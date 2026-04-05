use crate::db::{self, DbPool, FolderJobProgress, ImageRecord, IndexedMediaEntry};
use crate::media::{probe_video_metadata, MediaTools};
use crate::thumbnail;
use crate::vector;
use anyhow::Result;
use rayon::prelude::*;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use walkdir::WalkDir;

const IMAGE_EXTENSIONS: &[&str] = &[
    "jpg", "jpeg", "png", "gif", "bmp", "tiff", "tif", "webp", "avif", "heic", "heif",
];

const VIDEO_EXTENSIONS: &[&str] = &["mp4", "mov", "m4v", "webm"];

const INDEX_BATCH_SIZE: usize = 250;
const WORKER_BATCH_SIZE: usize = 12;
const WORKER_FETCH_SIZE: usize = 64;
const JOB_PROGRESS_EMIT_INTERVAL: Duration = Duration::from_millis(750);

static LAST_JOB_PROGRESS_EMIT: OnceLock<Mutex<HashMap<i64, Instant>>> = OnceLock::new();
static ACTIVE_INDEXING_FOLDERS: OnceLock<Mutex<HashSet<i64>>> = OnceLock::new();

#[derive(Clone, Serialize)]
pub struct IndexProgress {
    pub folder_id: i64,
    pub total: usize,
    pub indexed: usize,
    pub current_file: String,
    pub done: bool,
}

#[derive(Clone, Serialize)]
pub struct IndexedImagesBatch {
    pub folder_id: i64,
    pub images: Vec<ImageRecord>,
}

#[derive(Clone, Serialize)]
pub struct MediaUpdateBatch {
    pub images: Vec<ImageRecord>,
}

#[derive(Clone, Serialize)]
pub struct MediaJobProgressEvent {
    pub progress: Vec<FolderJobProgress>,
}

pub fn index_folder(app: AppHandle, pool: DbPool, folder_id: i64, folder_path: PathBuf) {
    std::thread::spawn(move || {
        set_folder_indexing_state(folder_id, true);
        if let Err(error) = do_index(app, pool, folder_id, folder_path) {
            eprintln!("Indexing error: {}", error);
        }
        set_folder_indexing_state(folder_id, false);
    });
}

pub fn start_thumbnail_worker(
    app: AppHandle,
    pool: DbPool,
    media_tools: MediaTools,
    cache_dir: PathBuf,
) {
    std::thread::spawn(move || loop {
        if let Err(error) = process_thumbnail_batch(&app, &pool, &media_tools, &cache_dir) {
            eprintln!("Thumbnail worker error: {}", error);
        }

        std::thread::sleep(std::time::Duration::from_millis(250));
    });
}

pub fn start_metadata_worker(app: AppHandle, pool: DbPool, media_tools: MediaTools) {
    std::thread::spawn(move || loop {
        if let Err(error) = process_metadata_batch(&app, &pool, &media_tools) {
            eprintln!("Metadata worker error: {}", error);
        }

        std::thread::sleep(std::time::Duration::from_millis(250));
    });
}

fn do_index(app: AppHandle, pool: DbPool, folder_id: i64, folder_path: PathBuf) -> Result<()> {
    let existing_entries = {
        let conn = pool.get()?;
        db::get_folder_media_index(&conn, folder_id)?
    };
    let existing_by_path = existing_entries
        .into_iter()
        .map(|entry| (entry.path.clone(), entry))
        .collect::<HashMap<_, _>>();

    let media_paths: Vec<PathBuf> = WalkDir::new(&folder_path)
        .follow_links(true)
        .into_iter()
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.file_type().is_file() && is_supported_media(entry.path()))
        .map(|entry| entry.path().to_path_buf())
        .collect();

    let total = media_paths.len();
    emit_progress(
        &app,
        &IndexProgress {
            folder_id,
            total,
            indexed: 0,
            current_file: String::new(),
            done: false,
        },
    );

    let mut seen_paths = HashSet::with_capacity(total);
    let mut processed = 0usize;

    for path_chunk in media_paths.chunks(INDEX_BATCH_SIZE) {
        let records: Vec<ImageRecord> = path_chunk
            .par_iter()
            .filter_map(|path| {
                let path_str = path.to_string_lossy().to_string();
                let existing = existing_by_path.get(&path_str);
                build_record(path, folder_id, existing)
            })
            .collect();

        for path in path_chunk {
            seen_paths.insert(path.to_string_lossy().to_string());
        }

        if !records.is_empty() {
            let committed = commit_batch(&pool, &records)?;
            emit_images(
                &app,
                &IndexedImagesBatch {
                    folder_id,
                    images: committed,
                },
            );
            emit_folder_job_progress(&app, &pool, &[folder_id]);
        }

        processed += path_chunk.len();
        let current_file = path_chunk
            .last()
            .and_then(|path| path.file_name())
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_default();

        emit_progress(
            &app,
            &IndexProgress {
                folder_id,
                total,
                indexed: processed,
                current_file,
                done: false,
            },
        );
    }

    let missing_ids = existing_by_path
        .values()
        .filter(|entry| !seen_paths.contains(&entry.path))
        .map(|entry| entry.id)
        .collect::<Vec<_>>();

    {
        let conn = pool.get()?;
        if !missing_ids.is_empty() {
            db::delete_images_by_ids(&conn, &missing_ids)?;
        }
        db::update_folder_count(&conn, folder_id)?;
    }

    emit_progress(
        &app,
        &IndexProgress {
            folder_id,
            total,
            indexed: processed,
            current_file: String::new(),
            done: true,
        },
    );
    emit_folder_job_progress(&app, &pool, &[folder_id]);
    Ok(())
}

fn build_record(
    path: &Path,
    folder_id: i64,
    existing: Option<&IndexedMediaEntry>,
) -> Option<ImageRecord> {
    let path_str = path.to_string_lossy().to_string();
    let filename = path.file_name()?.to_string_lossy().to_string();
    let metadata = std::fs::metadata(path).ok()?;
    let file_size = metadata.len() as i64;
    let modified_at = metadata.modified().ok().map(|time| {
        let date_time: chrono::DateTime<chrono::Utc> = time.into();
        date_time.to_rfc3339()
    });

    let ext = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("jpg");
    let media_kind = media_kind_for_ext(ext).to_string();

    if let Some(existing) = existing {
        if existing.file_size == file_size
            && existing.modified_at == modified_at
            && existing.media_kind == media_kind
        {
            return None;
        }
    }

    Some(ImageRecord {
        id: existing.map(|entry| entry.id).unwrap_or(0),
        folder_id,
        path: path_str,
        filename,
        thumbnail_path: None,
        width: None,
        height: None,
        file_size,
        created_at: None,
        modified_at,
        mime_type: mime_for_ext(ext).to_string(),
        media_kind: media_kind.clone(),
        duration_ms: None,
        video_codec: None,
        audio_codec: None,
        metadata_updated_at: None,
        metadata_error: None,
        favorite: false,
        rating: 0,
        embedding_status: "pending".to_string(),
        embedding_model: Some(vector::CLIP_MODEL_NAME.to_string()),
        embedding_updated_at: None,
        embedding_error: None,
    })
}

fn commit_batch(pool: &DbPool, records: &[ImageRecord]) -> Result<Vec<ImageRecord>> {
    let mut conn = pool.get()?;
    let tx = conn.transaction()?;
    let mut committed = Vec::with_capacity(records.len());

    for record in records {
        let mut committed_record = record.clone();
        committed_record.id = db::upsert_image(&tx, record)?;
        db::enqueue_embedding_job(&tx, committed_record.id)?;
        db::enqueue_thumbnail_job(&tx, committed_record.id)?;
        if committed_record.media_kind == "video" {
            db::enqueue_metadata_job(&tx, committed_record.id)?;
        }
        committed.push(committed_record);
    }

    tx.commit()?;
    Ok(committed)
}

fn process_thumbnail_batch(
    app: &AppHandle,
    pool: &DbPool,
    media_tools: &MediaTools,
    cache_dir: &Path,
) -> Result<()> {
    let jobs = {
        let conn = pool.get()?;
        let active_folders = active_indexing_folders();
        db::get_pending_thumbnail_jobs(&conn, WORKER_FETCH_SIZE)?
            .into_iter()
            .filter(|job| !active_folders.contains(&job.folder_id))
            .take(WORKER_BATCH_SIZE)
            .collect::<Vec<_>>()
    };

    if jobs.is_empty() {
        return Ok(());
    }

    for job in &jobs {
        let conn = pool.get()?;
        db::mark_thumbnail_job_processing(&conn, job.image_id)?;
    }

    let (image_jobs, video_jobs): (Vec<_>, Vec<_>) =
        jobs.into_iter().partition(|job| job.media_kind == "image");

    let mut results = image_jobs
        .par_iter()
        .map(|job| {
            (
                job.image_id,
                if job.media_kind == "image" {
                    thumbnail::generate_image_thumbnail(Path::new(&job.path), cache_dir).map(Some)
                } else {
                    thumbnail::generate_video_thumbnail(
                        media_tools,
                        Path::new(&job.path),
                        cache_dir,
                    )
                    .map(Some)
                },
            )
        })
        .collect::<Vec<_>>();

    for job in video_jobs {
        results.push((
            job.image_id,
            thumbnail::generate_video_thumbnail(media_tools, Path::new(&job.path), cache_dir)
                .map(Some),
        ));
    }

    let mut updated_images = Vec::new();
    for (image_id, thumbnail_result) in results {
        let generated = match thumbnail_result {
            Ok(path) => path,
            Err(error) => {
                let conn = pool.get()?;
                db::mark_thumbnail_failed(&conn, image_id, &error.to_string())?;
                continue;
            }
        };

        let thumbnail_path = generated
            .as_ref()
            .map(|thumb| thumb.path.to_string_lossy().to_string());
        let width = generated.as_ref().and_then(|thumb| thumb.width);
        let height = generated.as_ref().and_then(|thumb| thumb.height);

        let updated_image = {
            let conn = pool.get()?;
            db::mark_thumbnail_ready(&conn, image_id, thumbnail_path.as_deref(), width, height)?
        };
        updated_images.push(updated_image);
    }

    if !updated_images.is_empty() {
        let folder_ids = updated_images
            .iter()
            .map(|image| image.folder_id)
            .collect::<HashSet<_>>();
        emit_media_updates(
            app,
            &MediaUpdateBatch {
                images: updated_images,
            },
        );
        emit_folder_job_progress(app, pool, &folder_ids.into_iter().collect::<Vec<_>>());
    }

    Ok(())
}

fn process_metadata_batch(app: &AppHandle, pool: &DbPool, media_tools: &MediaTools) -> Result<()> {
    let jobs = {
        let conn = pool.get()?;
        let active_folders = active_indexing_folders();
        db::get_pending_metadata_jobs(&conn, WORKER_FETCH_SIZE)?
            .into_iter()
            .filter(|job| !active_folders.contains(&job.folder_id))
            .take(WORKER_BATCH_SIZE)
            .collect::<Vec<_>>()
    };

    if jobs.is_empty() {
        return Ok(());
    }

    for job in &jobs {
        let conn = pool.get()?;
        db::mark_metadata_job_processing(&conn, job.image_id)?;
    }

    let mut updated_images = Vec::new();

    for job in jobs {
        let metadata = match probe_video_metadata(media_tools, Path::new(&job.path)) {
            Ok(metadata) => metadata,
            Err(error) => {
                let conn = pool.get()?;
                db::mark_metadata_failed(&conn, job.image_id, &error.to_string())?;
                continue;
            }
        };

        let updated_image = {
            let conn = pool.get()?;
            db::mark_metadata_ready(
                &conn,
                job.image_id,
                metadata.duration_ms,
                metadata.width,
                metadata.height,
                metadata.video_codec.as_deref(),
                metadata.audio_codec.as_deref(),
            )?
        };
        updated_images.push(updated_image);
    }

    if !updated_images.is_empty() {
        let folder_ids = updated_images
            .iter()
            .map(|image| image.folder_id)
            .collect::<HashSet<_>>();
        emit_media_updates(
            app,
            &MediaUpdateBatch {
                images: updated_images,
            },
        );
        emit_folder_job_progress(app, pool, &folder_ids.into_iter().collect::<Vec<_>>());
    }

    Ok(())
}

fn active_indexing_folders() -> HashSet<i64> {
    ACTIVE_INDEXING_FOLDERS
        .get_or_init(|| Mutex::new(HashSet::new()))
        .lock()
        .map(|folders| folders.clone())
        .unwrap_or_default()
}

fn set_folder_indexing_state(folder_id: i64, is_active: bool) {
    if let Ok(mut folders) = ACTIVE_INDEXING_FOLDERS
        .get_or_init(|| Mutex::new(HashSet::new()))
        .lock()
    {
        if is_active {
            folders.insert(folder_id);
        } else {
            folders.remove(&folder_id);
        }
    }
}

fn emit_progress(app: &AppHandle, progress: &IndexProgress) {
    let _ = app.emit("index-progress", progress);
}

fn emit_images(app: &AppHandle, batch: &IndexedImagesBatch) {
    let _ = app.emit("indexed-images", batch);
}

fn emit_media_updates(app: &AppHandle, batch: &MediaUpdateBatch) {
    let _ = app.emit("media-updated", batch);
}

fn emit_folder_job_progress(app: &AppHandle, pool: &DbPool, folder_ids: &[i64]) {
    let mut unique_folder_ids = folder_ids.iter().copied().collect::<Vec<_>>();
    unique_folder_ids.sort_unstable();
    unique_folder_ids.dedup();

    let now = Instant::now();
    let emit_tracker = LAST_JOB_PROGRESS_EMIT.get_or_init(|| Mutex::new(HashMap::new()));
    let mut tracker = match emit_tracker.lock() {
        Ok(guard) => guard,
        Err(_) => return,
    };
    unique_folder_ids.retain(|folder_id| {
        let should_emit = tracker
            .get(folder_id)
            .map(|last_emit| now.duration_since(*last_emit) >= JOB_PROGRESS_EMIT_INTERVAL)
            .unwrap_or(true);
        if should_emit {
            tracker.insert(*folder_id, now);
        }
        should_emit
    });
    drop(tracker);

    if unique_folder_ids.is_empty() {
        return;
    }

    let Ok(conn) = pool.get() else {
        return;
    };

    let progress = unique_folder_ids
        .into_iter()
        .filter_map(|folder_id| db::get_folder_job_progress(&conn, folder_id).ok())
        .collect::<Vec<_>>();

    if !progress.is_empty() {
        let _ = app.emit("media-job-progress", MediaJobProgressEvent { progress });
    }
}

fn is_supported_media(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|value| {
            let extension = value.to_lowercase();
            IMAGE_EXTENSIONS.contains(&extension.as_str())
                || VIDEO_EXTENSIONS.contains(&extension.as_str())
        })
        .unwrap_or(false)
}

fn media_kind_for_ext(ext: &str) -> &'static str {
    match ext.to_lowercase().as_str() {
        "mp4" | "mov" | "m4v" | "webm" => "video",
        _ => "image",
    }
}

fn mime_for_ext(ext: &str) -> &'static str {
    match ext.to_lowercase().as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "bmp" => "image/bmp",
        "webp" => "image/webp",
        "tiff" | "tif" => "image/tiff",
        "avif" => "image/avif",
        "heic" | "heif" => "image/heif",
        "mp4" | "m4v" => "video/mp4",
        "mov" => "video/quicktime",
        "webm" => "video/webm",
        _ => "image/jpeg",
    }
}
