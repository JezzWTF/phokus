use crate::vector;
use anyhow::Result;
use hnsw_rs::prelude::{DistCosine, Hnsw, Neighbour};
use rusqlite::Connection;
use std::collections::HashMap;
use std::sync::{OnceLock, RwLock};

const HNSW_MAX_CONNECTIONS: usize = 24;
const HNSW_EF_CONSTRUCTION: usize = 300;
const HNSW_EF_SEARCH: usize = 96;

struct CachedHnswIndex {
    revision: String,
    image_ids_by_external: Vec<i64>,
    external_by_image_id: HashMap<i64, usize>,
    hnsw: Hnsw<'static, f32, DistCosine>,
}

static IMAGE_HNSW_INDEX: OnceLock<RwLock<Option<CachedHnswIndex>>> = OnceLock::new();

fn cache() -> &'static RwLock<Option<CachedHnswIndex>> {
    IMAGE_HNSW_INDEX.get_or_init(|| RwLock::new(None))
}

fn build_index(conn: &Connection) -> Result<CachedHnswIndex> {
    let embeddings = vector::get_all_image_embeddings_with_ids(conn, None)?;
    let max_elements = embeddings.len().max(1);
    let max_layer = 16.min((max_elements as f32).ln().trunc() as usize).max(1);
    let mut hnsw = Hnsw::<f32, DistCosine>::new(
        HNSW_MAX_CONNECTIONS,
        max_elements,
        max_layer,
        HNSW_EF_CONSTRUCTION,
        DistCosine {},
    );

    let image_ids_by_external = embeddings
        .iter()
        .map(|(image_id, _)| *image_id)
        .collect::<Vec<_>>();
    let external_by_image_id = image_ids_by_external
        .iter()
        .enumerate()
        .map(|(external_id, image_id)| (*image_id, external_id))
        .collect::<HashMap<_, _>>();
    let data_with_id = embeddings
        .iter()
        .enumerate()
        .map(|(external_id, (_, embedding))| (embedding, external_id))
        .collect::<Vec<_>>();

    hnsw.parallel_insert(&data_with_id);
    hnsw.set_searching_mode(true);

    Ok(CachedHnswIndex {
        revision: vector::get_embedding_revision(conn)?,
        image_ids_by_external,
        external_by_image_id,
        hnsw,
    })
}

fn ensure_index(conn: &Connection) -> Result<()> {
    let revision = vector::get_embedding_revision(conn)?;

    {
        let guard = cache().read().expect("hnsw cache poisoned");
        if guard.as_ref().map(|cached| cached.revision.as_str()) == Some(revision.as_str()) {
            return Ok(());
        }
    }

    let next = build_index(conn)?;
    let mut guard = cache().write().expect("hnsw cache poisoned");
    *guard = Some(next);
    Ok(())
}

pub fn find_similar_image_matches(
    conn: &Connection,
    image_id: i64,
    folder_id: Option<i64>,
    threshold: f32,
    offset: usize,
    limit: usize,
) -> Result<Vec<(i64, f32)>> {
    ensure_index(conn)?;

    let query_embedding = match vector::get_image_embedding(conn, image_id)? {
        Some(embedding) => embedding,
        None => return Ok(Vec::new()),
    };

    let guard = cache().read().expect("hnsw cache poisoned");
    let Some(cached) = guard.as_ref() else {
        return Ok(Vec::new());
    };

    let knbn = (offset + limit).max(limit).saturating_add(32);
    let neighbours: Vec<Neighbour> = if let Some(folder_id) = folder_id {
        let mut allowed_ids = vector::get_all_image_embeddings_with_ids(conn, Some(folder_id))?
            .into_iter()
            .filter_map(|(allowed_image_id, _)| {
                cached.external_by_image_id.get(&allowed_image_id).copied()
            })
            .collect::<Vec<_>>();
        allowed_ids.sort_unstable();
        cached
            .hnsw
            .search_filter(&query_embedding, knbn, HNSW_EF_SEARCH, Some(&allowed_ids))
    } else {
        cached.hnsw.search(&query_embedding, knbn, HNSW_EF_SEARCH)
    };

    let matches = neighbours
        .into_iter()
        .filter_map(|neighbour| {
            let image_id_match = cached.image_ids_by_external.get(neighbour.d_id).copied()?;
            if image_id_match == image_id || neighbour.distance > threshold {
                return None;
            }
            Some((image_id_match, neighbour.distance))
        })
        .skip(offset)
        .take(limit)
        .collect::<Vec<_>>();

    Ok(matches)
}
