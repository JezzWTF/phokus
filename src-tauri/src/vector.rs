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

#[allow(dead_code)]
fn pack_f32(values: &[f32]) -> Vec<u8> {
    let mut out = Vec::with_capacity(values.len() * std::mem::size_of::<f32>());
    for value in values {
        out.extend_from_slice(&value.to_le_bytes());
    }
    out
}
