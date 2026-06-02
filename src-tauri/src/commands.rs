use crate::captioner::{
    self, CaptionAcceleration, CaptionDetail, CaptionModelStatus, CaptionRuntimeProbe,
    CaptionVisionProbe,
};
use crate::db::{self, DbPool, ExploreTagEntry, Folder, FolderJobProgress, ImageRecord, ImageTag};
use crate::embedder;
use crate::hnsw_index;
use crate::indexer;
use crate::tagger::{self, TaggerAcceleration, TaggerModelStatus, TaggerRuntimeProbe};
use crate::vector;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
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

#[tauri::command]
pub async fn add_folder(
    app: AppHandle,
    db: State<'_, DbState>,
    path: String,
) -> Result<Folder, String> {
    let folder_path = PathBuf::from(&path);

    if !folder_path.exists() || !folder_path.is_dir() {
        return Err("Path is not a valid directory".into());
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

    indexer::index_folder(app, db.inner().clone(), folder_id, folder_path);

    Ok(folder)
}

#[tauri::command]
pub async fn get_folders(db: State<'_, DbState>) -> Result<Vec<Folder>, String> {
    let conn = db.get().map_err(|e| e.to_string())?;
    db::get_folders(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_background_job_progress(
    db: State<'_, DbState>,
) -> Result<Vec<FolderJobProgress>, String> {
    let conn = db.get().map_err(|e| e.to_string())?;
    db::get_all_folder_job_progress(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remove_folder(db: State<'_, DbState>, folder_id: i64) -> Result<(), String> {
    let conn = db.get().map_err(|e| e.to_string())?;
    db::delete_folder(&conn, folder_id).map_err(|e| e.to_string())
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

    let total = db::count_images(
        &conn,
        params.folder_id,
        search,
        media_kind,
        favorites_only,
        rating_min,
        embedding_failed_only,
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
            let mut ids = vector::search_image_ids_by_embedding(&conn, &embedding, offset + limit + 1)
                .map_err(|e| e.to_string())?;
            // Exclude the source image from global results
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

#[tauri::command]
pub async fn semantic_search_images(
    db: State<'_, DbState>,
    params: SemanticSearchParams,
) -> Result<Vec<ImageRecord>, String> {
    let embedding = embedder::embed_text_query(&params.query).map_err(|e| e.to_string())?;

    let conn = db.get().map_err(|e| e.to_string())?;
    let limit = params.limit.unwrap_or(64);
    let ids = vector::search_image_ids_by_embedding(&conn, &embedding, limit)
        .map_err(|e| e.to_string())?;
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

    Ok(images)
}

#[tauri::command]
pub async fn search_images_by_tag(
    db: State<'_, DbState>,
    params: TagSearchParams,
) -> Result<Vec<ImageRecord>, String> {
    let conn = db.get().map_err(|e| e.to_string())?;
    db::search_images_by_tag(
        &conn,
        &params.query,
        params.folder_id,
        params.media_kind.as_deref(),
        params.favorites_only.unwrap_or(false),
        params.rating_min.unwrap_or(0),
        params.limit.unwrap_or(64),
    )
    .map_err(|e| e.to_string())
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

fn fnv_hash_ids(ids: &[i64]) -> u64 {
    let mut h: u64 = 0xcbf29ce484222325;
    for &id in ids {
        for b in id.to_le_bytes() {
            h = h.wrapping_mul(0x100000001b3) ^ (b as u64);
        }
    }
    h
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

    // Compute a hash of the current embedded image IDs (sorted for stability)
    let mut sorted_ids: Vec<i64> = embeddings_with_ids.iter().map(|(id, _)| *id).collect();
    sorted_ids.sort_unstable();
    let current_hash = fnv_hash_ids(&sorted_ids);

    let folder_scope = match folder_id {
        Some(id) => format!("folder_{}", id),
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
    db::get_explore_tags(&conn, params.folder_id, params.limit.unwrap_or(48)).map_err(|e| e.to_string())
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
    db::search_tags_autocomplete(&conn, &params.query, params.folder_id, params.limit.unwrap_or(10))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn find_duplicates(
    app: AppHandle,
    db: State<'_, DbState>,
    folder_id: Option<i64>,
) -> Result<Vec<DuplicateGroup>, String> {
    let records = {
        let conn = db.get().map_err(|e| e.to_string())?;
        db::get_all_image_paths(&conn, folder_id).map_err(|e| e.to_string())?
    };

    let total = records.len();
    let _ = app.emit("duplicate_scan_progress", (0usize, total));

    // Two-phase detection. No full-file read at any point.
    //
    // Phase 1 — stat:
    //   Read only file metadata (size). Files with a unique size cannot be
    //   duplicates; discard them immediately. Zero file content read.
    //
    // Phase 2 — sample hash:
    //   For each size-matched candidate, read four evenly-spaced 16 KB windows
    //   (head, 33%, 66%, tail) and hash them together. Total I/O per file is
    //   capped at 64 KB regardless of how large the file is.
    //
    //   For small files (≤ 64 KB) the windows cover the whole file, so the
    //   hash is exact. For large files, matching all four windows at different
    //   offsets is effectively impossible for natural photo/video content unless
    //   the files are genuinely identical — eliminating the need for a full read.
    let app_hash = app.clone();
    let pairs: Vec<(u64, u64, i64)> = tokio::task::spawn_blocking(move || {
        use memmap2::Mmap;
        use rayon::prelude::*;
        use std::collections::HashMap;
        use std::sync::atomic::{AtomicUsize, Ordering};
        use xxhash_rust::xxh3::{xxh3_64, Xxh3};

        const WINDOW: usize = 16 * 1024; // 16 KB per sample window
        const N: usize = 4;              // windows at 0%, 33%, 66%, 100%
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
        let sized: Vec<(i64, String, u64)> = records
            .par_iter()
            .filter_map(|r| {
                let size = std::fs::metadata(&r.path).ok()?.len();
                if size == 0 { return None; }
                Some((r.id, r.path.clone(), size))
            })
            .collect();

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
            return vec![];
        }

        // ── Phase 2: sample hash ──────────────────────────────────────────
        let c_total = candidates.len();
        let _ = app_hash.emit("duplicate_scan_progress", (0usize, c_total));
        let counter = AtomicUsize::new(0);

        candidates
            .par_iter()
            .filter_map(|&idx| {
                let (id, path, size) = &sized[idx];
                let file = std::fs::File::open(path).ok()?;
                // SAFETY: read-only; no external truncation expected during scan.
                let mmap = unsafe { Mmap::map(&file).ok()? };
                let hash = sample(&mmap);
                let done = counter.fetch_add(1, Ordering::Relaxed) + 1;
                if done % 100 == 0 || done == c_total {
                    let _ = app_hash.emit("duplicate_scan_progress", (done, c_total));
                }
                Some((hash, *size, *id))
            })
            .collect()
    })
    .await
    .map_err(|e| e.to_string())?;

    let mut size_hash_map: std::collections::HashMap<(u64, u64), Vec<i64>> = std::collections::HashMap::new();
    for (hash, file_size, id) in pairs {
        size_hash_map.entry((hash, file_size)).or_default().push(id);
    }

    // Resolve image records for each duplicate group
    let conn = db.get().map_err(|e| e.to_string())?;
    let mut groups: Vec<DuplicateGroup> = size_hash_map
        .into_iter()
        .filter(|(_, ids)| ids.len() > 1)
        .filter_map(|((hash, file_size), ids)| {
            let images = db::get_images_by_ids(&conn, &ids).ok()?;
            Some(DuplicateGroup {
                file_hash: format!("{:016x}", hash),
                file_size,
                images,
            })
        })
        .collect();

    // Largest duplicates first — wastes the most space
    groups.sort_by(|a, b| b.file_size.cmp(&a.file_size));

    // Persist results so they survive restart — best-effort, ignore errors.
    let folder_scope = match folder_id {
        Some(id) => format!("folder:{}", id),
        None => "all".to_string(),
    };
    if let Ok(json) = serde_json::to_string(&groups) {
        let _ = db::set_duplicate_scan_cache(&conn, &folder_scope, &json);
    }

    Ok(groups)
}

#[tauri::command]
pub async fn load_duplicate_scan_cache(
    db: State<'_, DbState>,
    folder_id: Option<i64>,
) -> Result<Option<DuplicateScanCache>, String> {
    let folder_scope = match folder_id {
        Some(id) => format!("folder:{}", id),
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
pub async fn delete_images_from_disk(
    db: State<'_, DbState>,
    params: DeleteImagesFromDiskParams,
) -> Result<usize, String> {
    if params.image_ids.is_empty() {
        return Ok(0);
    }
    let conn = db.get().map_err(|e| e.to_string())?;
    // Collect paths before deleting DB rows
    let records = db::get_all_image_paths(&conn, None).map_err(|e| e.to_string())?;
    let id_set: std::collections::HashSet<i64> = params.image_ids.iter().copied().collect();
    let paths: Vec<String> = records
        .into_iter()
        .filter(|r| id_set.contains(&r.id))
        .map(|r| r.path)
        .collect();

    db::delete_images_by_ids(&conn, &params.image_ids).map_err(|e| e.to_string())?;

    let mut deleted = 0usize;
    for path in &paths {
        if std::fs::remove_file(path).is_ok() {
            deleted += 1;
        }
    }
    Ok(deleted)
}

#[tauri::command]
pub async fn get_images_by_ids(
    db: State<'_, DbState>,
    params: GetImagesByIdsParams,
) -> Result<Vec<ImageRecord>, String> {
    let conn = db.get().map_err(|e| e.to_string())?;
    db::get_images_by_ids(&conn, &params.image_ids).map_err(|e| e.to_string())
}

// ── k-means with cosine similarity (all vectors assumed to be unit-normalized) ──

fn dot(a: &[f32], b: &[f32]) -> f32 {
    a.iter().zip(b.iter()).map(|(x, y)| x * y).sum()
}

fn normalize(v: &mut Vec<f32>) {
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
        .map(|(image_id, filename, error)| FailedEmbeddingItem {
            image_id,
            filename,
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
            let state = states
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
    let (total, folder_ids) = match (params.folder_id, params.image_id, requested_folder_ids.is_empty()) {
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
    let (n, folder_ids): (usize, Vec<i64>) = match (params.folder_id, requested_folder_ids.is_empty()) {
        (Some(id), _) => (
            db::clear_tagging_jobs(&conn, Some(id)).map_err(|e| e.to_string())?,
            vec![id],
        ),
        (None, false) => {
            let mut total = 0usize;
            for &folder_id in &requested_folder_ids {
                total += db::clear_tagging_jobs(&conn, Some(folder_id)).map_err(|e| e.to_string())?;
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
