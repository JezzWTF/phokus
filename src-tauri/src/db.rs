use crate::vector;
use anyhow::Result;
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::{params, Connection, Row};
use serde::{Deserialize, Serialize};
use std::path::Path;

pub type DbPool = Pool<SqliteConnectionManager>;

#[derive(Debug)]
struct ConnectionOptions;

impl r2d2::CustomizeConnection<Connection, rusqlite::Error> for ConnectionOptions {
    fn on_acquire(&self, conn: &mut Connection) -> Result<(), rusqlite::Error> {
        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             PRAGMA synchronous=NORMAL;
             PRAGMA foreign_keys=ON;
             PRAGMA busy_timeout=5000;",
        )?;
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Folder {
    pub id: i64,
    pub path: String,
    pub name: String,
    pub image_count: i64,
    pub indexed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageRecord {
    pub id: i64,
    pub folder_id: i64,
    pub path: String,
    pub filename: String,
    pub thumbnail_path: Option<String>,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub file_size: i64,
    pub created_at: Option<String>,
    pub modified_at: Option<String>,
    pub mime_type: String,
    pub media_kind: String,
    pub duration_ms: Option<i64>,
    pub video_codec: Option<String>,
    pub audio_codec: Option<String>,
    pub metadata_updated_at: Option<String>,
    pub metadata_error: Option<String>,
    pub favorite: bool,
    pub rating: i64,
    pub embedding_status: String,
    pub embedding_model: Option<String>,
    pub embedding_updated_at: Option<String>,
    pub embedding_error: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbeddingJob {
    pub image_id: i64,
    pub folder_id: i64,
    pub path: String,
    pub thumbnail_path: Option<String>,
    pub media_kind: String,
    pub status: String,
    pub attempts: i64,
    pub last_error: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone)]
pub struct ThumbnailJob {
    pub image_id: i64,
    pub folder_id: i64,
    pub path: String,
    pub media_kind: String,
}

#[derive(Debug, Clone)]
pub struct MetadataJob {
    pub image_id: i64,
    pub folder_id: i64,
    pub path: String,
}

#[derive(Debug, Clone)]
pub struct IndexedMediaEntry {
    pub id: i64,
    pub path: String,
    pub modified_at: Option<String>,
    pub file_size: i64,
    pub media_kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FolderJobProgress {
    pub folder_id: i64,
    pub thumbnail_pending: i64,
    pub metadata_pending: i64,
    pub embedding_pending: i64,
    pub embedding_ready: i64,
    pub embedding_failed: i64,
}

pub fn create_pool(db_path: &Path) -> Result<DbPool> {
    vector::register_sqlite_vec();
    let manager = SqliteConnectionManager::file(db_path);
    let pool = Pool::builder()
        .connection_customizer(Box::new(ConnectionOptions))
        .build(manager)?;
    Ok(pool)
}

pub fn migrate(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS folders (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            path        TEXT NOT NULL UNIQUE,
            name        TEXT NOT NULL,
            image_count INTEGER NOT NULL DEFAULT 0,
            indexed_at  TEXT
        );

        CREATE TABLE IF NOT EXISTS images (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            folder_id      INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
            path           TEXT NOT NULL UNIQUE,
            filename       TEXT NOT NULL,
            thumbnail_path TEXT,
            width          INTEGER,
            height         INTEGER,
            file_size      INTEGER NOT NULL DEFAULT 0,
            created_at     TEXT,
            modified_at    TEXT,
            mime_type      TEXT NOT NULL DEFAULT 'image/jpeg',
            media_kind     TEXT NOT NULL DEFAULT 'image',
            favorite       INTEGER NOT NULL DEFAULT 0,
            rating         INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS embedding_jobs (
            image_id    INTEGER PRIMARY KEY REFERENCES images(id) ON DELETE CASCADE,
            status      TEXT NOT NULL DEFAULT 'pending',
            attempts    INTEGER NOT NULL DEFAULT 0,
            last_error  TEXT,
            created_at  TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS thumbnail_jobs (
            image_id    INTEGER PRIMARY KEY REFERENCES images(id) ON DELETE CASCADE,
            status      TEXT NOT NULL DEFAULT 'pending',
            attempts    INTEGER NOT NULL DEFAULT 0,
            last_error  TEXT,
            created_at  TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS metadata_jobs (
            image_id    INTEGER PRIMARY KEY REFERENCES images(id) ON DELETE CASCADE,
            status      TEXT NOT NULL DEFAULT 'pending',
            attempts    INTEGER NOT NULL DEFAULT 0,
            last_error  TEXT,
            created_at  TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_images_folder_id ON images(folder_id);
        CREATE INDEX IF NOT EXISTS idx_images_modified_at ON images(modified_at);
        CREATE INDEX IF NOT EXISTS idx_embedding_jobs_status ON embedding_jobs(status);
        CREATE INDEX IF NOT EXISTS idx_thumbnail_jobs_status ON thumbnail_jobs(status);
        CREATE INDEX IF NOT EXISTS idx_metadata_jobs_status ON metadata_jobs(status);
        ",
    )?;

    ensure_column(
        conn,
        "images",
        "embedding_status",
        "TEXT NOT NULL DEFAULT 'pending'",
    )?;
    ensure_column(conn, "images", "embedding_model", "TEXT")?;
    ensure_column(conn, "images", "embedding_updated_at", "TEXT")?;
    ensure_column(conn, "images", "embedding_error", "TEXT")?;
    ensure_column(
        conn,
        "images",
        "media_kind",
        "TEXT NOT NULL DEFAULT 'image'",
    )?;
    ensure_column(conn, "images", "favorite", "INTEGER NOT NULL DEFAULT 0")?;
    ensure_column(conn, "images", "rating", "INTEGER NOT NULL DEFAULT 0")?;
    ensure_column(conn, "images", "duration_ms", "INTEGER")?;
    ensure_column(conn, "images", "video_codec", "TEXT")?;
    ensure_column(conn, "images", "audio_codec", "TEXT")?;
    ensure_column(conn, "images", "metadata_updated_at", "TEXT")?;
    ensure_column(conn, "images", "metadata_error", "TEXT")?;

    vector::migrate(conn)?;
    Ok(())
}

pub fn insert_folder(conn: &Connection, path: &str, name: &str) -> Result<i64> {
    conn.execute(
        "INSERT OR IGNORE INTO folders (path, name) VALUES (?1, ?2)",
        params![path, name],
    )?;
    let id: i64 = conn.query_row(
        "SELECT id FROM folders WHERE path = ?1",
        params![path],
        |row| row.get(0),
    )?;
    Ok(id)
}

pub fn upsert_image(conn: &Connection, img: &ImageRecord) -> Result<i64> {
    let id = conn.query_row(
        "INSERT INTO images (folder_id, path, filename, thumbnail_path, width, height, file_size, created_at, modified_at, mime_type, media_kind, duration_ms, video_codec, audio_codec, metadata_updated_at, metadata_error, favorite, rating, embedding_status, embedding_model, embedding_updated_at, embedding_error)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22)
         ON CONFLICT(path) DO UPDATE SET
            folder_id = excluded.folder_id,
            filename = excluded.filename,
            thumbnail_path = excluded.thumbnail_path,
            width = excluded.width,
            height = excluded.height,
            file_size = excluded.file_size,
            created_at = excluded.created_at,
            modified_at = excluded.modified_at,
            mime_type = excluded.mime_type,
            media_kind = excluded.media_kind,
            duration_ms = excluded.duration_ms,
            video_codec = excluded.video_codec,
            audio_codec = excluded.audio_codec,
            metadata_updated_at = excluded.metadata_updated_at,
            metadata_error = excluded.metadata_error,
            embedding_status = excluded.embedding_status,
            embedding_model = excluded.embedding_model,
            embedding_updated_at = excluded.embedding_updated_at,
            embedding_error = excluded.embedding_error
         RETURNING id",
        params![
            img.folder_id,
            img.path,
            img.filename,
            img.thumbnail_path,
            img.width,
            img.height,
            img.file_size,
            img.created_at,
            img.modified_at,
            img.mime_type,
            img.media_kind,
            img.duration_ms,
            img.video_codec,
            img.audio_codec,
            img.metadata_updated_at,
            img.metadata_error,
            img.favorite,
            img.rating,
            img.embedding_status,
            img.embedding_model,
            img.embedding_updated_at,
            img.embedding_error,
        ],
        |row| row.get(0),
    )?;
    Ok(id)
}

pub fn enqueue_embedding_job(conn: &Connection, image_id: i64) -> Result<()> {
    conn.execute(
        "INSERT INTO embedding_jobs (image_id, status, attempts, last_error, created_at, updated_at)
         VALUES (?1, 'pending', 0, NULL, datetime('now'), datetime('now'))
         ON CONFLICT(image_id) DO UPDATE SET
            status = 'pending',
            last_error = NULL,
            updated_at = datetime('now')",
        [image_id],
    )?;
    Ok(())
}

pub fn backfill_embedding_jobs(conn: &Connection) -> Result<usize> {
    let inserted = conn.execute(
        "INSERT INTO embedding_jobs (image_id, status, attempts, last_error, created_at, updated_at)
         SELECT i.id, 'pending', 0, NULL, datetime('now'), datetime('now')
         FROM images i
         LEFT JOIN embedding_jobs j ON j.image_id = i.id
         WHERE i.embedding_status != 'ready'
           AND j.image_id IS NULL",
        [],
    )?;
    Ok(inserted)
}

pub fn retry_failed_embedding_jobs(conn: &Connection, folder_id: i64) -> Result<usize> {
    let updated = conn.execute(
        "INSERT INTO embedding_jobs (image_id, status, attempts, last_error, created_at, updated_at)
         SELECT id, 'pending', 0, NULL, datetime('now'), datetime('now')
         FROM images
         WHERE folder_id = ?1 AND embedding_status = 'failed'
         ON CONFLICT(image_id) DO UPDATE SET
             status = 'pending',
             last_error = NULL,
             updated_at = datetime('now')",
        [folder_id],
    )?;
    conn.execute(
        "UPDATE images
         SET embedding_status = 'pending', embedding_error = NULL
         WHERE folder_id = ?1 AND embedding_status = 'failed'",
        [folder_id],
    )?;
    Ok(updated)
}

pub fn reset_inflight_jobs(conn: &Connection) -> Result<()> {
    conn.execute(
        "UPDATE thumbnail_jobs SET status = 'pending' WHERE status = 'processing'",
        [],
    )?;
    conn.execute(
        "UPDATE metadata_jobs SET status = 'pending' WHERE status = 'processing'",
        [],
    )?;
    conn.execute(
        "UPDATE embedding_jobs SET status = 'pending' WHERE status = 'processing'",
        [],
    )?;
    Ok(())
}

pub fn enqueue_thumbnail_job(conn: &Connection, image_id: i64) -> Result<()> {
    conn.execute(
        "INSERT INTO thumbnail_jobs (image_id, status, attempts, last_error, created_at, updated_at)
         VALUES (?1, 'pending', 0, NULL, datetime('now'), datetime('now'))
         ON CONFLICT(image_id) DO UPDATE SET
            status = 'pending',
            last_error = NULL,
            updated_at = datetime('now')",
        [image_id],
    )?;
    Ok(())
}

pub fn enqueue_metadata_job(conn: &Connection, image_id: i64) -> Result<()> {
    conn.execute(
        "INSERT INTO metadata_jobs (image_id, status, attempts, last_error, created_at, updated_at)
         VALUES (?1, 'pending', 0, NULL, datetime('now'), datetime('now'))
         ON CONFLICT(image_id) DO UPDATE SET
            status = 'pending',
            last_error = NULL,
            updated_at = datetime('now')",
        [image_id],
    )?;
    Ok(())
}

pub fn get_pending_embedding_jobs(conn: &Connection, limit: usize) -> Result<Vec<EmbeddingJob>> {
    let mut stmt = conn.prepare(
        "SELECT j.image_id, i.folder_id, i.path, i.thumbnail_path, i.media_kind,
                j.status, j.attempts, j.last_error, j.created_at, j.updated_at
         FROM embedding_jobs j
         JOIN images i ON i.id = j.image_id
         WHERE status = 'pending'
         ORDER BY j.updated_at, j.image_id
         LIMIT ?1",
    )?;
    let rows = stmt.query_map([limit as i64], |row| {
        Ok(EmbeddingJob {
            image_id: row.get(0)?,
            folder_id: row.get(1)?,
            path: row.get(2)?,
            thumbnail_path: row.get(3)?,
            media_kind: row.get(4)?,
            status: row.get(5)?,
            attempts: row.get(6)?,
            last_error: row.get(7)?,
            created_at: row.get(8)?,
            updated_at: row.get(9)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn claim_embedding_jobs(conn: &mut Connection, limit: usize) -> Result<Vec<EmbeddingJob>> {
    let tx = conn.transaction()?;
    let candidates = get_pending_embedding_jobs(&tx, limit * 2)?;
    let mut claimed = Vec::with_capacity(limit);

    for job in candidates {
        let updated = tx.execute(
            "UPDATE embedding_jobs
             SET status = 'processing', attempts = attempts + 1, updated_at = datetime('now')
             WHERE image_id = ?1 AND status = 'pending'",
            [job.image_id],
        )?;

        if updated == 1 {
            claimed.push(job);
        }

        if claimed.len() >= limit {
            break;
        }
    }

    tx.commit()?;
    Ok(claimed)
}

#[allow(dead_code)]
pub fn mark_embedding_ready(conn: &Connection, image_id: i64, model: &str) -> Result<()> {
    conn.execute(
        "UPDATE images
         SET embedding_status = 'ready', embedding_model = ?2, embedding_updated_at = datetime('now'), embedding_error = NULL
         WHERE id = ?1",
        params![image_id, model],
    )?;
    conn.execute("DELETE FROM embedding_jobs WHERE image_id = ?1", [image_id])?;
    Ok(())
}

#[allow(dead_code)]
pub fn mark_embedding_failed(conn: &Connection, image_id: i64, error: &str) -> Result<()> {
    conn.execute(
        "UPDATE images
         SET embedding_status = 'failed', embedding_error = ?2
         WHERE id = ?1",
        params![image_id, error],
    )?;
    conn.execute(
        "UPDATE embedding_jobs
         SET status = 'failed', last_error = ?2, updated_at = datetime('now')
         WHERE image_id = ?1",
        params![image_id, error],
    )?;
    Ok(())
}

pub fn update_folder_count(conn: &Connection, folder_id: i64) -> Result<()> {
    conn.execute(
        "UPDATE folders SET image_count = (SELECT COUNT(*) FROM images WHERE folder_id = ?1), indexed_at = datetime('now') WHERE id = ?1",
        params![folder_id],
    )?;
    Ok(())
}

pub fn get_folder_media_index(conn: &Connection, folder_id: i64) -> Result<Vec<IndexedMediaEntry>> {
    let mut stmt = conn.prepare(
        "SELECT id, path, modified_at, file_size, media_kind
         FROM images
         WHERE folder_id = ?1",
    )?;
    let rows = stmt.query_map([folder_id], |row| {
        Ok(IndexedMediaEntry {
            id: row.get(0)?,
            path: row.get(1)?,
            modified_at: row.get(2)?,
            file_size: row.get(3)?,
            media_kind: row.get(4)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn delete_images_by_ids(conn: &Connection, image_ids: &[i64]) -> Result<()> {
    let tx = conn.unchecked_transaction()?;
    for image_id in image_ids {
        vector::delete_embedding(&tx, *image_id)?;
        tx.execute("DELETE FROM images WHERE id = ?1", [image_id])?;
    }
    tx.commit()?;
    Ok(())
}

pub fn get_folder_job_progress(conn: &Connection, folder_id: i64) -> Result<FolderJobProgress> {
    let thumbnail_pending = conn.query_row(
        "SELECT COUNT(*)
         FROM thumbnail_jobs j
         JOIN images i ON i.id = j.image_id
         WHERE i.folder_id = ?1 AND j.status IN ('pending', 'processing')",
        [folder_id],
        |row| row.get(0),
    )?;

    let metadata_pending = conn.query_row(
        "SELECT COUNT(*)
         FROM metadata_jobs j
         JOIN images i ON i.id = j.image_id
         WHERE i.folder_id = ?1 AND j.status IN ('pending', 'processing')",
        [folder_id],
        |row| row.get(0),
    )?;

    let embedding_pending = conn.query_row(
        "SELECT COUNT(*)
         FROM embedding_jobs j
         JOIN images i ON i.id = j.image_id
         WHERE i.folder_id = ?1 AND j.status IN ('pending', 'processing')",
        [folder_id],
        |row| row.get(0),
    )?;

    let embedding_ready = conn.query_row(
        "SELECT COUNT(*)
         FROM images
         WHERE folder_id = ?1 AND embedding_status = 'ready'",
        [folder_id],
        |row| row.get(0),
    )?;

    let embedding_failed = conn.query_row(
        "SELECT COUNT(*)
         FROM images
         WHERE folder_id = ?1 AND embedding_status = 'failed'",
        [folder_id],
        |row| row.get(0),
    )?;

    Ok(FolderJobProgress {
        folder_id,
        thumbnail_pending,
        metadata_pending,
        embedding_pending,
        embedding_ready,
        embedding_failed,
    })
}

pub fn get_all_folder_job_progress(conn: &Connection) -> Result<Vec<FolderJobProgress>> {
    let folder_ids = get_folders(conn)?
        .into_iter()
        .map(|folder| folder.id)
        .collect::<Vec<_>>();

    let mut progress = Vec::with_capacity(folder_ids.len());
    for folder_id in folder_ids {
        progress.push(get_folder_job_progress(conn, folder_id)?);
    }
    Ok(progress)
}

pub fn get_pending_thumbnail_jobs(conn: &Connection, limit: usize) -> Result<Vec<ThumbnailJob>> {
    let mut stmt = conn.prepare(
        "SELECT j.image_id, i.folder_id, i.path, i.media_kind
         FROM thumbnail_jobs j
         JOIN images i ON i.id = j.image_id
         WHERE j.status = 'pending'
         ORDER BY j.updated_at, j.image_id
         LIMIT ?1",
    )?;
    let rows = stmt.query_map([limit as i64], |row| {
        Ok(ThumbnailJob {
            image_id: row.get(0)?,
            folder_id: row.get(1)?,
            path: row.get(2)?,
            media_kind: row.get(3)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn claim_thumbnail_jobs(
    conn: &mut Connection,
    active_folder_ids: &std::collections::HashSet<i64>,
    fetch_limit: usize,
    claim_limit: usize,
) -> Result<Vec<ThumbnailJob>> {
    let tx = conn.transaction()?;
    let candidates = get_pending_thumbnail_jobs(&tx, fetch_limit)?;
    let mut claimed = Vec::with_capacity(claim_limit);

    for job in candidates {
        if active_folder_ids.contains(&job.folder_id) {
            continue;
        }

        let updated = tx.execute(
            "UPDATE thumbnail_jobs
             SET status = 'processing', attempts = attempts + 1, updated_at = datetime('now')
             WHERE image_id = ?1 AND status = 'pending'",
            [job.image_id],
        )?;

        if updated == 1 {
            claimed.push(job);
        }

        if claimed.len() >= claim_limit {
            break;
        }
    }

    tx.commit()?;
    Ok(claimed)
}

pub fn get_pending_metadata_jobs(conn: &Connection, limit: usize) -> Result<Vec<MetadataJob>> {
    let mut stmt = conn.prepare(
        "SELECT j.image_id, i.folder_id, i.path
         FROM metadata_jobs j
         JOIN images i ON i.id = j.image_id
         WHERE j.status = 'pending' AND i.media_kind = 'video'
         ORDER BY j.updated_at, j.image_id
         LIMIT ?1",
    )?;
    let rows = stmt.query_map([limit as i64], |row| {
        Ok(MetadataJob {
            image_id: row.get(0)?,
            folder_id: row.get(1)?,
            path: row.get(2)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn claim_metadata_jobs(
    conn: &mut Connection,
    active_folder_ids: &std::collections::HashSet<i64>,
    fetch_limit: usize,
    claim_limit: usize,
) -> Result<Vec<MetadataJob>> {
    let tx = conn.transaction()?;
    let candidates = get_pending_metadata_jobs(&tx, fetch_limit)?;
    let mut claimed = Vec::with_capacity(claim_limit);

    for job in candidates {
        if active_folder_ids.contains(&job.folder_id) {
            continue;
        }

        let updated = tx.execute(
            "UPDATE metadata_jobs
             SET status = 'processing', attempts = attempts + 1, updated_at = datetime('now')
             WHERE image_id = ?1 AND status = 'pending'",
            [job.image_id],
        )?;

        if updated == 1 {
            claimed.push(job);
        }

        if claimed.len() >= claim_limit {
            break;
        }
    }

    tx.commit()?;
    Ok(claimed)
}

pub fn mark_thumbnail_ready(
    conn: &Connection,
    image_id: i64,
    thumbnail_path: Option<&str>,
    width: Option<i64>,
    height: Option<i64>,
) -> Result<ImageRecord> {
    conn.execute(
        "UPDATE images
         SET thumbnail_path = ?2,
             width = COALESCE(?3, width),
             height = COALESCE(?4, height)
         WHERE id = ?1",
        params![image_id, thumbnail_path, width, height],
    )?;
    conn.execute("DELETE FROM thumbnail_jobs WHERE image_id = ?1", [image_id])?;
    get_image_by_id(conn, image_id)
}

pub fn mark_thumbnail_failed(conn: &Connection, image_id: i64, error: &str) -> Result<()> {
    conn.execute(
        "UPDATE thumbnail_jobs
         SET status = 'failed', last_error = ?2, updated_at = datetime('now')
         WHERE image_id = ?1",
        params![image_id, error],
    )?;
    Ok(())
}

pub fn mark_metadata_ready(
    conn: &Connection,
    image_id: i64,
    duration_ms: Option<i64>,
    width: Option<i64>,
    height: Option<i64>,
    video_codec: Option<&str>,
    audio_codec: Option<&str>,
) -> Result<ImageRecord> {
    conn.execute(
        "UPDATE images
         SET duration_ms = ?2,
             width = COALESCE(?3, width),
             height = COALESCE(?4, height),
             video_codec = ?5,
             audio_codec = ?6,
             metadata_updated_at = datetime('now'),
             metadata_error = NULL
         WHERE id = ?1",
        params![
            image_id,
            duration_ms,
            width,
            height,
            video_codec,
            audio_codec
        ],
    )?;
    conn.execute("DELETE FROM metadata_jobs WHERE image_id = ?1", [image_id])?;
    get_image_by_id(conn, image_id)
}

pub fn mark_metadata_failed(conn: &Connection, image_id: i64, error: &str) -> Result<()> {
    conn.execute(
        "UPDATE images
         SET metadata_error = ?2
         WHERE id = ?1",
        params![image_id, error],
    )?;
    conn.execute(
        "UPDATE metadata_jobs
         SET status = 'failed', last_error = ?2, updated_at = datetime('now')
         WHERE image_id = ?1",
        params![image_id, error],
    )?;
    Ok(())
}

pub fn update_image_details(
    conn: &Connection,
    image_id: i64,
    favorite: Option<bool>,
    rating: Option<i64>,
) -> Result<ImageRecord> {
    conn.execute(
        "UPDATE images
         SET favorite = COALESCE(?2, favorite),
             rating = COALESCE(?3, rating)
         WHERE id = ?1",
        params![image_id, favorite, rating],
    )?;

    conn.query_row(
        "SELECT id, folder_id, path, filename, thumbnail_path, width, height, file_size, created_at, modified_at, mime_type,
                media_kind, duration_ms, video_codec, audio_codec, metadata_updated_at, metadata_error,
                favorite, rating, embedding_status, embedding_model, embedding_updated_at, embedding_error
         FROM images
         WHERE id = ?1",
        [image_id],
        map_image_row,
    )
    .map_err(Into::into)
}

pub fn get_image_by_id(conn: &Connection, image_id: i64) -> Result<ImageRecord> {
    conn.query_row(
        "SELECT id, folder_id, path, filename, thumbnail_path, width, height, file_size, created_at, modified_at, mime_type,
                media_kind, duration_ms, video_codec, audio_codec, metadata_updated_at, metadata_error,
                favorite, rating, embedding_status, embedding_model, embedding_updated_at, embedding_error
         FROM images
         WHERE id = ?1",
        [image_id],
        map_image_row,
    )
    .map_err(Into::into)
}

pub fn get_images_by_ids(conn: &Connection, image_ids: &[i64]) -> Result<Vec<ImageRecord>> {
    let mut images = Vec::with_capacity(image_ids.len());
    for image_id in image_ids {
        images.push(get_image_by_id(conn, *image_id)?);
    }
    Ok(images)
}

pub fn get_folders(conn: &Connection) -> Result<Vec<Folder>> {
    let mut stmt =
        conn.prepare("SELECT id, path, name, image_count, indexed_at FROM folders ORDER BY name")?;
    let rows = stmt.query_map([], |row| {
        Ok(Folder {
            id: row.get(0)?,
            path: row.get(1)?,
            name: row.get(2)?,
            image_count: row.get(3)?,
            indexed_at: row.get(4)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn get_images(
    conn: &Connection,
    folder_id: Option<i64>,
    search: Option<&str>,
    media_kind: Option<&str>,
    favorites_only: bool,
    sort: &str,
    offset: i64,
    limit: i64,
) -> Result<Vec<ImageRecord>> {
    let order = match sort {
        "name_asc" => "filename ASC",
        "name_desc" => "filename DESC",
        "date_asc" => "modified_at ASC NULLS LAST",
        "date_desc" => "modified_at DESC NULLS LAST",
        "size_asc" => "file_size ASC",
        "size_desc" => "file_size DESC",
        "duration_asc" => "duration_ms ASC NULLS LAST",
        "duration_desc" => "duration_ms DESC NULLS LAST",
        _ => "modified_at DESC NULLS LAST",
    };

    let search_pattern = search.map(|value| format!("%{}%", value));
    let favorites_flag = i64::from(favorites_only);
    let sql = format!(
        "SELECT id, folder_id, path, filename, thumbnail_path, width, height, file_size, created_at, modified_at, mime_type,
                media_kind, duration_ms, video_codec, audio_codec, metadata_updated_at, metadata_error,
                favorite, rating, embedding_status, embedding_model, embedding_updated_at, embedding_error
         FROM images
         WHERE (?1 IS NULL OR folder_id = ?1)
           AND (?2 IS NULL OR filename LIKE ?2)
           AND (?3 IS NULL OR media_kind = ?3)
           AND (?4 = 0 OR favorite = 1)
         ORDER BY {}
         LIMIT ?5 OFFSET ?6",
        order
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(
        params![
            folder_id,
            search_pattern,
            media_kind,
            favorites_flag,
            limit,
            offset
        ],
        map_image_row,
    )?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn count_images(
    conn: &Connection,
    folder_id: Option<i64>,
    search: Option<&str>,
    media_kind: Option<&str>,
    favorites_only: bool,
) -> Result<i64> {
    let search_pattern = search.map(|value| format!("%{}%", value));

    let favorites_flag = i64::from(favorites_only);
    let count = conn.query_row(
        "SELECT COUNT(*) FROM images
         WHERE (?1 IS NULL OR folder_id = ?1)
           AND (?2 IS NULL OR filename LIKE ?2)
           AND (?3 IS NULL OR media_kind = ?3)
           AND (?4 = 0 OR favorite = 1)",
        params![folder_id, search_pattern, media_kind, favorites_flag],
        |row| row.get(0),
    )?;

    Ok(count)
}

pub fn delete_folder(conn: &Connection, folder_id: i64) -> Result<()> {
    conn.execute("DELETE FROM folders WHERE id = ?1", params![folder_id])?;
    Ok(())
}

fn map_image_row(row: &Row<'_>) -> rusqlite::Result<ImageRecord> {
    Ok(ImageRecord {
        id: row.get(0)?,
        folder_id: row.get(1)?,
        path: row.get(2)?,
        filename: row.get(3)?,
        thumbnail_path: row.get(4)?,
        width: row.get(5)?,
        height: row.get(6)?,
        file_size: row.get(7)?,
        created_at: row.get(8)?,
        modified_at: row.get(9)?,
        mime_type: row.get(10)?,
        media_kind: row.get(11)?,
        duration_ms: row.get(12)?,
        video_codec: row.get(13)?,
        audio_codec: row.get(14)?,
        metadata_updated_at: row.get(15)?,
        metadata_error: row.get(16)?,
        favorite: row.get::<_, i64>(17)? != 0,
        rating: row.get(18)?,
        embedding_status: row.get(19)?,
        embedding_model: row.get(20)?,
        embedding_updated_at: row.get(21)?,
        embedding_error: row.get(22)?,
    })
}

fn ensure_column(conn: &Connection, table: &str, column: &str, definition: &str) -> Result<()> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({})", table))?;
    let mut rows = stmt.query([])?;
    while let Some(row) = rows.next()? {
        let existing_name: String = row.get(1)?;
        if existing_name == column {
            return Ok(());
        }
    }

    conn.execute(
        &format!("ALTER TABLE {} ADD COLUMN {} {}", table, column, definition),
        [],
    )?;
    Ok(())
}
