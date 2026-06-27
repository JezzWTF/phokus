use crate::captioner::{
    self, CaptionAcceleration, CaptionDetail, CaptionModelStatus, CaptionRuntimeProbe,
    CaptionVisionProbe,
};
use crate::db::{
    self, Album, DbPool, ExploreTagEntry, Folder, FolderJobProgress, ImageRecord, ImageTag,
};
use crate::embedder;
use crate::hnsw_index;
use crate::indexer::{self, WatcherHandle};
use crate::tagger::{self, TaggerAcceleration, TaggerModelStatus, TaggerRuntimeProbe};
use crate::vector;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, Manager, State};

pub type DbState = DbPool;

#[derive(Serialize)]
pub struct ImagesPage {
    pub images: Vec<ImageRecord>,
    pub total: i64,
    pub offset: i64,
    pub limit: i64,
}

#[derive(Serialize)]
pub struct SimilarImagesPage {
    pub images: Vec<ImageRecord>,
    pub offset: usize,
    pub limit: usize,
    pub has_more: bool,
}

#[derive(Deserialize)]
pub struct GetImagesParams {
    pub folder_id: Option<i64>,
    pub search: Option<String>,
    pub media_kind: Option<String>,
    pub favorites_only: Option<bool>,
    pub rating_min: Option<i64>,
    pub embedding_failed_only: Option<bool>,
    pub tagging_failed_only: Option<bool>,
    pub sort: Option<String>,
    pub offset: Option<i64>,
    pub limit: Option<i64>,
}

#[derive(Deserialize)]
pub struct UpdateImageDetailsParams {
    pub image_id: i64,
    pub favorite: Option<bool>,
    pub rating: Option<i64>,
}

#[derive(Deserialize)]
pub struct FindSimilarImagesParams {
    pub image_id: i64,
    pub folder_id: Option<i64>,
    pub offset: Option<usize>,
    pub limit: Option<usize>,
    pub threshold: Option<f32>,
}

#[derive(Deserialize)]
pub struct FindSimilarByRegionParams {
    pub image_id: i64,
    /// Normalized crop rect (0.0–1.0).
    pub crop_x: f32,
    pub crop_y: f32,
    pub crop_w: f32,
    pub crop_h: f32,
    pub folder_id: Option<i64>,
    pub offset: Option<usize>,
    pub limit: Option<usize>,
}

#[derive(Deserialize)]
pub struct DebugSimilarImagesParams {
    pub image_id: i64,
    pub folder_id: Option<i64>,
    pub limit: Option<usize>,
}

#[derive(Deserialize)]
pub struct RetryFailedEmbeddingsParams {
    pub folder_id: i64,
}

#[derive(Deserialize)]
pub struct SetGeneratedCaptionParams {
    pub image_id: i64,
    pub caption: String,
    pub model: Option<String>,
}

#[derive(Deserialize)]
pub struct SuggestImageTagsParams {
    pub image_id: i64,
    pub limit: Option<usize>,
}

#[derive(Deserialize)]
pub struct QueueCaptionJobsParams {
    pub folder_id: Option<i64>,
    pub image_id: Option<i64>,
}

#[derive(Deserialize)]
pub struct ClearCaptionJobsParams {
    pub folder_id: Option<i64>,
}

#[derive(Deserialize)]
pub struct ResetCaptionsParams {
    pub folder_id: Option<i64>,
}

#[derive(Deserialize)]
pub struct SetCaptionAccelerationParams {
    pub acceleration: CaptionAcceleration,
}

#[derive(Deserialize)]
pub struct SetCaptionDetailParams {
    pub detail: CaptionDetail,
}

#[derive(Deserialize)]
pub struct ProbeCaptionImageParams {
    pub image_id: i64,
}

#[derive(Deserialize)]
pub struct GenerateCaptionParams {
    pub image_id: i64,
}

#[derive(Deserialize)]
pub struct SemanticSearchParams {
    pub query: String,
    pub folder_id: Option<i64>,
    pub media_kind: Option<String>,
    pub favorites_only: Option<bool>,
    pub rating_min: Option<i64>,
    pub limit: Option<usize>,
}

#[derive(Deserialize)]
pub struct TagSearchParams {
    pub query: String,
    pub folder_id: Option<i64>,
    pub media_kind: Option<String>,
    pub favorites_only: Option<bool>,
    pub rating_min: Option<i64>,
    pub limit: Option<usize>,
    pub offset: Option<usize>,
}

#[derive(Serialize)]
pub struct TagSearchPage {
    pub images: Vec<ImageRecord>,
    pub total: usize,
    pub offset: usize,
    pub limit: usize,
}

#[derive(Deserialize)]
pub struct GetExploreTagsParams {
    pub folder_id: Option<i64>,
    pub limit: Option<usize>,
}

#[derive(Deserialize)]
pub struct SearchTagsAutocompleteParams {
    pub query: String,
    pub folder_id: Option<i64>,
    pub limit: Option<usize>,
}

#[derive(Serialize, Deserialize)]
pub struct DuplicateGroup {
    pub file_hash: String,
    pub file_size: u64,
    pub images: Vec<ImageRecord>,
}

#[derive(Clone, Serialize)]
pub struct DuplicateScanProgress {
    pub phase: String,
    pub processed: usize,
    pub total: usize,
    pub skipped: usize,
}

#[derive(Serialize)]
pub struct DuplicateScanResult {
    pub groups: Vec<DuplicateGroup>,
    pub scanned_files: usize,
    pub candidate_files: usize,
    pub skipped_files: usize,
}

#[derive(Serialize)]
pub struct DuplicateScanCache {
    pub groups: Vec<DuplicateGroup>,
    pub scanned_at: i64,
}

#[derive(Deserialize)]
pub struct DeleteImagesFromDiskParams {
    pub image_ids: Vec<i64>,
}

#[derive(Deserialize)]
pub struct GetImagesByIdsParams {
    pub image_ids: Vec<i64>,
}

#[derive(Serialize)]
#[serde(tag = "status", content = "data", rename_all = "camelCase")]
pub enum FolderAddResult {
    Added(Folder),
    Skipped(String),
    Error(String),
}

enum AddOutcome {
    Added(Folder),
    Skipped(Folder),
}

fn paths_match(left: &str, right: &str) -> bool {
    let left_path = PathBuf::from(left);
    let right_path = PathBuf::from(right);
    if let (Ok(left_canonical), Ok(right_canonical)) =
        (left_path.canonicalize(), right_path.canonicalize())
    {
        return left_canonical == right_canonical;
    }

    #[cfg(windows)]
    {
        left.trim_end_matches(['\\', '/'])
            .eq_ignore_ascii_case(right.trim_end_matches(['\\', '/']))
    }

    #[cfg(not(windows))]
    {
        left.trim_end_matches('/').eq(right.trim_end_matches('/'))
    }
}

fn add_one_folder(
    app: AppHandle,
    db: DbPool,
    watcher: WatcherHandle,
    path: String,
) -> Result<AddOutcome, String> {
    let folder_path = PathBuf::from(&path);

    if !folder_path.exists() || !folder_path.is_dir() {
        return Err("Path is not a valid directory".into());
    }

    {
        let conn = db.get().map_err(|e| e.to_string())?;
        if let Some(folder) = db::get_folders(&conn)
            .map_err(|e| e.to_string())?
            .into_iter()
            .find(|folder| paths_match(&folder.path, &path))
        {
            return Ok(AddOutcome::Skipped(folder));
        }
    }

    // Let the webview load media from this folder via the asset protocol.
    if let Err(error) = app
        .asset_protocol_scope()
        .allow_directory(&folder_path, true)
    {
        log::error!("Failed to allow asset scope for {path}: {error}");
    }

    let name = folder_path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.clone());

    let folder_id = {
        let conn = db.get().map_err(|e| e.to_string())?;
        db::insert_folder(&conn, &path, &name).map_err(|e| e.to_string())?
    };

    let folders = {
        let conn = db.get().map_err(|e| e.to_string())?;
        db::get_folders(&conn).map_err(|e| e.to_string())?
    };

    let folder = folders
        .into_iter()
        .find(|f| f.id == folder_id)
        .ok_or("Folder not found after insert")?;

    watcher.add_folder(folder_path.clone(), folder_id);
    indexer::index_folder(app, db, folder_id, folder_path);

    Ok(AddOutcome::Added(folder))
}

#[tauri::command]
pub async fn add_folder(
    app: AppHandle,
    db: State<'_, DbState>,
    watcher: State<'_, WatcherHandle>,
    path: String,
) -> Result<Folder, String> {
    match add_one_folder(app, db.inner().clone(), watcher.inner().clone(), path)? {
        AddOutcome::Added(folder) => Ok(folder),
        AddOutcome::Skipped(folder) => Ok(folder),
    }
}

#[tauri::command]
pub async fn add_folders(
    app: AppHandle,
    db: State<'_, DbState>,
    watcher: State<'_, WatcherHandle>,
    paths: Vec<String>,
) -> Result<Vec<FolderAddResult>, String> {
    Ok(paths
        .into_iter()
        .map(|path| {
            match add_one_folder(
                app.clone(),
                db.inner().clone(),
                watcher.inner().clone(),
                path,
            ) {
                Ok(AddOutcome::Added(folder)) => FolderAddResult::Added(folder),
                Ok(AddOutcome::Skipped(folder)) => FolderAddResult::Skipped(folder.path),
                Err(error) => FolderAddResult::Error(error),
            }
        })
        .collect())
}

#[tauri::command]
pub async fn get_folders(db: State<'_, DbState>) -> Result<Vec<Folder>, String> {
    let conn = db.get().map_err(|e| e.to_string())?;
    db::get_folders(&conn).map_err(|e| e.to_string())
}

#[derive(Serialize)]
pub struct DirListing {
    pub current: Option<String>,
    pub parent: Option<String>,
    pub entries: Vec<DirEntry>,
}

#[derive(Serialize)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub has_children: bool,
}

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

fn directory_has_children(path: &Path) -> bool {
    std::fs::read_dir(path)
        .map(|mut entries| {
            entries.any(|entry| {
                entry
                    .ok()
                    .and_then(|entry| entry.file_type().ok())
                    .map(|file_type| file_type.is_dir())
                    .unwrap_or(false)
            })
        })
        .unwrap_or(false)
}

fn common_root_candidates() -> Vec<PathBuf> {
    let mut roots = Vec::new();

    #[cfg(windows)]
    {
        for letter in b'A'..=b'Z' {
            let drive = format!("{}:\\", letter as char);
            let path = PathBuf::from(&drive);
            if path.exists() {
                roots.push(path);
            }
        }

        if let Ok(profile) = std::env::var("USERPROFILE") {
            let home = PathBuf::from(profile);
            roots.push(home.clone());
            for child in ["Pictures", "Videos", "Desktop", "Downloads"] {
                roots.push(home.join(child));
            }
        }
    }

    #[cfg(not(windows))]
    {
        if let Ok(home) = std::env::var("HOME") {
            roots.push(PathBuf::from(home));
        }
        roots.push(PathBuf::from("/"));
    }

    roots
}

fn list_roots() -> Vec<DirEntry> {
    let mut seen = HashSet::new();
    let mut entries: Vec<DirEntry> = common_root_candidates()
        .into_iter()
        .filter(|path| path.exists() && path.is_dir())
        .filter_map(|path| {
            let path_string = path_to_string(&path);
            if !seen.insert(path_string.clone()) {
                return None;
            }
            let name = path
                .file_name()
                .map(|name| name.to_string_lossy().to_string())
                .filter(|name| !name.is_empty())
                .unwrap_or_else(|| path_string.clone());
            Some(DirEntry {
                name,
                path: path_string,
                has_children: directory_has_children(&path),
            })
        })
        .collect();
    entries.sort_by_key(|entry| entry.name.to_lowercase());
    entries
}

fn list_child_directories(path: &Path) -> Result<Vec<DirEntry>, String> {
    let mut entries = Vec::new();
    let read_dir = std::fs::read_dir(path).map_err(|e| e.to_string())?;

    for entry in read_dir.flatten() {
        let file_name = entry.file_name();
        let name = file_name.to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }

        let child_path = entry.path();
        let is_dir = entry
            .file_type()
            .map(|file_type| file_type.is_dir())
            .unwrap_or(false);
        if !is_dir {
            continue;
        }

        entries.push(DirEntry {
            name,
            path: path_to_string(&child_path),
            has_children: directory_has_children(&child_path),
        });
    }

    entries.sort_by_key(|entry| entry.name.to_lowercase());
    Ok(entries)
}

#[tauri::command]
pub async fn list_directories(path: Option<String>) -> Result<DirListing, String> {
    let trimmed = path.as_deref().map(str::trim).unwrap_or("");
    if trimmed.is_empty() {
        return Ok(DirListing {
            current: None,
            parent: None,
            entries: list_roots(),
        });
    }

    let current_path = PathBuf::from(trimmed);
    let parent = current_path.parent().map(path_to_string);
    let entries = list_child_directories(&current_path)?;

    Ok(DirListing {
        current: Some(path_to_string(&current_path)),
        parent,
        entries,
    })
}

#[derive(Deserialize)]
pub struct ReorderFoldersParams {
    pub folder_ids: Vec<i64>,
}

#[tauri::command]
pub async fn reorder_folders(
    db: State<'_, DbState>,
    params: ReorderFoldersParams,
) -> Result<(), String> {
    let conn = db.get().map_err(|e| e.to_string())?;
    db::reorder_folders(&conn, &params.folder_ids).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_background_job_progress(
    db: State<'_, DbState>,
) -> Result<Vec<FolderJobProgress>, String> {
    let conn = db.get().map_err(|e| e.to_string())?;
    db::get_all_folder_job_progress(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remove_folder(
    db: State<'_, DbState>,
    watcher: State<'_, WatcherHandle>,
    folder_id: i64,
) -> Result<(), String> {
    let conn = db.get().map_err(|e| e.to_string())?;
    // Capture the path before deletion so we can unregister the watcher.
    let folder_path = db::get_folders(&conn)
        .map_err(|e| e.to_string())?
        .into_iter()
        .find(|f| f.id == folder_id)
        .map(|f| PathBuf::from(f.path));
    // Collect thumbnail paths before the cascade delete removes the rows.
    let thumb_paths = db::get_thumbnail_paths_for_folder(&conn, folder_id).unwrap_or_default();
    db::delete_folder(&conn, folder_id).map_err(|e| e.to_string())?;
    if let Some(path) = folder_path {
        watcher.remove_folder(&path);
    }
    for thumb in &thumb_paths {
        let _ = std::fs::remove_file(thumb);
    }
    Ok(())
}

#[tauri::command]
pub async fn get_images(
    db: State<'_, DbState>,
    params: GetImagesParams,
) -> Result<ImagesPage, String> {
    let conn = db.get().map_err(|e| e.to_string())?;

    let sort = params.sort.as_deref().unwrap_or("date_desc");
    let offset = params.offset.unwrap_or(0);
    let limit = params.limit.unwrap_or(100);
    let search = params.search.as_deref();
    let media_kind = params.media_kind.as_deref();
    let favorites_only = params.favorites_only.unwrap_or(false);
    let rating_min = params.rating_min.unwrap_or(0);
    let embedding_failed_only = params.embedding_failed_only.unwrap_or(false);
    let tagging_failed_only = params.tagging_failed_only.unwrap_or(false);

    let total = db::count_images(
        &conn,
        params.folder_id,
        search,
        media_kind,
        favorites_only,
        rating_min,
        embedding_failed_only,
        tagging_failed_only,
    )
    .map_err(|e| e.to_string())?;

    let images = db::get_images(
        &conn,
        params.folder_id,
        search,
        media_kind,
        favorites_only,
        rating_min,
        embedding_failed_only,
        tagging_failed_only,
        sort,
        offset,
        limit,
    )
    .map_err(|e| e.to_string())?;

    Ok(ImagesPage {
        images,
        total,
        offset,
        limit,
    })
}

#[tauri::command]
pub async fn update_image_details(
    db: State<'_, DbState>,
    params: UpdateImageDetailsParams,
) -> Result<ImageRecord, String> {
    let conn = db.get().map_err(|e| e.to_string())?;
    db::update_image_details(&conn, params.image_id, params.favorite, params.rating)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn reindex_folder(
    app: AppHandle,
    db: State<'_, DbState>,
    folder_id: i64,
) -> Result<(), String> {
    let folder_path = {
        let conn = db.get().map_err(|e| e.to_string())?;
        let folders = db::get_folders(&conn).map_err(|e| e.to_string())?;
        folders
            .into_iter()
            .find(|f| f.id == folder_id)
            .map(|f| PathBuf::from(f.path))
            .ok_or("Folder not found")?
    };

    indexer::index_folder(app, db.inner().clone(), folder_id, folder_path);
    Ok(())
}

#[tauri::command]
pub async fn rename_folder(
    db: State<'_, DbState>,
    folder_id: i64,
    new_name: String,
) -> Result<(), String> {
    let new_name = new_name.trim().to_string();
    if new_name.is_empty() {
        return Err("Folder name cannot be empty".to_string());
    }
    let conn = db.get().map_err(|e| e.to_string())?;
    db::rename_folder(&conn, folder_id, &new_name).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_folder_path(
    app: AppHandle,
    db: State<'_, DbState>,
    watcher: State<'_, WatcherHandle>,
    folder_id: i64,
    new_path: String,
) -> Result<(), String> {
    let new_path_buf = PathBuf::from(&new_path);
    if !new_path_buf.is_dir() {
        return Err(format!("Path is not a valid directory: {new_path}"));
    }

    // Let the webview load media from the relocated folder via the asset protocol.
    if let Err(error) = app
        .asset_protocol_scope()
        .allow_directory(&new_path_buf, true)
    {
        log::error!("Failed to allow asset scope for {new_path}: {error}");
    }

    let new_name = new_path_buf
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| new_path.clone());
    let old_path = {
        let conn = db.get().map_err(|e| e.to_string())?;
        // Fetch the old path before updating so image paths can be rewritten.
        let old_path = db::get_folders(&conn)
            .map_err(|e| e.to_string())?
            .into_iter()
            .find(|f| f.id == folder_id)
            .map(|f| f.path)
            .ok_or("Folder not found")?;
        db::update_folder_path(&conn, folder_id, &old_path, &new_path, &new_name)
            .map_err(|e| e.to_string())?;
        old_path
    };
    watcher.update_folder(&PathBuf::from(old_path), new_path_buf.clone(), folder_id);
    indexer::index_folder(app, db.inner().clone(), folder_id, new_path_buf);
    Ok(())
}

#[tauri::command]
pub async fn find_similar_images(
    db: State<'_, DbState>,
    params: FindSimilarImagesParams,
) -> Result<SimilarImagesPage, String> {
    let conn = db.get().map_err(|e| e.to_string())?;
    let limit = params.limit.unwrap_or(32);
    let offset = params.offset.unwrap_or(0);
    let threshold = params.threshold.unwrap_or(0.24);
    if !vector::has_image_vector(&conn, params.image_id).map_err(|e| e.to_string())? {
        db::repair_embedding_consistency(&conn).map_err(|e| e.to_string())?;
        return Ok(SimilarImagesPage {
            images: Vec::new(),
            offset,
            limit,
            has_more: false,
        });
    }
    let matches = hnsw_index::find_similar_image_matches(
        &conn,
        params.image_id,
        params.folder_id,
        threshold,
        offset,
        limit + 1,
    )
    .map_err(|e| e.to_string())?;
    let has_more = matches.len() > limit;
    let image_ids = matches
        .into_iter()
        .take(limit)
        .map(|(image_id, _)| image_id)
        .collect::<Vec<_>>();
    let images = db::get_images_by_ids(&conn, &image_ids).map_err(|e| e.to_string())?;
    Ok(SimilarImagesPage {
        images,
        offset,
        limit,
        has_more,
    })
}

#[tauri::command]
pub async fn find_similar_by_region(
    db: State<'_, DbState>,
    params: FindSimilarByRegionParams,
) -> Result<SimilarImagesPage, String> {
    let conn = db.get().map_err(|e| e.to_string())?;
    let limit = params.limit.unwrap_or(32);
    let offset = params.offset.unwrap_or(0);

    // Look up the source image path
    let image = db::get_image_by_id(&conn, params.image_id).map_err(|e| e.to_string())?;
    let image_path = std::path::Path::new(&image.path);

    // Embed the cropped region in-memory (no temp file needed)
    let embedder = embedder::ClipImageEmbedder::new().map_err(|e| e.to_string())?;
    let embedding = embedder
        .embed_image_crop(
            image_path,
            params.crop_x,
            params.crop_y,
            params.crop_w,
            params.crop_h,
        )
        .map_err(|e| e.to_string())?;

    // Search for similar images using the crop embedding
    let image_ids = match params.folder_id {
        Some(folder_id) => vector::search_image_ids_by_embedding_in_folder(
            &conn,
            &embedding,
            folder_id,
            Some(params.image_id),
            offset + limit + 1,
        )
        .map_err(|e| e.to_string())?,
        None => {
            // Fetch one extra candidate to compensate for the source image that
            // will be removed, so has_more is accurate and results span multiple pages.
            let mut ids =
                vector::search_image_ids_by_embedding(&conn, &embedding, offset + limit + 2)
                    .map_err(|e| e.to_string())?;
            ids.retain(|&id| id != params.image_id);
            ids
        }
    };

    let has_more = image_ids.len() > offset + limit;
    let page_ids = image_ids
        .into_iter()
        .skip(offset)
        .take(limit)
        .collect::<Vec<_>>();

    let images = db::get_images_by_ids(&conn, &page_ids).map_err(|e| e.to_string())?;
    Ok(SimilarImagesPage {
        images,
        offset,
        limit,
        has_more,
    })
}

#[derive(Serialize)]
pub struct SimilarImagesDebug {
    pub image_id: i64,
    pub vector_count: i64,
    pub has_vector: bool,
    pub similar_ids: Vec<i64>,
}

#[tauri::command]
pub async fn debug_similar_images(
    db: State<'_, DbState>,
    params: DebugSimilarImagesParams,
) -> Result<SimilarImagesDebug, String> {
    let conn = db.get().map_err(|e| e.to_string())?;
    let limit = params.limit.unwrap_or(32);
    let vector_count = vector::count_image_vectors(&conn).map_err(|e| e.to_string())?;
    let has_vector = vector::has_image_vector(&conn, params.image_id).map_err(|e| e.to_string())?;
    let similar_ids = if has_vector {
        vector::find_similar_image_ids(&conn, params.image_id, limit, params.folder_id)
            .map_err(|e| e.to_string())?
    } else {
        Vec::new()
    };
    Ok(SimilarImagesDebug {
        image_id: params.image_id,
        vector_count,
        has_vector,
        similar_ids,
    })
}

#[tauri::command]
pub async fn retry_failed_embeddings(
    db: State<'_, DbState>,
    params: RetryFailedEmbeddingsParams,
) -> Result<usize, String> {
    let conn = db.get().map_err(|e| e.to_string())?;
    db::retry_failed_embedding_jobs(&conn, params.folder_id).map_err(|e| e.to_string())
}

#[derive(Serialize)]
pub struct FailedImageItem {
    pub image_id: i64,
    pub filename: String,
    pub path: String,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn get_failed_tagging_images(
    db: State<'_, DbState>,
    folder_id: i64,
) -> Result<Vec<FailedImageItem>, String> {
    let conn = db.get().map_err(|e| e.to_string())?;
    db::get_failed_tagging_images(&conn, folder_id)
        .map(|rows| {
            rows.into_iter()
                .map(|(image_id, filename, path, error)| FailedImageItem {
                    image_id,
                    filename,
                    path,
                    error,
                })
                .collect()
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn semantic_search_images(
    db: State<'_, DbState>,
    params: SemanticSearchParams,
) -> Result<Vec<ImageRecord>, String> {
    let embedding = embedder::embed_text_query(&params.query).map_err(|e| e.to_string())?;

    let conn = db.get().map_err(|e| e.to_string())?;
    let limit = params.limit.unwrap_or(64);

    let has_filters = params.folder_id.is_some()
        || params.media_kind.is_some()
        || params.favorites_only.unwrap_or(false)
        || params.rating_min.is_some_and(|r| r > 0);

    if !has_filters {
        // No post-query filtering — a single fetch of exactly `limit` results is optimal.
        let ids = vector::search_image_ids_by_embedding(&conn, &embedding, limit)
            .map_err(|e| e.to_string())?;
        return db::get_images_by_ids(&conn, &ids).map_err(|e| e.to_string());
    }

    // Post-query filters are active. Progressively double the fetch batch until we
    // collect enough results or exhaust the vector table, so we never over-fetch
    // more than necessary while still filling the requested page.
    let mut batch = limit;
    loop {
        let ids = vector::search_image_ids_by_embedding(&conn, &embedding, batch)
            .map_err(|e| e.to_string())?;
        let exhausted = ids.len() < batch;
        let mut images = db::get_images_by_ids(&conn, &ids).map_err(|e| e.to_string())?;

        if let Some(folder_id) = params.folder_id {
            images.retain(|image| image.folder_id == folder_id);
        }
        if let Some(media_kind) = params.media_kind.as_deref() {
            images.retain(|image| image.media_kind == media_kind);
        }
        if params.favorites_only.unwrap_or(false) {
            images.retain(|image| image.favorite);
        }
        if let Some(rating_min) = params.rating_min {
            images.retain(|image| image.rating >= rating_min);
        }

        if images.len() >= limit || exhausted {
            images.truncate(limit);
            return Ok(images);
        }
        // If we are already at the fetch cap, another iteration would fetch the
        // exact same IDs — break out rather than looping forever.
        if batch >= 8192 {
            return Ok(images);
        }
        batch = (batch * 2).min(8192);
    }
}

#[tauri::command]
pub async fn search_images_by_tag(
    db: State<'_, DbState>,
    params: TagSearchParams,
) -> Result<TagSearchPage, String> {
    let conn = db.get().map_err(|e| e.to_string())?;
    let limit = params.limit.unwrap_or(64);
    let offset = params.offset.unwrap_or(0);
    let (images, total) = db::search_images_by_tag(
        &conn,
        &params.query,
        params.folder_id,
        params.media_kind.as_deref(),
        params.favorites_only.unwrap_or(false),
        params.rating_min.unwrap_or(0),
        limit,
        offset,
    )
    .map_err(|e| e.to_string())?;
    Ok(TagSearchPage {
        images,
        total,
        offset,
        limit,
    })
}

#[tauri::command]
pub async fn set_generated_caption(
    db: State<'_, DbState>,
    params: SetGeneratedCaptionParams,
) -> Result<ImageRecord, String> {
    let conn = db.get().map_err(|e| e.to_string())?;
    let model = params.model.as_deref().unwrap_or("manual");
    db::update_generated_caption(&conn, params.image_id, &params.caption, model)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn suggest_image_tags(
    db: State<'_, DbState>,
    params: SuggestImageTagsParams,
) -> Result<Vec<String>, String> {
    let conn = db.get().map_err(|e| e.to_string())?;
    db::suggest_tags_from_caption(&conn, params.image_id, params.limit.unwrap_or(2))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_caption_model_status(app: AppHandle) -> Result<CaptionModelStatus, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(captioner::caption_model_status(&app_dir))
}

#[tauri::command]
pub async fn get_caption_acceleration(app: AppHandle) -> Result<CaptionAcceleration, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(captioner::caption_acceleration(&app_dir))
}

#[tauri::command]
pub async fn set_caption_acceleration(
    app: AppHandle,
    params: SetCaptionAccelerationParams,
) -> Result<CaptionAcceleration, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    captioner::set_caption_acceleration(&app_dir, params.acceleration).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_caption_detail(app: AppHandle) -> Result<CaptionDetail, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(captioner::caption_detail(&app_dir))
}

#[tauri::command]
pub async fn set_caption_detail(
    app: AppHandle,
    params: SetCaptionDetailParams,
) -> Result<CaptionDetail, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    captioner::set_caption_detail(&app_dir, params.detail).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn prepare_caption_model(app: AppHandle) -> Result<CaptionModelStatus, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        let app = app.clone();
        captioner::prepare_caption_model_with_progress(&app_dir, move |progress| {
            let _ = app.emit("caption-model-progress", progress);
        })
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_caption_model(app: AppHandle) -> Result<CaptionModelStatus, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || captioner::delete_caption_model(&app_dir))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn probe_caption_runtime(app: AppHandle) -> Result<CaptionRuntimeProbe, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || captioner::probe_caption_runtime(&app_dir))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn probe_caption_image(
    app: AppHandle,
    db: State<'_, DbState>,
    params: ProbeCaptionImageParams,
) -> Result<CaptionVisionProbe, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let image_path = {
        let conn = db.get().map_err(|e| e.to_string())?;
        db::get_image_by_id(&conn, params.image_id)
            .map(|image| image.path)
            .map_err(|e| e.to_string())?
    };
    tauri::async_runtime::spawn_blocking(move || {
        captioner::probe_caption_vision(&app_dir, std::path::Path::new(&image_path))
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn generate_caption_for_image(
    app: AppHandle,
    db: State<'_, DbState>,
    params: GenerateCaptionParams,
) -> Result<ImageRecord, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let image_path = {
        let conn = db.get().map_err(|e| e.to_string())?;
        let image = db::get_image_by_id(&conn, params.image_id).map_err(|e| e.to_string())?;
        if image.media_kind != "image" {
            return Err("AI captions can only be generated for images".to_string());
        }
        image.path
    };

    let caption = tauri::async_runtime::spawn_blocking(move || {
        captioner::generate_caption(&app_dir, std::path::Path::new(&image_path))
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|error| {
        if let Ok(conn) = db.get() {
            let _ = db::mark_caption_failed(&conn, params.image_id, &error.to_string());
        }
        error.to_string()
    })?;

    let conn = db.get().map_err(|e| e.to_string())?;
    db::update_generated_caption(
        &conn,
        params.image_id,
        &caption,
        captioner::FLORENCE_CAPTION_MODEL_NAME,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn queue_caption_jobs(
    db: State<'_, DbState>,
    params: QueueCaptionJobsParams,
) -> Result<usize, String> {
    let conn = db.get().map_err(|e| e.to_string())?;
    match (params.folder_id, params.image_id) {
        (_, Some(image_id)) => {
            db::enqueue_caption_job(&conn, image_id).map_err(|e| e.to_string())?;
            Ok(1)
        }
        (Some(folder_id), None) => {
            db::enqueue_missing_caption_jobs_for_folder(&conn, folder_id).map_err(|e| e.to_string())
        }
        (None, None) => db::enqueue_missing_caption_jobs(&conn).map_err(|e| e.to_string()),
    }
}

#[tauri::command]
pub async fn clear_caption_jobs(
    db: State<'_, DbState>,
    params: ClearCaptionJobsParams,
) -> Result<usize, String> {
    let conn = db.get().map_err(|e| e.to_string())?;
    db::clear_caption_jobs(&conn, params.folder_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn reset_generated_captions(
    db: State<'_, DbState>,
    params: ResetCaptionsParams,
) -> Result<usize, String> {
    let conn = db.get().map_err(|e| e.to_string())?;
    db::reset_generated_captions(&conn, params.folder_id).map_err(|e| e.to_string())
}

#[derive(Serialize, Deserialize)]
pub struct TagCloudEntry {
    pub count: usize,
    pub representative_image_id: i64,
    pub thumbnail_path: Option<String>,
    #[serde(default)]
    pub image_ids: Vec<i64>,
}

/// Clusters the library's image embeddings with k-means and returns one representative
/// image per cluster — the member whose embedding is closest to its cluster centroid.
/// Results are cached in SQLite keyed by a hash of the embedded image IDs, so repeated
/// calls (including across app restarts) return instantly when the library hasn't changed.
#[tauri::command]
pub async fn get_tag_cloud(
    db: State<'_, DbState>,
    folder_id: Option<i64>,
) -> Result<Vec<TagCloudEntry>, String> {
    let embeddings_with_ids = {
        let conn = db.get().map_err(|e| e.to_string())?;
        vector::get_all_image_embeddings_with_ids(&conn, folder_id).map_err(|e| e.to_string())?
    };

    let n = embeddings_with_ids.len();
    if n < 5 {
        return Ok(vec![]);
    }

    // Sort by ID for stable ordering; hash both IDs and embedding bytes so that
    // replacing a file and regenerating its embedding invalidates the cache even
    // when the set of image IDs hasn't changed.
    let mut sorted_pairs: Vec<_> = embeddings_with_ids.iter().collect();
    sorted_pairs.sort_unstable_by_key(|(id, _)| *id);
    let current_hash = {
        use xxhash_rust::xxh3::Xxh3;
        let mut hasher = Xxh3::new();
        for (id, embedding) in &sorted_pairs {
            hasher.update(&id.to_le_bytes());
            for val in embedding.iter() {
                hasher.update(&val.to_le_bytes());
            }
        }
        hasher.digest()
    };
    let folder_scope = match folder_id {
        Some(id) => format!("folder_{id}"),
        None => "all".to_string(),
    };

    // Try to return a valid SQLite cache
    {
        let conn = db.get().map_err(|e| e.to_string())?;
        if let Some(json) = db::get_tag_cloud_cache(&conn, &folder_scope, current_hash)
            .map_err(|e| e.to_string())?
        {
            if let Ok(entries) = serde_json::from_str::<Vec<TagCloudEntry>>(&json) {
                // Reject cache entries written before image_ids were tracked — they all
                // have empty image_ids which causes "No media found" when a cluster is opened.
                if entries.iter().all(|e| !e.image_ids.is_empty()) {
                    return Ok(entries);
                }
            }
        }
    }

    // Cache miss — run k-means
    let ids: Vec<i64> = embeddings_with_ids.iter().map(|(id, _)| *id).collect();
    let points: Vec<Vec<f32>> = embeddings_with_ids
        .into_iter()
        .map(|(_, emb)| emb)
        .collect();

    let k = (n / 20).clamp(5, 30);
    let (centroids, cluster_counts, assignments) = kmeans_cosine(&points, k, 40);

    let mut entries: Vec<TagCloudEntry> = Vec::new();
    let mut order: Vec<usize> = (0..k).collect();
    order.sort_unstable_by(|&a, &b| cluster_counts[b].cmp(&cluster_counts[a]));

    let conn = db.get().map_err(|e| e.to_string())?;

    for ci in order {
        let count = cluster_counts[ci];
        if count == 0 {
            continue;
        }

        let centroid = &centroids[ci];
        let cluster_ids = points
            .iter()
            .enumerate()
            .filter(|(i, _)| assignments[*i] == ci)
            .map(|(i, _)| ids[i])
            .collect::<Vec<_>>();

        let best_id = points
            .iter()
            .enumerate()
            .filter(|(i, _)| assignments[*i] == ci)
            .map(|(i, p)| (ids[i], dot(centroid, p)))
            .max_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal))
            .map(|(id, _)| id)
            .unwrap_or(0);

        let thumbnail_path = db::get_image_by_id(&conn, best_id)
            .ok()
            .and_then(|img| img.thumbnail_path);

        entries.push(TagCloudEntry {
            count,
            representative_image_id: best_id,
            thumbnail_path,
            image_ids: cluster_ids,
        });
    }

    // Persist to SQLite — ignore write errors (cache is best-effort)
    if let Ok(json) = serde_json::to_string(&entries) {
        let _ = db::set_tag_cloud_cache(&conn, &folder_scope, current_hash, &json);
    }

    Ok(entries)
}

#[tauri::command]
pub async fn get_explore_tags(
    db: State<'_, DbState>,
    params: GetExploreTagsParams,
) -> Result<Vec<ExploreTagEntry>, String> {
    let conn = db.get().map_err(|e| e.to_string())?;
    db::get_explore_tags(&conn, params.folder_id, params.limit.unwrap_or(48))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn search_tags_autocomplete(
    db: State<'_, DbState>,
    params: SearchTagsAutocompleteParams,
) -> Result<Vec<ExploreTagEntry>, String> {
    if params.query.trim().is_empty() {
        return Ok(vec![]);
    }
    let conn = db.get().map_err(|e| e.to_string())?;
    db::search_tags_autocomplete(
        &conn,
        &params.query,
        params.folder_id,
        params.limit.unwrap_or(10),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn find_duplicates(
    app: AppHandle,
    db: State<'_, DbState>,
    folder_id: Option<i64>,
) -> Result<DuplicateScanResult, String> {
    let records = {
        let conn = db.get().map_err(|e| e.to_string())?;
        db::get_all_image_paths(&conn, folder_id).map_err(|e| e.to_string())?
    };

    let total = records.len();
    let _ = app.emit(
        "duplicate_scan_progress",
        DuplicateScanProgress {
            phase: "checking".to_string(),
            processed: 0,
            total,
            skipped: 0,
        },
    );

    // Three-phase detection.
    //
    // Phase 1 — stat:
    //   Read only file metadata (size). Files with a unique size cannot be
    //   duplicates; discard them immediately. Zero file content read.
    //
    // Phase 2 — sample hash:
    //   For each size-matched candidate, read four evenly-spaced 16 KB windows
    //   and hash them. For small files (≤ 64 KB) the windows cover the whole
    //   file so the hash is exact. For large files this is a fast shortlist.
    //
    // Phase 3 — full hash (large files only):
    //   For sample-hash groups that contain files > 64 KB, compute a full-file
    //   hash to confirm the match before presenting them as deletable duplicates.
    let app_hash = app.clone();
    // (size, sample/full hash, image_id, path) for each confirmed candidate.
    type HashedCandidate = (u64, u64, i64, String);
    let (pairs, skipped_before_confirm, candidate_total): (Vec<HashedCandidate>, usize, usize) =
        tokio::task::spawn_blocking(move || {
            use memmap2::Mmap;
            use rayon::prelude::*;
            use std::collections::HashMap;
            use std::sync::atomic::{AtomicUsize, Ordering};
            use xxhash_rust::xxh3::{xxh3_64, Xxh3};

            const WINDOW: usize = 16 * 1024; // 16 KB per sample window
            const N: usize = 4; // windows at 0%, 33%, 66%, 100%
            const COVERED: usize = WINDOW * N; // 64 KB total; also full-coverage threshold

            // Hash four evenly-spaced 16 KB windows. For files ≤ 64 KB this is
            // equivalent to hashing the entire file.
            fn sample(mmap: &[u8]) -> u64 {
                if mmap.len() <= COVERED {
                    return xxh3_64(mmap);
                }
                let mut h = Xxh3::new();
                for i in 0..N {
                    let pos = (mmap.len() - WINDOW) * i / (N - 1);
                    h.update(&mmap[pos..pos + WINDOW]);
                }
                h.digest()
            }

            // ── Phase 1: stat ─────────────────────────────────────────────────
            let stat_counter = AtomicUsize::new(0);
            let stat_skipped = AtomicUsize::new(0);
            let sized: Vec<(i64, String, u64)> = records
                .par_iter()
                .filter_map(|r| {
                    let result = match std::fs::metadata(&r.path) {
                        Ok(metadata) => Some((r.id, r.path.clone(), metadata.len())),
                        Err(_) => {
                            stat_skipped.fetch_add(1, Ordering::Relaxed);
                            None
                        }
                    };
                    let done = stat_counter.fetch_add(1, Ordering::Relaxed) + 1;
                    if done.is_multiple_of(100) || done == total {
                        let _ = app_hash.emit(
                            "duplicate_scan_progress",
                            DuplicateScanProgress {
                                phase: "checking".to_string(),
                                processed: done,
                                total,
                                skipped: stat_skipped.load(Ordering::Relaxed),
                            },
                        );
                    }
                    result
                })
                .collect();
            let stat_skipped = stat_skipped.load(Ordering::Relaxed);

            let mut by_size: HashMap<u64, Vec<usize>> = HashMap::new();
            for (i, (_, _, size)) in sized.iter().enumerate() {
                by_size.entry(*size).or_default().push(i);
            }
            let candidates: Vec<usize> = by_size
                .into_values()
                .filter(|g| g.len() > 1)
                .flatten()
                .collect();

            if candidates.is_empty() {
                return (vec![], stat_skipped, 0);
            }

            // ── Phase 2: sample hash ──────────────────────────────────────────
            let c_total = candidates.len();
            let _ = app_hash.emit(
                "duplicate_scan_progress",
                DuplicateScanProgress {
                    phase: "hashing".to_string(),
                    processed: 0,
                    total: c_total,
                    skipped: stat_skipped,
                },
            );
            let counter = AtomicUsize::new(0);
            let hash_skipped = AtomicUsize::new(0);

            let pairs = candidates
                .par_iter()
                .filter_map(|&idx| {
                    let (id, path, size) = &sized[idx];
                    let result = if *size == 0 {
                        Some((xxh3_64(&[]), *size, *id, path.clone()))
                    } else {
                        std::fs::File::open(path)
                            .ok()
                            // SAFETY: read-only; no external truncation expected during scan.
                            .and_then(|file| unsafe { Mmap::map(&file).ok() })
                            .map(|mmap| (sample(&mmap), *size, *id, path.clone()))
                    };
                    if result.is_none() {
                        hash_skipped.fetch_add(1, Ordering::Relaxed);
                    }
                    let done = counter.fetch_add(1, Ordering::Relaxed) + 1;
                    if done.is_multiple_of(100) || done == c_total {
                        let _ = app_hash.emit(
                            "duplicate_scan_progress",
                            DuplicateScanProgress {
                                phase: "hashing".to_string(),
                                processed: done,
                                total: c_total,
                                skipped: stat_skipped + hash_skipped.load(Ordering::Relaxed),
                            },
                        );
                    }
                    result
                })
                .collect();
            (
                pairs,
                stat_skipped + hash_skipped.load(Ordering::Relaxed),
                c_total,
            )
        })
        .await
        .map_err(|e| e.to_string())?;

    // Group by (sample_hash, file_size).
    let mut size_hash_map: std::collections::HashMap<(u64, u64), Vec<(i64, String)>> =
        std::collections::HashMap::new();
    for (hash, file_size, id, path) in pairs {
        size_hash_map
            .entry((hash, file_size))
            .or_default()
            .push((id, path));
    }

    // Phase 3: for large-file groups (> 64 KB) the sample hash is not exact;
    // re-hash the full file contents to confirm matches. Each distinct full
    // hash becomes its own DuplicateGroup so disjoint sets (A,A vs B,B that
    // happened to share size and sample hash) are never merged.
    const COVERED: u64 = (16 * 1024 * 4) as u64;
    let confirming_total: usize = size_hash_map
        .iter()
        .filter(|((_, file_size), entries)| *file_size > COVERED && entries.len() > 1)
        .map(|(_, entries)| entries.len())
        .sum();
    if confirming_total > 0 {
        let _ = app.emit(
            "duplicate_scan_progress",
            DuplicateScanProgress {
                phase: "confirming".to_string(),
                processed: 0,
                total: confirming_total,
                skipped: skipped_before_confirm,
            },
        );
    }
    let app_confirm = app.clone();
    let (confirmed, skipped_files): (Vec<(u64, u64, Vec<i64>)>, usize) =
        tokio::task::spawn_blocking(move || {
            use memmap2::Mmap;
            use rayon::prelude::*;
            use std::sync::atomic::{AtomicUsize, Ordering};
            use xxhash_rust::xxh3::xxh3_64;

            let counter = AtomicUsize::new(0);
            let confirm_skipped = AtomicUsize::new(0);
            let confirmed = size_hash_map
                .into_iter()
                .filter(|(_, entries)| entries.len() > 1)
                .flat_map(|((sample_hash, file_size), entries)| {
                    if file_size <= COVERED {
                        // Sample was already a full hash — one group, no re-read needed.
                        return vec![(
                            sample_hash,
                            file_size,
                            entries.into_iter().map(|(id, _)| id).collect(),
                        )];
                    }
                    // Full-file hash pass. Group by full hash so that two sets of
                    // files that collide only in the sample produce separate groups.
                    let full_hashes: Vec<(i64, Option<u64>)> = entries
                        .par_iter()
                        .map(|(id, path)| {
                            let hash = std::fs::File::open(path)
                                .ok()
                                .and_then(|f| unsafe { Mmap::map(&f).ok() })
                                .map(|mmap| xxh3_64(&mmap));
                            if hash.is_none() {
                                confirm_skipped.fetch_add(1, Ordering::Relaxed);
                            }
                            let done = counter.fetch_add(1, Ordering::Relaxed) + 1;
                            if done.is_multiple_of(100) || done == confirming_total {
                                let _ = app_confirm.emit(
                                    "duplicate_scan_progress",
                                    DuplicateScanProgress {
                                        phase: "confirming".to_string(),
                                        processed: done,
                                        total: confirming_total,
                                        skipped: skipped_before_confirm
                                            + confirm_skipped.load(Ordering::Relaxed),
                                    },
                                );
                            }
                            (*id, hash)
                        })
                        .collect();
                    let mut by_full: std::collections::HashMap<u64, Vec<i64>> =
                        std::collections::HashMap::new();
                    for (id, maybe_hash) in full_hashes {
                        if let Some(h) = maybe_hash {
                            by_full.entry(h).or_default().push(id);
                        }
                    }
                    // Emit one entry per distinct full hash that has ≥ 2 members.
                    by_full
                        .into_iter()
                        .filter(|(_, ids)| ids.len() > 1)
                        .map(|(full_hash, ids)| (full_hash, file_size, ids))
                        .collect()
                })
                .collect();
            (
                confirmed,
                skipped_before_confirm + confirm_skipped.load(Ordering::Relaxed),
            )
        })
        .await
        .map_err(|e| e.to_string())?;

    // Resolve image records for each duplicate group
    let conn = db.get().map_err(|e| e.to_string())?;
    let mut groups: Vec<DuplicateGroup> = confirmed
        .into_iter()
        .filter_map(|(hash, file_size, ids)| {
            let images = db::get_images_by_ids(&conn, &ids).ok()?;
            Some(DuplicateGroup {
                file_hash: format!("{hash:016x}"),
                file_size,
                images,
            })
        })
        .collect();

    // Largest duplicates first — wastes the most space
    groups.sort_by_key(|group| std::cmp::Reverse(group.file_size));

    // Persist results so they survive restart — best-effort, ignore errors.
    let folder_scope = match folder_id {
        Some(id) => format!("folder:{id}"),
        None => "all".to_string(),
    };
    if let Ok(json) = serde_json::to_string(&groups) {
        let _ = db::set_duplicate_scan_cache(&conn, &folder_scope, &json);
    }

    Ok(DuplicateScanResult {
        groups,
        scanned_files: total,
        candidate_files: candidate_total,
        skipped_files,
    })
}

#[tauri::command]
pub async fn load_duplicate_scan_cache(
    db: State<'_, DbState>,
    folder_id: Option<i64>,
) -> Result<Option<DuplicateScanCache>, String> {
    let folder_scope = match folder_id {
        Some(id) => format!("folder:{id}"),
        None => "all".to_string(),
    };
    let conn = db.get().map_err(|e| e.to_string())?;
    match db::get_duplicate_scan_cache(&conn, &folder_scope).map_err(|e| e.to_string())? {
        Some((json, scanned_at)) => {
            let groups: Vec<DuplicateGroup> =
                serde_json::from_str(&json).map_err(|e| e.to_string())?;
            Ok(Some(DuplicateScanCache { groups, scanned_at }))
        }
        None => Ok(None),
    }
}

#[tauri::command]
pub async fn invalidate_duplicate_scan_cache(
    db: State<'_, DbState>,
    folder_id: Option<i64>,
) -> Result<(), String> {
    let folder_scope = match folder_id {
        Some(id) => format!("folder:{id}"),
        None => "all".to_string(),
    };
    let conn = db.get().map_err(|e| e.to_string())?;
    db::clear_duplicate_scan_cache(&conn, &folder_scope).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_images_from_disk(
    db: State<'_, DbState>,
    params: DeleteImagesFromDiskParams,
) -> Result<Vec<i64>, String> {
    if params.image_ids.is_empty() {
        return Ok(Vec::new());
    }
    let conn = db.get().map_err(|e| e.to_string())?;
    let records = db::get_all_image_paths(&conn, None).map_err(|e| e.to_string())?;
    let id_set: std::collections::HashSet<i64> = params.image_ids.iter().copied().collect();

    // Attempt filesystem removal first; only delete DB rows for files that
    // were successfully removed. This prevents entries from disappearing from
    // the library when a file is locked or permission-denied.
    let mut succeeded_ids: Vec<i64> = Vec::new();
    for r in records.into_iter().filter(|r| id_set.contains(&r.id)) {
        if std::fs::remove_file(&r.path).is_ok() {
            succeeded_ids.push(r.id);
            if let Some(thumb) = &r.thumbnail_path {
                let _ = std::fs::remove_file(thumb);
            }
        }
    }
    if !succeeded_ids.is_empty() {
        db::delete_images_by_ids(&conn, &succeeded_ids).map_err(|e| e.to_string())?;
    }
    // Return the IDs that were actually removed so the caller can update state precisely.
    Ok(succeeded_ids)
}

#[tauri::command]
pub async fn get_images_by_ids(
    db: State<'_, DbState>,
    params: GetImagesByIdsParams,
) -> Result<Vec<ImageRecord>, String> {
    let conn = db.get().map_err(|e| e.to_string())?;
    db::get_images_by_ids(&conn, &params.image_ids).map_err(|e| e.to_string())
}

/// Which acceleration variant this binary was compiled with. Used to badge the
/// version in Settings so it's clear whether the CPU or CUDA build is running.
#[tauri::command]
pub fn get_build_variant() -> String {
    if cfg!(feature = "candle-cuda") {
        "cuda".to_string()
    } else {
        "cpu".to_string()
    }
}

/// Camera/EXIF metadata for the lightbox info panel. Read on demand from the
/// file (not stored in the DB) so it works on every already-indexed image
/// without a reindex. All fields are optional — absent tags are simply omitted.
#[derive(Serialize, Default)]
pub struct ImageExif {
    pub make: Option<String>,
    pub model: Option<String>,
    pub lens: Option<String>,
    pub iso: Option<String>,
    pub f_number: Option<String>,
    pub exposure_time: Option<String>,
    pub focal_length: Option<String>,
    pub datetime_original: Option<String>,
    pub gps_lat: Option<f64>,
    pub gps_lon: Option<f64>,
}

fn gps_coord(exif: &exif::Exif, coord: exif::Tag, reference: exif::Tag) -> Option<f64> {
    let field = exif.get_field(coord, exif::In::PRIMARY)?;
    if let exif::Value::Rational(ref parts) = field.value {
        if parts.len() >= 3 {
            let degrees = parts[0].to_f64() + parts[1].to_f64() / 60.0 + parts[2].to_f64() / 3600.0;
            // Read the hemisphere straight from the ref tag's ASCII bytes
            // ("N"/"S"/"E"/"W") rather than its formatted display string.
            let negative = exif
                .get_field(reference, exif::In::PRIMARY)
                .map(|f| match &f.value {
                    exif::Value::Ascii(values) => values
                        .iter()
                        .flatten()
                        .next()
                        .map(|&byte| byte == b'S' || byte == b'W')
                        .unwrap_or(false),
                    _ => false,
                })
                .unwrap_or(false);
            return Some(if negative { -degrees } else { degrees });
        }
    }
    None
}

fn extract_image_exif(path: &Path) -> ImageExif {
    let mut out = ImageExif::default();
    let Ok(file) = std::fs::File::open(path) else {
        return out;
    };
    let mut reader = std::io::BufReader::new(file);
    let Ok(exif) = exif::Reader::new().read_from_container(&mut reader) else {
        return out;
    };

    let text = |tag: exif::Tag| -> Option<String> {
        let value = exif
            .get_field(tag, exif::In::PRIMARY)?
            .display_value()
            .with_unit(&exif)
            .to_string();
        let trimmed = value.trim().trim_matches('"').trim().to_string();
        (!trimmed.is_empty()).then_some(trimmed)
    };

    out.make = text(exif::Tag::Make);
    out.model = text(exif::Tag::Model);
    out.lens = text(exif::Tag::LensModel);
    out.iso = text(exif::Tag::PhotographicSensitivity);
    out.f_number = text(exif::Tag::FNumber);
    out.exposure_time = text(exif::Tag::ExposureTime);
    out.focal_length = text(exif::Tag::FocalLength);
    out.datetime_original = text(exif::Tag::DateTimeOriginal);
    out.gps_lat = gps_coord(&exif, exif::Tag::GPSLatitude, exif::Tag::GPSLatitudeRef);
    out.gps_lon = gps_coord(&exif, exif::Tag::GPSLongitude, exif::Tag::GPSLongitudeRef);
    out
}

#[derive(Deserialize)]
pub struct GetImageExifParams {
    pub image_id: i64,
}

#[tauri::command]
pub async fn get_image_exif(
    db: State<'_, DbState>,
    params: GetImageExifParams,
) -> Result<ImageExif, String> {
    let conn = db.get().map_err(|e| e.to_string())?;
    let record = db::get_image_by_id(&conn, params.image_id).map_err(|e| e.to_string())?;
    Ok(extract_image_exif(Path::new(&record.path)))
}

// ── k-means with cosine similarity (all vectors assumed to be unit-normalized) ──

fn dot(a: &[f32], b: &[f32]) -> f32 {
    a.iter().zip(b.iter()).map(|(x, y)| x * y).sum()
}

fn normalize(v: &mut [f32]) {
    let norm: f32 = v.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm > 1e-10 {
        v.iter_mut().for_each(|x| *x /= norm);
    }
}

fn kmeans_cosine(
    points: &[Vec<f32>],
    k: usize,
    max_iter: usize,
) -> (Vec<Vec<f32>>, Vec<usize>, Vec<usize>) {
    let n = points.len();
    let dim = points[0].len();

    // Deterministic k-means++ init: spread centroids as far apart as possible
    let mut centroids: Vec<Vec<f32>> = Vec::with_capacity(k);
    centroids.push(points[n / 2].clone());
    for _ in 1..k {
        let next = points
            .iter()
            .map(|p| {
                let best_sim = centroids
                    .iter()
                    .map(|c| dot(p, c))
                    .fold(f32::NEG_INFINITY, f32::max);
                1.0 - best_sim // distance = 1 - cosine_similarity
            })
            .enumerate()
            .max_by(|(_, a), (_, b)| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal))
            .map(|(i, _)| i)
            .unwrap_or(0);
        centroids.push(points[next].clone());
    }

    let mut assignments = vec![0usize; n];

    for _ in 0..max_iter {
        // Assignment step
        let mut changed = false;
        for (i, p) in points.iter().enumerate() {
            let best = centroids
                .iter()
                .enumerate()
                .map(|(j, c)| (j, dot(p, c)))
                .max_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal))
                .map(|(j, _)| j)
                .unwrap_or(0);
            if assignments[i] != best {
                assignments[i] = best;
                changed = true;
            }
        }
        if !changed {
            break;
        }

        // Update step: mean of assigned points, then normalize
        let mut sums = vec![vec![0.0f32; dim]; k];
        let mut counts = vec![0usize; k];
        for (p, &c) in points.iter().zip(assignments.iter()) {
            sums[c].iter_mut().zip(p.iter()).for_each(|(s, v)| *s += v);
            counts[c] += 1;
        }
        for (centroid, (sum, &count)) in
            centroids.iter_mut().zip(sums.iter_mut().zip(counts.iter()))
        {
            if count > 0 {
                sum.iter_mut().for_each(|v| *v /= count as f32);
                normalize(sum);
                *centroid = sum.clone();
            }
        }
    }

    let mut counts = vec![0usize; k];
    for &a in &assignments {
        counts[a] += 1;
    }

    (centroids, counts, assignments)
}

#[derive(Serialize)]
pub struct FailedEmbeddingItem {
    pub image_id: i64,
    pub filename: String,
    pub path: String,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn get_failed_embedding_images(
    db: State<'_, DbState>,
    folder_id: i64,
) -> Result<Vec<FailedEmbeddingItem>, String> {
    let conn = db.get().map_err(|e| e.to_string())?;
    let rows = db::get_failed_embedding_images(&conn, folder_id).map_err(|e| e.to_string())?;
    Ok(rows
        .into_iter()
        .map(|(image_id, filename, path, error)| FailedEmbeddingItem {
            image_id,
            filename,
            path,
            error,
        })
        .collect())
}

#[derive(Serialize)]
pub struct FolderWorkerStates {
    pub folder_id: i64,
    pub thumbnail_paused: bool,
    pub metadata_paused: bool,
    pub embedding_paused: bool,
    pub caption_paused: bool,
    pub tagging_paused: bool,
}

#[tauri::command]
pub async fn set_worker_paused(
    db: State<'_, DbState>,
    worker: String,
    folder_id: i64,
    paused: bool,
) -> Result<(), String> {
    indexer::set_worker_paused(&worker, folder_id, paused);
    if worker == "caption" && paused {
        let conn = db.get().map_err(|e| e.to_string())?;
        db::requeue_processing_caption_jobs_for_folder(&conn, folder_id)
            .map_err(|e| e.to_string())?;
    }
    if worker == "tagging" && paused {
        let conn = db.get().map_err(|e| e.to_string())?;
        db::requeue_processing_tagging_jobs_for_folder(&conn, folder_id)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn get_worker_states(folder_ids: Vec<i64>) -> Result<Vec<FolderWorkerStates>, String> {
    let states = indexer::get_worker_paused_states(&folder_ids);
    Ok(folder_ids
        .into_iter()
        .map(|folder_id| {
            let state =
                states
                    .get(&folder_id)
                    .copied()
                    .unwrap_or(indexer::FolderWorkerPausedState {
                        thumbnail: false,
                        metadata: false,
                        embedding: false,
                        caption: false,
                        tagging: false,
                    });
            FolderWorkerStates {
                folder_id,
                thumbnail_paused: state.thumbnail,
                metadata_paused: state.metadata,
                embedding_paused: state.embedding,
                caption_paused: state.caption,
                tagging_paused: state.tagging,
            }
        })
        .collect())
}

// ---------------------------------------------------------------------------
// Tagger commands
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct SetTaggerAccelerationParams {
    pub acceleration: TaggerAcceleration,
}

#[derive(Deserialize)]
pub struct SetTaggerThresholdParams {
    pub threshold: f32,
}

#[derive(Deserialize)]
pub struct SetTaggerBatchSizeParams {
    pub batch_size: usize,
}

#[derive(Deserialize)]
pub struct QueueTaggingJobsParams {
    pub folder_id: Option<i64>,
    pub folder_ids: Option<Vec<i64>>,
    pub image_id: Option<i64>,
}

#[derive(Deserialize)]
pub struct ClearTaggingJobsParams {
    pub folder_id: Option<i64>,
    pub folder_ids: Option<Vec<i64>>,
}

#[derive(Deserialize)]
pub struct GetImageTagsParams {
    pub image_id: i64,
}

#[derive(Deserialize)]
pub struct AddUserTagParams {
    pub image_id: i64,
    pub tag: String,
}

#[derive(Deserialize)]
pub struct RemoveTagParams {
    pub tag_id: i64,
}

#[tauri::command]
pub async fn get_tagger_model_status(app: AppHandle) -> Result<TaggerModelStatus, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(tagger::tagger_model_status(&app_dir))
}

#[tauri::command]
pub async fn get_tagger_acceleration(app: AppHandle) -> Result<TaggerAcceleration, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(tagger::tagger_acceleration(&app_dir))
}

#[tauri::command]
pub async fn set_tagger_acceleration(
    app: AppHandle,
    params: SetTaggerAccelerationParams,
) -> Result<TaggerAcceleration, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    tagger::set_tagger_acceleration(&app_dir, params.acceleration).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn probe_tagger_runtime(app: AppHandle) -> Result<TaggerRuntimeProbe, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || tagger::probe_tagger_runtime(&app_dir))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_tagger_threshold(app: AppHandle) -> Result<f32, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(tagger::tagger_threshold(&app_dir))
}

#[tauri::command]
pub async fn set_tagger_threshold(
    app: AppHandle,
    params: SetTaggerThresholdParams,
) -> Result<f32, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    tagger::set_tagger_threshold(&app_dir, params.threshold).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_tagger_batch_size(app: AppHandle) -> Result<usize, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(tagger::tagger_batch_size(&app_dir))
}

#[tauri::command]
pub async fn set_tagger_batch_size(
    app: AppHandle,
    params: SetTaggerBatchSizeParams,
) -> Result<usize, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    tagger::set_tagger_batch_size(&app_dir, params.batch_size).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn prepare_tagger_model(app: AppHandle) -> Result<TaggerModelStatus, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        let app = app.clone();
        tagger::prepare_tagger_model_with_progress(&app_dir, move |progress| {
            let _ = app.emit("tagger-model-progress", progress);
        })
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_tagger_model(app: AppHandle) -> Result<TaggerModelStatus, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || tagger::delete_tagger_model(&app_dir))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn queue_tagging_jobs(
    app: AppHandle,
    db: State<'_, DbState>,
    params: QueueTaggingJobsParams,
) -> Result<usize, String> {
    let conn = db.get().map_err(|e| e.to_string())?;
    let requested_folder_ids = params.folder_ids.unwrap_or_default();
    let (total, folder_ids) = match (
        params.folder_id,
        params.image_id,
        requested_folder_ids.is_empty(),
    ) {
        (_, Some(image_id), _) => {
            db::enqueue_tagging_job(&conn, image_id).map_err(|e| e.to_string())?;
            // Look up just this image's folder_id rather than fetching all folders
            let image = db::get_image_by_id(&conn, image_id).map_err(|e| e.to_string())?;
            (1usize, vec![image.folder_id])
        }
        (Some(folder_id), None, _) => {
            let n = db::enqueue_missing_tagging_jobs_for_folder(&conn, folder_id)
                .map_err(|e| e.to_string())?;
            (n, vec![folder_id])
        }
        (None, None, false) => {
            let mut total = 0usize;
            for &folder_id in &requested_folder_ids {
                total += db::enqueue_missing_tagging_jobs_for_folder(&conn, folder_id)
                    .map_err(|e| e.to_string())?;
            }
            (total, requested_folder_ids)
        }
        (None, None, true) => {
            let folders = db::get_folders(&conn).map_err(|e| e.to_string())?;
            let folder_ids: Vec<i64> = folders.iter().map(|f| f.id).collect();
            let mut total = 0usize;
            for &folder_id in &folder_ids {
                total += db::enqueue_missing_tagging_jobs_for_folder(&conn, folder_id)
                    .map_err(|e| e.to_string())?;
            }
            (total, folder_ids)
        }
    };
    drop(conn);
    indexer::emit_folder_job_progress(&app, db.inner(), &folder_ids, true);
    Ok(total)
}

#[tauri::command]
pub async fn clear_tagging_jobs(
    app: AppHandle,
    db: State<'_, DbState>,
    params: ClearTaggingJobsParams,
) -> Result<usize, String> {
    let conn = db.get().map_err(|e| e.to_string())?;
    let requested_folder_ids = params.folder_ids.unwrap_or_default();
    let (n, folder_ids): (usize, Vec<i64>) =
        match (params.folder_id, requested_folder_ids.is_empty()) {
            (Some(id), _) => (
                db::clear_tagging_jobs(&conn, Some(id)).map_err(|e| e.to_string())?,
                vec![id],
            ),
            (None, false) => {
                let mut total = 0usize;
                for &folder_id in &requested_folder_ids {
                    total += db::clear_tagging_jobs(&conn, Some(folder_id))
                        .map_err(|e| e.to_string())?;
                }
                (total, requested_folder_ids)
            }
            (None, true) => (
                db::clear_tagging_jobs(&conn, None).map_err(|e| e.to_string())?,
                db::get_folders(&conn)
                    .map_err(|e| e.to_string())?
                    .into_iter()
                    .map(|f| f.id)
                    .collect(),
            ),
        };
    drop(conn);
    indexer::emit_folder_job_progress(&app, db.inner(), &folder_ids, true);
    Ok(n)
}

#[tauri::command]
pub async fn get_image_tags(
    db: State<'_, DbState>,
    params: GetImageTagsParams,
) -> Result<Vec<ImageTag>, String> {
    let conn = db.get().map_err(|e| e.to_string())?;
    db::get_image_tags(&conn, params.image_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_user_tag(
    db: State<'_, DbState>,
    params: AddUserTagParams,
) -> Result<ImageTag, String> {
    let conn = db.get().map_err(|e| e.to_string())?;
    db::add_user_tag(&conn, params.image_id, &params.tag).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remove_tag(db: State<'_, DbState>, params: RemoveTagParams) -> Result<(), String> {
    let conn = db.get().map_err(|e| e.to_string())?;
    db::remove_tag(&conn, params.tag_id).map_err(|e| e.to_string())
}

#[derive(Deserialize)]
pub struct RenameTagParams {
    pub from: String,
    pub to: String,
}

#[derive(Deserialize)]
pub struct DeleteTagParams {
    pub tag: String,
}

#[tauri::command]
pub async fn rename_tag(db: State<'_, DbState>, params: RenameTagParams) -> Result<(), String> {
    let from = params.from.trim();
    let to = params.to.trim();
    if from.is_empty() || to.is_empty() {
        return Err("Tag names cannot be empty".to_string());
    }
    if from == to {
        return Ok(());
    }
    let conn = db.get().map_err(|e| e.to_string())?;
    db::rename_tag(&conn, from, to).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_tag(db: State<'_, DbState>, params: DeleteTagParams) -> Result<i64, String> {
    let tag = params.tag.trim();
    if tag.is_empty() {
        return Err("Tag name cannot be empty".to_string());
    }
    let conn = db.get().map_err(|e| e.to_string())?;
    db::delete_tag(&conn, tag).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Albums
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct CreateAlbumParams {
    pub name: String,
}

#[derive(Deserialize)]
pub struct RenameAlbumParams {
    pub album_id: i64,
    pub new_name: String,
}

#[derive(Deserialize)]
pub struct DeleteAlbumParams {
    pub album_id: i64,
}

#[derive(Deserialize)]
pub struct ReorderAlbumsParams {
    pub album_ids: Vec<i64>,
}

#[derive(Deserialize)]
pub struct DeleteAlbumsParams {
    pub album_ids: Vec<i64>,
}

#[derive(Deserialize)]
pub struct AlbumImagesParams {
    pub album_id: i64,
    pub image_ids: Vec<i64>,
}

#[derive(Deserialize)]
pub struct GetAlbumImagesParams {
    pub album_id: i64,
    pub sort: Option<String>,
    pub offset: Option<i64>,
    pub limit: Option<i64>,
}

#[tauri::command]
pub async fn list_albums(db: State<'_, DbState>) -> Result<Vec<Album>, String> {
    let conn = db.get().map_err(|e| e.to_string())?;
    db::list_albums(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_album(db: State<'_, DbState>, params: CreateAlbumParams) -> Result<Album, String> {
    let conn = db.get().map_err(|e| e.to_string())?;
    let name = params.name.trim();
    if name.is_empty() {
        return Err("Album name cannot be empty".to_string());
    }
    db::create_album(&conn, name).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn rename_album(db: State<'_, DbState>, params: RenameAlbumParams) -> Result<(), String> {
    let conn = db.get().map_err(|e| e.to_string())?;
    let name = params.new_name.trim();
    if name.is_empty() {
        return Err("Album name cannot be empty".to_string());
    }
    db::rename_album(&conn, params.album_id, name).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_album(db: State<'_, DbState>, params: DeleteAlbumParams) -> Result<(), String> {
    let conn = db.get().map_err(|e| e.to_string())?;
    db::delete_album(&conn, params.album_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn reorder_albums(db: State<'_, DbState>, params: ReorderAlbumsParams) -> Result<(), String> {
    let conn = db.get().map_err(|e| e.to_string())?;
    db::reorder_albums(&conn, &params.album_ids).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_albums(db: State<'_, DbState>, params: DeleteAlbumsParams) -> Result<(), String> {
    let conn = db.get().map_err(|e| e.to_string())?;
    db::delete_albums(&conn, &params.album_ids).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_images_to_album(
    db: State<'_, DbState>,
    params: AlbumImagesParams,
) -> Result<i64, String> {
    let conn = db.get().map_err(|e| e.to_string())?;
    db::add_images_to_album(&conn, params.album_id, &params.image_ids).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remove_images_from_album(
    db: State<'_, DbState>,
    params: AlbumImagesParams,
) -> Result<(), String> {
    let conn = db.get().map_err(|e| e.to_string())?;
    db::remove_images_from_album(&conn, params.album_id, &params.image_ids)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_album_images(
    db: State<'_, DbState>,
    params: GetAlbumImagesParams,
) -> Result<ImagesPage, String> {
    let conn = db.get().map_err(|e| e.to_string())?;
    let sort = params.sort.as_deref().unwrap_or("position");
    let offset = params.offset.unwrap_or(0);
    let limit = params.limit.unwrap_or(100);
    let total = db::count_album_images(&conn, params.album_id).map_err(|e| e.to_string())?;
    let images = db::get_album_images(&conn, params.album_id, sort, offset, limit)
        .map_err(|e| e.to_string())?;
    Ok(ImagesPage {
        images,
        total,
        offset,
        limit,
    })
}

// ---------------------------------------------------------------------------
// Bulk image operations
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct BulkUpdateDetailsParams {
    pub image_ids: Vec<i64>,
    pub favorite: Option<bool>,
    pub rating: Option<i64>,
}

#[derive(Deserialize)]
pub struct BulkAddTagsParams {
    pub image_ids: Vec<i64>,
    pub tags: Vec<String>,
}

#[derive(Deserialize)]
pub struct BulkRemoveTagParams {
    pub image_ids: Vec<i64>,
    pub tag: String,
}

#[tauri::command]
pub async fn bulk_update_details(
    db: State<'_, DbState>,
    params: BulkUpdateDetailsParams,
) -> Result<Vec<ImageRecord>, String> {
    let conn = db.get().map_err(|e| e.to_string())?;
    db::bulk_update_details(&conn, &params.image_ids, params.favorite, params.rating)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn bulk_add_tags(
    db: State<'_, DbState>,
    params: BulkAddTagsParams,
) -> Result<(), String> {
    let conn = db.get().map_err(|e| e.to_string())?;
    db::bulk_add_tags(&conn, &params.image_ids, &params.tags).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn bulk_remove_tag(
    db: State<'_, DbState>,
    params: BulkRemoveTagParams,
) -> Result<(), String> {
    let conn = db.get().map_err(|e| e.to_string())?;
    db::bulk_remove_tag_by_name(&conn, &params.image_ids, &params.tag).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Queue scope / folder-id persistence
// ---------------------------------------------------------------------------

const TAGGING_QUEUE_SCOPE_FILE: &str = "settings/tagging_queue_scope.txt";
const TAGGING_QUEUE_FOLDER_IDS_FILE: &str = "settings/tagging_queue_folder_ids.txt";

#[derive(Deserialize)]
pub struct SetTaggingQueueScopeParams {
    pub scope: String,
}

#[derive(Deserialize)]
pub struct SetTaggingQueueFolderIdsParams {
    pub folder_ids: Vec<i64>,
}

#[tauri::command]
pub async fn get_tagging_queue_scope(app: AppHandle) -> Result<String, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let path = app_dir.join(TAGGING_QUEUE_SCOPE_FILE);
    let value = std::fs::read_to_string(path).unwrap_or_default();
    Ok(if value.trim() == "selected" {
        "selected".to_string()
    } else {
        "all".to_string()
    })
}

#[tauri::command]
pub async fn set_tagging_queue_scope(
    app: AppHandle,
    params: SetTaggingQueueScopeParams,
) -> Result<String, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let path = app_dir.join(TAGGING_QUEUE_SCOPE_FILE);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let value = if params.scope == "selected" {
        "selected"
    } else {
        "all"
    };
    std::fs::write(path, value).map_err(|e| e.to_string())?;
    Ok(value.to_string())
}

#[tauri::command]
pub async fn get_tagging_queue_folder_ids(app: AppHandle) -> Result<Vec<i64>, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let path = app_dir.join(TAGGING_QUEUE_FOLDER_IDS_FILE);
    let Ok(content) = std::fs::read_to_string(path) else {
        return Ok(vec![]);
    };
    let ids = content
        .split(',')
        .filter_map(|s| s.trim().parse::<i64>().ok())
        .collect();
    Ok(ids)
}

#[tauri::command]
pub async fn set_tagging_queue_folder_ids(
    app: AppHandle,
    params: SetTaggingQueueFolderIdsParams,
) -> Result<(), String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let path = app_dir.join(TAGGING_QUEUE_FOLDER_IDS_FILE);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content: Vec<String> = params.folder_ids.iter().map(|id| id.to_string()).collect();
    std::fs::write(path, content.join(",")).map_err(|e| e.to_string())?;
    Ok(())
}

// ---------------------------------------------------------------------------
// App data folder
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn open_app_data_folder(app: AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    app.opener()
        .open_path(app_dir.to_string_lossy().as_ref(), None::<&str>)
        .map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Database maintenance
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct DatabaseInfo {
    pub size_mb: f64,
    pub reclaimable_mb: f64,
}

#[derive(Serialize)]
pub struct VacuumResult {
    pub before_mb: f64,
    pub after_mb: f64,
    pub freed_mb: f64,
}

#[tauri::command]
pub async fn get_database_info(
    app: AppHandle,
    db: State<'_, DbState>,
) -> Result<DatabaseInfo, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_dir.join("gallery.db");
    let size_bytes = std::fs::metadata(&db_path).map(|m| m.len()).unwrap_or(0);

    let conn = db.get().map_err(|e| e.to_string())?;
    let page_size: i64 = conn
        .query_row("PRAGMA page_size", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let freelist_count: i64 = conn
        .query_row("PRAGMA freelist_count", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;

    Ok(DatabaseInfo {
        size_mb: size_bytes as f64 / 1_048_576.0,
        reclaimable_mb: (freelist_count * page_size) as f64 / 1_048_576.0,
    })
}

#[tauri::command]
pub async fn vacuum_database(
    app: AppHandle,
    db: State<'_, DbState>,
) -> Result<VacuumResult, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_dir.join("gallery.db");
    let before_bytes = std::fs::metadata(&db_path).map(|m| m.len()).unwrap_or(0);

    let conn = db.get().map_err(|e| e.to_string())?;
    conn.execute_batch("PRAGMA wal_checkpoint(FULL); VACUUM;")
        .map_err(|e| e.to_string())?;
    drop(conn);

    let after_bytes = std::fs::metadata(&db_path).map(|m| m.len()).unwrap_or(0);
    Ok(VacuumResult {
        before_mb: before_bytes as f64 / 1_048_576.0,
        after_mb: after_bytes as f64 / 1_048_576.0,
        freed_mb: before_bytes.saturating_sub(after_bytes) as f64 / 1_048_576.0,
    })
}

#[tauri::command]
pub async fn rebuild_semantic_index(db: State<'_, DbState>) -> Result<usize, String> {
    let conn = db.get().map_err(|e| e.to_string())?;
    // Serialize against the embedding worker (which writes under the same lock)
    // so the rebuild can't interleave with an in-flight embedding batch.
    indexer::with_db_write_lock(|| db::reset_all_embeddings(&conn)).map_err(|e| e.to_string())
}

#[derive(serde::Serialize)]
pub struct OrphanedThumbnailsInfo {
    pub count: u64,
    pub size_mb: f64,
}

#[derive(serde::Serialize)]
pub struct CleanupOrphanedThumbnailsResult {
    pub deleted_count: u64,
    pub freed_mb: f64,
}

fn collect_db_thumbnail_filenames(
    conn: &rusqlite::Connection,
) -> Result<std::collections::HashSet<String>, String> {
    let mut stmt = conn
        .prepare("SELECT thumbnail_path FROM images WHERE thumbnail_path IS NOT NULL")
        .map_err(|e| e.to_string())?;
    let set = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .filter_map(|p| {
            std::path::Path::new(&p)
                .file_name()
                .and_then(|f| f.to_str())
                .map(|s| s.to_owned())
        })
        .collect();
    Ok(set)
}

#[tauri::command]
pub async fn get_orphaned_thumbnails_info(
    app: AppHandle,
    db: State<'_, DbState>,
) -> Result<OrphanedThumbnailsInfo, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let thumb_dir = app_dir.join("thumbnails");

    let conn = db.get().map_err(|e| e.to_string())?;
    let db_filenames = collect_db_thumbnail_filenames(&conn)?;
    drop(conn);

    let mut count = 0u64;
    let mut size_bytes = 0u64;

    if thumb_dir.exists() {
        for entry in std::fs::read_dir(&thumb_dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let fname = entry.file_name();
            if !db_filenames.contains(fname.to_string_lossy().as_ref()) {
                size_bytes += entry.metadata().map(|m| m.len()).unwrap_or(0);
                count += 1;
            }
        }
    }

    Ok(OrphanedThumbnailsInfo {
        count,
        size_mb: size_bytes as f64 / 1_048_576.0,
    })
}

#[tauri::command]
pub async fn cleanup_orphaned_thumbnails(
    app: AppHandle,
    db: State<'_, DbState>,
) -> Result<CleanupOrphanedThumbnailsResult, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let thumb_dir = app_dir.join("thumbnails");

    let conn = db.get().map_err(|e| e.to_string())?;
    let db_filenames = collect_db_thumbnail_filenames(&conn)?;
    drop(conn);

    let mut deleted_count = 0u64;
    let mut freed_bytes = 0u64;

    if thumb_dir.exists() {
        for entry in std::fs::read_dir(&thumb_dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let fname = entry.file_name();
            if !db_filenames.contains(fname.to_string_lossy().as_ref()) {
                let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
                if std::fs::remove_file(entry.path()).is_ok() {
                    deleted_count += 1;
                    freed_bytes += size;
                }
            }
        }
    }

    Ok(CleanupOrphanedThumbnailsResult {
        deleted_count,
        freed_mb: freed_bytes as f64 / 1_048_576.0,
    })
}

const MUTED_FOLDER_IDS_FILE: &str = "settings/muted_folder_ids.txt";
const NOTIFICATIONS_PAUSED_FILE: &str = "settings/notifications_paused.txt";

#[tauri::command]
pub async fn get_muted_folder_ids(app: AppHandle) -> Result<Vec<i64>, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let path = app_dir.join(MUTED_FOLDER_IDS_FILE);
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    Ok(content
        .trim()
        .split(',')
        .filter(|s| !s.is_empty())
        .filter_map(|s| s.parse::<i64>().ok())
        .collect())
}

#[derive(serde::Deserialize)]
pub struct SetMutedFolderIdsParams {
    pub folder_ids: Vec<i64>,
}

#[tauri::command]
pub async fn set_muted_folder_ids(
    app: AppHandle,
    params: SetMutedFolderIdsParams,
) -> Result<(), String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let settings_dir = app_dir.join("settings");
    std::fs::create_dir_all(&settings_dir).map_err(|e| e.to_string())?;
    let content = params
        .folder_ids
        .iter()
        .map(|id| id.to_string())
        .collect::<Vec<_>>()
        .join(",");
    std::fs::write(settings_dir.join("muted_folder_ids.txt"), content).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_notifications_paused(app: AppHandle) -> Result<bool, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let path = app_dir.join(NOTIFICATIONS_PAUSED_FILE);
    if !path.exists() {
        return Ok(false);
    }
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    Ok(content.trim() == "true")
}

#[tauri::command]
pub async fn set_notifications_paused(app: AppHandle, paused: bool) -> Result<(), String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let settings_dir = app_dir.join("settings");
    std::fs::create_dir_all(&settings_dir).map_err(|e| e.to_string())?;
    std::fs::write(
        settings_dir.join("notifications_paused.txt"),
        if paused { "true" } else { "false" },
    )
    .map_err(|e| e.to_string())
}

#[derive(Serialize)]
pub struct FfmpegStatus {
    pub installed: bool,
    pub downloading: bool,
    pub failed: bool,
}

#[tauri::command]
pub async fn get_ffmpeg_status() -> Result<FfmpegStatus, String> {
    Ok(FfmpegStatus {
        installed: crate::media::ffmpeg_ready(),
        downloading: crate::media::ffmpeg_downloading(),
        failed: crate::media::ffmpeg_failed(),
    })
}

#[tauri::command]
pub async fn retry_ffmpeg_download(app: AppHandle) -> Result<(), String> {
    crate::media::spawn_ffmpeg_provision(app);
    Ok(())
}

const ONBOARDING_COMPLETED_FILE: &str = "settings/onboarding_completed.txt";

#[tauri::command]
pub async fn get_onboarding_completed(app: AppHandle) -> Result<bool, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let path = app_dir.join(ONBOARDING_COMPLETED_FILE);
    if !path.exists() {
        return Ok(false);
    }
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    Ok(content.trim() == "true")
}

#[tauri::command]
pub async fn set_onboarding_completed(app: AppHandle, completed: bool) -> Result<(), String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let settings_dir = app_dir.join("settings");
    std::fs::create_dir_all(&settings_dir).map_err(|e| e.to_string())?;
    std::fs::write(
        settings_dir.join("onboarding_completed.txt"),
        if completed { "true" } else { "false" },
    )
    .map_err(|e| e.to_string())
}

const LAST_SEEN_VERSION_FILE: &str = "settings/last_seen_version.txt";

/// The app version recorded on the previous launch. `None` when the file is
/// absent (fresh install, or first launch since this was introduced) — the
/// frontend uses that to decide whether to surface the "What's New" prompt.
#[tauri::command]
pub async fn get_last_seen_version(app: AppHandle) -> Result<Option<String>, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let path = app_dir.join(LAST_SEEN_VERSION_FILE);
    if !path.exists() {
        return Ok(None);
    }
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let trimmed = content.trim();
    Ok(if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    })
}

#[tauri::command]
pub async fn set_last_seen_version(app: AppHandle, version: String) -> Result<(), String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let settings_dir = app_dir.join("settings");
    std::fs::create_dir_all(&settings_dir).map_err(|e| e.to_string())?;
    std::fs::write(settings_dir.join("last_seen_version.txt"), version.trim())
        .map_err(|e| e.to_string())
}
