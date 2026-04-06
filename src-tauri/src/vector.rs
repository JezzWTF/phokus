use anyhow::{anyhow, Result};
use rusqlite::{ffi::sqlite3_auto_extension, Connection};
use sqlite_vec::sqlite3_vec_init;
use std::sync::Once;

pub const CLIP_MODEL_NAME: &str = "openclip-vit-b-32";
pub const CLIP_VECTOR_DIM: usize = 512;

static SQLITE_VEC_INIT: Once = Once::new();

pub fn register_sqlite_vec() {
    SQLITE_VEC_INIT.call_once(|| unsafe {
        sqlite3_auto_extension(Some(std::mem::transmute(sqlite3_vec_init as *const ())));
    });
}

pub fn migrate(conn: &Connection) -> Result<()> {
    conn.execute_batch(&format!(
        "CREATE VIRTUAL TABLE IF NOT EXISTS image_vec USING vec0(
            image_id INTEGER PRIMARY KEY,
            embedding FLOAT[{}] distance_metric=cosine
        );",
        CLIP_VECTOR_DIM
    ))?;
    Ok(())
}

#[allow(dead_code)]
pub fn delete_embedding(conn: &Connection, image_id: i64) -> Result<()> {
    conn.execute("DELETE FROM image_vec WHERE image_id = ?1", [image_id])?;
    Ok(())
}

#[allow(dead_code)]
pub fn upsert_embedding(conn: &Connection, image_id: i64, embedding: &[f32]) -> Result<()> {
    if embedding.len() != CLIP_VECTOR_DIM {
        return Err(anyhow!(
            "expected {}-dimensional embedding, got {}",
            CLIP_VECTOR_DIM,
            embedding.len()
        ));
    }

    let packed = pack_f32(embedding);
    conn.execute("DELETE FROM image_vec WHERE image_id = ?1", [image_id])?;
    conn.execute(
        "INSERT INTO image_vec (image_id, embedding) VALUES (?1, ?2)",
        (&image_id, &packed),
    )?;
    Ok(())
}

pub fn find_similar_image_ids(conn: &Connection, image_id: i64, limit: usize) -> Result<Vec<i64>> {
    let embedding: Vec<u8> = conn.query_row(
        "SELECT embedding FROM image_vec WHERE image_id = ?1",
        [image_id],
        |row| row.get(0),
    )?;

    let mut stmt = conn.prepare(
        "SELECT image_id
         FROM image_vec
         WHERE embedding MATCH vec_f32(?1)
           AND k = ?2",
    )?;
    let rows = stmt.query_map((&embedding, (limit as i64) + 1), |row| row.get::<_, i64>(0))?;

    let mut ids = Vec::new();
    for row in rows {
        let candidate_id = row?;
        if candidate_id != image_id {
            ids.push(candidate_id);
        }
        if ids.len() >= limit {
            break;
        }
    }
    Ok(ids)
}

/// Returns all stored image embeddings with their image IDs, optionally filtered to one folder.
/// Each entry is `(image_id, normalized_f32_embedding)`.
pub fn get_all_image_embeddings_with_ids(
    conn: &Connection,
    folder_id: Option<i64>,
) -> Result<Vec<(i64, Vec<f32>)>> {
    let packed_rows: Vec<(i64, Vec<u8>)> = match folder_id {
        Some(fid) => {
            let mut stmt = conn.prepare(
                "SELECT image_id, embedding FROM image_vec
                 WHERE image_id IN (SELECT id FROM images WHERE folder_id = ?1)",
            )?;
            let rows: Vec<(i64, Vec<u8>)> = stmt
                .query_map([fid], |row| {
                    Ok((row.get::<_, i64>(0)?, row.get::<_, Vec<u8>>(1)?))
                })?
                .filter_map(|r| r.ok())
                .collect();
            rows
        }
        None => {
            let mut stmt = conn.prepare("SELECT image_id, embedding FROM image_vec")?;
            let rows: Vec<(i64, Vec<u8>)> = stmt
                .query_map([], |row| {
                    Ok((row.get::<_, i64>(0)?, row.get::<_, Vec<u8>>(1)?))
                })?
                .filter_map(|r| r.ok())
                .collect();
            rows
        }
    };

    Ok(packed_rows
        .into_iter()
        .map(|(id, b)| (id, unpack_f32(&b)))
        .collect())
}

fn unpack_f32(bytes: &[u8]) -> Vec<f32> {
    bytes
        .chunks_exact(4)
        .map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]]))
        .collect()
}

pub fn search_image_ids_by_embedding(
    conn: &Connection,
    embedding: &[f32],
    limit: usize,
) -> Result<Vec<i64>> {
    if embedding.len() != CLIP_VECTOR_DIM {
        return Err(anyhow!(
            "expected {}-dimensional embedding, got {}",
            CLIP_VECTOR_DIM,
            embedding.len()
        ));
    }

    let packed = pack_f32(embedding);
    let mut stmt = conn.prepare(
        "SELECT image_id
         FROM image_vec
         WHERE embedding MATCH vec_f32(?1)
           AND k = ?2",
    )?;
    let rows = stmt.query_map((&packed, limit as i64), |row| row.get::<_, i64>(0))?;

    let mut ids = Vec::new();
    for row in rows {
        ids.push(row?);
        if ids.len() >= limit {
            break;
        }
    }
    Ok(ids)
}

#[allow(dead_code)]
fn pack_f32(values: &[f32]) -> Vec<u8> {
    let mut out = Vec::with_capacity(values.len() * std::mem::size_of::<f32>());
    for value in values {
        out.extend_from_slice(&value.to_le_bytes());
    }
    out
}
