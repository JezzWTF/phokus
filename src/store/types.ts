export interface Folder {
  id: number
  path: string
  name: string
  image_count: number
  indexed_at: string | null
  scan_error: string | null
  sort_order: number
}

export interface DirEntry {
  name: string
  path: string
  has_children: boolean
}

export interface DirListing {
  current: string | null
  parent: string | null
  entries: DirEntry[]
}

export type FolderAddResult =
  | { status: 'added'; data: Folder }
  | { status: 'skipped'; data: string }
  | { status: 'error'; data: string }

export type MediaKind = 'image' | 'video'
export type MediaFilter = 'all' | MediaKind
export type ZoomPreset = 'compact' | 'comfortable' | 'detail'
export type SearchMode = 'filename' | 'semantic'
export type SearchCommand = 'filename' | 'semantic' | 'tag'
export type CaptionAcceleration = 'auto' | 'cpu' | 'directml'
export type CaptionDetail = 'short' | 'detailed' | 'paragraph'
export type TaggerAcceleration = 'auto' | 'cpu' | 'directml'
export type TaggerModel = 'wd' | 'joytag'
export type AiRating = 'general' | 'sensitive' | 'questionable' | 'explicit'
export type TaggingQueueScope = 'all' | 'selected'
export type SimilarScope = 'all_media' | 'current_folder' | 'current_album'
export type ExploreMode = 'visual' | 'tags'
export type AppTheme = 'phokus' | 'subtle-light' | 'conventional-dark'
export type SlideshowOrder = 'sequential' | 'random'
export type SlideshowTransition = 'soft-fade' | 'gentle-motion'

export interface ImageRecord {
  id: number
  folder_id: number
  path: string
  filename: string
  thumbnail_path: string | null
  width: number | null
  height: number | null
  file_size: number
  created_at: string | null
  modified_at: string | null
  taken_at: string | null
  mime_type: string
  media_kind: MediaKind
  duration_ms: number | null
  video_codec: string | null
  audio_codec: string | null
  metadata_updated_at: string | null
  metadata_error: string | null
  favorite: boolean
  rating: number
  embedding_status: string
  embedding_model: string | null
  embedding_updated_at: string | null
  embedding_error: string | null
  generated_caption: string | null
  caption_model: string | null
  caption_updated_at: string | null
  caption_error: string | null
  ai_rating: AiRating | null
  ai_tagger_model: string | null
  ai_tagged_at: string | null
  ai_tagger_error: string | null
}

export interface ImageTag {
  id: number
  image_id: number
  tag: string
  source: 'user' | 'ai'
  ai_model: string | null
  confidence: number | null
  created_at: string
}

export interface DatabaseInfo {
  size_mb: number
  reclaimable_mb: number
}

export interface VacuumResult {
  before_mb: number
  after_mb: number
  freed_mb: number
}

export interface OrphanedThumbnailsInfo {
  count: number
  size_mb: number
}

export interface CleanupOrphanedThumbnailsResult {
  deleted_count: number
  freed_mb: number
}

export interface TaggerModelStatus {
  model_id: string
  model_name: string
  local_dir: string
  ready: boolean
  missing_files: string[]
}

export interface TaggerModelProgress {
  total_files: number
  completed_files: number
  current_file: string | null
  downloaded_bytes: number | null
  total_bytes: number | null
  done: boolean
}

export interface IndexProgress {
  folder_id: number
  total: number
  indexed: number
  current_file: string
  done: boolean
}

export interface FolderJobProgress {
  folder_id: number
  thumbnail_pending: number
  metadata_pending: number
  embedding_pending: number
  embedding_ready: number
  embedding_failed: number
  caption_pending: number
  caption_ready: number
  caption_failed: number
  tagging_pending: number
  tagging_ready: number
  tagging_failed: number
}

export interface MediaJobProgressEvent {
  progress: FolderJobProgress[]
}

export interface IndexedImagesBatch {
  folder_id: number
  images: ImageRecord[]
}

export interface ThumbnailBatch {
  images: ImageRecord[]
}

export type ActiveView = 'gallery' | 'explore' | 'duplicates' | 'timeline' | 'album'

export interface Album {
  id: number
  name: string
  cover_image_id: number | null
  cover_thumbnail_path: string | null
  image_count: number
  sort_order: number
  created_at: string
  updated_at: string
}

export interface ImageExif {
  make: string | null
  model: string | null
  lens: string | null
  iso: string | null
  f_number: string | null
  exposure_time: string | null
  focal_length: string | null
  datetime_original: string | null
  gps_lat: number | null
  gps_lon: number | null
}

export interface VisualClusterEntry {
  count: number
  representative_image_id: number
  thumbnail_path: string | null
  image_ids: number[]
}

export interface ExploreTagEntry {
  tag: string
  count: number
  representative_image_id: number
  thumbnail_path: string | null
  has_ai_source: boolean
  has_user_source: boolean
}

export interface RelatedTagEntry {
  tag: string
  shared_count: number
}

export interface DuplicateGroup {
  file_hash: string
  file_size: number
  images: ImageRecord[]
}

export interface DuplicateScanProgress {
  phase: 'checking' | 'hashing' | 'confirming'
  processed: number
  total: number
  skipped: number
}

export interface DuplicateScanResult {
  groups: DuplicateGroup[]
  scanned_files: number
  candidate_files: number
  skipped_files: number
}

export interface SimilarImagesPage {
  images: ImageRecord[]
  offset: number
  limit: number
  has_more: boolean
}

export interface CaptionModelStatus {
  model_id: string
  model_name: string
  local_dir: string
  ready: boolean
  missing_files: string[]
}

export interface CaptionModelProgress {
  total_files: number
  completed_files: number
  current_file: string | null
  done: boolean
}

export interface CaptionRuntimeSessionProbe {
  file: string
  inputs: string[]
  outputs: string[]
}

export interface CaptionRuntimeProbe {
  ready: boolean
  acceleration: CaptionAcceleration
  detail: CaptionDetail
  tokenizer_vocab_size: number
  sessions: CaptionRuntimeSessionProbe[]
}

export interface CaptionVisionProbe {
  input_shape: number[]
  output_shape: number[]
  output_values: number
  acceleration: CaptionAcceleration
}

export interface TaggerRuntimeSessionProbe {
  file: string
  inputs: string[]
  outputs: string[]
}

export interface TaggerRuntimeProbe {
  ready: boolean
  acceleration: TaggerAcceleration
  session: TaggerRuntimeSessionProbe
}

export interface ParsedSearch {
  mode: SearchCommand
  query: string
  prefix: string | null
}

export type SortOrder =
  | 'date_desc'
  | 'date_asc'
  | 'name_asc'
  | 'name_desc'
  | 'size_desc'
  | 'size_asc'
  | 'rating_desc'
  | 'rating_asc'
  | 'duration_desc'
  | 'duration_asc'
  | 'taken_desc'
  | 'taken_asc'

export type UpdateStatus =
  'idle' | 'checking' | 'upToDate' | 'available' | 'downloading' | 'installing' | 'error'

export type WorkerKey = 'thumbnail' | 'metadata' | 'embedding' | 'tagging'

export const WORKER_KEYS: WorkerKey[] = ['thumbnail', 'metadata', 'embedding', 'tagging']

export interface FolderWorkerStates {
  folder_id: number
  thumbnail_paused: boolean
  metadata_paused: boolean
  embedding_paused: boolean
  tagging_paused: boolean
}

export type FfmpegStatus =
  'unknown' | 'starting' | 'downloading' | 'unpacking' | 'installed' | 'error'

export interface FfmpegProgressEvent {
  phase: string
  downloaded_bytes: number | null
  total_bytes: number | null
  error: string | null
}
