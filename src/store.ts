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

export interface IndexedImagesBatch {
  folder_id: number;
  images: ImageRecord[];
}

export type SortOrder =
  | "date_desc"
  | "date_asc"
  | "name_asc"
  | "name_desc"
  | "size_desc"
  | "size_asc";

interface GalleryState {
  folders: Folder[];
  selectedFolderId: number | null;
  images: ImageRecord[];
  totalImages: number;
  loadedCount: number;
  loadingImages: boolean;
  search: string;
  sort: SortOrder;
  mediaFilter: MediaFilter;
  favoritesOnly: boolean;
  zoomPreset: ZoomPreset;
  selectedImage: ImageRecord | null;
  indexingProgress: Record<number, IndexProgress>;
  cacheDir: string;

  loadFolders: () => Promise<void>;
  addFolder: (path: string) => Promise<void>;
  removeFolder: (folderId: number) => Promise<void>;
  reindexFolder: (folderId: number) => Promise<void>;
  selectFolder: (folderId: number | null) => void;
  loadImages: (reset?: boolean) => Promise<void>;
  loadMoreImages: () => Promise<void>;
  setSearch: (search: string) => void;
  setSort: (sort: SortOrder) => void;
  setMediaFilter: (filter: MediaFilter) => void;
  setFavoritesOnly: (favoritesOnly: boolean) => void;
  setZoomPreset: (zoomPreset: ZoomPreset) => void;
  openImage: (image: ImageRecord) => void;
  closeImage: () => void;
  updateImageDetails: (imageId: number, updates: { favorite?: boolean; rating?: number }) => Promise<void>;
  setCacheDir: (dir: string) => void;
  subscribeToProgress: () => Promise<UnlistenFn>;
}

const PAGE_SIZE = 200;

function matchesSearch(image: ImageRecord, search: string): boolean {
  if (!search) return true;
  return image.filename.toLowerCase().includes(search.toLowerCase());
}

function matchesFilters(
  image: ImageRecord,
  selectedFolderId: number | null,
  mediaFilter: MediaFilter,
  favoritesOnly: boolean,
  search: string,
): boolean {
  const matchesFolder = selectedFolderId === null || image.folder_id === selectedFolderId;
  const matchesMedia = mediaFilter === "all" || image.media_kind === mediaFilter;
  const matchesFavorite = !favoritesOnly || image.favorite;
  return matchesFolder && matchesMedia && matchesFavorite && matchesSearch(image, search);
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

function replaceImage(images: ImageRecord[], updatedImage: ImageRecord, sort: SortOrder): ImageRecord[] {
  return mergeImages(images, [updatedImage], sort);
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
  sort: "date_desc",
  mediaFilter: "all",
  favoritesOnly: false,
  zoomPreset: "comfortable",
  selectedImage: null,
  indexingProgress: {},
  cacheDir: "",

  setCacheDir: (cacheDir) => set({ cacheDir }),

  loadFolders: async () => {
    const folders = await invoke<Folder[]>("get_folders");
    set({ folders });
  },

  addFolder: async (path) => {
    const { cacheDir, loadFolders } = get();
    await invoke("add_folder", { path, cacheDir });
    await loadFolders();
  },

  removeFolder: async (folderId) => {
    await invoke("remove_folder", { folderId });
    const { selectedFolderId, loadFolders, loadImages } = get();
    await loadFolders();
    if (selectedFolderId === folderId) {
      set({ selectedFolderId: null });
      await loadImages(true);
    }
  },

  reindexFolder: async (folderId) => {
    const { cacheDir, loadFolders } = get();
    await invoke("reindex_folder", { folderId, cacheDir });
    await loadFolders();
  },

  selectFolder: (folderId) => {
    set({ selectedFolderId: folderId, images: [], loadedCount: 0 });
    void get().loadImages(true);
  },

  loadImages: async (reset = false) => {
    const { selectedFolderId, search, sort, loadedCount, mediaFilter, favoritesOnly } = get();
    set({ loadingImages: true });

    try {
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
    set({ search, images: [], loadedCount: 0 });
    void get().loadImages(true);
  },

  setSort: (sort) => {
    set({ sort, images: [], loadedCount: 0 });
    void get().loadImages(true);
  },

  setMediaFilter: (mediaFilter) => {
    set({ mediaFilter, images: [], loadedCount: 0 });
    void get().loadImages(true);
  },

  setFavoritesOnly: (favoritesOnly) => {
    set({ favoritesOnly, images: [], loadedCount: 0 });
    void get().loadImages(true);
  },

  setZoomPreset: (zoomPreset) => set({ zoomPreset }),

  openImage: (image) => set({ selectedImage: image }),
  closeImage: () => set({ selectedImage: null }),

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

        setTimeout(() => {
          set((state) => {
            const next = { ...state.indexingProgress };
            delete next[progress.folder_id];
            return { indexingProgress: next };
          });
        }, 2000);
      }
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
            state.search,
          ),
        );

        if (visibleImages.length === 0) {
          return state;
        }

        const images = mergeImages(state.images, visibleImages, state.sort);
        return {
          images,
          loadedCount: images.length,
          totalImages: Math.max(state.totalImages, images.length),
        };
      });
    });

    return () => {
      unlistenProgress();
      unlistenImages();
    };
  },
}));

appDataDir().then(async (dir) => {
  useGalleryStore.getState().setCacheDir(await join(dir, "thumbnails"));
});
