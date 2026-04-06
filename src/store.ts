import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { appDataDir, join } from "@tauri-apps/api/path";

export interface Folder {
  id: number;
  path: string;
  name: string;
  image_count: number;
  indexed_at: string | null;
}

export type MediaKind = "image" | "video";
export type MediaFilter = "all" | MediaKind;
export type ZoomPreset = "compact" | "comfortable" | "detail";
export type SearchMode = "filename" | "semantic";

export interface ImageRecord {
  id: number;
  folder_id: number;
  path: string;
  filename: string;
  thumbnail_path: string | null;
  width: number | null;
  height: number | null;
  file_size: number;
  created_at: string | null;
  modified_at: string | null;
  mime_type: string;
  media_kind: MediaKind;
  duration_ms: number | null;
  video_codec: string | null;
  audio_codec: string | null;
  metadata_updated_at: string | null;
  metadata_error: string | null;
  favorite: boolean;
  rating: number;
  embedding_status: string;
  embedding_model: string | null;
  embedding_updated_at: string | null;
  embedding_error: string | null;
}

export interface IndexProgress {
  folder_id: number;
  total: number;
  indexed: number;
  current_file: string;
  done: boolean;
}

export interface FolderJobProgress {
  folder_id: number;
  thumbnail_pending: number;
  metadata_pending: number;
  embedding_pending: number;
  embedding_ready: number;
  embedding_failed: number;
}

export interface MediaJobProgressEvent {
  progress: FolderJobProgress[];
}

export interface IndexedImagesBatch {
  folder_id: number;
  images: ImageRecord[];
}

export interface ThumbnailBatch {
  images: ImageRecord[];
}

export type ActiveView = "gallery" | "explore";

export interface TagCloudEntry {
  count: number;
  representative_image_id: number;
  thumbnail_path: string | null;
}

export type SortOrder =
  | "date_desc"
  | "date_asc"
  | "name_asc"
  | "name_desc"
  | "size_desc"
  | "size_asc"
  | "duration_desc"
  | "duration_asc";

interface GalleryState {
  folders: Folder[];
  selectedFolderId: number | null;
  images: ImageRecord[];
  totalImages: number;
  loadedCount: number;
  loadingImages: boolean;
  search: string;
  searchMode: SearchMode;
  sort: SortOrder;
  mediaFilter: MediaFilter;
  favoritesOnly: boolean;
  failedEmbeddingsOnly: boolean;
  zoomPreset: ZoomPreset;
  selectedImage: ImageRecord | null;
  collectionTitle: string | null;
  activeView: ActiveView;
  tagCloudEntries: TagCloudEntry[];
  tagCloudLoading: boolean;
  tagCloudFolderId: number | null | undefined; // undefined = never loaded
  indexingProgress: Record<number, IndexProgress>;
  mediaJobProgress: Record<number, FolderJobProgress>;
  cacheDir: string;

  loadFolders: () => Promise<void>;
  loadBackgroundJobProgress: () => Promise<void>;
  addFolder: (path: string) => Promise<void>;
  removeFolder: (folderId: number) => Promise<void>;
  reindexFolder: (folderId: number) => Promise<void>;
  selectFolder: (folderId: number | null) => void;
  loadImages: (reset?: boolean) => Promise<void>;
  loadMoreImages: () => Promise<void>;
  setSearch: (search: string) => void;
  clearSearch: () => void;
  resetSearch: () => void;
  setSearchMode: (mode: SearchMode) => void;
  setSort: (sort: SortOrder) => void;
  setMediaFilter: (filter: MediaFilter) => void;
  setFavoritesOnly: (favoritesOnly: boolean) => void;
  setFailedEmbeddingsOnly: (failedEmbeddingsOnly: boolean) => void;
  setZoomPreset: (zoomPreset: ZoomPreset) => void;
  openImage: (image: ImageRecord) => void;
  closeImage: () => void;
  setView: (view: ActiveView) => void;
  loadTagCloud: () => Promise<void>;
  searchByTag: (imageId: number) => void;
  loadSimilarImages: (imageId: number) => Promise<void>;
  retryFailedEmbeddings: (folderId: number) => Promise<void>;
  updateImageDetails: (imageId: number, updates: { favorite?: boolean; rating?: number }) => Promise<void>;
  setCacheDir: (dir: string) => void;
  subscribeToProgress: () => Promise<UnlistenFn>;
}

const PAGE_SIZE = 200;

function mergeIntoVisibleWindow(
  currentImages: ImageRecord[],
  newImages: ImageRecord[],
  sort: SortOrder,
  windowSize: number,
): ImageRecord[] {
  const merged = mergeImages(currentImages, newImages, sort);
  return merged.slice(0, Math.max(windowSize, 0));
}

function matchesSearch(image: ImageRecord, search: string): boolean {
  if (!search) return true;
  return image.filename.toLowerCase().includes(search.toLowerCase());
}

function matchesFilters(
  image: ImageRecord,
  selectedFolderId: number | null,
  mediaFilter: MediaFilter,
  favoritesOnly: boolean,
  failedEmbeddingsOnly: boolean,
  search: string,
): boolean {
  const matchesFolder = selectedFolderId === null || image.folder_id === selectedFolderId;
  const matchesMedia = mediaFilter === "all" || image.media_kind === mediaFilter;
  const matchesFavorite = !favoritesOnly || image.favorite;
  const matchesFailedEmbedding = !failedEmbeddingsOnly || image.embedding_status === "failed";
  return matchesFolder && matchesMedia && matchesFavorite && matchesFailedEmbedding && matchesSearch(image, search);
}

function compareNullableNumber(a: number | null, b: number | null): number {
  return (a ?? 0) - (b ?? 0);
}

function compareNullableDate(a: string | null, b: string | null): number {
  return (a ? Date.parse(a) : 0) - (b ? Date.parse(b) : 0);
}

function compareImages(a: ImageRecord, b: ImageRecord, sort: SortOrder): number {
  switch (sort) {
    case "name_asc":
      return a.filename.localeCompare(b.filename);
    case "name_desc":
      return b.filename.localeCompare(a.filename);
    case "date_asc":
      return compareNullableDate(a.modified_at, b.modified_at);
    case "date_desc":
      return compareNullableDate(b.modified_at, a.modified_at);
    case "size_asc":
      return compareNullableNumber(a.file_size, b.file_size);
    case "size_desc":
      return compareNullableNumber(b.file_size, a.file_size);
    case "duration_asc":
      return compareNullableNumber(a.duration_ms, b.duration_ms);
    case "duration_desc":
      return compareNullableNumber(b.duration_ms, a.duration_ms);
    default:
      return compareNullableDate(b.modified_at, a.modified_at);
  }
}

function mergeImages(currentImages: ImageRecord[], newImages: ImageRecord[], sort: SortOrder): ImageRecord[] {
  const merged = new Map<string, ImageRecord>();

  for (const image of currentImages) {
    merged.set(image.path, image);
  }

  for (const image of newImages) {
    merged.set(image.path, image);
  }

  return Array.from(merged.values()).sort((a, b) => compareImages(a, b, sort));
}

function countNewImages(currentImages: ImageRecord[], newImages: ImageRecord[]): number {
  const existingPaths = new Set(currentImages.map((image) => image.path));
  let count = 0;

  for (const image of newImages) {
    if (!existingPaths.has(image.path)) {
      existingPaths.add(image.path);
      count += 1;
    }
  }

  return count;
}

function replaceImage(images: ImageRecord[], updatedImage: ImageRecord, sort: SortOrder): ImageRecord[] {
  return mergeImages(images, [updatedImage], sort);
}

function replaceExistingImages(
  currentImages: ImageRecord[],
  updatedImages: ImageRecord[],
  sort: SortOrder,
): ImageRecord[] {
  const updatesByPath = new Map(updatedImages.map((image) => [image.path, image]));
  const nextImages = currentImages.map((image) => updatesByPath.get(image.path) ?? image);
  return nextImages.sort((a, b) => compareImages(a, b, sort));
}

export function tileSizeForZoom(zoomPreset: ZoomPreset): number {
  switch (zoomPreset) {
    case "compact":
      return 160;
    case "detail":
      return 280;
    default:
      return 220;
  }
}

export const useGalleryStore = create<GalleryState>((set, get) => ({
  folders: [],
  selectedFolderId: null,
  images: [],
  totalImages: 0,
  loadedCount: 0,
  loadingImages: false,
  search: "",
  searchMode: "filename",
  sort: "date_desc",
  mediaFilter: "all",
  favoritesOnly: false,
  failedEmbeddingsOnly: false,
  zoomPreset: "comfortable",
  selectedImage: null,
  collectionTitle: null,
  activeView: "gallery",
  tagCloudEntries: [],
  tagCloudLoading: false,
  tagCloudFolderId: undefined,
  indexingProgress: {},
  mediaJobProgress: {},
  cacheDir: "",

  setCacheDir: (cacheDir) => set({ cacheDir }),

  loadFolders: async () => {
    const folders = await invoke<Folder[]>("get_folders");
    set({ folders });
  },

  loadBackgroundJobProgress: async () => {
    const progress = await invoke<FolderJobProgress[]>("get_background_job_progress");
    set(() => ({
      mediaJobProgress: Object.fromEntries(progress.map((entry) => [entry.folder_id, entry])),
    }));
  },

  addFolder: async (path) => {
    const { loadFolders, loadBackgroundJobProgress } = get();
    await invoke("add_folder", { path });
    await loadFolders();
    await loadBackgroundJobProgress();
  },

  removeFolder: async (folderId) => {
    await invoke("remove_folder", { folderId });
    const { selectedFolderId, loadFolders, loadImages, loadBackgroundJobProgress } = get();
    await loadFolders();
    await loadBackgroundJobProgress();
    // Invalidate tag cloud cache since library content changed
    set({ tagCloudFolderId: undefined, tagCloudEntries: [] });
    if (selectedFolderId === folderId) {
      set({ selectedFolderId: null });
      await loadImages(true);
    }
  },

  reindexFolder: async (folderId) => {
    const { loadFolders, loadBackgroundJobProgress } = get();
    await invoke("reindex_folder", { folderId });
    await loadFolders();
    // Invalidate tag cloud cache since embeddings will be regenerated
    set({ tagCloudFolderId: undefined, tagCloudEntries: [] });
    await loadBackgroundJobProgress();
  },

  selectFolder: (folderId) => {
    set({ selectedFolderId: folderId, images: [], loadedCount: 0, collectionTitle: null, activeView: "gallery", failedEmbeddingsOnly: false });
    void get().loadImages(true);
  },

  loadImages: async (reset = false) => {
    const { selectedFolderId, search, searchMode, sort, loadedCount, mediaFilter, favoritesOnly, failedEmbeddingsOnly } = get();
    set({ loadingImages: true });

    try {
      if (searchMode === "semantic" && search.trim()) {
        const images = await invoke<ImageRecord[]>("semantic_search_images", {
          params: {
            query: search,
            folder_id: selectedFolderId,
            media_kind: mediaFilter === "all" ? null : mediaFilter,
            favorites_only: favoritesOnly,
            limit: PAGE_SIZE,
          },
        });

        set({
          images,
          totalImages: images.length,
          loadedCount: images.length,
          loadingImages: false,
          collectionTitle: `Semantic search: ${search}`,
        });
        return;
      }

      const offset = reset ? 0 : loadedCount;
      const result = await invoke<{
        images: ImageRecord[];
        total: number;
        offset: number;
        limit: number;
      }>("get_images", {
        params: {
          folder_id: selectedFolderId,
          search: search || null,
          media_kind: mediaFilter === "all" ? null : mediaFilter,
          favorites_only: favoritesOnly,
          embedding_failed_only: failedEmbeddingsOnly,
          sort,
          offset,
          limit: PAGE_SIZE,
        },
      });

      set((state) => ({
        images: reset ? result.images : [...state.images, ...result.images],
        totalImages: result.total,
        loadedCount: reset ? result.images.length : state.loadedCount + result.images.length,
        loadingImages: false,
        collectionTitle: reset ? null : state.collectionTitle,
      }));
    } catch (error) {
      console.error("Failed to load media:", error);
      set({ loadingImages: false });
    }
  },

  loadMoreImages: async () => {
    const { loadedCount, totalImages, loadingImages } = get();
    if (loadingImages || loadedCount >= totalImages) return;
    await get().loadImages(false);
  },

  setSearch: (search) => {
    set({ search, images: [], loadedCount: 0, collectionTitle: null });
    void get().loadImages(true);
  },

  clearSearch: () => {
    set({ search: "", images: [], loadedCount: 0, collectionTitle: null });
    void get().loadImages(true);
  },

  resetSearch: () => {
    set({ search: "", searchMode: "filename", images: [], loadedCount: 0, collectionTitle: null });
    void get().loadImages(true);
  },

  setSearchMode: (searchMode) => {
    set({ searchMode, images: [], loadedCount: 0, collectionTitle: null });
    void get().loadImages(true);
  },

  setSort: (sort) => {
    set({ sort, images: [], loadedCount: 0, collectionTitle: null });
    void get().loadImages(true);
  },

  setMediaFilter: (mediaFilter) => {
    set({ mediaFilter, images: [], loadedCount: 0, collectionTitle: null });
    void get().loadImages(true);
  },

  setFavoritesOnly: (favoritesOnly) => {
    set({ favoritesOnly, images: [], loadedCount: 0, collectionTitle: null });
    void get().loadImages(true);
  },

  setFailedEmbeddingsOnly: (failedEmbeddingsOnly) => {
    set({ failedEmbeddingsOnly, images: [], loadedCount: 0, collectionTitle: null });
    void get().loadImages(true);
  },

  setZoomPreset: (zoomPreset) => set({ zoomPreset }),

  openImage: (image) => set({ selectedImage: image }),
  closeImage: () => set({ selectedImage: null }),

  setView: (activeView) => set({ activeView }),

  loadTagCloud: async () => {
    const { selectedFolderId, tagCloudFolderId, tagCloudLoading } = get();
    // Skip if already loaded for this folder and not currently loading
    if (!tagCloudLoading && tagCloudFolderId !== undefined && tagCloudFolderId === selectedFolderId) {
      return;
    }
    set({ tagCloudLoading: true, tagCloudFolderId: selectedFolderId });
    try {
      const entries = await invoke<TagCloudEntry[]>("get_tag_cloud", {
        folderId: selectedFolderId,
      });
      set({ tagCloudEntries: entries, tagCloudLoading: false });
    } catch (error) {
      console.error("Failed to load tag cloud:", error);
      set({ tagCloudLoading: false });
    }
  },

  searchByTag: (imageId) => {
    set({ activeView: "gallery", images: [], loadedCount: 0, loadingImages: true, collectionTitle: "Similar Images" });
    void get().loadSimilarImages(imageId);
  },

  loadSimilarImages: async (imageId) => {
    set({ images: [], loadedCount: 0, loadingImages: true, collectionTitle: "Similar Images" });
    const images = await invoke<ImageRecord[]>("find_similar_images", {
      params: { image_id: imageId, limit: PAGE_SIZE },
    });
    set({
      images,
      totalImages: images.length,
      loadedCount: images.length,
      loadingImages: false,
      collectionTitle: "Similar Images",
      selectedFolderId: null,
      selectedImage: null,
    });
  },

  retryFailedEmbeddings: async (folderId) => {
    await invoke("retry_failed_embeddings", { params: { folder_id: folderId } });
    await get().loadBackgroundJobProgress();
  },

  updateImageDetails: async (imageId, updates) => {
    const updatedImage = await invoke<ImageRecord>("update_image_details", {
      params: {
        image_id: imageId,
        favorite: updates.favorite ?? null,
        rating: updates.rating ?? null,
      },
    });

    set((state) => ({
      images: replaceImage(state.images, updatedImage, state.sort),
      selectedImage: state.selectedImage?.id === updatedImage.id ? updatedImage : state.selectedImage,
    }));
  },

  subscribeToProgress: async () => {
    const unlistenProgress = await listen<IndexProgress>("index-progress", (event) => {
      const progress = event.payload;
      set((state) => ({
        indexingProgress: {
          ...state.indexingProgress,
          [progress.folder_id]: progress,
        },
      }));

      if (progress.done) {
        void get().loadFolders();
        void get().loadBackgroundJobProgress();
        void get().loadImages(true);

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
      set((state) => {
        const next = { ...state.mediaJobProgress };
        for (const progress of event.payload.progress) {
          next[progress.folder_id] = progress;
        }
        return { mediaJobProgress: next };
      });
    });

    const unlistenImages = await listen<IndexedImagesBatch>("indexed-images", (event) => {
      const batch = event.payload;

      set((state) => {
        const visibleImages = batch.images.filter((image) =>
          matchesFilters(
            image,
            state.selectedFolderId,
            state.mediaFilter,
            state.favoritesOnly,
            state.failedEmbeddingsOnly,
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

      set((state) => {
        const visibleImages = batch.images.filter((image) =>
          matchesFilters(
            image,
            state.selectedFolderId,
            state.mediaFilter,
            state.favoritesOnly,
            state.failedEmbeddingsOnly,
            state.search,
          ),
        );

        const selectedImage =
          state.selectedImage && batch.images.some((image) => image.id === state.selectedImage?.id)
            ? batch.images.find((image) => image.id === state.selectedImage?.id) ?? state.selectedImage
            : state.selectedImage;

        if (visibleImages.length === 0) {
          return { selectedImage };
        }

        return {
          images: replaceExistingImages(state.images, visibleImages, state.sort),
          selectedImage,
        };
      });
    });

    return () => {
      unlistenProgress();
      unlistenMediaJobs();
      unlistenImages();
      unlistenThumbnails();
    };
  },
}));

appDataDir().then(async (dir) => {
  useGalleryStore.getState().setCacheDir(await join(dir, "thumbnails"));
});
