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

const INDEX_BATCH_SIZE: usize = 25;

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

    // Parallel: read file metadata and dimensions across all CPU cores
    let records: Vec<ImageRecord> = image_paths
        .par_iter()
        .filter_map(|path| build_record(path, folder_id))
        .collect();

    // Sequential: commit in batches and stream results to the frontend
    let mut indexed = 0usize;
    for chunk in records.chunks(INDEX_BATCH_SIZE) {
        let committed = commit_batch(&pool, chunk)?;
        indexed += committed.len();
        emit_images(&app, &IndexedImagesBatch { folder_id, images: committed });
        emit_progress(
            &app,
            &IndexProgress {
                folder_id,
                total,
                indexed,
                current_file: String::new(),
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

fn commit_batch(pool: &DbPool, records: &[ImageRecord]) -> Result<Vec<ImageRecord>> {
    let mut conn = pool.get()?;
    let tx = conn.transaction()?;
    let mut committed = Vec::with_capacity(records.len());

    for record in records {
        let mut committed_record = record.clone();
        committed_record.id = db::upsert_image(&tx, record)?;
        db::enqueue_embedding_job(&tx, committed_record.id)?;
        committed.push(committed_record);
    }

    tx.commit()?;
    Ok(committed)
}
