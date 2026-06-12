use crate::captioner::{self, FlorenceCaptioner};
use crate::db::{self, DbPool, EmbeddingJob, FolderJobProgress, ImageRecord, IndexedMediaEntry};
use crate::embedder::{embedding_source_path, ClipImageEmbedder};
use crate::media::{probe_video_metadata, MediaTools};
use crate::storage::{detect_storage_profile, RuntimeAdaptiveProfile, StorageProfile};
use crate::tagger::{self, WdTagger};
use crate::thumbnail;
use crate::vector;
use anyhow::Result;
use rayon::prelude::*;
use serde::Serialize;
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use walkdir::WalkDir;

const IMAGE_EXTENSIONS: &[&str] = &[
    "jpg", "jpeg", "png", "gif", "bmp", "tiff", "tif", "webp", "avif", "heic", "heif",
];

const VIDEO_EXTENSIONS: &[&str] = &["mp4", "mov", "m4v", "webm"];

const JOB_PROGRESS_EMIT_INTERVAL: Duration = Duration::from_millis(750);
const CAPTION_BATCH_SIZE: usize = 1;

static LAST_JOB_PROGRESS_EMIT: OnceLock<Mutex<HashMap<i64, Instant>>> = OnceLock::new();
static ACTIVE_INDEXING_FOLDERS: OnceLock<Mutex<HashSet<i64>>> = OnceLock::new();

static PAUSED_WORKER_FOLDERS: OnceLock<Mutex<PausedWorkerFolders>> = OnceLock::new();

#[derive(Default)]
struct PausedWorkerFolders {
    thumbnail: HashSet<i64>,
    metadata: HashSet<i64>,
    embedding: HashSet<i64>,
    caption: HashSet<i64>,
    tagging: HashSet<i64>,
}

#[derive(Clone, Copy)]
pub struct FolderWorkerPausedState {
    pub thumbnail: bool,
    pub metadata: bool,
    pub embedding: bool,
    pub caption: bool,
    pub tagging: bool,
}

pub fn set_worker_paused(worker: &str, folder_id: i64, paused: bool) {
    if let Ok(mut paused_folders) = PAUSED_WORKER_FOLDERS
        .get_or_init(|| Mutex::new(PausedWorkerFolders::default()))
        .lock()
    {
        let folder_set = match worker {
            "thumbnail" => Some(&mut paused_folders.thumbnail),
            "metadata" => Some(&mut paused_folders.metadata),
            "embedding" => Some(&mut paused_folders.embedding),
            "caption" => Some(&mut paused_folders.caption),
            "tagging" => Some(&mut paused_folders.tagging),
            _ => None,
        };

        if let Some(folder_set) = folder_set {
            if paused {
                folder_set.insert(folder_id);
            } else {
                folder_set.remove(&folder_id);
            }
        }
    }
}

pub fn get_worker_paused_states(folder_ids: &[i64]) -> HashMap<i64, FolderWorkerPausedState> {
    let Ok(paused_folders) = PAUSED_WORKER_FOLDERS
        .get_or_init(|| Mutex::new(PausedWorkerFolders::default()))
        .lock()
    else {
        return HashMap::new();
    };

    folder_ids
        .iter()
        .copied()
        .map(|folder_id| {
            (
                folder_id,
                FolderWorkerPausedState {
                    thumbnail: paused_folders.thumbnail.contains(&folder_id),
                    metadata: paused_folders.metadata.contains(&folder_id),
                    embedding: paused_folders.embedding.contains(&folder_id),
                    caption: paused_folders.caption.contains(&folder_id),
                    tagging: paused_folders.tagging.contains(&folder_id),
                },
            )
        })
        .collect()
}

fn paused_folder_ids(worker: &str) -> HashSet<i64> {
    let Ok(paused_folders) = PAUSED_WORKER_FOLDERS
        .get_or_init(|| Mutex::new(PausedWorkerFolders::default()))
        .lock()
    else {
        return HashSet::new();
    };

    match worker {
        "thumbnail" => paused_folders.thumbnail.clone(),
        "metadata" => paused_folders.metadata.clone(),
        "embedding" => paused_folders.embedding.clone(),
        "caption" => paused_folders.caption.clone(),
        "tagging" => paused_folders.tagging.clone(),
        _ => HashSet::new(),
    }
}
static FOLDER_STORAGE_PROFILES: OnceLock<Mutex<HashMap<i64, RuntimeAdaptiveProfile>>> =
    OnceLock::new();
static DB_WRITE_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
const EMBEDDING_BATCH_SIZE: usize = 8;

/// Background workers form a strict priority pipeline: a worker only claims
/// jobs when no higher-priority claimable work exists, so stages drain one
/// at a time (thumbnails → metadata → embeddings → tagging) instead of all
/// workers contending for CPU, disk, and the DB writer at once.
#[derive(Clone, Copy, PartialEq, PartialOrd)]
enum WorkerTier {
    Thumbnail = 0,
    Metadata = 1,
    Embedding = 2,
    Tagging = 3,
}

/// True if any tier above `own_tier` still has claimable work. Each check
/// uses the same exclusion set the corresponding claim would (that worker's
/// paused folders plus actively-indexing folders), so paused or mid-scan
/// work never gates lower tiers.
fn higher_priority_work_pending(pool: &DbPool, own_tier: WorkerTier) -> Result<bool> {
    let conn = pool.get()?;
    let active_folders = active_indexing_folders();

    if own_tier > WorkerTier::Thumbnail {
        let mut excluded = paused_folder_ids("thumbnail");
        excluded.extend(active_folders.iter().copied());
        if db::has_claimable_thumbnail_jobs(&conn, &excluded)? {
            return Ok(true);
        }
    }
    if own_tier > WorkerTier::Metadata {
        let mut excluded = paused_folder_ids("metadata");
        excluded.extend(active_folders.iter().copied());
        if db::has_claimable_metadata_jobs(&conn, &excluded)? {
            return Ok(true);
        }
    }
    if own_tier > WorkerTier::Embedding {
        let mut excluded = paused_folder_ids("embedding");
        excluded.extend(active_folders.iter().copied());
        if db::has_claimable_embedding_jobs(&conn, &excluded)? {
            return Ok(true);
        }
    }
    Ok(false)
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

        // If the folder path no longer exists on disk, record the error and
        // emit done. Images are intentionally kept in the DB so the user can
        // choose to relocate the folder or remove it explicitly — they should
        // not be silently destroyed.
        if !folder_path.is_dir() {
            let error_msg = format!("Folder not found: {}", folder_path.display());
            eprintln!("Indexing error for folder {}: {}", folder_id, error_msg);
            if let Ok(conn) = pool.get() {
                let _ = db::set_folder_scan_error(&conn, folder_id, &error_msg);
            }
            emit_progress(
                &app,
                &IndexProgress {
                    folder_id,
                    total: 0,
                    indexed: 0,
                    current_file: String::new(),
                    done: true,
                },
            );
            set_folder_indexing_state(folder_id, false);
            return;
        }

        let storage_profile = detect_storage_profile(&folder_path);
        set_folder_storage_profile(folder_id, RuntimeAdaptiveProfile::new(storage_profile));
        if let Err(error) = do_index(app.clone(), &pool, folder_id, folder_path) {
            eprintln!("Indexing error for folder {}: {}", folder_id, error);
            if let Ok(conn) = pool.get() {
                let _ = db::set_folder_scan_error(&conn, folder_id, &error.to_string());
            }
            // Always emit done so the frontend reloads and recovers from partial state.
            emit_progress(
                &app,
                &IndexProgress {
                    folder_id,
                    total: 0,
                    indexed: 0,
                    current_file: String::new(),
                    done: true,
                },
            );
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
        // Only back off when the queue is empty (or errored); while jobs are
        // pending, claim the next batch immediately.
        match process_thumbnail_batch(&app, &pool, &media_tools, &cache_dir) {
            Ok(true) => {}
            Ok(false) => std::thread::sleep(std::time::Duration::from_millis(250)),
            Err(error) => {
                eprintln!("Thumbnail worker error: {}", error);
                std::thread::sleep(std::time::Duration::from_millis(250));
            }
        }
    });
}

pub fn start_metadata_worker(app: AppHandle, pool: DbPool, media_tools: MediaTools) {
    std::thread::spawn(move || loop {
        // Only back off when the queue is empty (or errored); while jobs are
        // pending, claim the next batch immediately.
        match process_metadata_batch(&app, &pool, &media_tools) {
            Ok(true) => {}
            Ok(false) => std::thread::sleep(std::time::Duration::from_millis(250)),
            Err(error) => {
                eprintln!("Metadata worker error: {}", error);
                std::thread::sleep(std::time::Duration::from_millis(250));
            }
        }
    });
}

pub fn start_embedding_worker(app: AppHandle, pool: DbPool) {
    std::thread::spawn(move || {
        let mut embedder: Option<ClipImageEmbedder> = None;
        println!("Embedding worker started.");
        loop {
            // Only back off when the queue is empty (or errored); while jobs
            // are pending, claim the next batch immediately.
            match process_embedding_batch(&app, &pool, &mut embedder) {
                Ok(true) => {}
                Ok(false) => std::thread::sleep(std::time::Duration::from_millis(500)),
                Err(error) => {
                    eprintln!("Embedding worker error: {}", error);
                    std::thread::sleep(std::time::Duration::from_millis(500));
                }
            }
        }
    });
}

pub fn start_caption_worker(app: AppHandle, pool: DbPool, app_data_dir: PathBuf) {
    std::thread::spawn(move || {
        let mut captioner: Option<FlorenceCaptioner> = None;
        println!("Caption worker started.");
        loop {
            // If the acceleration setting changed, drop the cached session so
            // the next batch picks it up with the new execution provider.
            if captioner::CAPTION_SESSION_DIRTY.swap(false, std::sync::atomic::Ordering::Relaxed) {
                println!("Caption worker: acceleration setting changed — resetting session.");
                captioner = None;
            }
            if let Err(error) = process_caption_batch(&app, &pool, &app_data_dir, &mut captioner) {
                eprintln!("Caption worker error: {}", error);
                captioner = None;
            }
            std::thread::sleep(std::time::Duration::from_millis(750));
        }
    });
}

pub fn start_tagging_worker(app: AppHandle, pool: DbPool, app_data_dir: PathBuf) {
    std::thread::spawn(move || {
        let mut tagger_instance: Option<WdTagger> = None;
        println!("Tagging worker started.");
        loop {
            // If the acceleration setting changed, drop the cached session so
            // the next batch picks it up with the new execution provider.
            if tagger::TAGGER_SESSION_DIRTY.swap(false, std::sync::atomic::Ordering::Relaxed) {
                println!("Tagging worker: acceleration setting changed — resetting session.");
                tagger_instance = None;
            }
            // Only back off when the queue is empty (or errored); while jobs
            // are pending, claim the next batch immediately.
            match process_tagging_batch(&app, &pool, &app_data_dir, &mut tagger_instance) {
                Ok(true) => {}
                Ok(false) => std::thread::sleep(std::time::Duration::from_millis(750)),
                Err(error) => {
                    eprintln!("Tagging worker error: {}", error);
                    tagger_instance = None;
                    std::thread::sleep(std::time::Duration::from_millis(750));
                }
            }
        }
    });
}

fn do_index(app: AppHandle, pool: &DbPool, folder_id: i64, folder_path: PathBuf) -> Result<()> {
    let existing_entries = {
        let conn = pool.get()?;
        db::get_folder_media_index(&conn, folder_id)?
    };
    let existing_by_path = existing_entries
        .into_iter()
        .map(|entry| (entry.path.clone(), entry))
        .collect::<HashMap<_, _>>();

    // Collect traversal errors separately. An unreadable subdirectory means we
    // cannot distinguish absent files from inaccessible ones; tracking errors
    // lets us skip the deletion step for paths under affected subtrees.
    let mut unreadable_prefixes: Vec<String> = Vec::new();
    let media_paths: Vec<PathBuf> = WalkDir::new(&folder_path)
        .follow_links(true)
        .into_iter()
        .filter_map(|entry| match entry {
            Ok(e) if e.file_type().is_file() && is_supported_media(e.path()) => {
                Some(e.path().to_path_buf())
            }
            Ok(_) => None,
            Err(err) => {
                // Record the inaccessible path so we can protect its descendants
                // from the missing-file deletion pass.
                if let Some(path) = err.path() {
                    unreadable_prefixes.push(path.to_string_lossy().into_owned());
                }
                eprintln!(
                    "WalkDir error while scanning folder {}: {}",
                    folder_path.display(),
                    err
                );
                None
            }
        })
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

    let mut offset = 0usize;
    while offset < media_paths.len() {
        let storage_profile = folder_storage_profile(folder_id);
        let end = (offset + storage_profile.index_batch_size()).min(media_paths.len());
        let path_chunk = &media_paths[offset..end];
        let batch_start = Instant::now();
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
            emit_folder_job_progress(&app, &pool, &[folder_id], false);
        }

        processed += path_chunk.len();
        observe_folder_scan_batch(folder_id, path_chunk.len(), batch_start.elapsed());
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
        offset = end;
    }

    let missing_ids = existing_by_path
        .values()
        .filter(|entry| !seen_paths.contains(&entry.path))
        .filter(|entry| {
            // If this path lives under a subtree that WalkDir couldn't read,
            // we don't know whether the file is gone or just temporarily
            // inaccessible — keep the record to avoid false deletions.
            // Use Path::starts_with (component-aware) so a sibling directory
            // whose name shares a prefix is not incorrectly protected.
            let entry_path = std::path::Path::new(&entry.path);
            unreadable_prefixes
                .iter()
                .all(|prefix| !entry_path.starts_with(prefix))
        })
        .map(|entry| entry.id)
        .collect::<Vec<_>>();

    {
        let conn = pool.get()?;
        if !missing_ids.is_empty() {
            db::delete_images_by_ids(&conn, &missing_ids)?;
        }
        let _ = db::backfill_embedding_jobs(&conn)?;
        db::update_folder_count(&conn, folder_id)?;
        let _ = db::clear_folder_scan_error(&conn, folder_id);
        // Invalidate duplicate scan cache — any reindex can change file contents
        // or the set of files, making cached duplicate groups stale.
        let folder_scope = format!("folder:{}", folder_id);
        let _ = db::clear_duplicate_scan_cache(&conn, &folder_scope);
        let _ = db::clear_duplicate_scan_cache(&conn, "all");
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
    emit_folder_job_progress(&app, &pool, &[folder_id], true);
    Ok(())
}

/// Extract the capture date from EXIF metadata, returned as an ISO 8601 string
/// (`"YYYY-MM-DDTHH:MM:SS"`). Tries `DateTimeOriginal` first, then
/// `DateTimeDigitized`, then `DateTime`. Returns `None` for video files or
/// images with no readable EXIF date.
fn extract_exif_date(path: &Path) -> Option<String> {
    use exif::{In, Tag, Value};
    use std::io::BufReader;

    let file = std::fs::File::open(path).ok()?;
    let mut reader = BufReader::new(file);
    let exif = exif::Reader::new().read_from_container(&mut reader).ok()?;

    for tag in [Tag::DateTimeOriginal, Tag::DateTimeDigitized, Tag::DateTime] {
        if let Some(field) = exif.get_field(tag, In::PRIMARY) {
            if let Value::Ascii(ref parts) = field.value {
                if let Some(bytes) = parts.first() {
                    // EXIF datetime format: "YYYY:MM:DD HH:MM:SS" (19 bytes)
                    if bytes.len() >= 19 {
                        let s = String::from_utf8_lossy(bytes);
                        // Reject all-zero sentinel dates written by some cameras
                        // for uninitialised EXIF fields ("0000:00:00 00:00:00").
                        let year: u32 = s[0..4].parse().unwrap_or(0);
                        if year == 0 {
                            continue;
                        }
                        let iso = format!(
                            "{}-{}-{}T{}:{}:{}",
                            &s[0..4],
                            &s[5..7],
                            &s[8..10],
                            &s[11..13],
                            &s[14..16],
                            &s[17..19]
                        );
                        return Some(iso);
                    }
                }
            }
        }
    }
    None
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
        taken_at: extract_exif_date(path),
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
        generated_caption: None,
        caption_model: None,
        caption_updated_at: None,
        caption_error: None,
        ai_rating: None,
        ai_tagger_model: None,
        ai_tagged_at: None,
        ai_tagger_error: None,
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

/// Returns `Ok(true)` if a batch was claimed and processed, `Ok(false)` if
/// the queue was empty.
fn process_thumbnail_batch(
    app: &AppHandle,
    pool: &DbPool,
    media_tools: &MediaTools,
    cache_dir: &Path,
) -> Result<bool> {
    let jobs = {
        with_db_write_lock(|| {
            let mut conn = pool.get()?;
            let active_folders = active_indexing_folders();
            let paused_folders = paused_folder_ids("thumbnail");
            let worker_batch_size = max_worker_batch_size(&active_folders);
            let worker_fetch_size = max_worker_fetch_size(&active_folders);
            db::claim_thumbnail_jobs(
                &mut conn,
                &active_folders,
                &paused_folders,
                worker_fetch_size,
                worker_batch_size,
            )
        })?
    };

    if jobs.is_empty() {
        return Ok(false);
    }

    println!("Thumbnail batch claimed: {} items", jobs.len());

    let (image_jobs, video_jobs): (Vec<_>, Vec<_>) =
        jobs.into_iter().partition(|job| job.media_kind == "image");

    // Images: parallel decode, committed as one batch.
    if !image_jobs.is_empty() {
        let results = image_jobs
            .par_iter()
            .map(|job| {
                (
                    job.image_id,
                    thumbnail::generate_image_thumbnail(Path::new(&job.path), cache_dir).map(Some),
                )
            })
            .collect::<Vec<_>>();
        persist_thumbnail_results(app, pool, results)?;
    }

    // Videos: sequential, off the rayon pool — each ffmpeg call blocks its
    // thread, and a video-heavy batch on the shared pool would starve image
    // decoding across all workers. Committed per item so progress keeps
    // moving through slow stretches.
    for job in &video_jobs {
        let result =
            thumbnail::generate_video_thumbnail(media_tools, Path::new(&job.path), cache_dir)
                .map(Some);
        persist_thumbnail_results(app, pool, vec![(job.image_id, result)])?;
    }

    Ok(true)
}

fn persist_thumbnail_results(
    app: &AppHandle,
    pool: &DbPool,
    results: Vec<(i64, anyhow::Result<Option<thumbnail::GeneratedThumbnail>>)>,
) -> Result<()> {
    let updated_images = {
        with_db_write_lock(|| {
            let mut conn = pool.get()?;
            let tx = conn.transaction()?;
            let mut updated_images = Vec::new();

            for (image_id, thumbnail_result) in results {
                let generated = match thumbnail_result {
                    Ok(path) => path,
                    Err(error) => {
                        db::mark_thumbnail_failed(&tx, image_id, &error.to_string())?;
                        continue;
                    }
                };

                let thumbnail_path = generated
                    .as_ref()
                    .map(|thumb| thumb.path.to_string_lossy().to_string());
                let width = generated.as_ref().and_then(|thumb| thumb.width);
                let height = generated.as_ref().and_then(|thumb| thumb.height);

                updated_images.push(db::mark_thumbnail_ready(
                    &tx,
                    image_id,
                    thumbnail_path.as_deref(),
                    width,
                    height,
                )?);
            }

            tx.commit()?;
            Ok(updated_images)
        })?
    };

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
        emit_folder_job_progress(app, pool, &folder_ids.into_iter().collect::<Vec<_>>(), true);
    }

    Ok(())
}

/// Returns `Ok(true)` if a batch was claimed and processed, `Ok(false)` if
/// the queue was empty.
fn process_metadata_batch(
    app: &AppHandle,
    pool: &DbPool,
    media_tools: &MediaTools,
) -> Result<bool> {
    if higher_priority_work_pending(pool, WorkerTier::Metadata)? {
        return Ok(false);
    }

    let jobs = {
        with_db_write_lock(|| {
            let mut conn = pool.get()?;
            let active_folders = active_indexing_folders();
            let paused_folders = paused_folder_ids("metadata");
            let worker_batch_size = max_worker_batch_size(&active_folders);
            let worker_fetch_size = max_worker_fetch_size(&active_folders);
            db::claim_metadata_jobs(
                &mut conn,
                &active_folders,
                &paused_folders,
                worker_fetch_size,
                worker_batch_size,
            )
        })?
    };

    if jobs.is_empty() {
        return Ok(false);
    }

    // Probes run sequentially (each ffprobe blocks on its process); results
    // are committed per item so progress keeps moving through slow stretches.
    for job in jobs {
        let metadata_result = probe_video_metadata(media_tools, Path::new(&job.path));

        let updated_image = with_db_write_lock(|| {
            let mut conn = pool.get()?;
            let tx = conn.transaction()?;
            let updated = match metadata_result {
                Ok(metadata) => Some(db::mark_metadata_ready(
                    &tx,
                    job.image_id,
                    metadata.duration_ms,
                    metadata.width,
                    metadata.height,
                    metadata.video_codec.as_deref(),
                    metadata.audio_codec.as_deref(),
                )?),
                Err(error) => {
                    db::mark_metadata_failed(&tx, job.image_id, &error.to_string())?;
                    None
                }
            };
            tx.commit()?;
            Ok(updated)
        })?;

        if let Some(image) = updated_image {
            let folder_id = image.folder_id;
            emit_media_updates(
                app,
                &MediaUpdateBatch {
                    images: vec![image],
                },
            );
            emit_folder_job_progress(app, pool, &[folder_id], false);
        }
    }

    Ok(true)
}

/// Returns `Ok(true)` if a batch was claimed and processed, `Ok(false)` if
/// the queue was empty.
fn process_embedding_batch(
    app: &AppHandle,
    pool: &DbPool,
    embedder: &mut Option<ClipImageEmbedder>,
) -> Result<bool> {
    if higher_priority_work_pending(pool, WorkerTier::Embedding)? {
        return Ok(false);
    }

    let batch_started_at = Instant::now();
    let claim_started_at = Instant::now();
    // Exclude folders that are actively indexing (matching the thumbnail and
    // metadata workers): embedding mid-scan competes with the scanner for
    // CPU, disk, and the DB writer, and video jobs would fail-fast anyway
    // because their thumbnails are deferred until indexing completes.
    let mut excluded_folders = paused_folder_ids("embedding");
    excluded_folders.extend(active_indexing_folders());
    let jobs = with_db_write_lock(|| {
        let mut conn = pool.get()?;
        db::claim_embedding_jobs(&mut conn, &excluded_folders, EMBEDDING_BATCH_SIZE)
    })?;
    let claim_elapsed = claim_started_at.elapsed();

    if jobs.is_empty() {
        return Ok(false);
    }

    if embedder.is_none() {
        *embedder = Some(ClipImageEmbedder::new()?);
    }

    println!("Embedding batch claimed: {} items", jobs.len());
    let folder_ids = jobs.iter().map(|job| job.folder_id).collect::<HashSet<_>>();
    emit_folder_job_progress(
        app,
        pool,
        &folder_ids.iter().copied().collect::<Vec<_>>(),
        false,
    );
    let embedder = embedder.as_ref().expect("embedder should be initialized");

    let infer_started_at = Instant::now();
    // Resolve the source path for each job. Videos without a thumbnail produce an Err
    // here — those jobs are marked failed immediately without going to the embedder.
    let source_results: Vec<Result<PathBuf>> = jobs
        .iter()
        .map(|job| embedding_source_path(&job.path, job.thumbnail_path.as_deref(), &job.media_kind))
        .collect();

    // Separate jobs with a valid source from those that fail early (e.g. video with no thumbnail).
    let mut embeddable_indices: Vec<usize> = Vec::new();
    let mut embeddable_paths: Vec<PathBuf> = Vec::new();
    // image_id -> early error message for jobs that cannot be embedded yet
    let mut pre_failed: HashMap<i64, String> = HashMap::new();

    for (i, (job, result)) in jobs.iter().zip(source_results.into_iter()).enumerate() {
        match result {
            Ok(path) => {
                embeddable_indices.push(i);
                embeddable_paths.push(path);
            }
            Err(e) => {
                pre_failed.insert(job.image_id, e.to_string());
            }
        }
    }

    // Run CLIP only on the jobs that have a valid source image.
    // image_id -> embedding result
    let mut embed_results: HashMap<i64, Result<Vec<f32>>> = HashMap::new();

    if !embeddable_indices.is_empty() {
        let embeddable_jobs: Vec<&EmbeddingJob> =
            embeddable_indices.iter().map(|&i| &jobs[i]).collect();

        match embedder.embed_images(&embeddable_paths) {
            Ok(embeddings) => {
                for (job, embedding) in embeddable_jobs.iter().zip(embeddings.into_iter()) {
                    embed_results.insert(job.image_id, Ok(embedding));
                }
            }
            Err(batch_error) => {
                eprintln!(
                    "Embedding batch fallback to per-image mode: {}",
                    batch_error
                );
                for (job, source_path) in embeddable_jobs
                    .into_iter()
                    .zip(embeddable_paths.into_iter())
                {
                    embed_results.insert(job.image_id, embedder.embed_image(&source_path));
                }
            }
        }
    }
    let infer_elapsed = infer_started_at.elapsed();

    let write_started_at = Instant::now();
    let updated_images = with_db_write_lock(|| {
        let mut conn = pool.get()?;
        let tx = conn.transaction()?;
        let mut updated_images = Vec::new();

        for job in &jobs {
            let embedding_result: Result<Vec<f32>> =
                if let Some(err) = pre_failed.remove(&job.image_id) {
                    Err(anyhow::anyhow!("{}", err))
                } else if let Some(r) = embed_results.remove(&job.image_id) {
                    r
                } else {
                    Err(anyhow::anyhow!("no result for image {}", job.image_id))
                };

            match embedding_result {
                Ok(embedding) => {
                    vector::upsert_embedding(&tx, job.image_id, &embedding)?;
                    db::mark_embedding_ready(&tx, job.image_id, vector::CLIP_MODEL_NAME)?;
                }
                Err(error) => {
                    db::mark_embedding_failed(&tx, job.image_id, &error.to_string())?;
                }
            }

            updated_images.push(db::get_image_by_id(&tx, job.image_id)?);
        }

        tx.commit()?;
        Ok(updated_images)
    })?;

    if !updated_images.is_empty() {
        println!("Embedding batch completed: {} items", updated_images.len());
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
        emit_folder_job_progress(app, pool, &folder_ids.into_iter().collect::<Vec<_>>(), true);
    }

    let write_elapsed = write_started_at.elapsed();
    let batch_elapsed = batch_started_at.elapsed();
    println!(
        "Embedding batch timing: claimed {} in {:?}, infer {:?}, write {:?}, total {:?}",
        EMBEDDING_BATCH_SIZE, claim_elapsed, infer_elapsed, write_elapsed, batch_elapsed
    );

    Ok(true)
}

fn process_caption_batch(
    app: &AppHandle,
    pool: &DbPool,
    app_data_dir: &Path,
    captioner: &mut Option<FlorenceCaptioner>,
) -> Result<()> {
    if !captioner::caption_model_status(app_data_dir).ready {
        return Ok(());
    }

    let paused_folders = paused_folder_ids("caption");
    let jobs = with_db_write_lock(|| {
        let mut conn = pool.get()?;
        db::claim_caption_jobs(&mut conn, &paused_folders, CAPTION_BATCH_SIZE)
    })?;

    if jobs.is_empty() {
        return Ok(());
    }

    if captioner.is_none() {
        match FlorenceCaptioner::new(app_data_dir) {
            Ok(model) => *captioner = Some(model),
            Err(error) => {
                with_db_write_lock(|| {
                    let conn = pool.get()?;
                    db::requeue_caption_jobs(
                        &conn,
                        &jobs.iter().map(|job| job.image_id).collect::<Vec<_>>(),
                    )
                })?;
                return Err(error);
            }
        }
    }

    let folder_ids = jobs.iter().map(|job| job.folder_id).collect::<HashSet<_>>();
    emit_folder_job_progress(
        app,
        pool,
        &folder_ids.iter().copied().collect::<Vec<_>>(),
        false,
    );

    let captioner = captioner
        .as_mut()
        .expect("captioner should be initialized before caption batch processing");
    let caption_results = jobs
        .iter()
        .map(|job| (job.clone(), captioner.generate(Path::new(&job.path))))
        .collect::<Vec<_>>();

    let updated_images = with_db_write_lock(|| {
        let mut conn = pool.get()?;
        let tx = conn.transaction()?;
        let mut updated_images = Vec::with_capacity(caption_results.len());

        for (job, caption_result) in &caption_results {
            if db::is_caption_job_cancelled(&tx, job.image_id)? {
                tx.execute(
                    "DELETE FROM caption_jobs WHERE image_id = ?1",
                    [job.image_id],
                )?;
                continue;
            }
            match caption_result {
                Ok(caption) => {
                    updated_images.push(db::update_generated_caption(
                        &tx,
                        job.image_id,
                        caption,
                        captioner::FLORENCE_CAPTION_MODEL_NAME,
                    )?);
                }
                Err(error) => {
                    db::mark_caption_failed(&tx, job.image_id, &error.to_string())?;
                    updated_images.push(db::get_image_by_id(&tx, job.image_id)?);
                }
            }
        }

        tx.commit()?;
        Ok(updated_images)
    })?;

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
        emit_folder_job_progress(app, pool, &folder_ids.into_iter().collect::<Vec<_>>(), true);
    }

    Ok(())
}

/// Returns `Ok(true)` if a batch was claimed and processed, `Ok(false)` if
/// the queue was empty or the model is not ready.
fn process_tagging_batch(
    app: &AppHandle,
    pool: &DbPool,
    app_data_dir: &Path,
    tagger_instance: &mut Option<WdTagger>,
) -> Result<bool> {
    if !tagger::tagger_model_status(app_data_dir).ready {
        return Ok(false);
    }

    if higher_priority_work_pending(pool, WorkerTier::Tagging)? {
        return Ok(false);
    }

    // Exclude actively-indexing folders for the same reason as the other
    // workers: don't compete with a running scan.
    let mut excluded_folders = paused_folder_ids("tagging");
    excluded_folders.extend(active_indexing_folders());
    let batch_size = crate::tagger::tagger_batch_size(app_data_dir);
    let jobs = with_db_write_lock(|| {
        let mut conn = pool.get()?;
        db::claim_tagging_jobs(&mut conn, &excluded_folders, batch_size)
    })?;

    if jobs.is_empty() {
        return Ok(false);
    }

    if tagger_instance.is_none() {
        match WdTagger::new(app_data_dir) {
            Ok(model) => *tagger_instance = Some(model),
            Err(error) => {
                with_db_write_lock(|| {
                    let conn = pool.get()?;
                    db::requeue_tagging_jobs(
                        &conn,
                        &jobs.iter().map(|job| job.image_id).collect::<Vec<_>>(),
                    )
                })?;
                return Err(error);
            }
        }
    }

    let folder_ids = jobs.iter().map(|job| job.folder_id).collect::<HashSet<_>>();
    emit_folder_job_progress(
        app,
        pool,
        &folder_ids.iter().copied().collect::<Vec<_>>(),
        false,
    );

    let tagger_ref = tagger_instance
        .as_mut()
        .expect("tagger should be initialized before tagging batch processing");

    let tag_results = jobs
        .iter()
        .map(|job| {
            (
                job.clone(),
                tagger_ref.run(Path::new(&job.path), tagger::DEFAULT_MAX_TAGS),
            )
        })
        .collect::<Vec<_>>();

    let updated_images = with_db_write_lock(|| {
        let mut conn = pool.get()?;
        let tx = conn.transaction()?;
        let mut updated_images = Vec::with_capacity(tag_results.len());

        for (job, tag_result) in &tag_results {
            // If the job is no longer in 'processing' state it was either
            // cancelled or reset to 'pending' (pause) while inference was running.
            // Discard the result in both cases — for cancelled rows also delete
            // the row; for paused rows leave it so the job is retried later.
            if !db::is_tagging_job_processing(&tx, job.image_id)? {
                tx.execute(
                    "DELETE FROM tagging_jobs WHERE image_id = ?1 AND status = 'cancelled'",
                    [job.image_id],
                )?;
                continue;
            }
            match tag_result {
                Ok(output) => {
                    let tag_pairs: Vec<(String, f64)> = output
                        .tags
                        .iter()
                        .map(|t| (t.tag.clone(), t.confidence as f64))
                        .collect();
                    db::update_ai_tags(
                        &tx,
                        job.image_id,
                        &tag_pairs,
                        &output.rating,
                        tagger::WD_TAGGER_MODEL_NAME,
                    )?;
                }
                Err(error) => {
                    db::mark_tagging_failed(&tx, job.image_id, &error.to_string())?;
                }
            }
            updated_images.push(db::get_image_by_id(&tx, job.image_id)?);
        }

        tx.commit()?;
        Ok(updated_images)
    })
    .or_else(|db_err| {
        // The DB write failed.  Try to requeue the claimed jobs so they aren't
        // left stuck in 'processing' until the next app restart.
        let image_ids: Vec<i64> = jobs.iter().map(|job| job.image_id).collect();
        let _ = with_db_write_lock(|| {
            let conn = pool.get()?;
            db::requeue_tagging_jobs(&conn, &image_ids)
        });
        Err(db_err)
    })?;

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
        emit_folder_job_progress(app, pool, &folder_ids.into_iter().collect::<Vec<_>>(), true);
    }

    Ok(true)
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

fn set_folder_storage_profile(folder_id: i64, profile: RuntimeAdaptiveProfile) {
    if let Ok(mut profiles) = FOLDER_STORAGE_PROFILES
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
    {
        profiles.insert(folder_id, profile);
    }
}

fn folder_storage_profile(folder_id: i64) -> StorageProfile {
    FOLDER_STORAGE_PROFILES
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .ok()
        .and_then(|profiles| profiles.get(&folder_id).copied())
        .map(|profile| profile.profile())
        .unwrap_or(StorageProfile::Balanced)
}

fn observe_folder_scan_batch(folder_id: i64, item_count: usize, elapsed: Duration) {
    if let Ok(mut profiles) = FOLDER_STORAGE_PROFILES
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
    {
        if let Some(profile) = profiles.get_mut(&folder_id) {
            profile.observe_scan_batch(item_count, elapsed);
        }
    }
}

fn max_worker_batch_size(active_folders: &HashSet<i64>) -> usize {
    active_folders
        .iter()
        .map(|folder_id| folder_storage_profile(*folder_id).worker_batch_size())
        .min()
        .unwrap_or(StorageProfile::Balanced.worker_batch_size())
}

fn max_worker_fetch_size(active_folders: &HashSet<i64>) -> usize {
    active_folders
        .iter()
        .map(|folder_id| folder_storage_profile(*folder_id).worker_fetch_size())
        .min()
        .unwrap_or(StorageProfile::Balanced.worker_fetch_size())
}

fn with_db_write_lock<T>(operation: impl FnOnce() -> Result<T>) -> Result<T> {
    let lock = DB_WRITE_LOCK.get_or_init(|| Mutex::new(()));
    let _guard = lock.lock().unwrap();
    operation()
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

pub fn emit_folder_job_progress(app: &AppHandle, pool: &DbPool, folder_ids: &[i64], force: bool) {
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
        let should_emit = force
            || tracker
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

// ── Filesystem watcher ────────────────────────────────────────────────────────

/// How long to wait after the last event for a path before processing it.
/// Absorbs bursts of OS events that accompany a single logical file write.
const WATCHER_DEBOUNCE: Duration = Duration::from_millis(500);

struct WatcherInner {
    watcher: Mutex<RecommendedWatcher>,
    /// Maps each watched folder root → its folder_id in the DB.
    folder_map: Arc<Mutex<HashMap<PathBuf, i64>>>,
}

/// Shared handle that lets command handlers register and deregister watched
/// directories without touching the debounce thread directly.
#[derive(Clone)]
pub struct WatcherHandle {
    inner: Arc<WatcherInner>,
}

impl WatcherHandle {
    pub fn add_folder(&self, path: PathBuf, folder_id: i64) {
        {
            let mut w = self.inner.watcher.lock().unwrap();
            if path.is_dir() {
                if let Err(e) = w.watch(&path, RecursiveMode::Recursive) {
                    eprintln!("Watcher: failed to watch {:?}: {}", path, e);
                }
            }
        }
        self.inner.folder_map.lock().unwrap().insert(path, folder_id);
    }

    pub fn remove_folder(&self, path: &Path) {
        {
            let mut w = self.inner.watcher.lock().unwrap();
            let _ = w.unwatch(path);
        }
        self.inner.folder_map.lock().unwrap().remove(path);
    }

    pub fn update_folder(&self, old_path: &Path, new_path: PathBuf, folder_id: i64) {
        {
            let mut w = self.inner.watcher.lock().unwrap();
            let _ = w.unwatch(old_path);
            if new_path.is_dir() {
                if let Err(e) = w.watch(&new_path, RecursiveMode::Recursive) {
                    eprintln!("Watcher: failed to watch {:?}: {}", new_path, e);
                }
            }
        }
        let mut map = self.inner.folder_map.lock().unwrap();
        map.remove(old_path);
        map.insert(new_path, folder_id);
    }
}

/// Start the filesystem watcher. Watches all folders currently in the DB and
/// returns a handle that command handlers can use to add/remove watched paths.
///
/// The debounce loop uses adaptive blocking:
/// - `recv()` when no events are pending — zero CPU
/// - `recv_timeout(earliest_deadline)` when events are pending — wakes exactly
///   when the soonest debounce window expires, no busy-polling
pub fn start_watcher(app: AppHandle, pool: DbPool, thumb_dir: PathBuf) -> WatcherHandle {
    let (tx, rx) = std::sync::mpsc::channel::<notify::Result<notify::Event>>();

    let raw_watcher = notify::recommended_watcher(move |result| {
        let _ = tx.send(result);
    })
    .expect("Failed to create filesystem watcher");

    // Seed the folder map from the DB so existing folders are watched on startup.
    let folder_map: Arc<Mutex<HashMap<PathBuf, i64>>> = Arc::new(Mutex::new(HashMap::new()));
    {
        let conn = pool.get().expect("Watcher: failed to get DB connection for init");
        let folders = db::get_folders(&conn).unwrap_or_default();
        let mut map = folder_map.lock().unwrap();
        for f in folders {
            map.insert(PathBuf::from(f.path), f.id);
        }
    }

    // Register each known folder with the OS watcher.
    let raw_watcher = {
        let mut w = raw_watcher;
        let map = folder_map.lock().unwrap();
        for path in map.keys() {
            if path.is_dir() {
                if let Err(e) = w.watch(path, RecursiveMode::Recursive) {
                    eprintln!("Watcher: failed to watch {:?}: {}", path, e);
                }
            }
        }
        w
    };

    let handle = WatcherHandle {
        inner: Arc::new(WatcherInner {
            watcher: Mutex::new(raw_watcher),
            folder_map: Arc::clone(&folder_map),
        }),
    };

    // Spawn the debounce loop on its own thread.
    let folder_map_thread = Arc::clone(&folder_map);
    std::thread::spawn(move || {
        // path → deadline: the earliest instant at which this path should be processed.
        let mut pending: HashMap<PathBuf, Instant> = HashMap::new();
        // old_path → new_path for rename events that carry both sides atomically.
        let mut pending_renames: Vec<(PathBuf, PathBuf)> = Vec::new();

        loop {
            // Adaptive blocking: block forever when idle, wake at the earliest
            // deadline when events are queued.
            let received = if pending.is_empty() && pending_renames.is_empty() {
                match rx.recv() {
                    Ok(e) => Some(e),
                    Err(_) => break, // sender dropped — app is shutting down
                }
            } else {
                let earliest = pending.values().copied().min().unwrap_or(Instant::now());
                let timeout = earliest.saturating_duration_since(Instant::now());
                match rx.recv_timeout(timeout) {
                    Ok(e) => Some(e),
                    Err(std::sync::mpsc::RecvTimeoutError::Timeout) => None,
                    Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
                }
            };

            let now = Instant::now();

            // Absorb incoming event — coalesces rapid writes into one deadline.
            if let Some(Ok(event)) = received {
                use notify::{EventKind, event::{ModifyKind, RenameMode}};
                if !matches!(event.kind, EventKind::Access(_)) {
                    // Intercept atomic rename events (old + new path in one event).
                    // Handle these separately to preserve embeddings and thumbnails.
                    if matches!(
                        event.kind,
                        EventKind::Modify(ModifyKind::Name(RenameMode::Both))
                    ) && event.paths.len() == 2
                    {
                        let old = event.paths[0].clone();
                        let new = event.paths[1].clone();
                        if is_supported_media(&old) || is_supported_media(&new) {
                            // Remove either side from regular pending so it isn't
                            // processed as an independent delete/create.
                            pending.remove(&old);
                            pending.remove(&new);
                            pending_renames.push((old, new));
                        }
                    } else {
                        for path in event.paths {
                            if is_supported_media(&path) {
                                pending.insert(path, now + WATCHER_DEBOUNCE);
                            }
                        }
                    }
                }
            }

            // Process renames immediately — they are atomic filesystem operations
            // and do not benefit from debouncing.
            for (old_path, new_path) in pending_renames.drain(..) {
                process_watcher_rename(&app, &pool, &folder_map_thread, &thumb_dir, &old_path, &new_path);
            }

            // Process all paths whose debounce window has expired.
            let ready: Vec<PathBuf> = pending
                .iter()
                .filter(|(_, &deadline)| deadline <= now)
                .map(|(p, _)| p.clone())
                .collect();

            for path in ready {
                pending.remove(&path);
                process_watcher_path(&app, &pool, &folder_map_thread, &path);
            }
        }
    });

    handle
}

/// Decide what to do with a path whose debounce window just expired.
/// If the file exists → upsert (with change-detection to avoid clobbering
/// metadata like thumbnail_path). If the file is gone → delete from DB.
fn process_watcher_path(
    app: &AppHandle,
    pool: &DbPool,
    folder_map: &Arc<Mutex<HashMap<PathBuf, i64>>>,
    path: &Path,
) {
    // Determine which registered folder owns this file.
    let folder_id = {
        let map = folder_map.lock().unwrap();
        map.iter()
            .find(|(folder_path, _)| path.starts_with(folder_path.as_path()))
            .map(|(_, &id)| id)
    };
    let Some(folder_id) = folder_id else { return };

    let conn = match pool.get() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Watcher: DB pool error: {}", e);
            return;
        }
    };

    if path.exists() {
        // File still on disk — upsert if content changed.
        let path_str = path.to_string_lossy();
        let existing = db::get_indexed_entry_by_path(&conn, &path_str).unwrap_or(None);
        let Some(record) = build_record(path, folder_id, existing.as_ref()) else {
            return; // file unchanged (same size + mtime) — nothing to do
        };
        drop(conn); // commit_batch acquires its own connection from the pool

        match commit_batch(pool, &[record]) {
            Ok(committed) if !committed.is_empty() => {
                // Always emit the images — they are committed to the DB.
                emit_images(app, &IndexedImagesBatch { folder_id, images: committed });
                emit_folder_job_progress(app, pool, &[folder_id], false);
                // Update the sidebar count only if we successfully write the new
                // count; skip the frontend notification on pool/DB failure to
                // avoid showing a stale number.
                if let Ok(count_conn) = pool.get() {
                    if db::update_folder_count(&count_conn, folder_id).is_ok() {
                        let _ = app.emit("folder-counts-changed", ());
                    }
                }
            }
            Ok(_) => {}
            Err(e) => eprintln!("Watcher: commit error for {:?}: {}", path, e),
        }
    } else {
        // File removed from disk — clean up DB row and thumbnail.
        let path_str = path.to_string_lossy();
        match db::get_image_id_and_thumbnail_by_path(&conn, &path_str) {
            Ok(Some((image_id, thumb_path))) => {
                if db::delete_images_by_ids(&conn, &[image_id]).is_ok() {
                    if let Some(thumb) = thumb_path {
                        let _ = std::fs::remove_file(thumb);
                    }
                    db::update_folder_count(&conn, folder_id).ok();
                    let _ = app.emit("watcher-deleted", vec![image_id]);
                    let _ = app.emit("folder-counts-changed", ());
                }
            }
            Ok(None) => {} // never indexed or already removed
            Err(e) => eprintln!("Watcher: lookup error for {:?}: {}", path, e),
        }
    }
}

/// Handles a filesystem rename/move event where both the old and new paths are
/// known. Updates the DB row in-place (preserving the embedding) and renames
/// the thumbnail file to match the new path hash.
fn process_watcher_rename(
    app: &AppHandle,
    pool: &DbPool,
    folder_map: &Arc<Mutex<HashMap<PathBuf, i64>>>,
    thumb_dir: &Path,
    old_path: &Path,
    new_path: &Path,
) {
    // Resolve folder_id from the old path first, fall back to new path.
    let folder_id = {
        let map = folder_map.lock().unwrap();
        map.iter()
            .find(|(fp, _)| old_path.starts_with(fp.as_path()) || new_path.starts_with(fp.as_path()))
            .map(|(_, &id)| id)
    };
    let Some(folder_id) = folder_id else { return };

    let conn = match pool.get() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Watcher rename: DB pool error: {}", e);
            return;
        }
    };

    let old_path_str = old_path.to_string_lossy();
    let new_path_str = new_path.to_string_lossy();

    let (image_id, old_thumb) = match db::get_image_id_and_thumbnail_by_path(&conn, &old_path_str) {
        Ok(Some(record)) => record,
        Ok(None) => {
            // Not yet indexed under the old path — treat as a brand-new file.
            drop(conn);
            process_watcher_path(app, pool, folder_map, new_path);
            return;
        }
        Err(e) => {
            eprintln!("Watcher rename: DB lookup error: {}", e);
            return;
        }
    };

    // Compute new thumbnail path and attempt to rename the file on disk.
    let new_thumb_path = crate::thumbnail::thumb_path(thumb_dir, &new_path_str);
    let new_thumb_str = new_thumb_path.to_string_lossy().into_owned();
    let thumb_ok = old_thumb
        .as_deref()
        .map(|old| std::fs::rename(old, &new_thumb_path).is_ok())
        .unwrap_or(false);
    // If rename failed (e.g. old thumb never existed), clear thumbnail_path so
    // the thumbnail worker regenerates it.
    let effective_thumb: Option<&str> = if thumb_ok { Some(&new_thumb_str) } else { None };

    let new_filename = new_path
        .file_name()
        .and_then(|f| f.to_str())
        .unwrap_or("");

    if let Err(e) = db::update_image_path(&conn, image_id, &new_path_str, new_filename, effective_thumb) {
        eprintln!("Watcher rename: DB update error: {}", e);
        return;
    }

    // Emit the updated record so the frontend refreshes without a full reload.
    match db::get_image_by_id(&conn, image_id) {
        Ok(record) => emit_images(app, &IndexedImagesBatch { folder_id, images: vec![record] }),
        Err(e) => eprintln!("Watcher rename: post-update fetch error: {}", e),
    }
}
