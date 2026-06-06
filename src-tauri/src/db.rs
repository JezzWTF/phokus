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
    pub generated_caption: Option<String>,
    pub caption_model: Option<String>,
    pub caption_updated_at: Option<String>,
    pub caption_error: Option<String>,
    pub ai_rating: Option<String>,
    pub ai_tagger_model: Option<String>,
    pub ai_tagged_at: Option<String>,
    pub ai_tagger_error: Option<String>,
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
pub struct CaptionJob {
    pub image_id: i64,
    pub folder_id: i64,
    pub path: String,
}

#[derive(Debug, Clone)]
pub struct TaggingJob {
    pub image_id: i64,
    pub folder_id: i64,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageTag {
    pub id: i64,
    pub image_id: i64,
    pub tag: String,
    pub source: String,
    pub ai_model: Option<String>,
    pub confidence: Option<f64>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ExploreTagEntry {
    pub tag: String,
    pub count: i64,
    pub representative_image_id: i64,
    pub thumbnail_path: Option<String>,
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
    pub caption_pending: i64,
    pub caption_ready: i64,
    pub caption_failed: i64,
    pub tagging_pending: i64,
    pub tagging_ready: i64,
    pub tagging_failed: i64,
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

        CREATE TABLE IF NOT EXISTS caption_jobs (
            image_id    INTEGER PRIMARY KEY REFERENCES images(id) ON DELETE CASCADE,
            status      TEXT NOT NULL DEFAULT 'pending',
            attempts    INTEGER NOT NULL DEFAULT 0,
            last_error  TEXT,
            created_at  TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS tagging_jobs (
            image_id    INTEGER PRIMARY KEY REFERENCES images(id) ON DELETE CASCADE,
            status      TEXT NOT NULL DEFAULT 'pending',
            attempts    INTEGER NOT NULL DEFAULT 0,
            last_error  TEXT,
            created_at  TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS image_tags (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            image_id   INTEGER NOT NULL REFERENCES images(id) ON DELETE CASCADE,
            tag        TEXT NOT NULL,
            source     TEXT NOT NULL DEFAULT 'user',
            ai_model   TEXT,
            confidence REAL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(image_id, tag)
        );

        CREATE TABLE IF NOT EXISTS tag_cloud_cache (
            folder_scope    TEXT PRIMARY KEY,
            image_ids_hash  INTEGER NOT NULL,
            entries_json    TEXT NOT NULL,
            created_at      TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS duplicate_scan_cache (
            folder_scope    TEXT PRIMARY KEY,
            scanned_at      INTEGER NOT NULL,
            groups_json     TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_images_folder_id ON images(folder_id);
        CREATE INDEX IF NOT EXISTS idx_images_modified_at ON images(modified_at);
        CREATE INDEX IF NOT EXISTS idx_embedding_jobs_status ON embedding_jobs(status);
        CREATE INDEX IF NOT EXISTS idx_thumbnail_jobs_status ON thumbnail_jobs(status);
        CREATE INDEX IF NOT EXISTS idx_metadata_jobs_status ON metadata_jobs(status);
        CREATE INDEX IF NOT EXISTS idx_caption_jobs_status ON caption_jobs(status);
        CREATE INDEX IF NOT EXISTS idx_tagging_jobs_status ON tagging_jobs(status);
        CREATE INDEX IF NOT EXISTS idx_image_tags_image_id ON image_tags(image_id);
        CREATE INDEX IF NOT EXISTS idx_image_tags_source ON image_tags(source);
        CREATE INDEX IF NOT EXISTS idx_image_tags_tag ON image_tags(tag);
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
    ensure_column(conn, "images", "generated_caption", "TEXT")?;
    ensure_column(conn, "images", "caption_model", "TEXT")?;
    ensure_column(conn, "images", "caption_updated_at", "TEXT")?;
    ensure_column(conn, "images", "caption_error", "TEXT")?;
    ensure_column(conn, "images", "ai_rating", "TEXT")?;
    ensure_column(conn, "images", "ai_tagger_model", "TEXT")?;
    ensure_column(conn, "images", "ai_tagged_at", "TEXT")?;
    ensure_column(conn, "images", "ai_tagger_error", "TEXT")?;

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
        "INSERT INTO images (folder_id, path, filename, thumbnail_path, width, height, file_size, created_at, modified_at, mime_type, media_kind, duration_ms, video_codec, audio_codec, metadata_updated_at, metadata_error, favorite, rating, embedding_status, embedding_model, embedding_updated_at, embedding_error, generated_caption, caption_model, caption_updated_at, caption_error, ai_rating, ai_tagger_model, ai_tagged_at, ai_tagger_error)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30)
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
            embedding_error = excluded.embedding_error,
            generated_caption = excluded.generated_caption,
            caption_model = excluded.caption_model,
            caption_updated_at = excluded.caption_updated_at,
            caption_error = excluded.caption_error,
            ai_rating = NULL,
            ai_tagger_model = NULL,
            ai_tagged_at = NULL,
            ai_tagger_error = NULL
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
            img.generated_caption,
            img.caption_model,
            img.caption_updated_at,
            img.caption_error,
            img.ai_rating,
            img.ai_tagger_model,
            img.ai_tagged_at,
            img.ai_tagger_error,
        ],
        |row| row.get(0),
    )?;
    // Remove stale AI tags when content changes so they aren't shown for the
    // new file. User-sourced tags are preserved.
    conn.execute(
        "DELETE FROM image_tags WHERE image_id = ?1 AND source = 'ai'",
        [id],
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

pub fn repair_embedding_consistency(conn: &Connection) -> Result<(usize, usize)> {
    let orphaned_vectors = vector::delete_orphaned_embeddings(conn)?;
    let ready_ids = {
        let mut stmt = conn.prepare(
            "SELECT id
             FROM images
             WHERE embedding_status = 'ready'",
        )?;
        let rows = stmt
            .query_map([], |row| row.get::<_, i64>(0))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        rows
    };

    let mut missing_vector_ids = Vec::new();
    for image_id in ready_ids {
        if !vector::has_image_vector(conn, image_id)? {
            missing_vector_ids.push(image_id);
        }
    }

    let tx = conn.unchecked_transaction()?;
    for image_id in &missing_vector_ids {
        tx.execute(
            "INSERT INTO embedding_jobs (image_id, status, attempts, last_error, created_at, updated_at)
             VALUES (?1, 'pending', 0, NULL, datetime('now'), datetime('now'))
             ON CONFLICT(image_id) DO UPDATE SET
                status = 'pending',
                last_error = NULL,
                updated_at = datetime('now')",
            [image_id],
        )?;
        tx.execute(
            "UPDATE images
             SET embedding_status = 'pending',
                 embedding_error = NULL
             WHERE id = ?1",
            [image_id],
        )?;
    }
    tx.commit()?;

    Ok((orphaned_vectors, missing_vector_ids.len()))
}

pub fn retry_failed_embedding_jobs(conn: &Connection, folder_id: i64) -> Result<usize> {
    // Only re-queue images that are actually embeddable right now.
    // Videos without a thumbnail would just fail again immediately, so skip them —
    // they will be re-queued automatically once their thumbnail is generated.
    let updated = conn.execute(
        "INSERT INTO embedding_jobs (image_id, status, attempts, last_error, created_at, updated_at)
         SELECT id, 'pending', 0, NULL, datetime('now'), datetime('now')
         FROM images
         WHERE folder_id = ?1
           AND embedding_status = 'failed'
           AND NOT (media_kind = 'video' AND thumbnail_path IS NULL)
         ON CONFLICT(image_id) DO UPDATE SET
             status = 'pending',
             last_error = NULL,
             updated_at = datetime('now')",
        [folder_id],
    )?;
    conn.execute(
        "UPDATE images
         SET embedding_status = 'pending', embedding_error = NULL
         WHERE folder_id = ?1
           AND embedding_status = 'failed'
           AND NOT (media_kind = 'video' AND thumbnail_path IS NULL)",
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
    conn.execute(
        "UPDATE caption_jobs SET status = 'pending' WHERE status = 'processing'",
        [],
    )?;
    conn.execute(
        "UPDATE tagging_jobs SET status = 'pending' WHERE status = 'processing'",
        [],
    )?;
    // Delete any rows that were cancelled before the previous shutdown so
    // they don't silently linger in the DB across restarts.
    conn.execute("DELETE FROM tagging_jobs WHERE status = 'cancelled'", [])?;
    conn.execute("DELETE FROM caption_jobs WHERE status = 'cancelled'", [])?;
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

pub fn enqueue_caption_job(conn: &Connection, image_id: i64) -> Result<()> {
    conn.execute(
        "INSERT INTO caption_jobs (image_id, status, attempts, last_error, created_at, updated_at)
         VALUES (?1, 'pending', 0, NULL, datetime('now'), datetime('now'))
         ON CONFLICT(image_id) DO UPDATE SET
            status = 'pending',
            last_error = NULL,
            updated_at = datetime('now')",
        [image_id],
    )?;
    conn.execute(
        "UPDATE images
         SET caption_error = NULL
         WHERE id = ?1",
        [image_id],
    )?;
    Ok(())
}

pub fn requeue_caption_jobs(conn: &Connection, image_ids: &[i64]) -> Result<()> {
    for image_id in image_ids {
        conn.execute(
            "UPDATE caption_jobs
             SET status = 'pending', updated_at = datetime('now')
             WHERE image_id = ?1 AND status = 'processing'",
            [image_id],
        )?;
    }
    Ok(())
}

pub fn requeue_processing_caption_jobs_for_folder(
    conn: &Connection,
    folder_id: i64,
) -> Result<usize> {
    conn.execute(
        "UPDATE caption_jobs
         SET status = 'pending', updated_at = datetime('now')
         WHERE status = 'processing'
           AND image_id IN (
               SELECT id FROM images WHERE folder_id = ?1
           )",
        [folder_id],
    )
    .map_err(Into::into)
}

pub fn clear_caption_jobs(conn: &Connection, folder_id: Option<i64>) -> Result<usize> {
    // Mirror the tagging worker pattern: mark in-flight rows as cancelled so
    // the worker can detect cancellation before writing results, then delete
    // every non-processing row immediately (pending, failed, etc.).
    match folder_id {
        Some(folder_id) => {
            conn.execute(
                "UPDATE caption_jobs
                 SET status = 'cancelled', last_error = NULL, updated_at = datetime('now')
                 WHERE status = 'processing'
                   AND image_id IN (SELECT id FROM images WHERE folder_id = ?1)",
                [folder_id],
            )?;
            let deleted = conn.execute(
                "DELETE FROM caption_jobs
                 WHERE status NOT IN ('processing', 'cancelled')
                   AND image_id IN (SELECT id FROM images WHERE folder_id = ?1)",
                [folder_id],
            )?;
            conn.execute(
                "UPDATE images
                 SET caption_error = NULL
                 WHERE folder_id = ?1
                   AND generated_caption IS NULL",
                [folder_id],
            )?;
            Ok(deleted)
        }
        None => {
            conn.execute(
                "UPDATE caption_jobs
                 SET status = 'cancelled', last_error = NULL, updated_at = datetime('now')
                 WHERE status = 'processing'",
                [],
            )?;
            let deleted = conn.execute(
                "DELETE FROM caption_jobs WHERE status NOT IN ('processing', 'cancelled')",
                [],
            )?;
            conn.execute(
                "UPDATE images
                 SET caption_error = NULL
                 WHERE generated_caption IS NULL",
                [],
            )?;
            Ok(deleted)
        }
    }
}

pub fn is_caption_job_cancelled(conn: &Connection, image_id: i64) -> Result<bool> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM caption_jobs WHERE image_id = ?1 AND status = 'cancelled'",
        [image_id],
        |row| row.get(0),
    )?;
    Ok(count > 0)
}

pub fn reset_generated_captions(conn: &Connection, folder_id: Option<i64>) -> Result<usize> {
    let image_ids = match folder_id {
        Some(folder_id) => {
            let mut stmt = conn.prepare(
                "SELECT id FROM images WHERE folder_id = ?1 AND generated_caption IS NOT NULL",
            )?;
            let rows = stmt.query_map([folder_id], |row| row.get::<_, i64>(0))?;
            rows.collect::<rusqlite::Result<Vec<_>>>()?
        }
        None => {
            let mut stmt =
                conn.prepare("SELECT id FROM images WHERE generated_caption IS NOT NULL")?;
            let rows = stmt.query_map([], |row| row.get::<_, i64>(0))?;
            rows.collect::<rusqlite::Result<Vec<_>>>()?
        }
    };

    let tx = conn.unchecked_transaction()?;
    for image_id in &image_ids {
        vector::delete_caption_embedding(&tx, *image_id)?;
    }

    match folder_id {
        Some(folder_id) => {
            tx.execute(
                "UPDATE images
                 SET generated_caption = NULL,
                     caption_model = NULL,
                     caption_updated_at = NULL,
                     caption_error = NULL
                 WHERE folder_id = ?1",
                [folder_id],
            )?;
            tx.execute(
                "DELETE FROM caption_jobs
                 WHERE image_id IN (SELECT id FROM images WHERE folder_id = ?1)",
                [folder_id],
            )?;
        }
        None => {
            tx.execute(
                "UPDATE images
                 SET generated_caption = NULL,
                     caption_model = NULL,
                     caption_updated_at = NULL,
                     caption_error = NULL",
                [],
            )?;
            tx.execute("DELETE FROM caption_jobs", [])?;
        }
    }

    tx.commit()?;
    Ok(image_ids.len())
}

pub fn enqueue_missing_caption_jobs_for_folder(conn: &Connection, folder_id: i64) -> Result<usize> {
    let inserted = conn.execute(
        "INSERT INTO caption_jobs (image_id, status, attempts, last_error, created_at, updated_at)
         SELECT id, 'pending', 0, NULL, datetime('now'), datetime('now')
         FROM images
         WHERE folder_id = ?1
           AND media_kind = 'image'
           AND generated_caption IS NULL
         ON CONFLICT(image_id) DO UPDATE SET
            status = 'pending',
            last_error = NULL,
            updated_at = datetime('now')",
        [folder_id],
    )?;
    conn.execute(
        "UPDATE images
         SET caption_error = NULL
         WHERE folder_id = ?1
           AND media_kind = 'image'
           AND generated_caption IS NULL",
        [folder_id],
    )?;
    Ok(inserted)
}

pub fn enqueue_missing_caption_jobs(conn: &Connection) -> Result<usize> {
    let inserted = conn.execute(
        "INSERT INTO caption_jobs (image_id, status, attempts, last_error, created_at, updated_at)
         SELECT id, 'pending', 0, NULL, datetime('now'), datetime('now')
         FROM images
         WHERE media_kind = 'image'
           AND generated_caption IS NULL
         ON CONFLICT(image_id) DO UPDATE SET
            status = 'pending',
            last_error = NULL,
            updated_at = datetime('now')",
        [],
    )?;
    conn.execute(
        "UPDATE images
         SET caption_error = NULL
         WHERE media_kind = 'image'
           AND generated_caption IS NULL",
        [],
    )?;
    Ok(inserted)
}

pub fn get_pending_embedding_jobs(
    conn: &Connection,
    excluded_folder_ids: &std::collections::HashSet<i64>,
    limit: usize,
) -> Result<Vec<EmbeddingJob>> {
    let sql = format!(
        "SELECT j.image_id, i.folder_id, i.path, i.thumbnail_path, i.media_kind,
                j.status, j.attempts, j.last_error, j.created_at, j.updated_at
         FROM embedding_jobs j
         JOIN images i ON i.id = j.image_id
         WHERE status = 'pending'
           {}
         ORDER BY j.updated_at, j.image_id
         LIMIT ?1",
        folder_exclusion_clause("i", excluded_folder_ids)
    );
    let mut stmt = conn.prepare(&sql)?;
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

pub fn claim_embedding_jobs(
    conn: &mut Connection,
    paused_folder_ids: &std::collections::HashSet<i64>,
    limit: usize,
) -> Result<Vec<EmbeddingJob>> {
    let tx = conn.transaction()?;
    let candidates = get_pending_embedding_jobs(&tx, paused_folder_ids, limit * 2)?;
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

fn get_pending_caption_jobs_excluding(
    conn: &Connection,
    excluded_folder_ids: &std::collections::HashSet<i64>,
    limit: usize,
) -> Result<Vec<CaptionJob>> {
    let sql = format!(
        "SELECT j.image_id, i.folder_id, i.path
         FROM caption_jobs j
         JOIN images i ON i.id = j.image_id
         WHERE j.status = 'pending'
           AND i.media_kind = 'image'
           AND i.generated_caption IS NULL
           {}
         ORDER BY j.updated_at, j.image_id
         LIMIT ?1",
        folder_exclusion_clause("i", excluded_folder_ids)
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([limit as i64], |row| {
        Ok(CaptionJob {
            image_id: row.get(0)?,
            folder_id: row.get(1)?,
            path: row.get(2)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn claim_caption_jobs(
    conn: &mut Connection,
    paused_folder_ids: &std::collections::HashSet<i64>,
    limit: usize,
) -> Result<Vec<CaptionJob>> {
    let tx = conn.transaction()?;
    let candidates = get_pending_caption_jobs_excluding(&tx, paused_folder_ids, limit * 2)?;
    let mut claimed = Vec::with_capacity(limit);

    for job in candidates {
        let updated = tx.execute(
            "UPDATE caption_jobs
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
    // Delete from sqlite-vec virtual tables outside the transaction — sqlite-vec
    // has known issues with transactional DML in early versions.
    for image_id in image_ids {
        vector::delete_embedding(conn, *image_id)?;
        vector::delete_caption_embedding(conn, *image_id)?;
    }
    let tx = conn.unchecked_transaction()?;
    for image_id in image_ids {
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

    let caption_pending = conn.query_row(
        "SELECT COUNT(*)
         FROM caption_jobs j
         JOIN images i ON i.id = j.image_id
         WHERE i.folder_id = ?1 AND j.status IN ('pending', 'processing')",
        [folder_id],
        |row| row.get(0),
    )?;

    let caption_ready = conn.query_row(
        "SELECT COUNT(*)
         FROM images
         WHERE folder_id = ?1 AND generated_caption IS NOT NULL",
        [folder_id],
        |row| row.get(0),
    )?;

    let caption_failed = conn.query_row(
        "SELECT COUNT(*)
         FROM caption_jobs j
         JOIN images i ON i.id = j.image_id
         WHERE i.folder_id = ?1 AND j.status = 'failed'",
        [folder_id],
        |row| row.get(0),
    )?;

    let tagging_pending = conn.query_row(
        "SELECT COUNT(*)
         FROM tagging_jobs j
         JOIN images i ON i.id = j.image_id
         WHERE i.folder_id = ?1 AND j.status IN ('pending', 'processing')",
        [folder_id],
        |row| row.get(0),
    )?;

    let tagging_ready = conn.query_row(
        "SELECT COUNT(*)
         FROM images
         WHERE folder_id = ?1 AND ai_tagged_at IS NOT NULL",
        [folder_id],
        |row| row.get(0),
    )?;

    let tagging_failed = conn.query_row(
        "SELECT COUNT(*)
         FROM tagging_jobs j
         JOIN images i ON i.id = j.image_id
         WHERE i.folder_id = ?1 AND j.status = 'failed'",
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
        caption_pending,
        caption_ready,
        caption_failed,
        tagging_pending,
        tagging_ready,
        tagging_failed,
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

fn get_pending_thumbnail_jobs_excluding(
    conn: &Connection,
    excluded_folder_ids: &std::collections::HashSet<i64>,
    limit: usize,
) -> Result<Vec<ThumbnailJob>> {
    let sql = format!(
        "SELECT j.image_id, i.folder_id, i.path, i.media_kind
         FROM thumbnail_jobs j
         JOIN images i ON i.id = j.image_id
         WHERE j.status = 'pending'
           {}
         ORDER BY j.updated_at, j.image_id
         LIMIT ?1",
        folder_exclusion_clause("i", excluded_folder_ids)
    );
    let mut stmt = conn.prepare(&sql)?;
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
    paused_folder_ids: &std::collections::HashSet<i64>,
    fetch_limit: usize,
    claim_limit: usize,
) -> Result<Vec<ThumbnailJob>> {
    let tx = conn.transaction()?;
    let excluded_folder_ids = active_folder_ids
        .union(paused_folder_ids)
        .copied()
        .collect::<std::collections::HashSet<_>>();
    let candidates = get_pending_thumbnail_jobs_excluding(&tx, &excluded_folder_ids, fetch_limit)?;
    let mut claimed = Vec::with_capacity(claim_limit);

    for job in candidates {
        debug_assert!(!excluded_folder_ids.contains(&job.folder_id));
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

fn get_pending_metadata_jobs_excluding(
    conn: &Connection,
    excluded_folder_ids: &std::collections::HashSet<i64>,
    limit: usize,
) -> Result<Vec<MetadataJob>> {
    let sql = format!(
        "SELECT j.image_id, i.folder_id, i.path
         FROM metadata_jobs j
         JOIN images i ON i.id = j.image_id
         WHERE j.status = 'pending' AND i.media_kind = 'video'
           {}
         ORDER BY j.updated_at, j.image_id
         LIMIT ?1",
        folder_exclusion_clause("i", excluded_folder_ids)
    );
    let mut stmt = conn.prepare(&sql)?;
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
    paused_folder_ids: &std::collections::HashSet<i64>,
    fetch_limit: usize,
    claim_limit: usize,
) -> Result<Vec<MetadataJob>> {
    let tx = conn.transaction()?;
    let excluded_folder_ids = active_folder_ids
        .union(paused_folder_ids)
        .copied()
        .collect::<std::collections::HashSet<_>>();
    let candidates = get_pending_metadata_jobs_excluding(&tx, &excluded_folder_ids, fetch_limit)?;
    let mut claimed = Vec::with_capacity(claim_limit);

    for job in candidates {
        debug_assert!(!excluded_folder_ids.contains(&job.folder_id));
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
                favorite, rating, embedding_status, embedding_model, embedding_updated_at, embedding_error,
                generated_caption, caption_model, caption_updated_at, caption_error,
                ai_rating, ai_tagger_model, ai_tagged_at, ai_tagger_error
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
                favorite, rating, embedding_status, embedding_model, embedding_updated_at, embedding_error,
                generated_caption, caption_model, caption_updated_at, caption_error,
                ai_rating, ai_tagger_model, ai_tagged_at, ai_tagger_error
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
        match get_image_by_id(conn, *image_id) {
            Ok(image) => images.push(image),
            Err(error) if is_query_returned_no_rows(&error) => {}
            Err(error) => return Err(error),
        }
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
    rating_min: i64,
    embedding_failed_only: bool,
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
        "rating_asc" => "rating ASC, modified_at DESC NULLS LAST",
        "rating_desc" => "rating DESC, modified_at DESC NULLS LAST",
        "duration_asc" => "duration_ms ASC NULLS LAST",
        "duration_desc" => "duration_ms DESC NULLS LAST",
        _ => "modified_at DESC NULLS LAST",
    };

    let search_pattern = search.map(|value| format!("%{}%", value));
    let favorites_flag = i64::from(favorites_only);
    let embedding_failed_flag = i64::from(embedding_failed_only);
    let sql = format!(
        "SELECT id, folder_id, path, filename, thumbnail_path, width, height, file_size, created_at, modified_at, mime_type,
                media_kind, duration_ms, video_codec, audio_codec, metadata_updated_at, metadata_error,
                favorite, rating, embedding_status, embedding_model, embedding_updated_at, embedding_error,
                generated_caption, caption_model, caption_updated_at, caption_error,
                ai_rating, ai_tagger_model, ai_tagged_at, ai_tagger_error
         FROM images
         WHERE (?1 IS NULL OR folder_id = ?1)
           AND (?2 IS NULL OR filename LIKE ?2)
           AND (?3 IS NULL OR media_kind = ?3)
           AND (?4 = 0 OR favorite = 1)
           AND rating >= ?5
           AND (?6 = 0 OR embedding_status = 'failed')
         ORDER BY {}
         LIMIT ?7 OFFSET ?8",
        order
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(
        params![
            folder_id,
            search_pattern,
            media_kind,
            favorites_flag,
            rating_min,
            embedding_failed_flag,
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
    rating_min: i64,
    embedding_failed_only: bool,
) -> Result<i64> {
    let search_pattern = search.map(|value| format!("%{}%", value));

    let favorites_flag = i64::from(favorites_only);
    let embedding_failed_flag = i64::from(embedding_failed_only);
    let count = conn.query_row(
        "SELECT COUNT(*) FROM images
         WHERE (?1 IS NULL OR folder_id = ?1)
           AND (?2 IS NULL OR filename LIKE ?2)
           AND (?3 IS NULL OR media_kind = ?3)
           AND (?4 = 0 OR favorite = 1)
           AND rating >= ?5
           AND (?6 = 0 OR embedding_status = 'failed')",
        params![
            folder_id,
            search_pattern,
            media_kind,
            favorites_flag,
            rating_min,
            embedding_failed_flag
        ],
        |row| row.get(0),
    )?;

    Ok(count)
}

pub fn search_images_by_tag(
    conn: &Connection,
    query: &str,
    folder_id: Option<i64>,
    media_kind: Option<&str>,
    favorites_only: bool,
    rating_min: i64,
    limit: usize,
) -> Result<Vec<ImageRecord>> {
    let normalized_query = query.trim().to_ascii_lowercase();
    if normalized_query.is_empty() {
        return Ok(Vec::new());
    }
    let favorites_flag = i64::from(favorites_only);

    let mut stmt = conn.prepare(
        "SELECT DISTINCT i.id
         FROM images i
         JOIN image_tags t ON t.image_id = i.id
         WHERE (?1 IS NULL OR i.folder_id = ?1)
           AND (?2 IS NULL OR i.media_kind = ?2)
           AND (?3 = 0 OR i.favorite = 1)
           AND i.rating >= ?4
           AND LOWER(TRIM(t.tag)) = ?5
         ORDER BY i.rating DESC, i.modified_at DESC NULLS LAST, i.filename ASC
         LIMIT ?6",
    )?;

    let image_ids = stmt
        .query_map(
            params![
                folder_id,
                media_kind,
                favorites_flag,
                rating_min,
                normalized_query,
                limit as i64
            ],
            |row| row.get::<_, i64>(0),
        )?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    get_images_by_ids(conn, &image_ids)
}

pub fn search_tags_autocomplete(
    conn: &Connection,
    query: &str,
    folder_id: Option<i64>,
    limit: usize,
) -> Result<Vec<ExploreTagEntry>> {
    let pattern = format!("%{}%", query.to_lowercase());
    let mut stmt = conn.prepare(
        "SELECT t.tag, COUNT(DISTINCT t.image_id) AS tag_count, MIN(t.image_id) AS representative_image_id
         FROM image_tags t
         JOIN images i ON i.id = t.image_id
         WHERE (?1 IS NULL OR i.folder_id = ?1)
           AND LOWER(t.tag) LIKE ?2
         GROUP BY t.tag
         ORDER BY tag_count DESC, t.tag ASC
         LIMIT ?3",
    )?;
    let rows = stmt
        .query_map(params![folder_id, pattern, limit as i64], |row| {
            Ok(ExploreTagEntry {
                tag: row.get(0)?,
                count: row.get(1)?,
                representative_image_id: row.get(2)?,
                thumbnail_path: None, // skip per-suggestion thumbnail for speed
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

pub struct ImagePathRecord {
    pub id: i64,
    pub path: String,
    pub thumbnail_path: Option<String>,
}

pub fn get_all_image_paths(
    conn: &Connection,
    folder_id: Option<i64>,
) -> Result<Vec<ImagePathRecord>> {
    let mut stmt = conn.prepare(
        "SELECT id, path, thumbnail_path FROM images WHERE (?1 IS NULL OR folder_id = ?1) ORDER BY id",
    )?;
    let rows = stmt
        .query_map(params![folder_id], |row| {
            Ok(ImagePathRecord {
                id: row.get(0)?,
                path: row.get(1)?,
                thumbnail_path: row.get(2)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

pub fn get_explore_tags(
    conn: &Connection,
    folder_id: Option<i64>,
    limit: usize,
) -> Result<Vec<ExploreTagEntry>> {
    let mut stmt = conn.prepare(
        "SELECT t.tag, COUNT(DISTINCT t.image_id) AS tag_count, MIN(t.image_id) AS representative_image_id
         FROM image_tags t
         JOIN images i ON i.id = t.image_id
         WHERE (?1 IS NULL OR i.folder_id = ?1)
         GROUP BY t.tag
         HAVING COUNT(DISTINCT t.image_id) >= 1
         ORDER BY tag_count DESC, t.tag ASC
         LIMIT ?2",
    )?;

    let rows = stmt
        .query_map(params![folder_id, limit as i64], |row| {
            let representative_image_id = row.get::<_, i64>(2)?;
            let thumbnail_path = get_image_by_id(conn, representative_image_id)
                .ok()
                .and_then(|image| image.thumbnail_path);

            Ok(ExploreTagEntry {
                tag: row.get(0)?,
                count: row.get(1)?,
                representative_image_id,
                thumbnail_path,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    Ok(rows)
}

pub fn get_failed_embedding_images(
    conn: &Connection,
    folder_id: i64,
) -> Result<Vec<(i64, String, Option<String>)>> {
    let mut stmt = conn.prepare(
        "SELECT id, filename, embedding_error
         FROM images
         WHERE folder_id = ?1 AND embedding_status = 'failed'
         ORDER BY filename",
    )?;
    let rows = stmt.query_map([folder_id], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, Option<String>>(2)?,
        ))
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn update_generated_caption(
    conn: &Connection,
    image_id: i64,
    caption: &str,
    model: &str,
) -> Result<ImageRecord> {
    conn.execute(
        "UPDATE images
         SET generated_caption = ?2,
             caption_model = ?3,
             caption_updated_at = datetime('now'),
             caption_error = NULL
         WHERE id = ?1",
        params![image_id, caption, model],
    )?;
    conn.execute("DELETE FROM caption_jobs WHERE image_id = ?1", [image_id])?;
    get_image_by_id(conn, image_id)
}

pub fn mark_caption_failed(conn: &Connection, image_id: i64, error: &str) -> Result<()> {
    conn.execute(
        "UPDATE images
         SET caption_error = ?2
         WHERE id = ?1",
        params![image_id, error],
    )?;
    conn.execute(
        "UPDATE caption_jobs
         SET status = 'failed', last_error = ?2, updated_at = datetime('now')
         WHERE image_id = ?1",
        params![image_id, error],
    )?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Tagging jobs
// ---------------------------------------------------------------------------

pub fn enqueue_tagging_job(conn: &Connection, image_id: i64) -> Result<()> {
    conn.execute(
        "INSERT INTO tagging_jobs (image_id, status, attempts, last_error, created_at, updated_at)
         VALUES (?1, 'pending', 0, NULL, datetime('now'), datetime('now'))
         ON CONFLICT(image_id) DO UPDATE SET
            status = CASE WHEN status != 'processing' THEN 'pending' ELSE status END,
            last_error = CASE WHEN status != 'processing' THEN NULL ELSE last_error END,
            updated_at = datetime('now')",
        [image_id],
    )?;
    Ok(())
}

pub fn claim_tagging_jobs(
    conn: &mut Connection,
    paused_folder_ids: &std::collections::HashSet<i64>,
    limit: usize,
) -> Result<Vec<TaggingJob>> {
    let tx = conn.transaction()?;
    let candidates = get_pending_tagging_jobs_excluding(&tx, paused_folder_ids, limit * 2)?;
    let mut claimed = Vec::new();
    for job in candidates {
        let updated = tx.execute(
            "UPDATE tagging_jobs
             SET status = 'processing', attempts = attempts + 1, updated_at = datetime('now')
             WHERE image_id = ?1 AND status = 'pending'",
            [job.image_id],
        )?;
        if updated > 0 {
            claimed.push(job);
            if claimed.len() >= limit {
                break;
            }
        }
    }
    tx.commit()?;
    Ok(claimed)
}

fn get_pending_tagging_jobs_excluding(
    conn: &Connection,
    paused_folder_ids: &std::collections::HashSet<i64>,
    limit: usize,
) -> Result<Vec<TaggingJob>> {
    let sql = format!(
        "SELECT j.image_id, i.folder_id, i.path
         FROM tagging_jobs j
         JOIN images i ON i.id = j.image_id
         WHERE j.status = 'pending'
           {}
         ORDER BY j.created_at ASC
         LIMIT ?1",
        folder_exclusion_clause("i", paused_folder_ids)
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt
        .query_map([limit as i64], |row| {
            Ok(TaggingJob {
                image_id: row.get(0)?,
                folder_id: row.get(1)?,
                path: row.get(2)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

pub fn update_ai_tags(
    conn: &Connection,
    image_id: i64,
    tags: &[(String, f64)],
    rating: &str,
    model: &str,
) -> Result<()> {
    // NOTE: callers are responsible for wrapping this in a transaction.
    // Do NOT open a nested transaction here — rusqlite/SQLite do not support
    // nested transactions and will error with "cannot start a transaction
    // within a transaction".

    // Remove previous AI tags for this image before inserting fresh ones
    conn.execute(
        "DELETE FROM image_tags WHERE image_id = ?1 AND source = 'ai'",
        [image_id],
    )?;

    let mut stmt = conn.prepare(
        "INSERT INTO image_tags (image_id, tag, source, ai_model, confidence, created_at)
         VALUES (?1, ?2, 'ai', ?3, ?4, datetime('now'))
         ON CONFLICT(image_id, tag) DO UPDATE SET
            source = 'ai',
            ai_model = excluded.ai_model,
            confidence = excluded.confidence
         WHERE source != 'user'",
    )?;
    for (tag, confidence) in tags {
        stmt.execute(params![image_id, tag, model, confidence])?;
    }
    drop(stmt);

    conn.execute(
        "UPDATE images
         SET ai_rating = ?2,
             ai_tagger_model = ?3,
             ai_tagged_at = datetime('now'),
             ai_tagger_error = NULL
         WHERE id = ?1",
        params![image_id, rating, model],
    )?;
    conn.execute("DELETE FROM tagging_jobs WHERE image_id = ?1", [image_id])?;
    Ok(())
}

pub fn mark_tagging_failed(conn: &Connection, image_id: i64, error: &str) -> Result<()> {
    conn.execute(
        "UPDATE images SET ai_tagger_error = ?2 WHERE id = ?1",
        params![image_id, error],
    )?;
    conn.execute(
        "UPDATE tagging_jobs
         SET status = 'failed', last_error = ?2, updated_at = datetime('now')
         WHERE image_id = ?1",
        params![image_id, error],
    )?;
    Ok(())
}

pub fn clear_tagging_jobs(conn: &Connection, folder_id: Option<i64>) -> Result<usize> {
    // Rows currently being processed by the worker must not be deleted mid-flight
    // — the worker holds a reference and will write results back after inference.
    // Mark them 'cancelled' so the worker discards the result instead of saving it,
    // then delete every non-processing row.  On the next poll the worker will find
    // no pending work and the queue will appear empty.
    let deleted = match folder_id {
        Some(fid) => {
            conn.execute(
                "UPDATE tagging_jobs
                 SET status = 'cancelled', last_error = NULL, updated_at = datetime('now')
                 WHERE status = 'processing'
                   AND image_id IN (SELECT id FROM images WHERE folder_id = ?1)",
                [fid],
            )?;
            let n = conn.execute(
                "DELETE FROM tagging_jobs
                 WHERE status NOT IN ('processing', 'cancelled')
                   AND image_id IN (SELECT id FROM images WHERE folder_id = ?1)",
                [fid],
            )?;
            conn.execute(
                "UPDATE images
                 SET ai_tagger_error = NULL
                 WHERE folder_id = ?1 AND ai_tagged_at IS NULL",
                [fid],
            )?;
            n
        }
        None => {
            conn.execute(
                "UPDATE tagging_jobs
                 SET status = 'cancelled', last_error = NULL, updated_at = datetime('now')
                 WHERE status = 'processing'",
                [],
            )?;
            let n = conn.execute("DELETE FROM tagging_jobs WHERE status NOT IN ('processing', 'cancelled')", [])?;
            conn.execute(
                "UPDATE images SET ai_tagger_error = NULL WHERE ai_tagged_at IS NULL",
                [],
            )?;
            n
        }
    };
    Ok(deleted)
}

pub fn get_image_tags(conn: &Connection, image_id: i64) -> Result<Vec<ImageTag>> {
    let mut stmt = conn.prepare(
        "SELECT id, image_id, tag, source, ai_model, confidence, created_at
         FROM image_tags
         WHERE image_id = ?1
         ORDER BY source DESC, confidence DESC NULLS LAST, tag ASC",
    )?;
    let rows = stmt
        .query_map([image_id], |row| {
            Ok(ImageTag {
                id: row.get(0)?,
                image_id: row.get(1)?,
                tag: row.get(2)?,
                source: row.get(3)?,
                ai_model: row.get(4)?,
                confidence: row.get(5)?,
                created_at: row.get(6)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

pub fn add_user_tag(conn: &Connection, image_id: i64, tag: &str) -> Result<ImageTag> {
    conn.execute(
        "INSERT INTO image_tags (image_id, tag, source, ai_model, confidence, created_at)
         VALUES (?1, ?2, 'user', NULL, NULL, datetime('now'))
         ON CONFLICT(image_id, tag) DO NOTHING",
        params![image_id, tag],
    )?;
    let row = conn.query_row(
        "SELECT id, image_id, tag, source, ai_model, confidence, created_at
         FROM image_tags WHERE image_id = ?1 AND tag = ?2",
        params![image_id, tag],
        |row| {
            Ok(ImageTag {
                id: row.get(0)?,
                image_id: row.get(1)?,
                tag: row.get(2)?,
                source: row.get(3)?,
                ai_model: row.get(4)?,
                confidence: row.get(5)?,
                created_at: row.get(6)?,
            })
        },
    )?;
    Ok(row)
}

pub fn remove_tag(conn: &Connection, tag_id: i64) -> Result<()> {
    conn.execute("DELETE FROM image_tags WHERE id = ?1", [tag_id])?;
    Ok(())
}

pub fn enqueue_missing_tagging_jobs_for_folder(conn: &Connection, folder_id: i64) -> Result<usize> {
    let inserted = conn.execute(
        "INSERT INTO tagging_jobs (image_id, status, attempts, last_error, created_at, updated_at)
         SELECT id, 'pending', 0, NULL, datetime('now'), datetime('now')
         FROM images
         WHERE folder_id = ?1
           AND media_kind = 'image'
           AND ai_tagged_at IS NULL
         ON CONFLICT(image_id) DO UPDATE SET
            -- Only reset to 'pending' if the row is not currently being
            -- processed or cancelled; leave 'processing' rows untouched so
            -- the worker can complete them and clean up normally.
            status = CASE WHEN status NOT IN ('processing', 'cancelled') THEN 'pending' ELSE status END,
            last_error = CASE WHEN status != 'processing' THEN NULL ELSE last_error END,
            updated_at = datetime('now')",
        [folder_id],
    )?;
    conn.execute(
        "UPDATE images
         SET ai_tagger_error = NULL
         WHERE folder_id = ?1
           AND media_kind = 'image'
           AND ai_tagged_at IS NULL",
        [folder_id],
    )?;
    Ok(inserted)
}

pub fn requeue_processing_tagging_jobs_for_folder(conn: &Connection, folder_id: i64) -> Result<()> {
    conn.execute(
        "UPDATE tagging_jobs
         SET status = 'pending', updated_at = datetime('now')
         WHERE status = 'processing'
           AND image_id IN (SELECT id FROM images WHERE folder_id = ?1)",
        [folder_id],
    )?;
    Ok(())
}

/// Returns `true` when the job row for `image_id` currently has status = 'cancelled'.
/// Used by the worker to discard inference results for jobs that were cancelled
/// while inference was running.
pub fn is_tagging_job_cancelled(conn: &Connection, image_id: i64) -> Result<bool> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM tagging_jobs WHERE image_id = ?1 AND status = 'cancelled'",
        [image_id],
        |row| row.get(0),
    )?;
    Ok(count > 0)
}

pub fn requeue_tagging_jobs(conn: &Connection, image_ids: &[i64]) -> Result<()> {
    for image_id in image_ids {
        conn.execute(
            "UPDATE tagging_jobs
             SET status = 'pending', updated_at = datetime('now')
             WHERE image_id = ?1 AND status = 'processing'",
            [image_id],
        )?;
    }
    Ok(())
}

pub fn suggest_tags_from_caption(
    conn: &Connection,
    image_id: i64,
    limit: usize,
) -> Result<Vec<String>> {
    let caption = conn.query_row(
        "SELECT generated_caption FROM images WHERE id = ?1",
        [image_id],
        |row| row.get::<_, Option<String>>(0),
    )?;

    Ok(caption
        .as_deref()
        .map(|caption| derive_caption_tags(caption, limit))
        .unwrap_or_default())
}

pub fn delete_folder(conn: &Connection, folder_id: i64) -> Result<()> {
    let image_ids = {
        let mut stmt = conn.prepare("SELECT id FROM images WHERE folder_id = ?1")?;
        let rows = stmt
            .query_map([folder_id], |row| row.get::<_, i64>(0))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        rows
    };

    let tx = conn.unchecked_transaction()?;
    for image_id in image_ids {
        vector::delete_embedding(&tx, image_id)?;
        vector::delete_caption_embedding(&tx, image_id)?;
    }
    tx.execute("DELETE FROM folders WHERE id = ?1", params![folder_id])?;
    tx.commit()?;
    Ok(())
}

fn derive_caption_tags(caption: &str, limit: usize) -> Vec<String> {
    const STOPWORDS: &[&str] = &[
        "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "into", "is", "it",
        "near", "of", "on", "or", "the", "to", "with", "without", "image", "photo", "picture",
        "showing", "shows", "there", "this", "that", "over", "under",
    ];

    let stopwords = STOPWORDS
        .iter()
        .copied()
        .collect::<std::collections::HashSet<_>>();
    let mut tags = Vec::new();
    for word in caption
        .split(|ch: char| !ch.is_alphanumeric())
        .map(|word| word.trim().to_lowercase())
        .filter(|word| word.len() >= 3 && !stopwords.contains(word.as_str()))
    {
        if !tags.contains(&word) {
            tags.push(word);
        }
        if tags.len() >= limit {
            break;
        }
    }
    tags
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
        generated_caption: row.get(23)?,
        caption_model: row.get(24)?,
        caption_updated_at: row.get(25)?,
        caption_error: row.get(26)?,
        ai_rating: row.get(27)?,
        ai_tagger_model: row.get(28)?,
        ai_tagged_at: row.get(29)?,
        ai_tagger_error: row.get(30)?,
    })
}

/// Returns cached tag-cloud entries if the stored hash matches `current_hash`.
pub fn get_tag_cloud_cache(
    conn: &Connection,
    folder_scope: &str,
    current_hash: u64,
) -> Result<Option<String>> {
    let result: rusqlite::Result<(i64, String)> = conn.query_row(
        "SELECT image_ids_hash, entries_json FROM tag_cloud_cache WHERE folder_scope = ?1",
        params![folder_scope],
        |row| Ok((row.get(0)?, row.get(1)?)),
    );
    match result {
        Ok((stored_hash, json)) if stored_hash as u64 == current_hash => Ok(Some(json)),
        Ok(_) => Ok(None),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

/// Upserts the tag-cloud cache for the given scope.
pub fn set_tag_cloud_cache(
    conn: &Connection,
    folder_scope: &str,
    image_ids_hash: u64,
    entries_json: &str,
) -> Result<()> {
    conn.execute(
        "INSERT INTO tag_cloud_cache (folder_scope, image_ids_hash, entries_json, created_at)
         VALUES (?1, ?2, ?3, datetime('now'))
         ON CONFLICT(folder_scope) DO UPDATE SET
             image_ids_hash = excluded.image_ids_hash,
             entries_json   = excluded.entries_json,
             created_at     = excluded.created_at",
        params![folder_scope, image_ids_hash as i64, entries_json],
    )?;
    Ok(())
}

/// Returns (groups_json, scanned_at_unix) for the given folder scope, if present.
pub fn get_duplicate_scan_cache(
    conn: &Connection,
    folder_scope: &str,
) -> Result<Option<(String, i64)>> {
    match conn.query_row(
        "SELECT groups_json, scanned_at FROM duplicate_scan_cache WHERE folder_scope = ?1",
        params![folder_scope],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)),
    ) {
        Ok(row) => Ok(Some(row)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

/// Upserts the duplicate scan cache for the given scope.
pub fn set_duplicate_scan_cache(
    conn: &Connection,
    folder_scope: &str,
    groups_json: &str,
) -> Result<()> {
    let scanned_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    conn.execute(
        "INSERT INTO duplicate_scan_cache (folder_scope, scanned_at, groups_json)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(folder_scope) DO UPDATE SET
             scanned_at  = excluded.scanned_at,
             groups_json = excluded.groups_json",
        params![folder_scope, scanned_at, groups_json],
    )?;
    Ok(())
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

fn is_query_returned_no_rows(error: &anyhow::Error) -> bool {
    error
        .downcast_ref::<rusqlite::Error>()
        .is_some_and(|error| matches!(error, rusqlite::Error::QueryReturnedNoRows))
}

fn folder_exclusion_clause(
    image_alias: &str,
    excluded_folder_ids: &std::collections::HashSet<i64>,
) -> String {
    if excluded_folder_ids.is_empty() {
        return String::new();
    }

    let mut ids = excluded_folder_ids.iter().copied().collect::<Vec<_>>();
    ids.sort_unstable();
    let id_list = ids
        .into_iter()
        .map(|id| id.to_string())
        .collect::<Vec<_>>()
        .join(",");
    format!("AND {}.folder_id NOT IN ({})", image_alias, id_list)
}
