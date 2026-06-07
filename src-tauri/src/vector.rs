use anyhow::{anyhow, Result};
use rusqlite::{ffi::sqlite3_auto_extension, Connection, Error as SqliteError};
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
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS caption_vec USING vec0(
            image_id INTEGER PRIMARY KEY,
            embedding FLOAT[{}] distance_metric=cosine
        );",
        CLIP_VECTOR_DIM, CLIP_VECTOR_DIM
    ))?;
    Ok(())
}

#[allow(dead_code)]
pub fn delete_embedding(conn: &Connection, image_id: i64) -> Result<()> {
    conn.execute("DELETE FROM image_vec WHERE image_id = ?1", [image_id])?;
    // Advance the revision so any cached HNSW index is invalidated after deletions.
    conn.execute(
        "INSERT INTO app_kv (key, value) VALUES ('embedding_revision', 1)
         ON CONFLICT(key) DO UPDATE SET value = value + 1",
        [],
    )?;
    Ok(())
}

#[allow(dead_code)]
pub fn delete_caption_embedding(conn: &Connection, image_id: i64) -> Result<()> {
    conn.execute("DELETE FROM caption_vec WHERE image_id = ?1", [image_id])?;
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
pub fn upsert_caption_embedding(conn: &Connection, image_id: i64, embedding: &[f32]) -> Result<()> {
    if embedding.len() != CLIP_VECTOR_DIM {
        return Err(anyhow!(
            "expected {}-dimensional embedding, got {}",
            CLIP_VECTOR_DIM,
            embedding.len()
        ));
    }

    let packed = pack_f32(embedding);
    conn.execute("DELETE FROM caption_vec WHERE image_id = ?1", [image_id])?;
    conn.execute(
        "INSERT INTO caption_vec (image_id, embedding) VALUES (?1, ?2)",
        (&image_id, &packed),
    )?;
    Ok(())
}

pub fn find_similar_image_ids(
    conn: &Connection,
    image_id: i64,
    limit: usize,
    folder_id: Option<i64>,
) -> Result<Vec<i64>> {
    let embedding: Vec<u8> = match conn.query_row(
        "SELECT embedding FROM image_vec WHERE image_id = ?1",
        [image_id],
        |row| row.get(0),
    ) {
        Ok(embedding) => embedding,
        Err(SqliteError::QueryReturnedNoRows) => return Ok(Vec::new()),
        Err(error) => return Err(error.into()),
    };

    if let Some(folder_id) = folder_id {
        // Brute-force cosine scan scoped to the folder — avoids the KNN k=4096 limit
        // and returns exact nearest neighbours within the folder.
        let mut stmt = conn.prepare(
            "SELECT v.image_id
             FROM image_vec v
             JOIN images i ON i.id = v.image_id
             WHERE i.folder_id = ?2
               AND v.image_id != ?3
             ORDER BY vec_distance_cosine(v.embedding, vec_f32(?1)) ASC
             LIMIT ?4",
        )?;
        let rows = stmt.query_map((&embedding, folder_id, image_id, limit as i64), |row| {
            row.get::<_, i64>(0)
        })?;
        return Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?);
    }

    // Global KNN search (no folder filter) — use the ANN index.
    let mut stmt = conn.prepare(
        "SELECT image_id
         FROM image_vec
         WHERE embedding MATCH vec_f32(?1)
           AND k = ?2",
    )?;
    let rows = stmt
        .query_map((&embedding, (limit + 1) as i64), |row| row.get::<_, i64>(0))?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    let mut ids = Vec::new();
    for row in rows {
        if row != image_id {
            ids.push(row);
        }
        if ids.len() >= limit {
            break;
        }
    }
    Ok(ids)
}

// pub fn find_similar_image_matches(
//     conn: &Connection,
//     image_id: i64,
//     folder_id: Option<i64>,
//     threshold: f32,
//     offset: usize,
//     limit: usize,
// ) -> Result<Vec<(i64, f32)>> {
//     let embedding: Vec<u8> = match conn.query_row(
//         "SELECT embedding FROM image_vec WHERE image_id = ?1",
//         [image_id],
//         |row| row.get(0),
//     ) {
//         Ok(embedding) => embedding,
//         Err(SqliteError::QueryReturnedNoRows) => return Ok(Vec::new()),
//         Err(error) => return Err(error.into()),
//     };

//     let query = match folder_id {
//         Some(_) => {
//             "SELECT v.image_id, vec_distance_cosine(v.embedding, vec_f32(?1)) AS distance
//              FROM image_vec v
//              JOIN images i ON i.id = v.image_id
//              WHERE i.folder_id = ?2
//                AND v.image_id != ?3
//                AND vec_distance_cosine(v.embedding, vec_f32(?1)) <= ?4
//              ORDER BY distance ASC
//              LIMIT ?5 OFFSET ?6"
//         }
//         None => {
//             "SELECT v.image_id, vec_distance_cosine(v.embedding, vec_f32(?1)) AS distance
//              FROM image_vec v
//              WHERE v.image_id != ?2
//                AND vec_distance_cosine(v.embedding, vec_f32(?1)) <= ?3
//              ORDER BY distance ASC
//              LIMIT ?4 OFFSET ?5"
//         }
//     };

//     let mut stmt = conn.prepare(query)?;
//     match folder_id {
//         Some(folder_id) => Ok(stmt
//             .query_map(
//                 (
//                     &embedding,
//                     folder_id,
//                     image_id,
//                     threshold,
//                     limit as i64,
//                     offset as i64,
//                 ),
//                 |row| Ok((row.get::<_, i64>(0)?, row.get::<_, f32>(1)?)),
//             )?
//             .collect::<rusqlite::Result<Vec<_>>>()?),
//         None => Ok(stmt
//             .query_map(
//                 (&embedding, image_id, threshold, limit as i64, offset as i64),
//                 |row| Ok((row.get::<_, i64>(0)?, row.get::<_, f32>(1)?)),
//             )?
//             .collect::<rusqlite::Result<Vec<_>>>()?),
//     }
// }

pub fn get_image_embedding(conn: &Connection, image_id: i64) -> Result<Option<Vec<f32>>> {
    let embedding: Result<Vec<u8>, rusqlite::Error> = conn.query_row(
        "SELECT embedding FROM image_vec WHERE image_id = ?1",
        [image_id],
        |row| row.get(0),
    );

    match embedding {
        Ok(bytes) => Ok(Some(unpack_f32(&bytes))),
        Err(SqliteError::QueryReturnedNoRows) => Ok(None),
        Err(error) => Err(error.into()),
    }
}

pub fn get_embedding_revision(conn: &Connection) -> Result<String> {
    // Use the monotonically incremented app_kv counter so that two embeddings
    // saved within the same clock second still advance the revision, preventing
    // the HNSW cache from serving stale vectors.
    let revision: i64 = conn
        .query_row(
            "SELECT COALESCE((SELECT value FROM app_kv WHERE key = 'embedding_revision'), 0)",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);
    Ok(revision.to_string())
}

// fn image_ids_for_folder(
//     conn: &Connection,
//     folder_id: i64,
// ) -> Result<std::collections::HashSet<i64>> {
//     let mut stmt = conn.prepare("SELECT id FROM images WHERE folder_id = ?1")?;
//     let rows = stmt.query_map([folder_id], |row| row.get::<_, i64>(0))?;
//     Ok(rows.collect::<rusqlite::Result<std::collections::HashSet<_>>>()?)
// }

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

/// Brute-force cosine search scoped to a single folder, ordered by ascending distance.
/// Used for region-based similarity search where we want folder-scoped results.
pub fn search_image_ids_by_embedding_in_folder(
    conn: &Connection,
    embedding: &[f32],
    folder_id: i64,
    exclude_image_id: Option<i64>,
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
    let exclude_id = exclude_image_id.unwrap_or(-1);
    let mut stmt = conn.prepare(
        "SELECT v.image_id
         FROM image_vec v
         JOIN images i ON i.id = v.image_id
         WHERE i.folder_id = ?2
           AND v.image_id != ?3
         ORDER BY vec_distance_cosine(v.embedding, vec_f32(?1)) ASC
         LIMIT ?4",
    )?;
    let rows = stmt.query_map((&packed, folder_id, exclude_id, limit as i64), |row| {
        row.get::<_, i64>(0)
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

#[allow(dead_code)]
pub fn search_caption_ids_by_embedding(
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
         FROM caption_vec
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

pub fn count_image_vectors(conn: &Connection) -> Result<i64> {
    conn.query_row("SELECT COUNT(*) FROM image_vec", [], |row| row.get(0))
        .map_err(Into::into)
}

#[allow(dead_code)]
pub fn count_caption_vectors(conn: &Connection) -> Result<i64> {
    conn.query_row("SELECT COUNT(*) FROM caption_vec", [], |row| row.get(0))
        .map_err(Into::into)
}

pub fn delete_orphaned_embeddings(conn: &Connection) -> Result<usize> {
    let image_ids = {
        let mut stmt = conn.prepare("SELECT id FROM images")?;
        let rows = stmt
            .query_map([], |row| row.get::<_, i64>(0))?
            .collect::<rusqlite::Result<std::collections::HashSet<_>>>()?;
        rows
    };
    let vector_ids = {
        let mut stmt = conn.prepare("SELECT image_id FROM image_vec")?;
        let rows = stmt
            .query_map([], |row| row.get::<_, i64>(0))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        rows
    };
    let orphaned_ids = vector_ids
        .into_iter()
        .filter(|image_id| !image_ids.contains(image_id))
        .collect::<Vec<_>>();

    for image_id in &orphaned_ids {
        delete_embedding(conn, *image_id)?;
    }

    Ok(orphaned_ids.len())
}

#[allow(dead_code)]
pub fn delete_orphaned_caption_embeddings(conn: &Connection) -> Result<usize> {
    let image_ids = {
        let mut stmt = conn.prepare("SELECT id FROM images")?;
        let rows = stmt
            .query_map([], |row| row.get::<_, i64>(0))?
            .collect::<rusqlite::Result<std::collections::HashSet<_>>>()?;
        rows
    };
    let vector_ids = {
        let mut stmt = conn.prepare("SELECT image_id FROM caption_vec")?;
        let rows = stmt
            .query_map([], |row| row.get::<_, i64>(0))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        rows
    };
    let orphaned_ids = vector_ids
        .into_iter()
        .filter(|image_id| !image_ids.contains(image_id))
        .collect::<Vec<_>>();

    for image_id in &orphaned_ids {
        delete_caption_embedding(conn, *image_id)?;
    }

    Ok(orphaned_ids.len())
}

pub fn has_image_vector(conn: &Connection, image_id: i64) -> Result<bool> {
    conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM image_vec WHERE image_id = ?1)",
        [image_id],
        |row| row.get::<_, i64>(0),
    )
    .map(|value| value != 0)
    .map_err(Into::into)
}

#[allow(dead_code)]
fn pack_f32(values: &[f32]) -> Vec<u8> {
    let mut out = Vec::with_capacity(values.len() * std::mem::size_of::<f32>());
    for value in values {
        out.extend_from_slice(&value.to_le_bytes());
    }
    out
}
