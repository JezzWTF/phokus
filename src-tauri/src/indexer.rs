use crate::db::{self, DbPool, ImageRecord};
use crate::thumbnail;
use crate::vector;
use anyhow::Result;
use rayon::prelude::*;
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};
use walkdir::WalkDir;

const IMAGE_EXTENSIONS: &[&str] = &[
    "jpg", "jpeg", "png", "gif", "bmp", "tiff", "tif", "webp", "avif", "heic", "heif",
];

const VIDEO_EXTENSIONS: &[&str] = &["mp4", "mov", "m4v", "webm"];

fn is_supported_media(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| {
            let ext = e.to_lowercase();
            IMAGE_EXTENSIONS.contains(&ext.as_str()) || VIDEO_EXTENSIONS.contains(&ext.as_str())
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
pub struct ThumbnailBatch {
    pub images: Vec<ImageRecord>,
}

const INDEX_BATCH_SIZE: usize = 25;
const THUMBNAIL_BATCH_SIZE: usize = 12;

pub fn index_folder(
    app: AppHandle,
    pool: DbPool,
    folder_id: i64,
    folder_path: PathBuf,
    _cache_dir: PathBuf,
) {
    std::thread::spawn(move || {
        if let Err(e) = do_index(app, pool, folder_id, folder_path) {
            eprintln!("Indexing error: {}", e);
        }
    });
}

fn do_index(app: AppHandle, pool: DbPool, folder_id: i64, folder_path: PathBuf) -> Result<()> {
    let image_paths: Vec<PathBuf> = WalkDir::new(&folder_path)
        .follow_links(true)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file() && is_supported_media(e.path()))
        .map(|e| e.path().to_path_buf())
        .collect();

    let total = image_paths.len();

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

    let mut indexed = 0usize;
    for path_chunk in image_paths.chunks(INDEX_BATCH_SIZE) {
        let records: Vec<ImageRecord> = path_chunk
            .par_iter()
            .filter_map(|path| build_record(path, folder_id))
            .collect();

        if records.is_empty() {
            continue;
        }

        let committed = commit_batch(&pool, &records)?;
        indexed += committed.len();
        emit_images(
            &app,
            &IndexedImagesBatch {
                folder_id,
                images: committed,
            },
        );

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
                indexed,
                current_file,
                done: false,
            },
        );
    }

    {
        let conn = pool.get()?;
        db::update_folder_count(&conn, folder_id)?;
    }

    emit_progress(
        &app,
        &IndexProgress {
            folder_id,
            total,
            indexed,
            current_file: String::new(),
            done: true,
        },
    );

    Ok(())
}

fn build_record(path: &Path, folder_id: i64) -> Option<ImageRecord> {
    let path_str = path.to_string_lossy().to_string();
    let filename = path.file_name()?.to_string_lossy().to_string();

    let meta = std::fs::metadata(path).ok();
    let file_size = meta.as_ref().map(|m| m.len() as i64).unwrap_or(0);
    let modified_at = meta.as_ref().and_then(|m| m.modified().ok()).map(|t| {
        let dt: chrono::DateTime<chrono::Utc> = t.into();
        dt.to_rfc3339()
    });

    let (width, height) = thumbnail::get_dimensions(path)
        .map(|(w, h)| (Some(w as i64), Some(h as i64)))
        .unwrap_or((None, None));

    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("jpg");

    Some(ImageRecord {
        id: 0,
        folder_id,
        path: path_str,
        filename,
        thumbnail_path: None,
        width,
        height,
        file_size,
        created_at: None,
        modified_at,
        mime_type: mime_for_ext(ext).to_string(),
        media_kind: media_kind_for_ext(ext).to_string(),
        favorite: false,
        rating: 0,
        embedding_status: "pending".to_string(),
        embedding_model: Some(vector::CLIP_MODEL_NAME.to_string()),
        embedding_updated_at: None,
        embedding_error: None,
    })
}

fn emit_progress(app: &AppHandle, progress: &IndexProgress) {
    let _ = app.emit("index-progress", progress);
}

fn emit_images(app: &AppHandle, batch: &IndexedImagesBatch) {
    let _ = app.emit("indexed-images", batch);
}

fn emit_thumbnails(app: &AppHandle, batch: &ThumbnailBatch) {
    let _ = app.emit("thumbnail-updated", batch);
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
        committed.push(committed_record);
    }

    tx.commit()?;
    Ok(committed)
}

pub fn start_thumbnail_worker(app: AppHandle, pool: DbPool, cache_dir: PathBuf) {
    std::thread::spawn(move || loop {
        if let Err(error) = process_thumbnail_batch(&app, &pool, &cache_dir) {
            eprintln!("Thumbnail worker error: {}", error);
        }

        std::thread::sleep(std::time::Duration::from_millis(250));
    });
}

fn process_thumbnail_batch(app: &AppHandle, pool: &DbPool, cache_dir: &Path) -> Result<()> {
    let mut updated_images = Vec::new();

    for _ in 0..THUMBNAIL_BATCH_SIZE {
        let job = {
            let conn = pool.get()?;
            db::get_next_thumbnail_job(&conn)?
        };

        let Some(job) = job else {
            break;
        };

        {
            let conn = pool.get()?;
            db::mark_thumbnail_job_processing(&conn, job.image_id)?;
        }

        let thumbnail_result = match job.media_kind.as_str() {
            "image" => thumbnail::generate_thumbnail(Path::new(&job.path), cache_dir),
            "video" => thumbnail::generate_video_poster(Path::new(&job.path), cache_dir),
            _ => {
                let conn = pool.get()?;
                updated_images.push(db::mark_thumbnail_ready(&conn, job.image_id, None)?);
                continue;
            }
        };

        let thumbnail_path = match thumbnail_result {
            Ok(path) => Some(path.to_string_lossy().to_string()),
            Err(error) => {
                let conn = pool.get()?;
                db::mark_thumbnail_failed(&conn, job.image_id, &error.to_string())?;
                continue;
            }
        };

        let updated_image = {
            let conn = pool.get()?;
            db::mark_thumbnail_ready(&conn, job.image_id, thumbnail_path.as_deref())?
        };
        updated_images.push(updated_image);
    }

    if !updated_images.is_empty() {
        emit_thumbnails(
            app,
            &ThumbnailBatch {
                images: updated_images,
            },
        );
    }

    Ok(())
}
