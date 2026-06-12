import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { appDataDir, join } from "@tauri-apps/api/path";
import { getVersion } from "@tauri-apps/api/app";
import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { notifyTaskComplete } from "./notifications";

// Per-folder debounce timers for batching notifications.
// Keyed as `${folderId}:embedding` or `${folderId}:tagging`.
const notificationTimers = new Map<string, ReturnType<typeof setTimeout>>();
const NOTIFICATION_DEBOUNCE_MS = 6000;

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
  taken_at: string | null;
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

export interface DatabaseInfo {
  size_mb: number;
  reclaimable_mb: number;
}

export interface VacuumResult {
  before_mb: number;
  after_mb: number;
  freed_mb: number;
}

export interface OrphanedThumbnailsInfo {
  count: number;
  size_mb: number;
}

export interface CleanupOrphanedThumbnailsResult {
  deleted_count: number;
  freed_mb: number;
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

export type ActiveView = "gallery" | "explore" | "duplicates" | "timeline";

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

export interface DuplicateScanProgress {
  phase: "checking" | "hashing" | "confirming";
  processed: number;
  total: number;
  skipped: number;
}

interface DuplicateScanResult {
  groups: DuplicateGroup[];
  scanned_files: number;
  candidate_files: number;
  skipped_files: number;
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
  | "duration_asc"
  | "taken_desc"
  | "taken_asc";

export type UpdateStatus = "idle" | "checking" | "upToDate" | "available" | "downloading" | "installing" | "error";

export type FfmpegStatus = "unknown" | "starting" | "downloading" | "unpacking" | "installed" | "error";

interface FfmpegProgressEvent {
  phase: string;
  downloaded_bytes: number | null;
  total_bytes: number | null;
  error: string | null;
}

// The Update handle from the plugin carries the download method; it's not
// serializable state, so it lives outside the store.
let pendingUpdate: Update | null = null;

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
  mutedFolderIds: number[];
  notificationsPaused: boolean;

  appVersion: string | null;
  updateStatus: UpdateStatus;
  updateVersion: string | null;
  updateProgress: number | null; // 0..1 download progress, null while size unknown
  updateError: string | null;
  updateDismissed: boolean;

  ffmpegStatus: FfmpegStatus;
  ffmpegProgress: { downloaded_bytes: number; total_bytes: number } | null;
  ffmpegError: string | null;
  onboardingCompleted: boolean | null; // null = not loaded yet
  onboardingOpen: boolean;
  onboardingStep: number;

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
  duplicateScanProgress: DuplicateScanProgress | null;
  duplicateScanError: string | null;
  duplicateScanWarning: string | null;
  duplicateSelectedIds: Set<number>;
  duplicateLastScanned: number | null; // Unix timestamp (seconds)
  duplicateScanFolderId: number | null | undefined; // undefined = never scanned

  loadFolders: () => Promise<void>;
  loadBackgroundJobProgress: () => Promise<void>;
  addFolder: (path: string) => Promise<void>;
  removeFolder: (folderId: number) => Promise<void>;
  reindexFolder: (folderId: number) => Promise<void>;
  renameFolder: (folderId: number, newName: string) => Promise<void>;
  updateFolderPath: (folderId: number, newPath: string) => Promise<void>;
  selectFolder: (folderId: number | null) => void;
  setViewFolderScope: (folderId: number | null) => void;
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
  loadTaggingQueueScope: () => Promise<void>;
  setTaggingQueueScope: (scope: TaggingQueueScope) => void;
  loadTaggingQueueFolderIds: () => Promise<void>;
  toggleTaggingQueueFolder: (folderId: number) => void;
  setTaggingQueueFolderIds: (folderIds: number[]) => void;
  loadMutedFolderIds: () => Promise<void>;
  toggleMutedFolder: (folderId: number) => void;
  loadNotificationsPaused: () => Promise<void>;
  setNotificationsPaused: (paused: boolean) => void;
  loadAppVersion: () => Promise<void>;
  checkForUpdates: (options?: { quiet?: boolean }) => Promise<void>;
  installUpdate: () => Promise<void>;
  dismissUpdate: () => void;
  loadFfmpegStatus: () => Promise<void>;
  retryFfmpegDownload: () => Promise<void>;
  loadOnboardingCompleted: () => Promise<void>;
  completeOnboarding: () => void;
  openOnboarding: () => void;
  setOnboardingStep: (step: number) => void;
  openAppDataFolder: () => Promise<void>;
  getDatabaseInfo: () => Promise<DatabaseInfo>;
  vacuumDatabase: () => Promise<VacuumResult>;
  getOrphanedThumbnailsInfo: () => Promise<OrphanedThumbnailsInfo>;
  cleanupOrphanedThumbnails: () => Promise<CleanupOrphanedThumbnailsResult>;
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
    case "taken_asc":
      return compareNullableDate(a.taken_at ?? a.modified_at, b.taken_at ?? b.modified_at);
    case "taken_desc":
      return compareNullableDate(b.taken_at ?? b.modified_at, a.taken_at ?? a.modified_at);
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
  mutedFolderIds: [],
  notificationsPaused: false,

  appVersion: null,
  updateStatus: "idle",
  updateVersion: null,
  updateProgress: null,
  updateError: null,
  updateDismissed: false,

  ffmpegStatus: "unknown",
  ffmpegProgress: null,
  ffmpegError: null,
  onboardingCompleted: null,
  onboardingOpen: false,
  onboardingStep: 0,

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
  duplicateScanError: null,
  duplicateScanWarning: null,
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
    // Invalidate tag cloud and explore-tags cache since library content changed
    set({ tagCloudFolderId: undefined, tagCloudEntries: [], exploreTagsFolderId: undefined });
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

  renameFolder: async (folderId, newName) => {
    await invoke("rename_folder", { folderId, newName });
    await get().loadFolders();
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

  // Change folder scope from inside a feature view (Timeline/Explore/Duplicates)
  // without leaving it — unlike selectFolder, activeView is preserved.
  setViewFolderScope: (folderId) => {
    const { activeView, selectedFolderId } = get();
    if (folderId === selectedFolderId) return;

    set({ selectedFolderId: folderId, images: [], loadedCount: 0, collectionTitle: null, similarSourceImageId: null, similarHasMore: false, imageLoadError: null });

    if (activeView === "duplicates") {
      const { duplicateScanFolderId } = get();
      if (duplicateScanFolderId !== folderId) {
        set({
          duplicateGroups: [],
          duplicateLastScanned: null,
          duplicateScanFolderId: undefined,
          duplicateScanWarning: null,
        });
        void get().loadDuplicateScanCache(folderId);
      }
      return;
    }

    // Explore reloads itself via TagCloud's useEffect on selectedFolderId.
    if (activeView === "explore") return;

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
        const offset = reset ? 0 : loadedCount;
        const result = await invoke<{ images: ImageRecord[]; total: number; offset: number; limit: number }>("search_images_by_tag", {
          params: {
            query: parsedSearch.query,
            folder_id: selectedFolderId,
            media_kind: mediaFilter === "all" ? null : mediaFilter,
            favorites_only: favoritesOnly,
            rating_min: minimumRating > 0 ? minimumRating : null,
            limit: PAGE_SIZE,
            offset,
          },
        });

        if (requestToken !== galleryRequestToken) return;
        if (reset) {
          set({
            images: result.images,
            totalImages: result.total,
            loadedCount: result.images.length,
            loadingImages: false,
            collectionTitle: `Tag search: ${parsedSearch.query}`,
            selectedFolderId,
            similarSourceImageId: null,
            similarSourceFolderId: null,
            similarHasMore: false,
            similarFolderId: null,
          });
        } else {
          set((state) => ({
            images: [...state.images, ...result.images],
            loadedCount: state.loadedCount + result.images.length,
            totalImages: result.total,
            loadingImages: false,
          }));
        }
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
      await get().loadSimilarImages(similarSourceImageId, similarFolderId, false, get().similarSourceFolderId ?? null);
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
    if (activeView === "timeline") {
      set({ activeView, sort: "taken_asc", images: [], loadedCount: 0, collectionTitle: null, similarSourceImageId: null, similarSourceFolderId: null, similarFolderId: null, similarHasMore: false, similarCrop: null, imageLoadError: null });
      void get().loadImages(true);
      return;
    }
    if (activeView === "duplicates") {
      const { selectedFolderId, duplicateScanFolderId } = get();
      if (duplicateScanFolderId !== selectedFolderId) {
        set({
          activeView,
          duplicateGroups: [],
          duplicateLastScanned: null,
          duplicateScanFolderId: undefined,
          duplicateScanWarning: null,
        });
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
    const { similarSourceImageId, similarSourceFolderId, selectedFolderId, collectionTitle, similarCrop } = get();
    if (similarSourceImageId === null) return;
    const folderId = similarScope === "current_folder" ? (similarSourceFolderId ?? selectedFolderId) : null;
    if (collectionTitle === "Region Search Results" && similarCrop !== null) {
      void get().loadSimilarByRegion(similarSourceImageId, similarCrop, folderId, similarSourceFolderId);
    } else {
      void get().loadSimilarImages(similarSourceImageId, folderId, true, similarSourceFolderId);
    }
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

  loadTaggingQueueScope: async () => {
    try {
      const scope = await invoke<TaggingQueueScope>("get_tagging_queue_scope");
      set({ taggingQueueScope: scope });
    } catch {
      // silently fall back to in-memory default
    }
  },

  setTaggingQueueScope: (taggingQueueScope) => {
    set((state) => ({
      taggingQueueScope,
      taggingQueueFolderIds:
        taggingQueueScope === "selected" && state.taggingQueueFolderIds.length === 0 && state.folders.length > 0
          ? [state.folders[0].id]
          : state.taggingQueueFolderIds,
    }));
    void invoke("set_tagging_queue_scope", { scope: taggingQueueScope }).catch(() => {});
  },

  loadTaggingQueueFolderIds: async () => {
    try {
      const folderIds = await invoke<number[]>("get_tagging_queue_folder_ids");
      set({ taggingQueueFolderIds: folderIds });
    } catch {
      // silently fall back to in-memory default
    }
  },

  toggleTaggingQueueFolder: (folderId) => {
    set((state) => {
      const next = state.taggingQueueFolderIds.includes(folderId)
        ? state.taggingQueueFolderIds.filter((id) => id !== folderId)
        : [...state.taggingQueueFolderIds, folderId].sort((a, b) => a - b);
      void invoke("set_tagging_queue_folder_ids", { folder_ids: next }).catch(() => {});
      return { taggingQueueFolderIds: next };
    });
  },

  setTaggingQueueFolderIds: (taggingQueueFolderIds) => {
    set({ taggingQueueFolderIds });
    void invoke("set_tagging_queue_folder_ids", { folder_ids: taggingQueueFolderIds }).catch(() => {});
  },

  loadMutedFolderIds: async () => {
    try {
      const folderIds = await invoke<number[]>("get_muted_folder_ids");
      set({ mutedFolderIds: folderIds });
    } catch {
      // fall back to in-memory default
    }
  },

  toggleMutedFolder: (folderId) => {
    set((state) => {
      const next = state.mutedFolderIds.includes(folderId)
        ? state.mutedFolderIds.filter((id) => id !== folderId)
        : [...state.mutedFolderIds, folderId];
      void invoke("set_muted_folder_ids", { folder_ids: next }).catch(() => {});
      return { mutedFolderIds: next };
    });
  },

  loadNotificationsPaused: async () => {
    try {
      const paused = await invoke<boolean>("get_notifications_paused");
      set({ notificationsPaused: paused });
    } catch {
      // fall back to in-memory default
    }
  },

  setNotificationsPaused: (paused) => {
    set({ notificationsPaused: paused });
    void invoke("set_notifications_paused", { paused }).catch(() => {});
  },

  loadAppVersion: async () => {
    try {
      set({ appVersion: await getVersion() });
    } catch {
      // leave null; the UI falls back to a dash
    }
  },

  checkForUpdates: async (options) => {
    const quiet = options?.quiet ?? false;
    const { updateStatus } = get();
    if (updateStatus === "checking" || updateStatus === "downloading" || updateStatus === "installing") return;

    set({ updateStatus: "checking", updateError: null });
    try {
      const update = await check();
      if (update) {
        pendingUpdate = update;
        set({ updateStatus: "available", updateVersion: update.version, updateDismissed: false });
      } else {
        pendingUpdate = null;
        set({ updateStatus: "upToDate", updateVersion: null });
      }
    } catch (error) {
      pendingUpdate = null;
      if (quiet) {
        // Launch-time check: stay silent on network/endpoint failures.
        set({ updateStatus: "idle" });
      } else {
        set({ updateStatus: "error", updateError: error instanceof Error ? error.message : String(error) });
      }
    }
  },

  installUpdate: async () => {
    const update = pendingUpdate;
    if (!update || get().updateStatus !== "available") return;

    set({ updateStatus: "downloading", updateProgress: null, updateError: null });
    try {
      let contentLength: number | null = null;
      let downloaded = 0;
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            contentLength = event.data.contentLength ?? null;
            set({ updateProgress: contentLength ? 0 : null });
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            if (contentLength) {
              set({ updateProgress: Math.min(downloaded / contentLength, 1) });
            }
            break;
          case "Finished":
            set({ updateStatus: "installing", updateProgress: 1 });
            break;
        }
      });
      await relaunch();
    } catch (error) {
      set({ updateStatus: "error", updateError: error instanceof Error ? error.message : String(error) });
    }
  },

  dismissUpdate: () => set({ updateDismissed: true }),

  loadFfmpegStatus: async () => {
    try {
      const status = await invoke<{ installed: boolean; downloading: boolean; failed: boolean }>(
        "get_ffmpeg_status",
      );
      if (status.installed) {
        set({ ffmpegStatus: "installed" });
      } else if (status.failed) {
        // The download failed before our event listener attached — surface
        // the error state so the retry button is reachable.
        set({ ffmpegStatus: "error", ffmpegError: "The download could not be completed. Check your connection and retry." });
      } else {
        // Not installed and possibly not downloading yet — the provision
        // thread starts with the app, so treat the gap as "starting" and let
        // the first ffmpeg-progress event settle the real state.
        set({ ffmpegStatus: "starting" });
      }
    } catch {
      // leave "unknown"; events will correct it
    }
  },

  retryFfmpegDownload: async () => {
    set({ ffmpegStatus: "starting", ffmpegError: null, ffmpegProgress: null });
    try {
      await invoke("retry_ffmpeg_download");
    } catch (error) {
      set({ ffmpegStatus: "error", ffmpegError: error instanceof Error ? error.message : String(error) });
    }
  },

  loadOnboardingCompleted: async () => {
    try {
      const completed = await invoke<boolean>("get_onboarding_completed");
      set(
        completed
          ? { onboardingCompleted: true }
          : { onboardingCompleted: false, onboardingOpen: true, onboardingStep: 0 },
      );
    } catch {
      // If the flag can't be read, don't trap the user in onboarding.
      set({ onboardingCompleted: true });
    }
  },

  completeOnboarding: () => {
    set({ onboardingOpen: false, onboardingCompleted: true });
    void invoke("set_onboarding_completed", { completed: true }).catch(() => {});
  },

  openOnboarding: () => set({ onboardingOpen: true, onboardingStep: 0 }),

  setOnboardingStep: (step) => set({ onboardingStep: step }),

  openAppDataFolder: async () => {
    await invoke("open_app_data_folder");
  },

  getDatabaseInfo: () => invoke<DatabaseInfo>("get_database_info"),

  vacuumDatabase: () => invoke<VacuumResult>("vacuum_database"),

  getOrphanedThumbnailsInfo: () => invoke<OrphanedThumbnailsInfo>("get_orphaned_thumbnails_info"),

  cleanupOrphanedThumbnails: () => invoke<CleanupOrphanedThumbnailsResult>("cleanup_orphaned_thumbnails"),

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
      set({
        duplicateGroups: cached.groups,
        duplicateLastScanned: cached.scanned_at,
        duplicateScanFolderId: folderId,
        duplicateScanWarning: null,
      });
    }
  },

  scanDuplicates: async (folderId = null) => {
    const { listen } = await import("@tauri-apps/api/event");
    set({
      duplicateScanning: true,
      duplicateGroups: [],
      duplicateScanProgress: null,
      duplicateScanError: null,
      duplicateScanWarning: null,
      duplicateSelectedIds: new Set(),
    });
    const unlisten = await listen<DuplicateScanProgress>("duplicate_scan_progress", (event) => {
      set({ duplicateScanProgress: event.payload });
    });
    try {
      const result = await invoke<DuplicateScanResult>("find_duplicates", { folderId: folderId ?? null });
      const warning = result.skipped_files > 0
        ? `${result.skipped_files.toLocaleString()} file${result.skipped_files === 1 ? "" : "s"} could not be read and were skipped.`
        : null;
      set({
        duplicateGroups: result.groups,
        duplicateLastScanned: Math.floor(Date.now() / 1000),
        duplicateScanFolderId: folderId,
        duplicateScanWarning: warning,
      });
      void notifyTaskComplete(
        "Duplicate scan complete",
        `${result.groups.length === 1 ? "Found 1 duplicate group." : `Found ${result.groups.length.toLocaleString()} duplicate groups.`}${warning ? ` ${warning}` : ""}`,
      );
    } catch (e) {
      set({ duplicateScanError: String(e) });
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
    const { duplicateSelectedIds, duplicateGroups } = get();
    const ids = Array.from(duplicateSelectedIds);
    if (ids.length === 0) return 0;
    // Backend returns only the IDs that were actually removed from disk.
    const succeededIds = await invoke<number[]>("delete_images_from_disk", { params: { image_ids: ids } });
    const succeededSet = new Set(succeededIds);
    // Only remove images confirmed deleted — failed files remain visible so the user can retry.
    set((state) => ({
      duplicateSelectedIds: new Set(),
      duplicateGroups: state.duplicateGroups
        .map((g) => ({ ...g, images: g.images.filter((img) => !succeededSet.has(img.id)) }))
        .filter((g) => g.images.length > 1),
    }));
    // Invalidate the persisted cache for every affected scope:
    // - global "all" cache (always, since a folder-scoped deletion still makes the global result stale)
    // - each folder that contained a deleted image (so a folder-scoped scan is also evicted)
    const affectedFolderIds = new Set<number>(
      duplicateGroups
        .flatMap((g) => g.images)
        .filter((img) => succeededSet.has(img.id))
        .map((img) => img.folder_id),
    );
    await invoke("invalidate_duplicate_scan_cache", { folderId: null }); // global
    for (const folderId of affectedFolderIds) {
      await invoke("invalidate_duplicate_scan_cache", { folderId });
    }
    return succeededIds.length;
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
              // New tags landed — invalidate Explore tag cache.
              set({ exploreTagsFolderId: undefined });
            }, NOTIFICATION_DEBOUNCE_MS));
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

    return () => {
      unlistenProgress();
      unlistenMediaJobs();
      unlistenCaptionModelProgress();
      unlistenTaggerModelProgress();
      unlistenImages();
      unlistenThumbnails();
      unlistenWatcherDeleted();
      unlistenFolderCounts();
      unlistenFfmpegProgress();
    };
  },
}));

appDataDir().then(async (dir) => {
  useGalleryStore.getState().setCacheDir(await join(dir, "thumbnails"));
});
