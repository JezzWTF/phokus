import type { Folder, FolderJobProgress, ImageRecord } from '../store/types'

let nextImageId = 1

export function makeImage(overrides: Partial<ImageRecord> = {}): ImageRecord {
  const id = overrides.id ?? nextImageId++
  return {
    id,
    folder_id: 1,
    path: `C:/media/image-${id}.jpg`,
    filename: `image-${id}.jpg`,
    thumbnail_path: null,
    width: 1920,
    height: 1080,
    file_size: 1024,
    created_at: null,
    modified_at: '2026-01-01T00:00:00Z',
    taken_at: null,
    mime_type: 'image/jpeg',
    media_kind: 'image',
    duration_ms: null,
    video_codec: null,
    audio_codec: null,
    metadata_updated_at: null,
    metadata_error: null,
    favorite: false,
    rating: 0,
    embedding_status: 'pending',
    embedding_model: null,
    embedding_updated_at: null,
    embedding_error: null,
    generated_caption: null,
    caption_model: null,
    caption_updated_at: null,
    caption_error: null,
    ai_rating: null,
    ai_tagger_model: null,
    ai_tagged_at: null,
    ai_tagger_error: null,
    ...overrides,
  }
}

export function makeFolder(overrides: Partial<Folder> = {}): Folder {
  return {
    id: 1,
    path: 'C:/media',
    name: 'media',
    image_count: 0,
    indexed_at: null,
    scan_error: null,
    sort_order: 0,
    ...overrides,
  }
}

export function makeFolderProgress(overrides: Partial<FolderJobProgress> = {}): FolderJobProgress {
  return {
    folder_id: 1,
    thumbnail_pending: 0,
    metadata_pending: 0,
    embedding_pending: 0,
    embedding_ready: 0,
    embedding_failed: 0,
    caption_pending: 0,
    caption_ready: 0,
    caption_failed: 0,
    tagging_pending: 0,
    tagging_ready: 0,
    tagging_failed: 0,
    ...overrides,
  }
}
