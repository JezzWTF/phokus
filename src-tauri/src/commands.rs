use crate::db::{self, DbPool, Folder, FolderJobProgress, ImageRecord};
use crate::embedder;
use crate::indexer;
use crate::vector;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State};

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
pub struct RetryFailedEmbeddingsParams {
    pub folder_id: i64,
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

    let total = db::count_images(&conn, params.folder_id, search, media_kind, favorites_only)
        .map_err(|e| e.to_string())?;

    let images = db::get_images(
        &conn,
        params.folder_id,
        search,
        media_kind,
        favorites_only,
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
    let image_ids = vector::find_similar_image_ids(&conn, params.image_id, limit)
        .map_err(|e| e.to_string())?;
    db::get_images_by_ids(&conn, &image_ids).map_err(|e| e.to_string())
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
    let ids = vector::search_image_ids_by_embedding(&conn, &embedding, limit).map_err(|e| e.to_string())?;
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

#[derive(Serialize)]
pub struct TagCloudEntry {
    pub label: String,
    pub count: usize,
}

/// Clusters the library's image embeddings with k-means, then labels each cluster by
/// finding the closest word in the vocabulary.  The vocabulary is loaded from
/// `{app_data_dir}/vocabulary.txt` if present, otherwise from the bundled default.
/// Vocabulary embeddings are cached to disk — only recomputed when the vocabulary changes.
#[tauri::command]
pub async fn get_tag_cloud(
    app: AppHandle,
    db: State<'_, DbState>,
    folder_id: Option<i64>,
) -> Result<Vec<TagCloudEntry>, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;

    let image_embeddings = {
        let conn = db.get().map_err(|e| e.to_string())?;
        vector::get_all_image_embeddings(&conn, folder_id).map_err(|e| e.to_string())?
    };

    let n = image_embeddings.len();
    if n < 5 {
        return Ok(vec![]);
    }

    // Load vocabulary (custom file > bundled default)
    let vocab = embedder::load_vocabulary(&app_data_dir);

    // Embed vocabulary — disk-cached, only recomputes when vocabulary changes
    let vocab_refs: Vec<&str> = vocab.iter().map(|s| s.as_str()).collect();
    let vocab_embeddings = embedder::embed_vocab_cached(&vocab, &app_data_dir)
        .map_err(|e| e.to_string())?;

    // Choose k proportional to library size, capped at 30
    let k = (n / 20).clamp(5, 30);

    // Cluster image embeddings
    let (centroids, cluster_counts) = kmeans_cosine(&image_embeddings, k, 40);

    // Label each cluster with the nearest vocabulary word
    let mut entries: Vec<TagCloudEntry> = Vec::new();
    let mut used_labels = std::collections::HashSet::new();

    let mut order: Vec<usize> = (0..k).collect();
    order.sort_unstable_by(|&a, &b| cluster_counts[b].cmp(&cluster_counts[a]));

    for ci in order {
        let count = cluster_counts[ci];
        if count == 0 { continue; }

        let centroid = &centroids[ci];
        let label = vocab_refs
            .iter()
            .zip(vocab_embeddings.iter())
            .map(|(&word, emb)| {
                let sim: f32 = centroid.iter().zip(emb.iter()).map(|(a, b)| a * b).sum();
                (word, sim)
            })
            .max_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal))
            .map(|(word, _)| word.to_string())
            .unwrap_or_else(|| "other".to_string());

        if used_labels.insert(label.clone()) {
            entries.push(TagCloudEntry { label, count });
        }
    }

    entries.sort_unstable_by(|a, b| b.count.cmp(&a.count));
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
) -> (Vec<Vec<f32>>, Vec<usize>) {
    let n = points.len();
    let dim = points[0].len();

    // Deterministic k-means++ init: spread centroids as far apart as possible
    let mut centroids: Vec<Vec<f32>> = Vec::with_capacity(k);
    centroids.push(points[n / 2].clone());
    for _ in 1..k {
        let next = points
            .iter()
            .map(|p| {
                let best_sim = centroids.iter().map(|c| dot(p, c)).fold(f32::NEG_INFINITY, f32::max);
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
        if !changed { break; }

        // Update step: mean of assigned points, then normalize
        let mut sums = vec![vec![0.0f32; dim]; k];
        let mut counts = vec![0usize; k];
        for (p, &c) in points.iter().zip(assignments.iter()) {
            sums[c].iter_mut().zip(p.iter()).for_each(|(s, v)| *s += v);
            counts[c] += 1;
        }
        for (centroid, (sum, &count)) in centroids.iter_mut().zip(sums.iter_mut().zip(counts.iter())) {
            if count > 0 {
                sum.iter_mut().for_each(|v| *v /= count as f32);
                normalize(sum);
                *centroid = sum.clone();
            }
        }
    }

    let mut counts = vec![0usize; k];
    for &a in &assignments { counts[a] += 1; }

    (centroids, counts)
}

#[derive(Serialize)]
pub struct WorkerStates {
    pub thumbnail_paused: bool,
    pub metadata_paused: bool,
    pub embedding_paused: bool,
}

#[tauri::command]
pub async fn set_worker_paused(worker: String, paused: bool) -> Result<(), String> {
    indexer::set_worker_paused(&worker, paused);
    Ok(())
}

#[tauri::command]
pub async fn get_worker_states() -> Result<WorkerStates, String> {
    let states = indexer::get_worker_paused_states();
    Ok(WorkerStates {
        thumbnail_paused: states[0],
        metadata_paused: states[1],
        embedding_paused: states[2],
    })
}
