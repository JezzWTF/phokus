import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { appDataDir, join } from "@tauri-apps/api/path";
import { notifyTaskComplete } from "./notifications";

export interface Folder {
  id: number;
  path: string;
  name: string;
  image_count: number;
  indexed_at: string | null;
  scan_error: string | null;
}

export type MediaKind = "image" | "video";
export type MediaFilter = "all" | MediaKind;
export type ZoomPreset = "compact" | "comfortable" | "detail";
export type SearchMode = "filename" | "semantic";
export type SearchCommand = "filename" | "semantic" | "tag";
export type CaptionAcceleration = "auto" | "cpu" | "directml";
export type CaptionDetail = "short" | "detailed" | "paragraph";
export type TaggerAcceleration = "auto" | "cpu" | "directml";
export type AiRating = "general" | "sensitive" | "questionable" | "explicit";
export type TaggingQueueScope = "all" | "selected";
export type SimilarScope = "all_media" | "current_folder";
export type ExploreMode = "visual" | "tags";

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
  generated_caption: string | null;
  caption_model: string | null;
  caption_updated_at: string | null;
  caption_error: string | null;
  ai_rating: AiRating | null;
  ai_tagger_model: string | null;
  ai_tagged_at: string | null;
  ai_tagger_error: string | null;
}

export interface ImageTag {
  id: number;
  image_id: number;
  tag: string;
  source: "user" | "ai";
  ai_model: string | null;
  confidence: number | null;
  created_at: string;
}

export interface TaggerModelStatus {
  model_id: string;
  model_name: string;
  local_dir: string;
  ready: boolean;
  missing_files: string[];
}

export interface TaggerModelProgress {
  total_files: number;
  completed_files: number;
  current_file: string | null;
  done: boolean;
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
  caption_pending: number;
  caption_ready: number;
  caption_failed: number;
  tagging_pending: number;
  tagging_ready: number;
  tagging_failed: number;
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

export type ActiveView = "gallery" | "explore" | "duplicates";

export interface TagCloudEntry {
  count: number;
  representative_image_id: number;
  thumbnail_path: string | null;
  image_ids: number[];
}

export interface ExploreTagEntry {
  tag: string;
  count: number;
  representative_image_id: number;
  thumbnail_path: string | null;
}

export interface DuplicateGroup {
  file_hash: string;
  file_size: number;
  images: ImageRecord[];
}

export interface SimilarImagesPage {
  images: ImageRecord[];
  offset: number;
  limit: number;
  has_more: boolean;
}

export interface CaptionModelStatus {
  model_id: string;
  model_name: string;
  local_dir: string;
  ready: boolean;
  missing_files: string[];
}

export interface CaptionModelProgress {
  total_files: number;
  completed_files: number;
  current_file: string | null;
  done: boolean;
}

export interface CaptionRuntimeSessionProbe {
  file: string;
  inputs: string[];
  outputs: string[];
}

export interface CaptionRuntimeProbe {
  ready: boolean;
  acceleration: CaptionAcceleration;
  detail: CaptionDetail;
  tokenizer_vocab_size: number;
  sessions: CaptionRuntimeSessionProbe[];
}

export interface CaptionVisionProbe {
  input_shape: number[];
  output_shape: number[];
  output_values: number;
  acceleration: CaptionAcceleration;
}

export interface TaggerRuntimeSessionProbe {
  file: string;
  inputs: string[];
  outputs: string[];
}

export interface TaggerRuntimeProbe {
  ready: boolean;
  acceleration: TaggerAcceleration;
  session: TaggerRuntimeSessionProbe;
}

export interface ParsedSearch {
  mode: SearchCommand;
  query: string;
  prefix: string | null;
}

export type SortOrder =
  | "date_desc"
  | "date_asc"
  | "name_asc"
  | "name_desc"
  | "size_desc"
  | "size_asc"
  | "rating_desc"
  | "rating_asc"
  | "duration_desc"
  | "duration_asc";

interface GalleryState {
  folders: Folder[];
  selectedFolderId: number | null;
  images: ImageRecord[];
  totalImages: number;
  loadedCount: number;
  loadingImages: boolean;
  imageLoadError: string | null;
  search: string;
  searchMode: SearchMode;
  sort: SortOrder;
  mediaFilter: MediaFilter;
  favoritesOnly: boolean;
  minimumRating: number;
  failedEmbeddingsOnly: boolean;
  zoomPreset: ZoomPreset;
  selectedImage: ImageRecord | null;
  collectionTitle: string | null;
  similarSourceImageId: number | null;
  similarSourceFolderId: number | null;
  similarHasMore: boolean;
  similarScope: SimilarScope;
  similarFolderId: number | null;
  similarCrop: { x: number; y: number; w: number; h: number } | null;
  galleryScrollResetKey: number;
  activeView: ActiveView;
  exploreMode: ExploreMode;
  tagCloudEntries: TagCloudEntry[];
  tagCloudLoading: boolean;
  tagCloudFolderId: number | null | undefined; // undefined = never loaded
  exploreTagEntries: ExploreTagEntry[];
  exploreTagLoading: boolean;
  exploreTagsFolderId: number | null | undefined;
  indexingProgress: Record<number, IndexProgress>;
  mediaJobProgress: Record<number, FolderJobProgress>;
  cacheDir: string;
  captionModelStatus: CaptionModelStatus | null;
  captionModelPreparing: boolean;
  captionModelError: string | null;
  captionModelProgress: CaptionModelProgress | null;
  captionRuntimeProbe: CaptionRuntimeProbe | null;
  captionRuntimeChecking: boolean;
  captionAcceleration: CaptionAcceleration;
  captionDetail: CaptionDetail;
  aiCaptionsEnabled: boolean;
  settingsOpen: boolean;
  taggingQueueScope: TaggingQueueScope;
  taggingQueueFolderIds: number[];

  taggerModelStatus: TaggerModelStatus | null;
  taggerModelPreparing: boolean;
  taggerModelError: string | null;
  taggerModelProgress: TaggerModelProgress | null;
  taggerAcceleration: TaggerAcceleration;
  taggerThreshold: number;
  taggerBatchSize: number;
  taggerRuntimeProbe: TaggerRuntimeProbe | null;
  taggerRuntimeChecking: boolean;

  duplicateGroups: DuplicateGroup[];
  duplicateScanning: boolean;
  duplicateScanProgress: { scanned: number; total: number } | null;
  duplicateSelectedIds: Set<number>;
  duplicateLastScanned: number | null; // Unix timestamp (seconds)
  duplicateScanFolderId: number | null | undefined; // undefined = never scanned

  loadFolders: () => Promise<void>;
  loadBackgroundJobProgress: () => Promise<void>;
  addFolder: (path: string) => Promise<void>;
  removeFolder: (folderId: number) => Promise<void>;
  reindexFolder: (folderId: number) => Promise<void>;
  updateFolderPath: (folderId: number, newPath: string) => Promise<void>;
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
  setMinimumRating: (minimumRating: number) => void;
  setFailedEmbeddingsOnly: (failedEmbeddingsOnly: boolean) => void;
  setZoomPreset: (zoomPreset: ZoomPreset) => void;
  openImage: (image: ImageRecord) => void;
  closeImage: () => void;
  setView: (view: ActiveView) => void;
  setExploreMode: (mode: ExploreMode) => void;
  loadTagCloud: () => Promise<void>;
  loadExploreTags: () => Promise<void>;
  showVisualCluster: (imageIds: number[]) => Promise<void>;
  searchForTag: (tag: string) => void;
  loadSimilarImages: (imageId: number, folderId?: number | null, reset?: boolean, sourceFolderId?: number | null) => Promise<void>;
  loadSimilarByRegion: (imageId: number, crop: { x: number; y: number; w: number; h: number }, folderId?: number | null, sourceFolderId?: number | null) => Promise<void>;
  setSimilarScope: (scope: SimilarScope) => void;
  suggestImageTags: (imageId: number) => Promise<string[]>;
  loadCaptionModelStatus: () => Promise<void>;
  prepareCaptionModel: () => Promise<void>;
  deleteCaptionModel: () => Promise<void>;
  probeCaptionRuntime: () => Promise<void>;
  probeCaptionImage: (imageId: number) => Promise<CaptionVisionProbe>;
  generateCaptionForImage: (imageId: number) => Promise<ImageRecord>;
  queueCaptionJobs: (folderId?: number | null) => Promise<number>;
  queueCaptionForImage: (imageId: number) => Promise<number>;
  clearCaptionJobs: (folderId?: number | null) => Promise<number>;
  resetGeneratedCaptions: (folderId?: number | null) => Promise<number>;
  loadCaptionAcceleration: () => Promise<void>;
  setCaptionAcceleration: (acceleration: CaptionAcceleration) => Promise<void>;
  loadCaptionDetail: () => Promise<void>;
  setCaptionDetail: (detail: CaptionDetail) => Promise<void>;
  setAiCaptionsEnabled: (enabled: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setTaggingQueueScope: (scope: TaggingQueueScope) => void;
  toggleTaggingQueueFolder: (folderId: number) => void;
  setTaggingQueueFolderIds: (folderIds: number[]) => void;
  retryFailedEmbeddings: (folderId: number) => Promise<void>;
  updateImageDetails: (imageId: number, updates: { favorite?: boolean; rating?: number }) => Promise<void>;
  setCacheDir: (dir: string) => void;
  subscribeToProgress: () => Promise<UnlistenFn>;

  loadTaggerModelStatus: () => Promise<void>;
  prepareTaggerModel: () => Promise<void>;
  deleteTaggerModel: () => Promise<void>;
  loadTaggerAcceleration: () => Promise<void>;
  setTaggerAcceleration: (acceleration: TaggerAcceleration) => Promise<void>;
  loadTaggerThreshold: () => Promise<void>;
  setTaggerThreshold: (threshold: number) => Promise<void>;
  loadTaggerBatchSize: () => Promise<void>;
  setTaggerBatchSize: (batchSize: number) => Promise<void>;
  probeTaggerRuntime: () => Promise<void>;
  queueTaggingJobs: (folderId?: number | null) => Promise<number>;
  queueTaggingJobsForFolders: (folderIds: number[]) => Promise<number>;
  queueTaggingForImage: (imageId: number) => Promise<number>;
  clearTaggingJobs: (folderId?: number | null) => Promise<number>;
  clearTaggingJobsForFolders: (folderIds: number[]) => Promise<number>;
  loadDuplicateScanCache: (folderId?: number | null) => Promise<void>;
  scanDuplicates: (folderId?: number | null) => Promise<void>;
  toggleDuplicateSelected: (imageId: number) => void;
  selectAllDuplicates: (imageIds: number[]) => void;
  selectKeepFirstAllGroups: () => void;
  clearDuplicateSelection: () => void;
  deleteSelectedDuplicates: () => Promise<number>;
  getImageTags: (imageId: number) => Promise<ImageTag[]>;
  addUserTag: (imageId: number, tag: string) => Promise<ImageTag>;
  removeTag: (tagId: number) => Promise<void>;
}

const PAGE_SIZE = 200;
const AI_CAPTIONS_ENABLED_KEY = "phokus.aiCaptionsEnabled";
const SIMILAR_DISTANCE_THRESHOLD = 0.24;

// Single token shared by all gallery-producing requests (folder loads, searches,
// similarity, region search). Any new request increments it so a stale response
// from a previous collection type cannot overwrite newer results.
let galleryRequestToken = 0;
let tagCloudRequestToken = 0;
let exploreTagRequestToken = 0;

function initialAiCaptionsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(AI_CAPTIONS_ENABLED_KEY) === "true";
}

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

function isDerivedCollectionTitle(collectionTitle: string | null): boolean {
  return collectionTitle !== null;
}

export function parseSearchValue(search: string): ParsedSearch {
  if (!search.trim()) {
    return { mode: "filename", query: "", prefix: null };
  }

  const slashPrefix = search.match(/^\/([a-z])(?:\s|$)/i);
  if (slashPrefix) {
    const rawPrefix = slashPrefix[1].toLowerCase();
    const query = search.length > 3 ? search.slice(3) : "";
    if (rawPrefix === "s") {
      return { mode: "semantic", query, prefix: "/s" };
    }
    if (rawPrefix === "t") {
      return { mode: "tag", query, prefix: "/t" };
    }
    return { mode: "filename", query, prefix: rawPrefix === "f" ? "/f" : null };
  }

  const trimmed = search.trim();
  const match = trimmed.match(/^([a-z]):\s*(.*)$/i);
  if (!match) {
    return { mode: "filename", query: trimmed, prefix: null };
  }

  const rawPrefix = match[1].toLowerCase();
  const query = match[2].trim();
  if (rawPrefix === "s") {
    return { mode: "semantic", query, prefix: "s:" };
  }
  if (rawPrefix === "t") {
    return { mode: "tag", query, prefix: "t:" };
  }
  return { mode: "filename", query, prefix: rawPrefix === "f" ? "f:" : null };
}

export function searchModeLabel(mode: SearchCommand): string {
  switch (mode) {
    case "semantic":
      return "Semantic Search";
    case "tag":
      return "Tag Search";
    default:
      return "Filename Search";
  }
}

function matchesFilters(
  image: ImageRecord,
  selectedFolderId: number | null,
  mediaFilter: MediaFilter,
  favoritesOnly: boolean,
  minimumRating: number,
  failedEmbeddingsOnly: boolean,
  search: string,
): boolean {
  const matchesFolder = selectedFolderId === null || image.folder_id === selectedFolderId;
  const matchesMedia = mediaFilter === "all" || image.media_kind === mediaFilter;
  const matchesFavorite = !favoritesOnly || image.favorite;
  const matchesRating = image.rating >= minimumRating;
  const matchesFailedEmbedding = !failedEmbeddingsOnly || image.embedding_status === "failed";
  return matchesFolder && matchesMedia && matchesFavorite && matchesRating && matchesFailedEmbedding && matchesSearch(image, search);
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
    case "rating_asc":
      return compareNullableNumber(a.rating, b.rating);
    case "rating_desc":
      return compareNullableNumber(b.rating, a.rating);
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
  imageLoadError: null,
  search: "",
  searchMode: "filename",
  sort: "date_desc",
  mediaFilter: "all",
  favoritesOnly: false,
  minimumRating: 0,
  failedEmbeddingsOnly: false,
  zoomPreset: "comfortable",
  selectedImage: null,
  collectionTitle: null,
  similarSourceImageId: null,
  similarSourceFolderId: null,
  similarHasMore: false,
  similarScope: "all_media",
  similarFolderId: null,
  similarCrop: null,
  galleryScrollResetKey: 0,
  activeView: "gallery",
  exploreMode: "visual",
  tagCloudEntries: [],
  tagCloudLoading: false,
  tagCloudFolderId: undefined,
  exploreTagEntries: [],
  exploreTagLoading: false,
  exploreTagsFolderId: undefined,
  indexingProgress: {},
  mediaJobProgress: {},
  cacheDir: "",
  captionModelStatus: null,
  captionModelPreparing: false,
  captionModelError: null,
  captionModelProgress: null,
  captionRuntimeProbe: null,
  captionRuntimeChecking: false,
  captionAcceleration: "auto",
  captionDetail: "paragraph",
  aiCaptionsEnabled: initialAiCaptionsEnabled(),
  settingsOpen: false,
  taggingQueueScope: "all",
  taggingQueueFolderIds: [],

  taggerModelStatus: null,
  taggerModelPreparing: false,
  taggerModelError: null,
  taggerModelProgress: null,
  taggerAcceleration: "auto",
  taggerThreshold: 0.35,
  taggerBatchSize: 8,
  taggerRuntimeProbe: null,
  taggerRuntimeChecking: false,

  duplicateGroups: [],
  duplicateScanning: false,
  duplicateScanProgress: null,
  duplicateSelectedIds: new Set(),
  duplicateLastScanned: null,
  duplicateScanFolderId: undefined,

  setCacheDir: (cacheDir) => set({ cacheDir }),

  loadFolders: async () => {
    const folders = await invoke<Folder[]>("get_folders");
    set((state) => {
      const folderIds = new Set(folders.map((folder) => folder.id));
      const nextSelected = state.taggingQueueFolderIds.filter((folderId) => folderIds.has(folderId));
      return {
        folders,
        taggingQueueFolderIds:
          nextSelected.length > 0
            ? nextSelected
            : state.taggingQueueScope === "selected" && folders.length > 0
              ? [folders[0].id]
              : nextSelected,
      };
    });
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

  updateFolderPath: async (folderId, newPath) => {
    const { loadFolders, loadBackgroundJobProgress } = get();
    await invoke("update_folder_path", { folderId, newPath });
    await loadFolders();
    await loadBackgroundJobProgress();
  },

  selectFolder: (folderId) => {
    set({ selectedFolderId: folderId, images: [], loadedCount: 0, collectionTitle: null, similarSourceImageId: null, similarHasMore: false, activeView: "gallery", failedEmbeddingsOnly: false, imageLoadError: null });
    void get().loadImages(true);
  },

  loadImages: async (reset = false) => {
    const { selectedFolderId, search, sort, loadedCount, mediaFilter, favoritesOnly, minimumRating, failedEmbeddingsOnly } = get();
    const parsedSearch = parseSearchValue(search);
    const requestToken = ++galleryRequestToken;
    set({ loadingImages: true, imageLoadError: null });

    try {
      if (parsedSearch.mode === "semantic" && parsedSearch.query) {
        const images = await invoke<ImageRecord[]>("semantic_search_images", {
          params: {
            query: parsedSearch.query,
            folder_id: selectedFolderId,
            media_kind: mediaFilter === "all" ? null : mediaFilter,
            favorites_only: favoritesOnly,
            rating_min: minimumRating > 0 ? minimumRating : null,
            limit: PAGE_SIZE,
          },
        });

        if (requestToken !== galleryRequestToken) return;
        set({
          images,
          totalImages: images.length,
          loadedCount: images.length,
          loadingImages: false,
          collectionTitle: `Semantic search: ${parsedSearch.query}`,
          selectedFolderId,
          similarSourceImageId: null,
          similarSourceFolderId: null,
          similarHasMore: false,
          similarFolderId: null,
        });
        return;
      }

      if (parsedSearch.mode === "tag" && parsedSearch.query) {
        const images = await invoke<ImageRecord[]>("search_images_by_tag", {
          params: {
            query: parsedSearch.query,
            folder_id: selectedFolderId,
            media_kind: mediaFilter === "all" ? null : mediaFilter,
            favorites_only: favoritesOnly,
            rating_min: minimumRating > 0 ? minimumRating : null,
            limit: PAGE_SIZE,
          },
        });

        if (requestToken !== galleryRequestToken) return;
        set({
          images,
          totalImages: images.length,
          loadedCount: images.length,
          loadingImages: false,
          collectionTitle: `Tag search: ${parsedSearch.query}`,
          selectedFolderId,
          similarSourceImageId: null,
          similarSourceFolderId: null,
          similarHasMore: false,
          similarFolderId: null,
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
          search: parsedSearch.query || null,
          media_kind: mediaFilter === "all" ? null : mediaFilter,
          favorites_only: favoritesOnly,
          rating_min: minimumRating > 0 ? minimumRating : null,
          embedding_failed_only: failedEmbeddingsOnly,
          sort,
          offset,
          limit: PAGE_SIZE,
        },
      });

      if (requestToken !== galleryRequestToken) return;
      set((state) => ({
        images: reset ? result.images : [...state.images, ...result.images],
        totalImages: result.total,
        loadedCount: reset ? result.images.length : state.loadedCount + result.images.length,
        loadingImages: false,
        collectionTitle: reset ? null : state.collectionTitle,
        similarSourceImageId: null,
        similarSourceFolderId: null,
        similarHasMore: false,
        similarFolderId: null,
      }));
    } catch (error) {
      if (requestToken !== galleryRequestToken) return;
      console.error("Failed to load media:", error);
      set({ loadingImages: false, imageLoadError: String(error) });
    }
  },

  loadMoreImages: async () => {
    const { loadedCount, totalImages, loadingImages, collectionTitle, similarSourceImageId, similarHasMore, similarFolderId, similarCrop } = get();
    if (loadingImages || loadedCount >= totalImages) return;
    if (collectionTitle === "Explore Cluster") return;
    if (collectionTitle === "Similar Images" && similarSourceImageId !== null) {
      if (!similarHasMore) return;
      await get().loadSimilarImages(similarSourceImageId, similarFolderId, false);
      return;
    }
    if (collectionTitle === "Region Search Results" && similarSourceImageId !== null && similarCrop !== null) {
      if (!similarHasMore) return;
      const requestToken = ++galleryRequestToken;
      set({ loadingImages: true });
      try {
        const result = await invoke<SimilarImagesPage>("find_similar_by_region", {
          params: {
            image_id: similarSourceImageId,
            crop_x: similarCrop.x,
            crop_y: similarCrop.y,
            crop_w: similarCrop.w,
            crop_h: similarCrop.h,
            folder_id: similarFolderId,
            offset: loadedCount,
            limit: PAGE_SIZE,
          },
        });
        if (requestToken !== galleryRequestToken) return;
        set((state) => ({
          images: [...state.images, ...result.images],
          loadedCount: state.loadedCount + result.images.length,
          totalImages: result.has_more ? state.loadedCount + result.images.length + 1 : state.loadedCount + result.images.length,
          similarHasMore: result.has_more,
          loadingImages: false,
        }));
      } catch {
        if (requestToken !== galleryRequestToken) return;
        set({ loadingImages: false });
      }
      return;
    }
    await get().loadImages(false);
  },

  setSearch: (search) => {
    set({ search, images: [], loadedCount: 0, collectionTitle: null, similarSourceImageId: null, similarHasMore: false, imageLoadError: null });
    void get().loadImages(true);
  },

  clearSearch: () => {
    set({ search: "", images: [], loadedCount: 0, collectionTitle: null, similarSourceImageId: null, similarHasMore: false, imageLoadError: null });
    void get().loadImages(true);
  },

  resetSearch: () => {
    set({ search: "", searchMode: "filename", images: [], loadedCount: 0, collectionTitle: null, similarSourceImageId: null, similarHasMore: false, imageLoadError: null });
    void get().loadImages(true);
  },

  setSearchMode: (searchMode) => {
    set({ searchMode, images: [], loadedCount: 0, collectionTitle: null, similarSourceImageId: null, similarHasMore: false, imageLoadError: null });
    void get().loadImages(true);
  },

  setSort: (sort) => {
    set({ sort, images: [], loadedCount: 0, collectionTitle: null, similarSourceImageId: null, similarHasMore: false, imageLoadError: null });
    void get().loadImages(true);
  },

  setMediaFilter: (mediaFilter) => {
    set({ mediaFilter, images: [], loadedCount: 0, collectionTitle: null, similarSourceImageId: null, similarHasMore: false, imageLoadError: null });
    void get().loadImages(true);
  },

  setFavoritesOnly: (favoritesOnly) => {
    set({ favoritesOnly, images: [], loadedCount: 0, collectionTitle: null, similarSourceImageId: null, similarHasMore: false, imageLoadError: null });
    void get().loadImages(true);
  },

  setMinimumRating: (minimumRating) => {
    set({ minimumRating, images: [], loadedCount: 0, collectionTitle: null, similarSourceImageId: null, similarHasMore: false, imageLoadError: null });
    void get().loadImages(true);
  },

  setFailedEmbeddingsOnly: (failedEmbeddingsOnly) => {
    set({ failedEmbeddingsOnly, images: [], loadedCount: 0, collectionTitle: null, similarSourceImageId: null, similarHasMore: false, imageLoadError: null });
    void get().loadImages(true);
  },

  setZoomPreset: (zoomPreset) => set({ zoomPreset }),

  openImage: (image) => set({ selectedImage: image }),
  closeImage: () => set({ selectedImage: null }),

  setView: (activeView) => {
    if (activeView === "duplicates") {
      const { selectedFolderId, duplicateScanFolderId } = get();
      if (duplicateScanFolderId !== selectedFolderId) {
        set({ activeView, duplicateGroups: [], duplicateLastScanned: null, duplicateScanFolderId: undefined });
        void get().loadDuplicateScanCache(selectedFolderId);
        return;
      }
    }
    set({ activeView });
  },

  setExploreMode: (exploreMode) => set({ exploreMode }),

  loadTagCloud: async () => {
    const { selectedFolderId, tagCloudFolderId, tagCloudLoading } = get();
    // Skip if already loaded for this folder and not currently loading
    if (!tagCloudLoading && tagCloudFolderId !== undefined && tagCloudFolderId === selectedFolderId) {
      return;
    }
    const requestToken = ++tagCloudRequestToken;
    set({ tagCloudLoading: true, tagCloudFolderId: selectedFolderId });
    try {
      const entries = await invoke<TagCloudEntry[]>("get_tag_cloud", {
        folderId: selectedFolderId,
      });
      if (requestToken !== tagCloudRequestToken) return;
      set({ tagCloudEntries: entries, tagCloudLoading: false });
    } catch (error) {
      if (requestToken !== tagCloudRequestToken) return;
      console.error("Failed to load tag cloud:", error);
      set({ tagCloudLoading: false });
    }
  },

  loadExploreTags: async () => {
    const { selectedFolderId, exploreTagsFolderId, exploreTagLoading } = get();
    if (!exploreTagLoading && exploreTagsFolderId !== undefined && exploreTagsFolderId === selectedFolderId) {
      return;
    }
    const requestToken = ++exploreTagRequestToken;
    set({ exploreTagLoading: true, exploreTagsFolderId: selectedFolderId });
    try {
      const entries = await invoke<ExploreTagEntry[]>("get_explore_tags", {
        params: { folder_id: selectedFolderId, limit: 48 },
      });
      if (requestToken !== exploreTagRequestToken) return;
      set({ exploreTagEntries: entries, exploreTagLoading: false });
    } catch (error) {
      if (requestToken !== exploreTagRequestToken) return;
      console.error("Failed to load explore tags:", error);
      set({ exploreTagLoading: false });
    }
  },

  showVisualCluster: async (imageIds) => {
    const requestToken = ++galleryRequestToken;
    set((state) => ({
      activeView: "gallery",
      search: "",
      images: [],
      totalImages: imageIds.length,
      loadedCount: 0,
      loadingImages: true,
      collectionTitle: "Explore Cluster",
      imageLoadError: null,
      similarSourceImageId: null,
      similarSourceFolderId: null,
      similarHasMore: false,
      similarFolderId: null,
      galleryScrollResetKey: state.galleryScrollResetKey + 1,
    }));

    try {
      const images = await invoke<ImageRecord[]>("get_images_by_ids", {
        params: { image_ids: imageIds },
      });
      if (requestToken !== galleryRequestToken) return;
      set({
        images,
        totalImages: images.length,
        loadedCount: images.length,
        loadingImages: false,
        imageLoadError: null,
        collectionTitle: "Explore Cluster",
      });
    } catch (error) {
      if (requestToken !== galleryRequestToken) return;
      set({
        images: [],
        totalImages: 0,
        loadedCount: 0,
        loadingImages: false,
        imageLoadError: String(error),
        collectionTitle: "Explore Cluster",
      });
    }
  },

  searchForTag: (tag) => {
    set({ activeView: "gallery", search: `/t ${tag}`, images: [], loadedCount: 0, collectionTitle: null, similarSourceImageId: null, similarHasMore: false, similarFolderId: null, imageLoadError: null });
    void get().loadImages(true);
  },

  loadSimilarImages: async (imageId, folderId = get().selectedFolderId, reset = true, sourceFolderId = folderId ?? null) => {
    const requestToken = ++galleryRequestToken;
    const offset = reset ? 0 : get().loadedCount;
    const similarScope = folderId === null ? "all_media" : "current_folder";
    set((state) => ({
      images: reset ? [] : state.images,
      loadedCount: reset ? 0 : state.loadedCount,
      loadingImages: true,
      collectionTitle: "Similar Images",
      imageLoadError: null,
      similarSourceImageId: imageId,
      similarSourceFolderId: sourceFolderId,
      similarFolderId: folderId ?? null,
      similarScope,
      galleryScrollResetKey: reset ? state.galleryScrollResetKey + 1 : state.galleryScrollResetKey,
    }));

    try {
      const result = await invoke<SimilarImagesPage>("find_similar_images", {
        params: {
          image_id: imageId,
          folder_id: folderId ?? null,
          offset,
          limit: PAGE_SIZE,
          threshold: SIMILAR_DISTANCE_THRESHOLD,
        },
      });

      if (requestToken !== galleryRequestToken) return;

      set((state) => {
        const nextImages = reset ? result.images : [...state.images, ...result.images];
        const nextLoadedCount = nextImages.length;
        return {
          images: nextImages,
          totalImages: result.has_more ? nextLoadedCount + 1 : nextLoadedCount,
          loadedCount: nextLoadedCount,
          loadingImages: false,
          imageLoadError: null,
          collectionTitle: "Similar Images",
          similarSourceImageId: imageId,
          similarSourceFolderId: sourceFolderId,
          similarHasMore: result.has_more,
          similarFolderId: folderId ?? null,
          similarScope,
          selectedImage: reset ? null : state.selectedImage,
        };
      });
    } catch (error) {
      if (requestToken !== galleryRequestToken) return;
      console.error("Failed to load similar images:", error);
      set({
        images: [],
        totalImages: 0,
        loadedCount: 0,
        loadingImages: false,
        imageLoadError: String(error),
        collectionTitle: "Similar Images",
        similarSourceImageId: imageId,
        similarSourceFolderId: sourceFolderId,
        similarHasMore: false,
        similarFolderId: folderId ?? null,
        similarScope,
        selectedImage: null,
      });
    }
  },

  loadSimilarByRegion: async (imageId, crop, folderId = get().selectedFolderId, sourceFolderId = folderId ?? null) => {
    const requestToken = ++galleryRequestToken;
    const similarScope = folderId === null ? "all_media" : "current_folder";
    set((state) => ({
      images: [],
      loadedCount: 0,
      loadingImages: true,
      collectionTitle: "Region Search Results",
      imageLoadError: null,
      similarSourceImageId: imageId,
      similarSourceFolderId: sourceFolderId,
      similarFolderId: folderId ?? null,
      similarCrop: crop,
      similarScope,
      galleryScrollResetKey: state.galleryScrollResetKey + 1,
      selectedImage: null,
    }));

    try {
      const result = await invoke<SimilarImagesPage>("find_similar_by_region", {
        params: {
          image_id: imageId,
          crop_x: crop.x,
          crop_y: crop.y,
          crop_w: crop.w,
          crop_h: crop.h,
          folder_id: folderId ?? null,
          offset: 0,
          limit: PAGE_SIZE,
        },
      });

      if (requestToken !== galleryRequestToken) return;

      set({
        images: result.images,
        totalImages: result.has_more ? result.images.length + 1 : result.images.length,
        loadedCount: result.images.length,
        loadingImages: false,
        imageLoadError: null,
        collectionTitle: "Region Search Results",
        similarSourceImageId: imageId,
        similarSourceFolderId: sourceFolderId,
        similarHasMore: result.has_more,
        similarFolderId: folderId ?? null,
        similarCrop: crop,
        similarScope,
      });
    } catch (error) {
      if (requestToken !== galleryRequestToken) return;
      console.error("Failed to load region search results:", error);
      set({
        images: [],
        totalImages: 0,
        loadedCount: 0,
        loadingImages: false,
        imageLoadError: String(error),
        collectionTitle: "Region Search Results",
        similarSourceImageId: imageId,
        similarSourceFolderId: sourceFolderId,
        similarHasMore: false,
        similarFolderId: folderId ?? null,
        similarScope,
        selectedImage: null,
      });
    }
  },

  setSimilarScope: (similarScope) => {
    set({ similarScope });
    const { similarSourceImageId, similarSourceFolderId, selectedFolderId } = get();
    if (similarSourceImageId === null) return;
    const folderId = similarScope === "current_folder" ? (similarSourceFolderId ?? selectedFolderId) : null;
    void get().loadSimilarImages(similarSourceImageId, folderId, true, similarSourceFolderId);
  },

  suggestImageTags: async (imageId) => {
    return invoke<string[]>("suggest_image_tags", {
      params: { image_id: imageId, limit: 2 },
    });
  },

  loadCaptionModelStatus: async () => {
    try {
      const captionModelStatus = await invoke<CaptionModelStatus>("get_caption_model_status");
      set({ captionModelStatus, captionModelError: null });
    } catch (error) {
      set({ captionModelError: String(error) });
    }
  },

  loadCaptionAcceleration: async () => {
    try {
      const captionAcceleration = await invoke<CaptionAcceleration>("get_caption_acceleration");
      set({ captionAcceleration });
    } catch (error) {
      set({ captionModelError: String(error) });
    }
  },

  setCaptionAcceleration: async (acceleration) => {
    const captionAcceleration = await invoke<CaptionAcceleration>("set_caption_acceleration", {
      params: { acceleration },
    });
    set({ captionAcceleration, captionRuntimeProbe: null });
  },

  loadCaptionDetail: async () => {
    try {
      const captionDetail = await invoke<CaptionDetail>("get_caption_detail");
      set({ captionDetail });
    } catch (error) {
      set({ captionModelError: String(error) });
    }
  },

  setCaptionDetail: async (detail) => {
    const captionDetail = await invoke<CaptionDetail>("set_caption_detail", {
      params: { detail },
    });
    set({ captionDetail, captionRuntimeProbe: null });
  },

  prepareCaptionModel: async () => {
    set({ captionModelPreparing: true, captionModelError: null, captionModelProgress: null });
    try {
      const captionModelStatus = await invoke<CaptionModelStatus>("prepare_caption_model");
      window.localStorage.setItem(AI_CAPTIONS_ENABLED_KEY, String(captionModelStatus.ready));
      set({ captionModelStatus, captionModelPreparing: false, captionModelError: null, captionModelProgress: null, aiCaptionsEnabled: captionModelStatus.ready });
    } catch (error) {
      set({ captionModelPreparing: false, captionModelError: String(error), captionModelProgress: null });
    }
  },

  deleteCaptionModel: async () => {
    set({ captionModelPreparing: true, captionModelError: null, captionModelProgress: null });
    try {
      const captionModelStatus = await invoke<CaptionModelStatus>("delete_caption_model");
      window.localStorage.setItem(AI_CAPTIONS_ENABLED_KEY, "false");
      set({ captionModelStatus, captionModelPreparing: false, captionModelError: null, captionModelProgress: null, captionRuntimeProbe: null, aiCaptionsEnabled: false });
    } catch (error) {
      set({ captionModelPreparing: false, captionModelError: String(error), captionModelProgress: null });
    }
  },

  probeCaptionRuntime: async () => {
    set({ captionRuntimeChecking: true, captionModelError: null });
    try {
      const captionRuntimeProbe = await invoke<CaptionRuntimeProbe>("probe_caption_runtime");
      set({ captionRuntimeProbe, captionRuntimeChecking: false, captionModelError: null });
    } catch (error) {
      set({ captionRuntimeChecking: false, captionModelError: String(error), captionRuntimeProbe: null });
    }
  },

  probeCaptionImage: async (imageId) => {
    return invoke<CaptionVisionProbe>("probe_caption_image", {
      params: { image_id: imageId },
    });
  },

  generateCaptionForImage: async (imageId) => {
    const updatedImage = await invoke<ImageRecord>("generate_caption_for_image", {
      params: { image_id: imageId },
    });

    set((state) => ({
      images: replaceImage(state.images, updatedImage, state.sort),
      selectedImage: state.selectedImage?.id === updatedImage.id ? updatedImage : state.selectedImage,
    }));

    return updatedImage;
  },

  queueCaptionJobs: async (folderId = get().selectedFolderId) => {
    const queued = await invoke<number>("queue_caption_jobs", {
      params: { folder_id: folderId ?? null, image_id: null },
    });
    await get().loadBackgroundJobProgress();
    return queued;
  },

  queueCaptionForImage: async (imageId) => {
    const queued = await invoke<number>("queue_caption_jobs", {
      params: { folder_id: null, image_id: imageId },
    });
    await get().loadBackgroundJobProgress();
    return queued;
  },

  clearCaptionJobs: async (folderId = get().selectedFolderId) => {
    const cleared = await invoke<number>("clear_caption_jobs", {
      params: { folder_id: folderId ?? null },
    });
    await get().loadBackgroundJobProgress();
    return cleared;
  },

  resetGeneratedCaptions: async (folderId = get().selectedFolderId) => {
    const reset = await invoke<number>("reset_generated_captions", {
      params: { folder_id: folderId ?? null },
    });
    await get().loadBackgroundJobProgress();
    await get().loadImages(true);
    return reset;
  },

  setAiCaptionsEnabled: (aiCaptionsEnabled) => {
    window.localStorage.setItem(AI_CAPTIONS_ENABLED_KEY, String(aiCaptionsEnabled));
    set({ aiCaptionsEnabled });
  },

  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),

  setTaggingQueueScope: (taggingQueueScope) => {
    set((state) => ({
      taggingQueueScope,
      taggingQueueFolderIds:
        taggingQueueScope === "selected" && state.taggingQueueFolderIds.length === 0 && state.folders.length > 0
          ? [state.folders[0].id]
          : state.taggingQueueFolderIds,
    }));
  },

  toggleTaggingQueueFolder: (folderId) => {
    set((state) => {
      const next = state.taggingQueueFolderIds.includes(folderId)
        ? state.taggingQueueFolderIds.filter((id) => id !== folderId)
        : [...state.taggingQueueFolderIds, folderId].sort((a, b) => a - b);
      return { taggingQueueFolderIds: next };
    });
  },

  setTaggingQueueFolderIds: (taggingQueueFolderIds) => set({ taggingQueueFolderIds }),

  loadTaggerModelStatus: async () => {
    try {
      const taggerModelStatus = await invoke<TaggerModelStatus>("get_tagger_model_status");
      set({ taggerModelStatus, taggerModelError: null });
    } catch (error) {
      set({ taggerModelError: String(error) });
    }
  },

  loadTaggerAcceleration: async () => {
    try {
      const taggerAcceleration = await invoke<TaggerAcceleration>("get_tagger_acceleration");
      set({ taggerAcceleration });
    } catch (error) {
      set({ taggerModelError: String(error) });
    }
  },

  setTaggerAcceleration: async (acceleration) => {
    const taggerAcceleration = await invoke<TaggerAcceleration>("set_tagger_acceleration", {
      params: { acceleration },
    });
    set({ taggerAcceleration, taggerRuntimeProbe: null });
  },

  loadTaggerThreshold: async () => {
    try {
      const taggerThreshold = await invoke<number>("get_tagger_threshold");
      set({ taggerThreshold });
    } catch (error) {
      set({ taggerModelError: String(error) });
    }
  },

  setTaggerThreshold: async (threshold) => {
    const taggerThreshold = await invoke<number>("set_tagger_threshold", {
      params: { threshold },
    });
    set({ taggerThreshold });
  },

  loadTaggerBatchSize: async () => {
    try {
      const taggerBatchSize = await invoke<number>("get_tagger_batch_size");
      set({ taggerBatchSize });
    } catch (error) {
      set({ taggerModelError: String(error) });
    }
  },

  setTaggerBatchSize: async (batchSize) => {
    const taggerBatchSize = await invoke<number>("set_tagger_batch_size", {
      params: { batch_size: batchSize },
    });
    set({ taggerBatchSize });
  },

  prepareTaggerModel: async () => {
    set({ taggerModelPreparing: true, taggerModelError: null, taggerModelProgress: null });
    try {
      const taggerModelStatus = await invoke<TaggerModelStatus>("prepare_tagger_model");
      set({ taggerModelStatus, taggerModelPreparing: false, taggerModelError: null, taggerModelProgress: null });
    } catch (error) {
      set({ taggerModelPreparing: false, taggerModelError: String(error), taggerModelProgress: null });
    }
  },

  deleteTaggerModel: async () => {
    set({ taggerModelPreparing: true, taggerModelError: null, taggerModelProgress: null });
    try {
      const taggerModelStatus = await invoke<TaggerModelStatus>("delete_tagger_model");
      set({ taggerModelStatus, taggerModelPreparing: false, taggerModelError: null, taggerModelProgress: null, taggerRuntimeProbe: null });
    } catch (error) {
      set({ taggerModelPreparing: false, taggerModelError: String(error), taggerModelProgress: null });
    }
  },

  probeTaggerRuntime: async () => {
    set({ taggerRuntimeChecking: true, taggerModelError: null });
    try {
      const taggerRuntimeProbe = await invoke<TaggerRuntimeProbe>("probe_tagger_runtime");
      set({ taggerRuntimeProbe, taggerRuntimeChecking: false, taggerModelError: null });
    } catch (error) {
      set({ taggerRuntimeChecking: false, taggerModelError: String(error), taggerRuntimeProbe: null });
    }
  },

  queueTaggingJobs: async (folderId = get().selectedFolderId) => {
    const queued = await invoke<number>("queue_tagging_jobs", {
      params: { folder_id: folderId ?? null, image_id: null },
    });
    await get().loadBackgroundJobProgress();
    return queued;
  },

  queueTaggingJobsForFolders: async (folderIds) => {
    const queued = await invoke<number>("queue_tagging_jobs", {
      params: { folder_id: null, folder_ids: folderIds, image_id: null },
    });
    await get().loadBackgroundJobProgress();
    return queued;
  },

  queueTaggingForImage: async (imageId) => {
    const queued = await invoke<number>("queue_tagging_jobs", {
      params: { folder_id: null, image_id: imageId },
    });
    await get().loadBackgroundJobProgress();
    return queued;
  },

  clearTaggingJobs: async (folderId = get().selectedFolderId) => {
    const cleared = await invoke<number>("clear_tagging_jobs", {
      params: { folder_id: folderId ?? null },
    });
    await get().loadBackgroundJobProgress();
    return cleared;
  },

  clearTaggingJobsForFolders: async (folderIds) => {
    const cleared = await invoke<number>("clear_tagging_jobs", {
      params: { folder_id: null, folder_ids: folderIds },
    });
    await get().loadBackgroundJobProgress();
    return cleared;
  },

  getImageTags: async (imageId) => {
    return invoke<ImageTag[]>("get_image_tags", {
      params: { image_id: imageId },
    });
  },

  addUserTag: async (imageId, tag) => {
    const result = await invoke<ImageTag>("add_user_tag", {
      params: { image_id: imageId, tag },
    });
    // Invalidate explore tags cache so new tag appears immediately
    set({ exploreTagsFolderId: undefined });
    return result;
  },

  removeTag: async (tagId) => {
    await invoke<void>("remove_tag", {
      params: { tag_id: tagId },
    });
    // Invalidate explore tags cache so removed tag disappears immediately
    set({ exploreTagsFolderId: undefined });
  },

  loadDuplicateScanCache: async (folderId = null) => {
    interface CacheResult { groups: DuplicateGroup[]; scanned_at: number }
    const cached = await invoke<CacheResult | null>("load_duplicate_scan_cache", { folderId: folderId ?? null });
    if (cached) {
      set({ duplicateGroups: cached.groups, duplicateLastScanned: cached.scanned_at, duplicateScanFolderId: folderId });
    }
  },

  scanDuplicates: async (folderId = null) => {
    const { listen } = await import("@tauri-apps/api/event");
    set({ duplicateScanning: true, duplicateGroups: [], duplicateScanProgress: null, duplicateSelectedIds: new Set() });
    const unlisten = await listen<[number, number]>("duplicate_scan_progress", (event) => {
      const [scanned, total] = event.payload;
      set({ duplicateScanProgress: { scanned, total } });
    });
    try {
      const groups = await invoke<DuplicateGroup[]>("find_duplicates", { folderId: folderId ?? null });
      set({ duplicateGroups: groups, duplicateLastScanned: Math.floor(Date.now() / 1000), duplicateScanFolderId: folderId });
      void notifyTaskComplete(
        "Duplicate scan complete",
        groups.length === 1 ? "Found 1 duplicate group." : `Found ${groups.length.toLocaleString()} duplicate groups.`,
      );
    } finally {
      unlisten();
      set({ duplicateScanning: false });
    }
  },

  toggleDuplicateSelected: (imageId) => {
    set((state) => {
      const next = new Set(state.duplicateSelectedIds);
      if (next.has(imageId)) next.delete(imageId);
      else next.add(imageId);
      return { duplicateSelectedIds: next };
    });
  },

  selectAllDuplicates: (imageIds) => {
    set((state) => {
      const next = new Set(state.duplicateSelectedIds);
      for (const id of imageIds) next.add(id);
      return { duplicateSelectedIds: next };
    });
  },

  selectKeepFirstAllGroups: () => {
    const { duplicateGroups } = get();
    const toMark = new Set<number>();
    for (const group of duplicateGroups) {
      for (const img of group.images.slice(1)) toMark.add(img.id);
    }
    set({ duplicateSelectedIds: toMark });
  },

  clearDuplicateSelection: () => set({ duplicateSelectedIds: new Set() }),

  deleteSelectedDuplicates: async () => {
    const { duplicateSelectedIds } = get();
    const ids = Array.from(duplicateSelectedIds);
    if (ids.length === 0) return 0;
    const deleted = await invoke<number>("delete_images_from_disk", { params: { image_ids: ids } });
    // Remove deleted images from groups and drop now-trivial groups
    set((state) => ({
      duplicateSelectedIds: new Set(),
      duplicateGroups: state.duplicateGroups
        .map((g) => ({ ...g, images: g.images.filter((img) => !duplicateSelectedIds.has(img.id)) }))
        .filter((g) => g.images.length > 1),
    }));
    return deleted;
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
          const folderName = get().folders.find((folder) => folder.id === progress.folder_id)?.name;
          void notifyTaskComplete(
            "Folder scan complete",
            folderName ? `${folderName} has finished scanning.` : "A folder has finished scanning.",
          );
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

        const folderName =
          get().folders.find((folder) => folder.id === progress.folder_id)?.name ?? "Folder";

        if (previous.embedding_pending > 0 && progress.embedding_pending === 0) {
          const failureDetail =
            progress.embedding_failed > 0
              ? ` ${progress.embedding_failed.toLocaleString()} failed.`
              : "";
          void notifyTaskComplete(
            "Embeddings complete",
            `${folderName} finished generating embeddings.${failureDetail}`,
          );
        }

        if (previous.tagging_pending > 0 && progress.tagging_pending === 0) {
          const failureDetail =
            progress.tagging_failed > 0
              ? ` ${progress.tagging_failed.toLocaleString()} failed.`
              : "";
          void notifyTaskComplete(
            "AI tagging complete",
            `${folderName} finished generating tags.${failureDetail}`,
          );
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
    });

    const unlistenImages = await listen<IndexedImagesBatch>("indexed-images", (event) => {
      const batch = event.payload;

      set((state) => {
        if (isDerivedCollectionTitle(state.collectionTitle) || state.activeView === "explore") {
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
        if (isDerivedCollectionTitle(state.collectionTitle) || state.activeView === "explore") {
          const selectedImage =
            state.selectedImage && batch.images.some((image) => image.id === state.selectedImage?.id)
              ? batch.images.find((image) => image.id === state.selectedImage?.id) ?? state.selectedImage
              : state.selectedImage;
          return { selectedImage };
        }

        const visibleImages = batch.images.filter((image) =>
          matchesFilters(
            image,
            state.selectedFolderId,
            state.mediaFilter,
            state.favoritesOnly,
            state.minimumRating,
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
      unlistenCaptionModelProgress();
      unlistenTaggerModelProgress();
      unlistenImages();
      unlistenThumbnails();
    };
  },
}));

appDataDir().then(async (dir) => {
  useGalleryStore.getState().setCacheDir(await join(dir, "thumbnails"));
});
