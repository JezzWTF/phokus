import { listen, UnlistenFn } from "@tauri-apps/api/event";
import type { StoreApi } from "zustand";
import { notifyTaskComplete } from "../notifications";
import {
  PAGE_SIZE,
  countNewImages,
  imagesAffectScope,
  isDerivedCollectionTitle,
  matchesFilters,
  mergeIntoVisibleWindow,
  replaceExistingImages,
  scopeHasTaggingPending,
  taggingProgressAffectsScope,
} from "./helpers";
import type { GalleryStore } from "./index";
import type {
  CaptionModelProgress,
  FfmpegProgressEvent,
  IndexProgress,
  IndexedImagesBatch,
  MediaJobProgressEvent,
  TaggerModelProgress,
  ThumbnailBatch,
} from "./types";

// Per-folder debounce timers for batching notifications.
// Keyed as `${folderId}:embedding` or `${folderId}:tagging`.
const notificationTimers = new Map<string, ReturnType<typeof setTimeout>>();
const NOTIFICATION_DEBOUNCE_MS = 6000;

let exploreTagRefreshTimer: ReturnType<typeof setTimeout> | null = null;
const EXPLORE_TAG_REFRESH_IDLE_MS = 900;
const EXPLORE_TAG_REFRESH_WHILE_TAGGING_MS = 4500;

function scheduleExploreTagRefresh(load: () => void, delayMs: number) {
  if (exploreTagRefreshTimer) clearTimeout(exploreTagRefreshTimer);
  exploreTagRefreshTimer = setTimeout(() => {
    exploreTagRefreshTimer = null;
    load();
  }, delayMs);
}

export async function subscribeToProgress(
  set: StoreApi<GalleryStore>["setState"],
  get: StoreApi<GalleryStore>["getState"],
): Promise<UnlistenFn> {
  const unlistenProgress = await listen<IndexProgress>("index-progress", (event) => {
    const progress = event.payload;
    const previous = get().indexingProgress[progress.folder_id];
    set((state) => ({
      indexingProgress: {
        ...state.indexingProgress,
        [progress.folder_id]: progress,
      },
    }));

    if (progress.done) {
      if (
        previous &&
        !previous.done &&
        progress.total > 0 &&
        progress.indexed >= progress.total
      ) {
        const { notificationsPaused, mutedFolderIds } = get();
        if (!notificationsPaused && !mutedFolderIds.includes(progress.folder_id)) {
          const folderName = get().folders.find((folder) => folder.id === progress.folder_id)?.name;
          void notifyTaskComplete(
            "Folder scan complete",
            folderName ? `${folderName} has finished scanning.` : "A folder has finished scanning.",
          );
        }
      }
      void get().loadFolders();
      void get().loadBackgroundJobProgress();
      if (get().activeView !== "explore" && !isDerivedCollectionTitle(get().collectionTitle)) {
        void get().loadImages(true);
      }

      setTimeout(() => {
        set((state) => {
          const next = { ...state.indexingProgress };
          delete next[progress.folder_id];
          return { indexingProgress: next };
        });
      }, 2000);
    }
  });

  const unlistenMediaJobs = await listen<MediaJobProgressEvent>("media-job-progress", (event) => {
    const previousProgress = get().mediaJobProgress;

    for (const progress of event.payload.progress) {
      const previous = previousProgress[progress.folder_id];
      if (!previous) continue;

      const { notificationsPaused, mutedFolderIds } = get();
      const suppressed = notificationsPaused || mutedFolderIds.includes(progress.folder_id);
      const folderName =
        get().folders.find((folder) => folder.id === progress.folder_id)?.name ?? "Folder";

      // Embeddings — debounced so rapid file additions don't fire per-file.
      const embeddingKey = `${progress.folder_id}:embedding`;
      if (!suppressed) {
        if (previous.embedding_pending > 0 && progress.embedding_pending === 0) {
          clearTimeout(notificationTimers.get(embeddingKey));
          const failureDetail =
            progress.embedding_failed > 0
              ? ` ${progress.embedding_failed.toLocaleString()} failed.`
              : "";
          const body = `${folderName} finished generating embeddings.${failureDetail}`;
          notificationTimers.set(embeddingKey, setTimeout(() => {
            notificationTimers.delete(embeddingKey);
            void notifyTaskComplete("Embeddings complete", body);
          }, NOTIFICATION_DEBOUNCE_MS));
        } else if (previous.embedding_pending === 0 && progress.embedding_pending > 0) {
          // More jobs queued — cancel the pending notification.
          clearTimeout(notificationTimers.get(embeddingKey));
          notificationTimers.delete(embeddingKey);
        }
      }

      // Tagging — same debounce pattern.
      const taggingKey = `${progress.folder_id}:tagging`;
      if (!suppressed) {
        if (previous.tagging_pending > 0 && progress.tagging_pending === 0) {
          clearTimeout(notificationTimers.get(taggingKey));
          const failureDetail =
            progress.tagging_failed > 0
              ? ` ${progress.tagging_failed.toLocaleString()} failed.`
              : "";
          const body = `${folderName} finished generating tags.${failureDetail}`;
          notificationTimers.set(taggingKey, setTimeout(() => {
            notificationTimers.delete(taggingKey);
            void notifyTaskComplete("AI tagging complete", body);
          }, NOTIFICATION_DEBOUNCE_MS));
          const state = get();
          if (taggingProgressAffectsScope(progress.folder_id, state.selectedFolderId)) {
            // New tags landed — refresh the Explore tag cloud after the worker
            // settles instead of waiting for the user to revisit Explore.
            set({ exploreTagsFolderId: undefined });
            if (state.activeView === "explore" && state.exploreMode === "tags") {
              scheduleExploreTagRefresh(() => {
                void get().loadExploreTags({ force: true });
              }, EXPLORE_TAG_REFRESH_IDLE_MS);
            }
          }
        } else if (previous.tagging_pending === 0 && progress.tagging_pending > 0) {
          clearTimeout(notificationTimers.get(taggingKey));
          notificationTimers.delete(taggingKey);
        }
      }
    }

    set((state) => {
      const next = { ...state.mediaJobProgress };
      for (const progress of event.payload.progress) {
        next[progress.folder_id] = progress;
      }
      return { mediaJobProgress: next };
    });
  });

  const unlistenCaptionModelProgress = await listen<CaptionModelProgress>("caption-model-progress", (event) => {
    set({
      captionModelProgress: event.payload.done ? null : event.payload,
      captionModelPreparing: !event.payload.done,
    });
  });

  const unlistenTaggerModelProgress = await listen<TaggerModelProgress>("tagger-model-progress", (event) => {
    set({
      taggerModelProgress: event.payload.done ? null : event.payload,
      taggerModelPreparing: !event.payload.done,
    });
    if (event.payload.done) {
      void get().loadTaggerModelStatus();
    }
  });

  const unlistenImages = await listen<IndexedImagesBatch>("indexed-images", (event) => {
    const batch = event.payload;

    set((state) => {
      // Album view holds a fixed membership set; newly-indexed files never
      // auto-join it. Guarding on activeView also covers the brief window
      // where collectionTitle is null mid sort-change in an album.
      if (
        isDerivedCollectionTitle(state.collectionTitle) ||
        state.activeView === "explore" ||
        state.activeView === "album" ||
        state.colorFilter !== null
      ) {
        return state;
      }

      const visibleImages = batch.images.filter((image) =>
        matchesFilters(
          image,
          state.selectedFolderId,
          state.mediaFilter,
          state.favoritesOnly,
          state.minimumRating,
          state.failedEmbeddingsOnly,
          state.failedTaggingOnly,
          state.search,
        ),
      );

      if (visibleImages.length === 0) {
        return state;
      }

      const newVisibleCount = countNewImages(state.images, visibleImages);
      const visibleWindow = Math.max(state.loadedCount, PAGE_SIZE);
      const images = mergeIntoVisibleWindow(state.images, visibleImages, state.sort, visibleWindow);
      return {
        images,
        loadedCount: Math.max(state.loadedCount, Math.min(images.length, visibleWindow)),
        totalImages: Math.max(state.totalImages + newVisibleCount, images.length),
      };
    });
  });

  const unlistenThumbnails = await listen<ThumbnailBatch>("media-updated", (event) => {
    const batch = event.payload;
    const taggingUpdated = batch.images.some((image) => image.ai_tagged_at !== null || image.ai_tagger_error !== null);
    const state = get();
    if (taggingUpdated && imagesAffectScope(batch.images, state.selectedFolderId)) {
      set({ exploreTagsFolderId: undefined });
      if (state.activeView === "explore" && state.exploreMode === "tags") {
        const delay = scopeHasTaggingPending(state.mediaJobProgress, state.selectedFolderId)
          ? EXPLORE_TAG_REFRESH_WHILE_TAGGING_MS
          : EXPLORE_TAG_REFRESH_IDLE_MS;
        scheduleExploreTagRefresh(() => {
          void get().loadExploreTags({ force: true });
        }, delay);
      }
    }

    set((state) => {
      const selectedImageUpdate =
        state.selectedImage && batch.images.some((image) => image.id === state.selectedImage?.id)
          ? batch.images.find((image) => image.id === state.selectedImage?.id) ?? state.selectedImage
          : state.selectedImage;

      // Album view holds already-loaded images; paint thumbnail/metadata
      // fills in place (without re-sorting) so tiles refresh while browsing.
      if (state.activeView === "album") {
        return {
          images: replaceExistingImages(state.images, batch.images),
          selectedImage: selectedImageUpdate,
        };
      }

      if (isDerivedCollectionTitle(state.collectionTitle) || state.activeView === "explore") {
        return { selectedImage: selectedImageUpdate };
      }

      const visibleImages = batch.images.filter((image) =>
        matchesFilters(
          image,
          state.selectedFolderId,
          state.mediaFilter,
          state.favoritesOnly,
          state.minimumRating,
          state.failedEmbeddingsOnly,
          state.failedTaggingOnly,
          state.search,
        ),
      );

      if (visibleImages.length === 0) {
        return { selectedImage: selectedImageUpdate };
      }

      return {
        images: replaceExistingImages(state.images, visibleImages),
        selectedImage: selectedImageUpdate,
      };
    });
  });

  const unlistenWatcherDeleted = await listen<number[]>("watcher-deleted", (event) => {
    const deletedIds = new Set(event.payload);
    set((state) => {
      const removed = state.images.filter((img) => deletedIds.has(img.id)).length;
      const images = state.images.filter((img) => !deletedIds.has(img.id));
      const selectedImage =
        state.selectedImage && deletedIds.has(state.selectedImage.id)
          ? null
          : state.selectedImage;
      return {
        images,
        totalImages: Math.max(0, state.totalImages - removed),
        loadedCount: Math.max(0, state.loadedCount - removed),
        selectedImage,
      };
    });
  });

  const unlistenFolderCounts = await listen("folder-counts-changed", () => {
    void get().loadFolders();
  });

  const unlistenFfmpegProgress = await listen<FfmpegProgressEvent>("ffmpeg-progress", (event) => {
    const payload = event.payload;
    switch (payload.phase) {
      case "starting":
        set({ ffmpegStatus: "starting", ffmpegError: null });
        break;
      case "downloading":
        set({
          ffmpegStatus: "downloading",
          ffmpegProgress:
            payload.downloaded_bytes !== null && payload.total_bytes !== null
              ? { downloaded_bytes: payload.downloaded_bytes, total_bytes: payload.total_bytes }
              : null,
        });
        break;
      case "unpacking":
        set({ ffmpegStatus: "unpacking" });
        break;
      case "done":
        set({ ffmpegStatus: "installed", ffmpegProgress: null, ffmpegError: null });
        break;
      case "error":
        set({ ffmpegStatus: "error", ffmpegError: payload.error ?? "Download failed" });
        break;
    }
  });

  const unlistenColorBackfill = await listen<{ processed: number; total: number; done: boolean }>(
    "color-backfill-progress",
    (event) => {
      set({ colorBackfill: event.payload.done ? null : event.payload });
    },
  );

  return () => {
    if (exploreTagRefreshTimer) {
      clearTimeout(exploreTagRefreshTimer);
      exploreTagRefreshTimer = null;
    }
    unlistenProgress();
    unlistenMediaJobs();
    unlistenCaptionModelProgress();
    unlistenTaggerModelProgress();
    unlistenImages();
    unlistenThumbnails();
    unlistenWatcherDeleted();
    unlistenFolderCounts();
    unlistenFfmpegProgress();
    unlistenColorBackfill();
  };
}
