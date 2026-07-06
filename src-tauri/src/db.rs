use crate::{ai_tag_filter, vector};
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
    pub scan_error: Option<String>,
    pub sort_order: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Album {
    pub id: i64,
    pub name: String,
    pub cover_image_id: Option<i64>,
    pub cover_thumbnail_path: Option<String>,
    pub image_count: i64,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
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
    pub taken_at: Option<String>,
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

// Caption worker disabled (lib.rs) — kept for future re-enabling.
#[allow(dead_code)]
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
    pub thumbnail_path: Option<String>,
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
    pub has_ai_source: bool,
    pub has_user_source: bool,
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
            indexed_at  TEXT,
            scan_error  TEXT
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

        CREATE TABLE IF NOT EXISTS visual_cluster_cache (
            folder_scope    TEXT PRIMARY KEY,
            image_ids_hash  INTEGER NOT NULL,
            entries_json    TEXT NOT NULL,
            created_at      TEXT NOT NULL DEFAULT (datetime('now'))
        );
        -- Renamed from the misnamed tag_cloud_cache (it caches visual clusters,
        -- not tags). The cache is disposable and was already invalidated by a
        -- cluster-algorithm version bump, so the old table is simply dropped.
        DROP TABLE IF EXISTS tag_cloud_cache;

        CREATE TABLE IF NOT EXISTS duplicate_scan_cache (
            folder_scope    TEXT PRIMARY KEY,
            scanned_at      INTEGER NOT NULL,
            groups_json     TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS app_kv (
            key   TEXT PRIMARY KEY,
            value INTEGER NOT NULL DEFAULT 0
        );

        INSERT OR IGNORE INTO app_kv (key, value) VALUES ('embedding_revision', 0);

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
        CREATE INDEX IF NOT EXISTS idx_image_tags_tag_image_id ON image_tags(tag, image_id);

        CREATE TABLE IF NOT EXISTS albums (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            name           TEXT NOT NULL,
            cover_image_id INTEGER REFERENCES images(id) ON DELETE SET NULL,
            sort_order     INTEGER NOT NULL DEFAULT 0,
            -- Forward-compat for smart albums (saved searches); unused in v1.
            -- 'manual' = a curated set held in album_images.
            kind           TEXT NOT NULL DEFAULT 'manual',
            query_json     TEXT,
            created_at     TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS album_images (
            album_id   INTEGER NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
            image_id   INTEGER NOT NULL REFERENCES images(id) ON DELETE CASCADE,
            position   INTEGER NOT NULL DEFAULT 0,
            added_at   TEXT NOT NULL DEFAULT (datetime('now')),
            PRIMARY KEY (album_id, image_id)
        );

        CREATE INDEX IF NOT EXISTS idx_album_images_album ON album_images(album_id);
        CREATE INDEX IF NOT EXISTS idx_album_images_image ON album_images(image_id);

        CREATE TABLE IF NOT EXISTS image_colors (
            image_id INTEGER NOT NULL REFERENCES images(id) ON DELETE CASCADE,
            idx      INTEGER NOT NULL,
            r        INTEGER NOT NULL,
            g        INTEGER NOT NULL,
            b        INTEGER NOT NULL,
            weight   REAL NOT NULL,
            PRIMARY KEY (image_id, idx)
        );
        CREATE INDEX IF NOT EXISTS idx_image_colors_image ON image_colors(image_id);
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
    ensure_column(conn, "images", "taken_at", "TEXT")?;
    // Index must be created after ensure_column adds the column; it cannot live
    // in the execute_batch above because that batch runs before the column exists
    // on databases that predate Phase 1.
    conn.execute_batch("CREATE INDEX IF NOT EXISTS idx_images_taken_at ON images(taken_at);")?;
    ensure_column(conn, "folders", "scan_error", "TEXT")?;
    ensure_column(conn, "folders", "sort_order", "INTEGER NOT NULL DEFAULT 0")?;
    conn.execute(
        "UPDATE folders SET sort_order = id WHERE sort_order = 0",
        [],
    )?;

    vector::migrate(conn)?;
    remove_filtered_ai_tags(conn)?;
    Ok(())
}

fn remove_filtered_ai_tags(conn: &Connection) -> Result<()> {
    let mut stmt = conn.prepare("SELECT id, tag FROM image_tags WHERE source = 'ai'")?;
    let filtered_ids = stmt
        .query_map([], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
        })?
        .filter_map(|row| match row {
            Ok((id, tag)) if ai_tag_filter::is_removed_ai_tag(&tag) => Some(Ok(id)),
            Ok(_) => None,
            Err(error) => Some(Err(error)),
        })
        .collect::<rusqlite::Result<Vec<_>>>()?;
    drop(stmt);

    if filtered_ids.is_empty() {
        return Ok(());
    }

    let tx = conn.unchecked_transaction()?;
    {
        let mut delete_stmt = tx.prepare("DELETE FROM image_tags WHERE id = ?1")?;
        for id in &filtered_ids {
            delete_stmt.execute([id])?;
        }
    }
    tx.execute("DELETE FROM visual_cluster_cache", [])?;
    tx.commit()?;

    log::info!(
        "Removed {} filtered AI tag(s) from existing library data",
        filtered_ids.len()
    );
    Ok(())
}

pub fn insert_folder(conn: &Connection, path: &str, name: &str) -> Result<i64> {
    conn.execute(
        "INSERT OR IGNORE INTO folders (path, name, sort_order)
         VALUES (?1, ?2, COALESCE((SELECT MAX(sort_order) + 1 FROM folders), 1))",
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
        "INSERT INTO images (folder_id, path, filename, thumbnail_path, width, height, file_size, created_at, modified_at, taken_at, mime_type, media_kind, duration_ms, video_codec, audio_codec, metadata_updated_at, metadata_error, favorite, rating, embedding_status, embedding_model, embedding_updated_at, embedding_error, generated_caption, caption_model, caption_updated_at, caption_error, ai_rating, ai_tagger_model, ai_tagged_at, ai_tagger_error)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30, ?31)
         ON CONFLICT(path) DO UPDATE SET
            folder_id = excluded.folder_id,
            filename = excluded.filename,
            thumbnail_path = excluded.thumbnail_path,
            width = excluded.width,
            height = excluded.height,
            file_size = excluded.file_size,
            created_at = excluded.created_at,
            modified_at = excluded.modified_at,
            taken_at = excluded.taken_at,
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
            img.taken_at,
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

/// Full semantic-index rebuild: recreate the vector tables at the current model
/// dimension and re-queue every image for embedding. Used by the maintenance
/// action when the index is stale or its dimension no longer matches the model
/// (which otherwise surfaces as a "dimension mismatch" search error). Returns the
/// number of images re-queued.
pub fn reset_all_embeddings(conn: &Connection) -> Result<usize> {
    // Recreate the vector tables at the current model dimension first (DDL, kept
    // out of the transaction below). The caller holds the DB write lock, so the
    // embedding worker can't interleave a write between this and the queue reset.
    vector::rebuild_tables(conn)?;
    let tx = conn.unchecked_transaction()?;
    tx.execute(
        "UPDATE images
         SET embedding_status = 'pending',
             embedding_model = NULL,
             embedding_updated_at = NULL,
             embedding_error = NULL",
        [],
    )?;
    tx.execute("DELETE FROM embedding_jobs", [])?;
    let queued = tx.execute(
        "INSERT INTO embedding_jobs (image_id, status, attempts, last_error, created_at, updated_at)
         SELECT id, 'pending', 0, NULL, datetime('now'), datetime('now')
         FROM images",
        [],
    )?;
    tx.execute(
        "INSERT INTO app_kv (key, value) VALUES ('embedding_revision', 1)
         ON CONFLICT(key) DO UPDATE SET value = value + 1",
        [],
    )?;
    tx.commit()?;
    Ok(queued)
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

#[allow(dead_code)] // caption worker disabled (lib.rs)
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

#[allow(dead_code)] // caption worker disabled (lib.rs)
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
            // Mark in-flight jobs cancelled so the worker skips writing back;
            // delete all others.
            tx.execute(
                "UPDATE caption_jobs
                 SET status = 'cancelled', last_error = NULL, updated_at = datetime('now')
                 WHERE status = 'processing'
                   AND image_id IN (SELECT id FROM images WHERE folder_id = ?1)",
                [folder_id],
            )?;
            tx.execute(
                "DELETE FROM caption_jobs
                 WHERE status NOT IN ('processing', 'cancelled')
                   AND image_id IN (SELECT id FROM images WHERE folder_id = ?1)",
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
            // Same cancellation protocol as clear_caption_jobs.
            tx.execute(
                "UPDATE caption_jobs
                 SET status = 'cancelled', last_error = NULL, updated_at = datetime('now')
                 WHERE status = 'processing'",
                [],
            )?;
            tx.execute(
                "DELETE FROM caption_jobs WHERE status NOT IN ('processing', 'cancelled')",
                [],
            )?;
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
           AND NOT (i.media_kind = 'video' AND i.thumbnail_path IS NULL)
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

#[allow(dead_code)] // caption worker disabled (lib.rs)
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

#[allow(dead_code)] // caption worker disabled (lib.rs)
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
    // Advance the monotonic revision so the HNSW cache is always rebuilt after
    // any embedding change, regardless of clock resolution.
    conn.execute(
        "INSERT INTO app_kv (key, value) VALUES ('embedding_revision', 1)
         ON CONFLICT(key) DO UPDATE SET value = value + 1",
        [],
    )?;
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
    include_videos: bool,
    limit: usize,
) -> Result<Vec<ThumbnailJob>> {
    let sql = format!(
        "SELECT j.image_id, i.folder_id, i.path, i.media_kind
         FROM thumbnail_jobs j
         JOIN images i ON i.id = j.image_id
         WHERE j.status = 'pending'
           {}
           {}
         ORDER BY j.updated_at, j.image_id
         LIMIT ?1",
        media_kind_clause(include_videos),
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

/// Video and AVIF thumbnail jobs need FFmpeg; while it isn't provisioned they
/// must be invisible to both claiming and tier-priority checks, or pending
/// FFmpeg-backed jobs would stall every lower tier indefinitely.
fn media_kind_clause(include_videos: bool) -> &'static str {
    if include_videos {
        ""
    } else {
        "AND i.media_kind = 'image' AND lower(i.path) NOT GLOB '*.avif'"
    }
}

/// Escapes `%`, `_`, and `\` so a user-supplied string can be safely embedded
/// in a `LIKE` pattern (paired with `ESCAPE '\\'` in the query) without the
/// wildcards being interpreted literally.
fn escape_like_pattern(value: &str) -> String {
    value.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_")
}

/// True if any claimable (pending, non-excluded) jobs exist in `job_table`.
/// Used by lower-priority workers to defer to higher-priority queues.
/// `extra_predicate` narrows the image join (e.g. videos only for metadata).
fn has_claimable_jobs(
    conn: &Connection,
    job_table: &str,
    extra_predicate: &str,
    excluded_folder_ids: &std::collections::HashSet<i64>,
) -> Result<bool> {
    let sql = format!(
        "SELECT EXISTS(
             SELECT 1
             FROM {} j
             JOIN images i ON i.id = j.image_id
             WHERE j.status = 'pending'
               {}
               {}
         )",
        job_table,
        extra_predicate,
        folder_exclusion_clause("i", excluded_folder_ids)
    );
    Ok(conn.query_row(&sql, [], |row| row.get::<_, i64>(0))? != 0)
}

pub fn has_claimable_thumbnail_jobs(
    conn: &Connection,
    excluded_folder_ids: &std::collections::HashSet<i64>,
    include_videos: bool,
) -> Result<bool> {
    has_claimable_jobs(
        conn,
        "thumbnail_jobs",
        media_kind_clause(include_videos),
        excluded_folder_ids,
    )
}

pub fn has_claimable_metadata_jobs(
    conn: &Connection,
    excluded_folder_ids: &std::collections::HashSet<i64>,
) -> Result<bool> {
    has_claimable_jobs(
        conn,
        "metadata_jobs",
        "AND i.media_kind = 'video'",
        excluded_folder_ids,
    )
}

pub fn has_claimable_embedding_jobs(
    conn: &Connection,
    excluded_folder_ids: &std::collections::HashSet<i64>,
) -> Result<bool> {
    has_claimable_jobs(
        conn,
        "embedding_jobs",
        "AND NOT (i.media_kind = 'video' AND i.thumbnail_path IS NULL)",
        excluded_folder_ids,
    )
}

pub fn claim_thumbnail_jobs(
    conn: &mut Connection,
    active_folder_ids: &std::collections::HashSet<i64>,
    paused_folder_ids: &std::collections::HashSet<i64>,
    include_videos: bool,
    fetch_limit: usize,
    claim_limit: usize,
) -> Result<Vec<ThumbnailJob>> {
    let tx = conn.transaction()?;
    let excluded_folder_ids = active_folder_ids
        .union(paused_folder_ids)
        .copied()
        .collect::<std::collections::HashSet<_>>();
    let candidates = get_pending_thumbnail_jobs_excluding(
        &tx,
        &excluded_folder_ids,
        include_videos,
        fetch_limit,
    )?;
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
        "SELECT id, folder_id, path, filename, thumbnail_path, width, height, file_size, created_at, modified_at, taken_at, mime_type,
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

/// Look up the lightweight indexed-media entry for a single path.
/// Used by the filesystem watcher to run change-detection before upserting.
pub fn get_indexed_entry_by_path(
    conn: &Connection,
    path: &str,
) -> Result<Option<IndexedMediaEntry>> {
    let result = conn.query_row(
        "SELECT id, path, modified_at, file_size, media_kind FROM images WHERE path = ?1",
        [path],
        |row| {
            Ok(IndexedMediaEntry {
                id: row.get(0)?,
                path: row.get(1)?,
                modified_at: row.get(2)?,
                file_size: row.get(3)?,
                media_kind: row.get(4)?,
            })
        },
    );
    match result {
        Ok(entry) => Ok(Some(entry)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

/// Look up just the image id for a path. Used by the filesystem watcher
/// to find the DB row to delete when a file is removed from disk.
#[allow(dead_code)] // only caller is the disabled caption worker path
pub fn get_image_id_by_path(conn: &Connection, path: &str) -> Result<Option<i64>> {
    let result = conn.query_row("SELECT id FROM images WHERE path = ?1", [path], |row| {
        row.get(0)
    });
    match result {
        Ok(id) => Ok(Some(id)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

pub fn get_image_by_id(conn: &Connection, image_id: i64) -> Result<ImageRecord> {
    conn.query_row(
        "SELECT id, folder_id, path, filename, thumbnail_path, width, height, file_size, created_at, modified_at, taken_at, mime_type,
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
    let mut stmt = conn.prepare(
        "SELECT id, path, name, image_count, indexed_at, scan_error, sort_order
         FROM folders
         ORDER BY sort_order, id",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(Folder {
            id: row.get(0)?,
            path: row.get(1)?,
            name: row.get(2)?,
            image_count: row.get(3)?,
            indexed_at: row.get(4)?,
            scan_error: row.get(5)?,
            sort_order: row.get(6)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn reorder_folders(conn: &Connection, folder_ids: &[i64]) -> Result<()> {
    let tx = conn.unchecked_transaction()?;
    for (index, folder_id) in folder_ids.iter().enumerate() {
        tx.execute(
            "UPDATE folders SET sort_order = ?2 WHERE id = ?1",
            params![folder_id, index as i64 + 1],
        )?;
    }
    tx.commit()?;
    Ok(())
}

// ── Albums ────────────────────────────────────────────────────────────────────

fn map_album_row(row: &Row<'_>) -> rusqlite::Result<Album> {
    Ok(Album {
        id: row.get(0)?,
        name: row.get(1)?,
        cover_image_id: row.get(2)?,
        cover_thumbnail_path: row.get(3)?,
        image_count: row.get(4)?,
        sort_order: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

/// SELECT that resolves each album's cover thumbnail (explicit cover, else the
/// first member by position) and live image count. Shared by list/get-one.
const ALBUM_SELECT: &str = "
    SELECT a.id, a.name, a.cover_image_id,
           (SELECT ci.thumbnail_path FROM images ci
              WHERE ci.id = COALESCE(
                  a.cover_image_id,
                  (SELECT ai.image_id FROM album_images ai
                     WHERE ai.album_id = a.id
                     ORDER BY ai.position, ai.added_at LIMIT 1)
              )) AS cover_thumbnail_path,
           (SELECT COUNT(*) FROM album_images ai WHERE ai.album_id = a.id) AS image_count,
           a.sort_order, a.created_at, a.updated_at
    FROM albums a";

pub fn list_albums(conn: &Connection) -> Result<Vec<Album>> {
    let sql = format!("{ALBUM_SELECT} ORDER BY a.sort_order, a.id");
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([], map_album_row)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn get_album(conn: &Connection, album_id: i64) -> Result<Album> {
    let sql = format!("{ALBUM_SELECT} WHERE a.id = ?1");
    conn.query_row(&sql, [album_id], map_album_row)
        .map_err(Into::into)
}

pub fn create_album(conn: &Connection, name: &str) -> Result<Album> {
    let id: i64 = conn.query_row(
        "INSERT INTO albums (name, sort_order)
         VALUES (?1, COALESCE((SELECT MAX(sort_order) + 1 FROM albums), 1))
         RETURNING id",
        params![name],
        |row| row.get(0),
    )?;
    get_album(conn, id)
}

pub fn rename_album(conn: &Connection, album_id: i64, new_name: &str) -> Result<()> {
    conn.execute(
        "UPDATE albums SET name = ?2, updated_at = datetime('now') WHERE id = ?1",
        params![album_id, new_name],
    )?;
    Ok(())
}

pub fn delete_album(conn: &Connection, album_id: i64) -> Result<()> {
    // album_images rows cascade away via the FK.
    conn.execute("DELETE FROM albums WHERE id = ?1", [album_id])?;
    Ok(())
}

/// Delete many albums at once (membership rows cascade away via the FK).
pub fn delete_albums(conn: &Connection, album_ids: &[i64]) -> Result<()> {
    let tx = conn.unchecked_transaction()?;
    for album_id in album_ids {
        tx.execute("DELETE FROM albums WHERE id = ?1", [album_id])?;
    }
    tx.commit()?;
    Ok(())
}

pub fn reorder_albums(conn: &Connection, album_ids: &[i64]) -> Result<()> {
    let tx = conn.unchecked_transaction()?;
    for (index, album_id) in album_ids.iter().enumerate() {
        tx.execute(
            "UPDATE albums SET sort_order = ?2 WHERE id = ?1",
            params![album_id, index as i64 + 1],
        )?;
    }
    tx.commit()?;
    Ok(())
}

/// Append images to an album (idempotent). Returns the number newly added.
pub fn add_images_to_album(conn: &Connection, album_id: i64, image_ids: &[i64]) -> Result<i64> {
    let tx = conn.unchecked_transaction()?;
    let mut next_position: i64 = tx.query_row(
        "SELECT COALESCE(MAX(position) + 1, 0) FROM album_images WHERE album_id = ?1",
        [album_id],
        |row| row.get(0),
    )?;
    let mut added = 0i64;
    for image_id in image_ids {
        let changed = tx.execute(
            "INSERT INTO album_images (album_id, image_id, position)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(album_id, image_id) DO NOTHING",
            params![album_id, image_id, next_position],
        )?;
        if changed > 0 {
            next_position += 1;
            added += 1;
        }
    }
    tx.execute(
        "UPDATE albums SET updated_at = datetime('now') WHERE id = ?1",
        [album_id],
    )?;
    tx.commit()?;
    Ok(added)
}

pub fn remove_images_from_album(conn: &Connection, album_id: i64, image_ids: &[i64]) -> Result<()> {
    let tx = conn.unchecked_transaction()?;
    for image_id in image_ids {
        tx.execute(
            "DELETE FROM album_images WHERE album_id = ?1 AND image_id = ?2",
            params![album_id, image_id],
        )?;
    }
    tx.execute(
        "UPDATE albums SET updated_at = datetime('now') WHERE id = ?1",
        [album_id],
    )?;
    tx.commit()?;
    Ok(())
}

pub fn count_album_images(conn: &Connection, album_id: i64) -> Result<i64> {
    let count = conn.query_row(
        "SELECT COUNT(*) FROM album_images WHERE album_id = ?1",
        [album_id],
        |row| row.get(0),
    )?;
    Ok(count)
}

pub fn get_album_images(
    conn: &Connection,
    album_id: i64,
    sort: &str,
    offset: i64,
    limit: i64,
) -> Result<Vec<ImageRecord>> {
    // Default to curated order (album_images.position); otherwise honor the same
    // sort vocabulary as get_images. Albums span folders, so no folder filter.
    let order = match sort {
        "name_asc" => "i.filename ASC",
        "name_desc" => "i.filename DESC",
        "date_asc" => "i.modified_at ASC NULLS LAST",
        "date_desc" => "i.modified_at DESC NULLS LAST",
        "size_asc" => "i.file_size ASC",
        "size_desc" => "i.file_size DESC",
        "rating_asc" => "i.rating ASC, i.modified_at DESC NULLS LAST",
        "rating_desc" => "i.rating DESC, i.modified_at DESC NULLS LAST",
        "duration_asc" => "i.duration_ms ASC NULLS LAST",
        "duration_desc" => "i.duration_ms DESC NULLS LAST",
        "taken_asc" => "COALESCE(i.taken_at, i.modified_at) ASC NULLS LAST",
        "taken_desc" => "COALESCE(i.taken_at, i.modified_at) DESC NULLS LAST",
        _ => "ai.position ASC",
    };
    let sql = format!(
        "SELECT i.id, i.folder_id, i.path, i.filename, i.thumbnail_path, i.width, i.height, i.file_size, i.created_at, i.modified_at, i.taken_at, i.mime_type,
                i.media_kind, i.duration_ms, i.video_codec, i.audio_codec, i.metadata_updated_at, i.metadata_error,
                i.favorite, i.rating, i.embedding_status, i.embedding_model, i.embedding_updated_at, i.embedding_error,
                i.generated_caption, i.caption_model, i.caption_updated_at, i.caption_error,
                i.ai_rating, i.ai_tagger_model, i.ai_tagged_at, i.ai_tagger_error
         FROM images i
         JOIN album_images ai ON ai.image_id = i.id
         WHERE ai.album_id = ?1
         ORDER BY {order}
         LIMIT ?2 OFFSET ?3"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![album_id, limit, offset], map_image_row)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

// ── Bulk image operations ──────────────────────────────────────────────────────

/// Apply favorite and/or rating to many images at once; returns the updated rows.
pub fn bulk_update_details(
    conn: &Connection,
    image_ids: &[i64],
    favorite: Option<bool>,
    rating: Option<i64>,
) -> Result<Vec<ImageRecord>> {
    let tx = conn.unchecked_transaction()?;
    for image_id in image_ids {
        tx.execute(
            "UPDATE images
             SET favorite = COALESCE(?2, favorite),
                 rating = COALESCE(?3, rating)
             WHERE id = ?1",
            params![image_id, favorite, rating],
        )?;
    }
    tx.commit()?;
    get_images_by_ids(conn, image_ids)
}

/// Add one or more user tags to many images at once.
pub fn bulk_add_tags(conn: &Connection, image_ids: &[i64], tags: &[String]) -> Result<()> {
    let tx = conn.unchecked_transaction()?;
    for image_id in image_ids {
        for tag in tags {
            let trimmed = tag.trim();
            if trimmed.is_empty() {
                continue;
            }
            tx.execute(
                "INSERT INTO image_tags (image_id, tag, source, ai_model, confidence, created_at)
                 VALUES (?1, ?2, 'user', NULL, NULL, datetime('now'))
                 ON CONFLICT(image_id, tag) DO UPDATE SET
                     source = 'user',
                     ai_model = NULL,
                     confidence = NULL
                 WHERE source = 'ai'",
                params![image_id, trimmed],
            )?;
        }
    }
    tx.commit()?;
    Ok(())
}

/// Remove a tag (by name) from many images at once.
pub fn bulk_remove_tag_by_name(conn: &Connection, image_ids: &[i64], tag: &str) -> Result<()> {
    let tx = conn.unchecked_transaction()?;
    for image_id in image_ids {
        tx.execute(
            "DELETE FROM image_tags WHERE image_id = ?1 AND tag = ?2",
            params![image_id, tag],
        )?;
    }
    tx.commit()?;
    Ok(())
}

// ── Color palettes (color search) ──────────────────────────────────────────────

/// Replace an image's stored color palette. `colors` is `(r, g, b, weight)`.
pub fn replace_image_colors(
    conn: &Connection,
    image_id: i64,
    colors: &[(u8, u8, u8, f32)],
) -> Result<()> {
    conn.execute("DELETE FROM image_colors WHERE image_id = ?1", [image_id])?;
    for (idx, (r, g, b, weight)) in colors.iter().enumerate() {
        conn.execute(
            "INSERT INTO image_colors (image_id, idx, r, g, b, weight)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                image_id,
                idx as i64,
                *r as i64,
                *g as i64,
                *b as i64,
                *weight as f64
            ],
        )?;
    }
    Ok(())
}

/// Images (with thumbnails) that have no stored palette yet — the backfill set.
/// Returns `(image_id, thumbnail_path)`.
pub fn get_images_missing_colors(conn: &Connection, limit: i64) -> Result<Vec<(i64, String)>> {
    let mut stmt = conn.prepare(
        "SELECT i.id, i.thumbnail_path
         FROM images i
         WHERE i.media_kind = 'image'
           AND i.thumbnail_path IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM image_colors c WHERE c.image_id = i.id)
         LIMIT ?1",
    )?;
    let rows = stmt.query_map([limit], |row| {
        Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// Count of images still awaiting palette extraction (for backfill progress).
pub fn count_images_missing_colors(conn: &Connection) -> Result<i64> {
    let count = conn.query_row(
        "SELECT COUNT(*)
         FROM images i
         WHERE i.media_kind = 'image'
           AND i.thumbnail_path IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM image_colors c WHERE c.image_id = i.id)",
        [],
        |row| row.get(0),
    )?;
    Ok(count)
}

pub fn repair_deferred_embedding_jobs(conn: &Connection) -> Result<usize> {
    let pattern = "No thumbnail available yet for%";
    let repaired = conn.execute(
        "UPDATE embedding_jobs
         SET status = 'pending', last_error = NULL, updated_at = datetime('now')
         WHERE status = 'failed'
           AND last_error LIKE ?1
           AND image_id IN (
               SELECT id FROM images WHERE media_kind = 'video' OR lower(path) GLOB '*.avif'
           )",
        [pattern],
    )?;
    conn.execute(
        "UPDATE images
         SET embedding_status = 'pending', embedding_error = NULL
         WHERE embedding_status = 'failed'
           AND embedding_error LIKE ?1
           AND (media_kind = 'video' OR lower(path) GLOB '*.avif')",
        [pattern],
    )?;
    Ok(repaired)
}

pub fn repair_avif_jobs(conn: &Connection) -> Result<usize> {
    let unsupported_pattern = "%Avif%not supported%";
    let thumbnail_repaired = conn.execute(
        "UPDATE thumbnail_jobs
         SET status = 'pending', last_error = NULL, updated_at = datetime('now')
         WHERE status = 'failed'
           AND image_id IN (SELECT id FROM images WHERE lower(path) GLOB '*.avif')
           AND last_error LIKE ?1",
        [unsupported_pattern],
    )?;
    let embedding_repaired = conn.execute(
        "UPDATE embedding_jobs
         SET status = 'pending', last_error = NULL, updated_at = datetime('now')
         WHERE status = 'failed'
           AND image_id IN (SELECT id FROM images WHERE lower(path) GLOB '*.avif')
           AND last_error LIKE ?1",
        [unsupported_pattern],
    )?;
    conn.execute(
        "UPDATE images
         SET embedding_status = 'pending', embedding_error = NULL
         WHERE embedding_status = 'failed'
           AND lower(path) GLOB '*.avif'
           AND embedding_error LIKE ?1",
        [unsupported_pattern],
    )?;
    let tagging_repaired = conn.execute(
        "UPDATE tagging_jobs
         SET status = 'pending', last_error = NULL, updated_at = datetime('now')
         WHERE status = 'failed'
           AND image_id IN (SELECT id FROM images WHERE lower(path) GLOB '*.avif')
           AND last_error LIKE ?1",
        [unsupported_pattern],
    )?;
    conn.execute(
        "UPDATE images
         SET ai_tagger_error = NULL
         WHERE lower(path) GLOB '*.avif'
           AND ai_tagger_error LIKE ?1",
        [unsupported_pattern],
    )?;
    Ok(thumbnail_repaired + embedding_repaired + tagging_repaired)
}

pub fn rename_folder(conn: &Connection, folder_id: i64, new_name: &str) -> Result<()> {
    conn.execute(
        "UPDATE folders SET name = ?2 WHERE id = ?1",
        params![folder_id, new_name],
    )?;
    Ok(())
}

pub fn update_folder_path(
    conn: &Connection,
    folder_id: i64,
    old_path: &str,
    new_path: &str,
    new_name: &str,
) -> Result<()> {
    // Both updates must be atomic: if the image path rewrite fails (e.g. a
    // uniqueness collision) the folder row must not remain at the new location.
    let tx = conn.unchecked_transaction()?;
    tx.execute(
        "UPDATE folders SET path = ?2, name = ?3, scan_error = NULL WHERE id = ?1",
        params![folder_id, new_path, new_name],
    )?;
    // Rewrite image paths so the indexer can match them by path and skip
    // re-generating thumbnails and embeddings for unchanged files.
    // Use SUBSTR to replace only the leading prefix; SQLite's replace()
    // would corrupt paths where the old folder name also appears deeper in the tree.
    tx.execute(
        "UPDATE images SET path = ?2 || SUBSTR(path, LENGTH(?1) + 1) WHERE folder_id = ?3",
        params![old_path, new_path, folder_id],
    )?;
    tx.commit()?;
    Ok(())
}

pub fn set_folder_scan_error(conn: &Connection, folder_id: i64, error: &str) -> Result<()> {
    conn.execute(
        "UPDATE folders SET scan_error = ?2 WHERE id = ?1",
        params![folder_id, error],
    )?;
    Ok(())
}

pub fn clear_folder_scan_error(conn: &Connection, folder_id: i64) -> Result<()> {
    conn.execute(
        "UPDATE folders SET scan_error = NULL WHERE id = ?1",
        [folder_id],
    )?;
    Ok(())
}

#[allow(clippy::too_many_arguments)] // mirrors the gallery query surface; a params struct adds noise for one caller
pub fn get_images(
    conn: &Connection,
    folder_id: Option<i64>,
    search: Option<&str>,
    media_kind: Option<&str>,
    favorites_only: bool,
    rating_min: i64,
    embedding_failed_only: bool,
    tagging_failed_only: bool,
    color: Option<(u8, u8, u8)>,
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
        "taken_asc" => "COALESCE(taken_at, modified_at) ASC NULLS LAST",
        "taken_desc" => "COALESCE(taken_at, modified_at) DESC NULLS LAST",
        _ => "modified_at DESC NULLS LAST",
    };

    let search_pattern = search.map(|value| format!("%{}%", escape_like_pattern(value)));
    let favorites_flag = i64::from(favorites_only);
    let embedding_failed_flag = i64::from(embedding_failed_only);
    let tagging_failed_flag = i64::from(tagging_failed_only);
    let (color_flag, qr, qg, qb) = match color {
        Some((r, g, b)) => (1i64, r as i64, g as i64, b as i64),
        None => (0, 0, 0, 0),
    };
    let sql = format!(
        "SELECT id, folder_id, path, filename, thumbnail_path, width, height, file_size, created_at, modified_at, taken_at, mime_type,
                media_kind, duration_ms, video_codec, audio_codec, metadata_updated_at, metadata_error,
                favorite, rating, embedding_status, embedding_model, embedding_updated_at, embedding_error,
                generated_caption, caption_model, caption_updated_at, caption_error,
                ai_rating, ai_tagger_model, ai_tagged_at, ai_tagger_error
         FROM images
         WHERE (?1 IS NULL OR folder_id = ?1)
           AND (?2 IS NULL OR filename LIKE ?2 ESCAPE '\\')
           AND (?3 IS NULL OR media_kind = ?3)
           AND (?4 = 0 OR favorite = 1)
           AND rating >= ?5
           AND (?6 = 0 OR embedding_status = 'failed')
           AND (?7 = 0 OR ai_tagger_error IS NOT NULL)
           AND (?10 = 0 OR EXISTS (
               SELECT 1 FROM image_colors c
               WHERE c.image_id = images.id
                 AND c.weight >= ?15
                 AND ((c.r - ?11)*(c.r - ?11) + (c.g - ?12)*(c.g - ?12) + (c.b - ?13)*(c.b - ?13)) <= ?14
           ))
         ORDER BY {order}
         LIMIT ?8 OFFSET ?9"
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
            tagging_failed_flag,
            limit,
            offset,
            color_flag,
            qr,
            qg,
            qb,
            crate::color::MATCH_DISTANCE_SQ,
            crate::color::MATCH_MIN_WEIGHT
        ],
        map_image_row,
    )?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

#[allow(clippy::too_many_arguments)]
pub fn count_images(
    conn: &Connection,
    folder_id: Option<i64>,
    search: Option<&str>,
    media_kind: Option<&str>,
    favorites_only: bool,
    rating_min: i64,
    embedding_failed_only: bool,
    tagging_failed_only: bool,
    color: Option<(u8, u8, u8)>,
) -> Result<i64> {
    let search_pattern = search.map(|value| format!("%{}%", escape_like_pattern(value)));

    let favorites_flag = i64::from(favorites_only);
    let embedding_failed_flag = i64::from(embedding_failed_only);
    let tagging_failed_flag = i64::from(tagging_failed_only);
    let (color_flag, qr, qg, qb) = match color {
        Some((r, g, b)) => (1i64, r as i64, g as i64, b as i64),
        None => (0, 0, 0, 0),
    };
    let count = conn.query_row(
        "SELECT COUNT(*) FROM images
         WHERE (?1 IS NULL OR folder_id = ?1)
           AND (?2 IS NULL OR filename LIKE ?2 ESCAPE '\\')
           AND (?3 IS NULL OR media_kind = ?3)
           AND (?4 = 0 OR favorite = 1)
           AND rating >= ?5
           AND (?6 = 0 OR embedding_status = 'failed')
           AND (?7 = 0 OR ai_tagger_error IS NOT NULL)
           AND (?8 = 0 OR EXISTS (
               SELECT 1 FROM image_colors c
               WHERE c.image_id = images.id
                 AND c.weight >= ?13
                 AND ((c.r - ?9)*(c.r - ?9) + (c.g - ?10)*(c.g - ?10) + (c.b - ?11)*(c.b - ?11)) <= ?12
           ))",
        params![
            folder_id,
            search_pattern,
            media_kind,
            favorites_flag,
            rating_min,
            embedding_failed_flag,
            tagging_failed_flag,
            color_flag,
            qr,
            qg,
            qb,
            crate::color::MATCH_DISTANCE_SQ,
            crate::color::MATCH_MIN_WEIGHT
        ],
        |row| row.get(0),
    )?;

    Ok(count)
}

#[allow(clippy::too_many_arguments)]
pub fn search_images_by_tag(
    conn: &Connection,
    query: &str,
    folder_id: Option<i64>,
    media_kind: Option<&str>,
    favorites_only: bool,
    rating_min: i64,
    color: Option<(u8, u8, u8)>,
    limit: usize,
    offset: usize,
) -> Result<(Vec<ImageRecord>, usize)> {
    let normalized_query = query.trim().to_ascii_lowercase();
    if normalized_query.is_empty() {
        return Ok((Vec::new(), 0));
    }
    let favorites_flag = i64::from(favorites_only);
    let (color_flag, qr, qg, qb) = match color {
        Some((r, g, b)) => (1i64, r as i64, g as i64, b as i64),
        None => (0, 0, 0, 0),
    };

    // Total count (for pagination)
    let total: usize = conn.query_row(
        "SELECT COUNT(DISTINCT i.id)
         FROM images i
         JOIN image_tags t ON t.image_id = i.id
         WHERE (?1 IS NULL OR i.folder_id = ?1)
           AND (?2 IS NULL OR i.media_kind = ?2)
           AND (?3 = 0 OR i.favorite = 1)
           AND i.rating >= ?4
           AND LOWER(TRIM(t.tag)) = ?5
           AND (?6 = 0 OR EXISTS (
               SELECT 1 FROM image_colors c
               WHERE c.image_id = i.id
                 AND c.weight >= ?11
                 AND ((c.r - ?7)*(c.r - ?7) + (c.g - ?8)*(c.g - ?8) + (c.b - ?9)*(c.b - ?9)) <= ?10
           ))",
        params![
            folder_id,
            media_kind,
            favorites_flag,
            rating_min,
            normalized_query,
            color_flag,
            qr,
            qg,
            qb,
            crate::color::MATCH_DISTANCE_SQ,
            crate::color::MATCH_MIN_WEIGHT
        ],
        |row| row.get::<_, i64>(0),
    )? as usize;

    let mut stmt = conn.prepare(
        "SELECT DISTINCT i.id
         FROM images i
         JOIN image_tags t ON t.image_id = i.id
         WHERE (?1 IS NULL OR i.folder_id = ?1)
           AND (?2 IS NULL OR i.media_kind = ?2)
           AND (?3 = 0 OR i.favorite = 1)
           AND i.rating >= ?4
           AND LOWER(TRIM(t.tag)) = ?5
           AND (?6 = 0 OR EXISTS (
               SELECT 1 FROM image_colors c
               WHERE c.image_id = i.id
                 AND c.weight >= ?11
                 AND ((c.r - ?7)*(c.r - ?7) + (c.g - ?8)*(c.g - ?8) + (c.b - ?9)*(c.b - ?9)) <= ?10
           ))
         ORDER BY i.rating DESC, i.modified_at DESC NULLS LAST, i.filename ASC
         LIMIT ?12 OFFSET ?13",
    )?;

    let image_ids = stmt
        .query_map(
            params![
                folder_id,
                media_kind,
                favorites_flag,
                rating_min,
                normalized_query,
                color_flag,
                qr,
                qg,
                qb,
                crate::color::MATCH_DISTANCE_SQ,
                crate::color::MATCH_MIN_WEIGHT,
                limit as i64,
                offset as i64
            ],
            |row| row.get::<_, i64>(0),
        )?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    Ok((get_images_by_ids(conn, &image_ids)?, total))
}

pub fn search_tags_autocomplete(
    conn: &Connection,
    query: &str,
    folder_id: Option<i64>,
    limit: usize,
) -> Result<Vec<ExploreTagEntry>> {
    let pattern = format!("%{}%", escape_like_pattern(&query.to_lowercase()));
    let mut stmt = conn.prepare(
        "SELECT t.tag, COUNT(DISTINCT t.image_id) AS tag_count, MIN(t.image_id) AS representative_image_id,
                MAX(CASE WHEN t.source = 'ai' THEN 1 ELSE 0 END) AS has_ai_source,
                MAX(CASE WHEN t.source = 'user' THEN 1 ELSE 0 END) AS has_user_source
         FROM image_tags t
         JOIN images i ON i.id = t.image_id
         WHERE (?1 IS NULL OR i.folder_id = ?1)
           AND LOWER(t.tag) LIKE ?2 ESCAPE '\\'
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
                has_ai_source: row.get::<_, i64>(3)? != 0,
                has_user_source: row.get::<_, i64>(4)? != 0,
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

/// Returns (image_id, thumbnail_path) for the given path. Used by the watcher
/// delete branch so it can clean up the thumbnail file in the same step.
pub fn get_image_id_and_thumbnail_by_path(
    conn: &Connection,
    path: &str,
) -> Result<Option<(i64, Option<String>)>> {
    let result = conn.query_row(
        "SELECT id, thumbnail_path FROM images WHERE path = ?1",
        params![path],
        |row| Ok((row.get::<_, i64>(0)?, row.get::<_, Option<String>>(1)?)),
    );
    match result {
        Ok(v) => Ok(Some(v)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

/// Returns all non-null thumbnail_path values for images in a folder.
/// Called before folder deletion so callers can remove the files from disk.
pub fn get_thumbnail_paths_for_folder(conn: &Connection, folder_id: i64) -> Result<Vec<String>> {
    let mut stmt = conn.prepare(
        "SELECT thumbnail_path FROM images WHERE folder_id = ?1 AND thumbnail_path IS NOT NULL",
    )?;
    let rows = stmt
        .query_map([folder_id], |row| row.get::<_, String>(0))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

/// Updates a moved/renamed image's path and thumbnail_path in-place.
/// Pass `new_thumbnail_path = None` to clear it (triggers regeneration).
pub fn update_image_path(
    conn: &Connection,
    image_id: i64,
    new_path: &str,
    new_filename: &str,
    new_thumbnail_path: Option<&str>,
) -> Result<()> {
    conn.execute(
        "UPDATE images SET path = ?2, filename = ?3, thumbnail_path = ?4 WHERE id = ?1",
        params![image_id, new_path, new_filename, new_thumbnail_path],
    )?;
    Ok(())
}

pub fn get_explore_tags(
    conn: &Connection,
    folder_id: Option<i64>,
    limit: usize,
) -> Result<Vec<ExploreTagEntry>> {
    let mut stmt = conn.prepare(
        "WITH tag_counts AS (
             SELECT t.tag,
                    COUNT(DISTINCT t.image_id) AS tag_count,
                    MIN(t.image_id) AS representative_image_id,
                    MAX(CASE WHEN t.source = 'ai' THEN 1 ELSE 0 END) AS has_ai_source,
                    MAX(CASE WHEN t.source = 'user' THEN 1 ELSE 0 END) AS has_user_source
             FROM image_tags t
             JOIN images i ON i.id = t.image_id
             WHERE (?1 IS NULL OR i.folder_id = ?1)
             GROUP BY t.tag
             HAVING COUNT(DISTINCT t.image_id) >= 1
             ORDER BY tag_count DESC, t.tag ASC
             LIMIT ?2
         )
         SELECT c.tag,
                c.tag_count,
                c.representative_image_id,
                i.thumbnail_path,
                c.has_ai_source,
                c.has_user_source
         FROM tag_counts c
         JOIN images i ON i.id = c.representative_image_id
         ORDER BY c.tag_count DESC, c.tag ASC",
    )?;

    let rows = stmt
        .query_map(params![folder_id, limit as i64], |row| {
            let representative_image_id = row.get::<_, i64>(2)?;

            Ok(ExploreTagEntry {
                tag: row.get(0)?,
                count: row.get(1)?,
                representative_image_id,
                thumbnail_path: row.get(3)?,
                has_ai_source: row.get::<_, i64>(4)? != 0,
                has_user_source: row.get::<_, i64>(5)? != 0,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    Ok(rows)
}

pub fn get_related_tags(
    conn: &Connection,
    tag: &str,
    folder_id: Option<i64>,
    limit: usize,
) -> Result<Vec<(String, i64)>> {
    let mut stmt = conn.prepare(
        "SELECT other.tag, COUNT(DISTINCT other.image_id) AS shared_count
         FROM image_tags base
         JOIN image_tags other ON other.image_id = base.image_id
         JOIN images i ON i.id = base.image_id
         WHERE base.tag = ?1
           AND other.tag != base.tag
           AND (?2 IS NULL OR i.folder_id = ?2)
         GROUP BY other.tag
         ORDER BY shared_count DESC, other.tag ASC
         LIMIT ?3",
    )?;

    let rows = stmt
        .query_map(params![tag, folder_id, limit as i64], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    Ok(rows)
}

type FailedEmbeddingRow = (i64, String, String, Option<String>);

pub fn get_failed_embedding_images(
    conn: &Connection,
    folder_id: i64,
) -> Result<Vec<FailedEmbeddingRow>> {
    let mut stmt = conn.prepare(
        "SELECT id, filename, path, embedding_error
         FROM images
         WHERE folder_id = ?1 AND embedding_status = 'failed'
         ORDER BY filename",
    )?;
    let rows = stmt.query_map([folder_id], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, Option<String>>(3)?,
        ))
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

type FailedTaggingRow = (i64, String, String, Option<String>);

pub fn get_failed_tagging_images(
    conn: &Connection,
    folder_id: i64,
) -> Result<Vec<FailedTaggingRow>> {
    let mut stmt = conn.prepare(
        "SELECT i.id, i.filename, i.path, COALESCE(j.last_error, i.ai_tagger_error)
         FROM images i
         LEFT JOIN tagging_jobs j ON j.image_id = i.id AND j.status = 'failed'
         WHERE i.folder_id = ?1 AND i.ai_tagger_error IS NOT NULL
         ORDER BY i.filename",
    )?;
    let rows = stmt.query_map([folder_id], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, Option<String>>(3)?,
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
        "SELECT j.image_id, i.folder_id, i.path, i.thumbnail_path
         FROM tagging_jobs j
         JOIN images i ON i.id = j.image_id
         WHERE j.status = 'pending'
           AND NOT (lower(i.path) GLOB '*.avif' AND i.thumbnail_path IS NULL)
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
                thumbnail_path: row.get(3)?,
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
            let n = conn.execute(
                "DELETE FROM tagging_jobs WHERE status NOT IN ('processing', 'cancelled')",
                [],
            )?;
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
         ON CONFLICT(image_id, tag) DO UPDATE SET
             source = 'user',
             ai_model = NULL,
             confidence = NULL
         WHERE source = 'ai'",
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

/// Rename a tag across the whole library, or merge it into an existing tag when
/// `to` already exists. Images that already carry `to` keep a single instance
/// (the colliding source row is dropped).
pub fn rename_tag(conn: &Connection, from: &str, to: &str) -> Result<()> {
    let tx = conn.unchecked_transaction()?;
    // Move rows where the target tag isn't already on that image; UNIQUE
    // collisions are skipped (OR IGNORE)…
    tx.execute(
        "UPDATE OR IGNORE image_tags SET tag = ?2 WHERE tag = ?1",
        params![from, to],
    )?;
    // …then drop the now-duplicate leftovers still under the old name.
    tx.execute("DELETE FROM image_tags WHERE tag = ?1", params![from])?;
    // The visual-cluster cache keys on image-id hashes, not tag text, so a rename
    // wouldn't invalidate it automatically — clear it.
    tx.execute("DELETE FROM visual_cluster_cache", [])?;
    tx.commit()?;
    Ok(())
}

/// Delete a tag from every image in the library. Returns the number of rows removed.
pub fn delete_tag(conn: &Connection, name: &str) -> Result<i64> {
    let tx = conn.unchecked_transaction()?;
    let removed = tx.execute("DELETE FROM image_tags WHERE tag = ?1", params![name])? as i64;
    tx.execute("DELETE FROM visual_cluster_cache", [])?;
    tx.commit()?;
    Ok(removed)
}

pub fn reset_ai_tags(conn: &Connection, folder_id: Option<i64>) -> Result<usize> {
    let image_ids = match folder_id {
        Some(folder_id) => {
            let mut stmt = conn.prepare(
                "SELECT DISTINCT i.id
                 FROM images i
                 LEFT JOIN image_tags t ON t.image_id = i.id AND t.source = 'ai'
                 LEFT JOIN tagging_jobs j ON j.image_id = i.id
                 WHERE i.folder_id = ?1
                   AND i.media_kind = 'image'
                   AND (
                     t.id IS NOT NULL
                     OR i.ai_rating IS NOT NULL
                     OR i.ai_tagger_model IS NOT NULL
                     OR i.ai_tagged_at IS NOT NULL
                     OR i.ai_tagger_error IS NOT NULL
                     OR j.image_id IS NOT NULL
                   )",
            )?;
            let rows = stmt.query_map([folder_id], |row| row.get::<_, i64>(0))?;
            rows.collect::<rusqlite::Result<Vec<_>>>()?
        }
        None => {
            let mut stmt = conn.prepare(
                "SELECT DISTINCT i.id
                 FROM images i
                 LEFT JOIN image_tags t ON t.image_id = i.id AND t.source = 'ai'
                 LEFT JOIN tagging_jobs j ON j.image_id = i.id
                 WHERE i.media_kind = 'image'
                   AND (
                     t.id IS NOT NULL
                     OR i.ai_rating IS NOT NULL
                     OR i.ai_tagger_model IS NOT NULL
                     OR i.ai_tagged_at IS NOT NULL
                     OR i.ai_tagger_error IS NOT NULL
                     OR j.image_id IS NOT NULL
                   )",
            )?;
            let rows = stmt.query_map([], |row| row.get::<_, i64>(0))?;
            rows.collect::<rusqlite::Result<Vec<_>>>()?
        }
    };

    let tx = conn.unchecked_transaction()?;
    match folder_id {
        Some(folder_id) => {
            tx.execute(
                "DELETE FROM image_tags
                 WHERE source = 'ai'
                   AND image_id IN (SELECT id FROM images WHERE folder_id = ?1)",
                [folder_id],
            )?;
            tx.execute(
                "UPDATE images
                 SET ai_rating = NULL,
                     ai_tagger_model = NULL,
                     ai_tagged_at = NULL,
                     ai_tagger_error = NULL
                 WHERE folder_id = ?1
                   AND media_kind = 'image'",
                [folder_id],
            )?;
            tx.execute(
                "UPDATE tagging_jobs
                 SET status = 'cancelled', last_error = NULL, updated_at = datetime('now')
                 WHERE status = 'processing'
                   AND image_id IN (SELECT id FROM images WHERE folder_id = ?1)",
                [folder_id],
            )?;
            tx.execute(
                "DELETE FROM tagging_jobs
                 WHERE status NOT IN ('processing', 'cancelled')
                   AND image_id IN (SELECT id FROM images WHERE folder_id = ?1)",
                [folder_id],
            )?;
        }
        None => {
            tx.execute("DELETE FROM image_tags WHERE source = 'ai'", [])?;
            tx.execute(
                "UPDATE images
                 SET ai_rating = NULL,
                     ai_tagger_model = NULL,
                     ai_tagged_at = NULL,
                     ai_tagger_error = NULL
                 WHERE media_kind = 'image'",
                [],
            )?;
            tx.execute(
                "UPDATE tagging_jobs
                 SET status = 'cancelled', last_error = NULL, updated_at = datetime('now')
                 WHERE status = 'processing'",
                [],
            )?;
            tx.execute(
                "DELETE FROM tagging_jobs WHERE status NOT IN ('processing', 'cancelled')",
                [],
            )?;
        }
    }
    tx.execute("DELETE FROM visual_cluster_cache", [])?;
    tx.commit()?;
    Ok(image_ids.len())
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

/// Returns `true` when the job row for `image_id` is still `processing`.
/// A `false` result means the row was reset to `pending` (pause) or `cancelled`
/// while inference was running — either way the result must be discarded.
pub fn is_tagging_job_processing(conn: &Connection, image_id: i64) -> Result<bool> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM tagging_jobs WHERE image_id = ?1 AND status = 'processing'",
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

    // Delete sqlite-vec rows outside any transaction — DML on virtual tables is
    // unreliable inside a transaction and will cause remove_folder to fail for
    // folders that have generated embeddings. The folder cascade (images rows)
    // is handled by the FK ON DELETE CASCADE when the folder row is deleted.
    for image_id in &image_ids {
        vector::delete_embedding(conn, *image_id)?;
        vector::delete_caption_embedding(conn, *image_id)?;
    }

    let tx = conn.unchecked_transaction()?;
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
        taken_at: row.get(10)?,
        mime_type: row.get(11)?,
        media_kind: row.get(12)?,
        duration_ms: row.get(13)?,
        video_codec: row.get(14)?,
        audio_codec: row.get(15)?,
        metadata_updated_at: row.get(16)?,
        metadata_error: row.get(17)?,
        favorite: row.get::<_, i64>(18)? != 0,
        rating: row.get(19)?,
        embedding_status: row.get(20)?,
        embedding_model: row.get(21)?,
        embedding_updated_at: row.get(22)?,
        embedding_error: row.get(23)?,
        generated_caption: row.get(24)?,
        caption_model: row.get(25)?,
        caption_updated_at: row.get(26)?,
        caption_error: row.get(27)?,
        ai_rating: row.get(28)?,
        ai_tagger_model: row.get(29)?,
        ai_tagged_at: row.get(30)?,
        ai_tagger_error: row.get(31)?,
    })
}

/// Returns cached visual-cluster entries if the stored hash matches `current_hash`.
pub fn get_visual_cluster_cache(
    conn: &Connection,
    folder_scope: &str,
    current_hash: u64,
) -> Result<Option<String>> {
    let result: rusqlite::Result<(i64, String)> = conn.query_row(
        "SELECT image_ids_hash, entries_json FROM visual_cluster_cache WHERE folder_scope = ?1",
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

/// Upserts the visual-cluster cache for the given scope.
pub fn set_visual_cluster_cache(
    conn: &Connection,
    folder_scope: &str,
    image_ids_hash: u64,
    entries_json: &str,
) -> Result<()> {
    conn.execute(
        "INSERT INTO visual_cluster_cache (folder_scope, image_ids_hash, entries_json, created_at)
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

/// Deletes the duplicate scan cache for the given scope.
pub fn clear_duplicate_scan_cache(conn: &Connection, folder_scope: &str) -> Result<()> {
    conn.execute(
        "DELETE FROM duplicate_scan_cache WHERE folder_scope = ?1",
        params![folder_scope],
    )?;
    Ok(())
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
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let mut rows = stmt.query([])?;
    while let Some(row) = rows.next()? {
        let existing_name: String = row.get(1)?;
        if existing_name == column {
            return Ok(());
        }
    }

    conn.execute(
        &format!("ALTER TABLE {table} ADD COLUMN {column} {definition}"),
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
    format!("AND {image_alias}.folder_id NOT IN ({id_list})")
}

/// Shared fixtures for unit tests across modules (db, vector, …).
#[cfg(test)]
pub(crate) mod test_support {
    use super::*;

    pub(crate) fn test_conn() -> Connection {
        vector::register_sqlite_vec();
        let conn = Connection::open_in_memory().unwrap();
        // The r2d2 pool customizer normally sets this; mirror it so FK cascades
        // (album deletion, folder deletion) behave like production.
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        migrate(&conn).unwrap();
        vector::migrate(&conn).unwrap();
        conn
    }

    pub(crate) fn test_image(folder_id: i64, path: &str) -> ImageRecord {
        ImageRecord {
            id: 0,
            folder_id,
            path: path.to_string(),
            filename: path.rsplit('/').next().unwrap_or(path).to_string(),
            thumbnail_path: None,
            width: Some(100),
            height: Some(100),
            file_size: 1024,
            created_at: None,
            modified_at: Some("2026-01-01T00:00:00Z".into()),
            taken_at: None,
            mime_type: "image/jpeg".into(),
            media_kind: "image".into(),
            duration_ms: None,
            video_codec: None,
            audio_codec: None,
            metadata_updated_at: None,
            metadata_error: None,
            favorite: false,
            rating: 0,
            embedding_status: "pending".into(),
            embedding_model: None,
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
        }
    }
}

#[cfg(test)]
mod tests {
    use super::test_support::{test_conn, test_image};
    use super::*;

    #[test]
    fn escape_like_pattern_escapes_wildcards_and_backslash() {
        assert_eq!(escape_like_pattern("50%off"), "50\\%off");
        assert_eq!(escape_like_pattern("a_b"), "a\\_b");
        assert_eq!(escape_like_pattern(r"C:\images"), r"C:\\images");
        assert_eq!(escape_like_pattern("50%_x\\"), "50\\%\\_x\\\\");
        assert_eq!(escape_like_pattern("plain text"), "plain text");
    }

    #[test]
    fn insert_folder_is_idempotent_per_path() {
        let conn = test_conn();
        let first = insert_folder(&conn, "C:/media", "media").unwrap();
        let second = insert_folder(&conn, "C:/media", "media again").unwrap();
        assert_eq!(first, second);

        insert_folder(&conn, "C:/other", "other").unwrap();
        let folders = get_folders(&conn).unwrap();
        assert_eq!(folders.len(), 2);
        assert_eq!(folders[0].name, "media");
    }

    #[test]
    fn upsert_image_updates_in_place_and_preserves_user_state() {
        let conn = test_conn();
        let folder_id = insert_folder(&conn, "C:/media", "media").unwrap();
        let mut img = test_image(folder_id, "C:/media/a.jpg");
        let id = upsert_image(&conn, &img).unwrap();

        // Simulate user state + AI state on the stored row.
        conn.execute(
            "UPDATE images SET favorite = 1, rating = 4, ai_tagger_model = 'wd' WHERE id = ?1",
            [id],
        )
        .unwrap();
        add_user_tag(&conn, id, "keeper").unwrap();
        conn.execute(
            "INSERT INTO image_tags (image_id, tag, source, ai_model, confidence, created_at)
             VALUES (?1, 'cat', 'ai', 'wd', 0.9, datetime('now'))",
            [id],
        )
        .unwrap();

        img.file_size = 2048;
        let same_id = upsert_image(&conn, &img).unwrap();
        assert_eq!(same_id, id);

        let stored = get_image_by_id(&conn, id).unwrap();
        assert_eq!(stored.file_size, 2048);
        // favorite/rating survive re-index; AI tag state is invalidated.
        assert!(stored.favorite);
        assert_eq!(stored.rating, 4);
        assert_eq!(stored.ai_tagger_model, None);

        let tags = get_image_tags(&conn, id).unwrap();
        assert_eq!(tags.len(), 1);
        assert_eq!(tags[0].tag, "keeper");
        assert_eq!(tags[0].source, "user");
    }

    #[test]
    fn get_images_applies_filters_and_agrees_with_count() {
        let conn = test_conn();
        let folder_a = insert_folder(&conn, "C:/a", "a").unwrap();
        let folder_b = insert_folder(&conn, "C:/b", "b").unwrap();

        upsert_image(&conn, &test_image(folder_a, "C:/a/cat.jpg")).unwrap();
        let dog_id = upsert_image(&conn, &test_image(folder_a, "C:/a/dog.jpg")).unwrap();
        let mut video = test_image(folder_b, "C:/b/clip.mp4");
        video.media_kind = "video".into();
        video.embedding_status = "failed".into();
        upsert_image(&conn, &video).unwrap();
        conn.execute(
            "UPDATE images SET favorite = 1, rating = 5 WHERE id = ?1",
            [dog_id],
        )
        .unwrap();

        let no_filter = get_images(
            &conn, None, None, None, false, 0, false, false, None, "name_asc", 0, 100,
        )
        .unwrap();
        assert_eq!(no_filter.len(), 3);
        assert_eq!(
            count_images(&conn, None, None, None, false, 0, false, false, None).unwrap(),
            3
        );

        let by_folder = get_images(
            &conn,
            Some(folder_a),
            None,
            None,
            false,
            0,
            false,
            false,
            None,
            "name_asc",
            0,
            100,
        )
        .unwrap();
        assert_eq!(by_folder.len(), 2);

        let by_search = get_images(
            &conn,
            None,
            Some("cat"),
            None,
            false,
            0,
            false,
            false,
            None,
            "name_asc",
            0,
            100,
        )
        .unwrap();
        assert_eq!(by_search.len(), 1);
        assert_eq!(by_search[0].filename, "cat.jpg");

        let videos = get_images(
            &conn,
            None,
            None,
            Some("video"),
            false,
            0,
            false,
            false,
            None,
            "name_asc",
            0,
            100,
        )
        .unwrap();
        assert_eq!(videos.len(), 1);

        let favorites = get_images(
            &conn, None, None, None, true, 0, false, false, None, "name_asc", 0, 100,
        )
        .unwrap();
        assert_eq!(favorites.len(), 1);
        assert_eq!(favorites[0].filename, "dog.jpg");

        let rated = get_images(
            &conn, None, None, None, false, 3, false, false, None, "name_asc", 0, 100,
        )
        .unwrap();
        assert_eq!(rated.len(), 1);

        let failed = get_images(
            &conn, None, None, None, false, 0, true, false, None, "name_asc", 0, 100,
        )
        .unwrap();
        assert_eq!(failed.len(), 1);
        assert_eq!(failed[0].filename, "clip.mp4");

        // Pagination: page size 2 then the remaining 1.
        let page_one = get_images(
            &conn, None, None, None, false, 0, false, false, None, "name_asc", 0, 2,
        )
        .unwrap();
        let page_two = get_images(
            &conn, None, None, None, false, 0, false, false, None, "name_asc", 2, 2,
        )
        .unwrap();
        assert_eq!(page_one.len(), 2);
        assert_eq!(page_two.len(), 1);
        assert_eq!(page_one[0].filename, "cat.jpg");
        assert_eq!(page_two[0].filename, "dog.jpg");
    }

    #[test]
    fn user_tags_upgrade_ai_tags_and_survive_tag_maintenance() {
        let conn = test_conn();
        let folder_id = insert_folder(&conn, "C:/a", "a").unwrap();
        let id = upsert_image(&conn, &test_image(folder_id, "C:/a/a.jpg")).unwrap();

        conn.execute(
            "INSERT INTO image_tags (image_id, tag, source, ai_model, confidence, created_at)
             VALUES (?1, 'cat', 'ai', 'wd', 0.9, datetime('now'))",
            [id],
        )
        .unwrap();
        let upgraded = add_user_tag(&conn, id, "cat").unwrap();
        assert_eq!(upgraded.source, "user");
        assert_eq!(upgraded.ai_model, None);
        assert_eq!(get_image_tags(&conn, id).unwrap().len(), 1);

        let tag = add_user_tag(&conn, id, "kitty").unwrap();
        remove_tag(&conn, tag.id).unwrap();
        assert_eq!(get_image_tags(&conn, id).unwrap().len(), 1);
    }

    #[test]
    fn rename_tag_merges_into_existing_tag() {
        let conn = test_conn();
        let folder_id = insert_folder(&conn, "C:/a", "a").unwrap();
        let with_both = upsert_image(&conn, &test_image(folder_id, "C:/a/a.jpg")).unwrap();
        let with_old = upsert_image(&conn, &test_image(folder_id, "C:/a/b.jpg")).unwrap();

        add_user_tag(&conn, with_both, "cat").unwrap();
        add_user_tag(&conn, with_both, "kitty").unwrap();
        add_user_tag(&conn, with_old, "kitty").unwrap();

        rename_tag(&conn, "kitty", "cat").unwrap();

        let both_tags = get_image_tags(&conn, with_both).unwrap();
        assert_eq!(both_tags.len(), 1);
        assert_eq!(both_tags[0].tag, "cat");
        let old_tags = get_image_tags(&conn, with_old).unwrap();
        assert_eq!(old_tags.len(), 1);
        assert_eq!(old_tags[0].tag, "cat");
    }

    #[test]
    fn delete_tag_removes_it_everywhere_and_reports_count() {
        let conn = test_conn();
        let folder_id = insert_folder(&conn, "C:/a", "a").unwrap();
        let first = upsert_image(&conn, &test_image(folder_id, "C:/a/a.jpg")).unwrap();
        let second = upsert_image(&conn, &test_image(folder_id, "C:/a/b.jpg")).unwrap();
        add_user_tag(&conn, first, "cat").unwrap();
        add_user_tag(&conn, second, "cat").unwrap();
        add_user_tag(&conn, second, "dog").unwrap();

        assert_eq!(delete_tag(&conn, "cat").unwrap(), 2);
        assert_eq!(get_image_tags(&conn, first).unwrap().len(), 0);
        assert_eq!(get_image_tags(&conn, second).unwrap().len(), 1);
    }

    #[test]
    fn album_crud_and_membership() {
        let conn = test_conn();
        let folder_id = insert_folder(&conn, "C:/a", "a").unwrap();
        let first = upsert_image(&conn, &test_image(folder_id, "C:/a/a.jpg")).unwrap();
        let second = upsert_image(&conn, &test_image(folder_id, "C:/a/b.jpg")).unwrap();

        let album = create_album(&conn, "Holiday").unwrap();
        assert_eq!(album.name, "Holiday");
        assert_eq!(album.image_count, 0);

        // Adding is idempotent.
        assert_eq!(
            add_images_to_album(&conn, album.id, &[first, second]).unwrap(),
            2
        );
        assert_eq!(add_images_to_album(&conn, album.id, &[first]).unwrap(), 0);
        assert_eq!(count_album_images(&conn, album.id).unwrap(), 2);

        remove_images_from_album(&conn, album.id, &[first]).unwrap();
        assert_eq!(count_album_images(&conn, album.id).unwrap(), 1);

        rename_album(&conn, album.id, "Trip").unwrap();
        assert_eq!(get_album(&conn, album.id).unwrap().name, "Trip");

        delete_album(&conn, album.id).unwrap();
        assert!(list_albums(&conn).unwrap().is_empty());
        // Membership rows cascade away with the album.
        let orphans: i64 = conn
            .query_row("SELECT COUNT(*) FROM album_images", [], |row| row.get(0))
            .unwrap();
        assert_eq!(orphans, 0);
    }

    #[test]
    fn backfill_enqueues_only_unqueued_unready_images() {
        let conn = test_conn();
        let folder_id = insert_folder(&conn, "C:/a", "a").unwrap();
        let pending = upsert_image(&conn, &test_image(folder_id, "C:/a/a.jpg")).unwrap();
        let mut ready = test_image(folder_id, "C:/a/b.jpg");
        ready.embedding_status = "ready".into();
        upsert_image(&conn, &ready).unwrap();
        let queued = upsert_image(&conn, &test_image(folder_id, "C:/a/c.jpg")).unwrap();
        enqueue_embedding_job(&conn, queued).unwrap();

        assert_eq!(backfill_embedding_jobs(&conn).unwrap(), 1);
        let has_job: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM embedding_jobs WHERE image_id = ?1",
                [pending],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(has_job, 1);
    }

    #[test]
    fn retry_failed_embeddings_skips_thumbnailless_videos() {
        let conn = test_conn();
        let folder_id = insert_folder(&conn, "C:/a", "a").unwrap();
        let mut failed_image = test_image(folder_id, "C:/a/a.jpg");
        failed_image.embedding_status = "failed".into();
        let failed_image_id = upsert_image(&conn, &failed_image).unwrap();

        let mut failed_video = test_image(folder_id, "C:/a/clip.mp4");
        failed_video.media_kind = "video".into();
        failed_video.embedding_status = "failed".into();
        failed_video.thumbnail_path = None;
        upsert_image(&conn, &failed_video).unwrap();

        assert_eq!(retry_failed_embedding_jobs(&conn, folder_id).unwrap(), 1);
        let requeued = get_image_by_id(&conn, failed_image_id).unwrap();
        assert_eq!(requeued.embedding_status, "pending");
    }

    #[test]
    fn repair_embedding_consistency_requeues_ready_images_without_vectors() {
        let conn = test_conn();
        let folder_id = insert_folder(&conn, "C:/a", "a").unwrap();
        let mut ready = test_image(folder_id, "C:/a/a.jpg");
        ready.embedding_status = "ready".into();
        let ready_id = upsert_image(&conn, &ready).unwrap();

        let (orphaned, requeued) = repair_embedding_consistency(&conn).unwrap();
        assert_eq!(orphaned, 0);
        assert_eq!(requeued, 1);
        let repaired = get_image_by_id(&conn, ready_id).unwrap();
        assert_eq!(repaired.embedding_status, "pending");
    }

    #[test]
    fn search_images_by_tag_is_case_insensitive_and_paginates() {
        let conn = test_conn();
        let folder_a = insert_folder(&conn, "C:/a", "a").unwrap();
        let folder_b = insert_folder(&conn, "C:/b", "b").unwrap();
        let first = upsert_image(&conn, &test_image(folder_a, "C:/a/a.jpg")).unwrap();
        let second = upsert_image(&conn, &test_image(folder_a, "C:/a/b.jpg")).unwrap();
        let third = upsert_image(&conn, &test_image(folder_b, "C:/b/c.jpg")).unwrap();
        add_user_tag(&conn, first, "Cat").unwrap();
        add_user_tag(&conn, second, "cat").unwrap();
        add_user_tag(&conn, third, "cat").unwrap();
        add_user_tag(&conn, third, "dog").unwrap();

        // Query is trimmed and matched case-insensitively against stored tags.
        let (all, total) =
            search_images_by_tag(&conn, "  CAT ", None, None, false, 0, None, 10, 0).unwrap();
        assert_eq!(total, 3);
        assert_eq!(all.len(), 3);

        let (scoped, scoped_total) =
            search_images_by_tag(&conn, "cat", Some(folder_a), None, false, 0, None, 10, 0)
                .unwrap();
        assert_eq!(scoped_total, 2);
        assert_eq!(scoped.len(), 2);

        // Pagination: total stays the full count while the page shrinks.
        let (page, page_total) =
            search_images_by_tag(&conn, "cat", None, None, false, 0, None, 2, 2).unwrap();
        assert_eq!(page_total, 3);
        assert_eq!(page.len(), 1);

        // Blank queries return nothing instead of matching everything.
        let (empty, empty_total) =
            search_images_by_tag(&conn, "   ", None, None, false, 0, None, 10, 0).unwrap();
        assert!(empty.is_empty());
        assert_eq!(empty_total, 0);
    }

    #[test]
    fn update_ai_tags_replaces_ai_state_without_downgrading_user_tags() {
        let conn = test_conn();
        let folder_id = insert_folder(&conn, "C:/a", "a").unwrap();
        let id = upsert_image(&conn, &test_image(folder_id, "C:/a/a.jpg")).unwrap();
        add_user_tag(&conn, id, "cat").unwrap();
        conn.execute(
            "INSERT INTO image_tags (image_id, tag, source, ai_model, confidence, created_at)
             VALUES (?1, 'stale', 'ai', 'wd', 0.5, datetime('now'))",
            [id],
        )
        .unwrap();
        enqueue_tagging_job(&conn, id).unwrap();

        update_ai_tags(
            &conn,
            id,
            &[("cat".into(), 0.9), ("outdoors".into(), 0.7)],
            "general",
            "wd",
        )
        .unwrap();

        let tags = get_image_tags(&conn, id).unwrap();
        assert_eq!(tags.len(), 2, "stale AI tag should be gone");
        let cat = tags.iter().find(|tag| tag.tag == "cat").unwrap();
        assert_eq!(cat.source, "user", "user tag must not be downgraded to ai");
        let outdoors = tags.iter().find(|tag| tag.tag == "outdoors").unwrap();
        assert_eq!(outdoors.source, "ai");
        assert_eq!(outdoors.confidence, Some(0.7));

        let record = get_image_by_id(&conn, id).unwrap();
        assert_eq!(record.ai_rating.as_deref(), Some("general"));
        assert_eq!(record.ai_tagger_model.as_deref(), Some("wd"));
        assert_eq!(record.ai_tagger_error, None);

        let pending_jobs: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM tagging_jobs WHERE image_id = ?1",
                [id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(pending_jobs, 0, "completed job should be dequeued");
    }

    #[test]
    fn delete_folder_cascades_images_tags_and_vectors() {
        let conn = test_conn();
        let folder_id = insert_folder(&conn, "C:/a", "a").unwrap();
        let id = upsert_image(&conn, &test_image(folder_id, "C:/a/a.jpg")).unwrap();
        add_user_tag(&conn, id, "cat").unwrap();
        vector::upsert_embedding(&conn, id, &vec![0.5f32; vector::CLIP_VECTOR_DIM]).unwrap();

        delete_folder(&conn, folder_id).unwrap();

        assert!(get_folders(&conn).unwrap().is_empty());
        let remaining_images: i64 = conn
            .query_row("SELECT COUNT(*) FROM images", [], |row| row.get(0))
            .unwrap();
        assert_eq!(remaining_images, 0);
        let remaining_tags: i64 = conn
            .query_row("SELECT COUNT(*) FROM image_tags", [], |row| row.get(0))
            .unwrap();
        assert_eq!(remaining_tags, 0);
        assert!(!vector::has_image_vector(&conn, id).unwrap());
    }
}
