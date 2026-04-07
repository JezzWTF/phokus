use crate::captioner::{self, CaptionModelStatus, CaptionRuntimeProbe, CaptionVisionProbe};
use crate::db::{self, DbPool, Folder, FolderJobProgress, ImageRecord};
use crate::embedder;
use crate::indexer;
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

#[derive(Deserialize)]
pub struct GetImagesParams {
    pub folder_id: Option<i64>,
    pub search: Option<String>,
    pub media_kind: Option<String>,
    pub favorites_only: Option<bool>,
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
    pub limit: Option<usize>,
}

#[derive(Deserialize)]
pub struct DebugSimilarImagesParams {
    pub image_id: i64,
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
    pub limit: Option<usize>,
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
    let embedding_failed_only = params.embedding_failed_only.unwrap_or(false);

    let total = db::count_images(
        &conn,
        params.folder_id,
        search,
        media_kind,
        favorites_only,
        embedding_failed_only,
    )
    .map_err(|e| e.to_string())?;

    let images = db::get_images(
        &conn,
        params.folder_id,
        search,
        media_kind,
        favorites_only,
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
) -> Result<Vec<ImageRecord>, String> {
    let conn = db.get().map_err(|e| e.to_string())?;
    let limit = params.limit.unwrap_or(32);
    if !vector::has_image_vector(&conn, params.image_id).map_err(|e| e.to_string())? {
        db::repair_embedding_consistency(&conn).map_err(|e| e.to_string())?;
        return Ok(Vec::new());
    }
    let image_ids =
        vector::find_similar_image_ids(&conn, params.image_id, limit).map_err(|e| e.to_string())?;
    db::get_images_by_ids(&conn, &image_ids).map_err(|e| e.to_string())
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
        vector::find_similar_image_ids(&conn, params.image_id, limit).map_err(|e| e.to_string())?
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

    Ok(images)
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

#[derive(Serialize, Deserialize)]
pub struct TagCloudEntry {
    pub count: usize,
    pub representative_image_id: i64,
    pub thumbnail_path: Option<String>,
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
                return Ok(entries);
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
        });
    }

    // Persist to SQLite — ignore write errors (cache is best-effort)
    if let Ok(json) = serde_json::to_string(&entries) {
        let _ = db::set_tag_cloud_cache(&conn, &folder_scope, current_hash, &json);
    }

    Ok(entries)
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
}

#[tauri::command]
pub async fn set_worker_paused(worker: String, folder_id: i64, paused: bool) -> Result<(), String> {
    indexer::set_worker_paused(&worker, folder_id, paused);
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
                    });
            FolderWorkerStates {
                folder_id,
                thumbnail_paused: state.thumbnail,
                metadata_paused: state.metadata,
                embedding_paused: state.embedding,
                caption_paused: state.caption,
            }
        })
        .collect())
}
