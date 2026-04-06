use anyhow::{Context, Result};
use candle_core::{DType, Device, Tensor};
use candle_nn::VarBuilder;
use candle_transformers::models::clip::{self, ClipModel};
use hf_hub::{api::sync::Api, Repo, RepoType};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use tokenizers::Tokenizer;

static TEXT_SEARCH_EMBEDDER: OnceLock<Mutex<Option<ClipImageEmbedder>>> = OnceLock::new();
/// In-process cache so the disk file is only read/written once per session.
static VOCAB_EMBED_CACHE: OnceLock<Mutex<Option<Vec<Vec<f32>>>>> = OnceLock::new();

/// Default vocabulary bundled with the binary.
pub const DEFAULT_VOCABULARY: &str = include_str!("../data/vocabulary.txt");

/// Embed a text query using a lazily-initialized, cached CLIP embedder.
pub fn embed_text_query(query: &str) -> Result<Vec<f32>> {
    with_text_embedder(|e| e.embed_text(query))
}

/// Parse vocabulary text: strip comment lines (starting with `#`) and blank lines.
pub fn parse_vocabulary(text: &str) -> Vec<String> {
    text.lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty() && !l.starts_with('#'))
        .map(|l| l.to_string())
        .collect()
}

/// Load the vocabulary from `{cache_dir}/vocabulary.txt` if it exists,
/// otherwise fall back to the binary-bundled default.
pub fn load_vocabulary(cache_dir: &Path) -> Vec<String> {
    let custom_path = cache_dir.join("vocabulary.txt");
    if custom_path.exists() {
        if let Ok(text) = std::fs::read_to_string(&custom_path) {
            let words = parse_vocabulary(&text);
            if !words.is_empty() {
                println!("Using custom vocabulary from {:?} ({} words)", custom_path, words.len());
                return words;
            }
        }
    }
    parse_vocabulary(DEFAULT_VOCABULARY)
}

/// Embed the vocabulary, using a disk cache so CLIP is only called when the vocabulary
/// actually changes.  Cache file: `{cache_dir}/vocab_embeddings.bin`.
///
/// Format: `[u64 hash][u32 n_words][u32 dim][(n_words × dim) × f32 LE]`
pub fn embed_vocab_cached(vocab: &[String], cache_dir: &Path) -> Result<Vec<Vec<f32>>> {
    // In-process cache hit
    {
        let guard = VOCAB_EMBED_CACHE
            .get_or_init(|| Mutex::new(None))
            .lock()
            .map_err(|_| anyhow::anyhow!("Vocab cache lock poisoned"))?;
        if let Some(cached) = guard.as_ref() {
            return Ok(cached.clone());
        }
    }

    let vocab_hash = fnv_hash(vocab);
    let disk_path = cache_dir.join("vocab_embeddings.bin");

    // Try loading from disk
    if let Ok(embeddings) = load_disk_cache(&disk_path, vocab_hash) {
        let mut guard = VOCAB_EMBED_CACHE
            .get_or_init(|| Mutex::new(None))
            .lock()
            .map_err(|_| anyhow::anyhow!("Vocab cache lock poisoned"))?;
        *guard = Some(embeddings.clone());
        println!("Vocabulary embeddings loaded from disk cache ({} words).", embeddings.len());
        return Ok(embeddings);
    }

    // Compute embeddings
    println!("Computing vocabulary embeddings ({} words) — this is cached after the first run.", vocab.len());
    let prompts: Vec<String> = vocab.iter().map(|w| format!("a photo of {}", w)).collect();
    let prompt_refs: Vec<&str> = prompts.iter().map(|s| s.as_str()).collect();

    let embeddings = with_text_embedder(|e| {
        let mut all = Vec::with_capacity(vocab.len());
        for chunk in prompt_refs.chunks(64) {
            all.extend(e.embed_texts_batch(chunk)?);
        }
        Ok(all)
    })?;

    // Save to disk
    if let Err(e) = save_disk_cache(&disk_path, vocab_hash, &embeddings) {
        eprintln!("Warning: could not write vocab cache: {e}");
    }

    let mut guard = VOCAB_EMBED_CACHE
        .get_or_init(|| Mutex::new(None))
        .lock()
        .map_err(|_| anyhow::anyhow!("Vocab cache lock poisoned"))?;
    *guard = Some(embeddings.clone());
    Ok(embeddings)
}

fn fnv_hash(words: &[String]) -> u64 {
    let mut h: u64 = 0xcbf29ce484222325;
    for w in words {
        for b in w.bytes() {
            h = h.wrapping_mul(0x100000001b3) ^ (b as u64);
        }
        h = h.wrapping_mul(0x100000001b3) ^ 0x0A; // newline separator
    }
    h
}

fn load_disk_cache(path: &Path, expected_hash: u64) -> Result<Vec<Vec<f32>>> {
    let mut f = std::fs::File::open(path).context("no cache file")?;
    let mut buf = Vec::new();
    f.read_to_end(&mut buf)?;

    if buf.len() < 16 {
        anyhow::bail!("cache too short");
    }

    let hash = u64::from_le_bytes(buf[0..8].try_into()?);
    if hash != expected_hash {
        anyhow::bail!("vocab hash mismatch — recomputing");
    }
    let n = u32::from_le_bytes(buf[8..12].try_into()?) as usize;
    let dim = u32::from_le_bytes(buf[12..16].try_into()?) as usize;

    let expected_len = 16 + n * dim * 4;
    if buf.len() != expected_len {
        anyhow::bail!("cache size mismatch");
    }

    let mut embeddings = Vec::with_capacity(n);
    let data = &buf[16..];
    for i in 0..n {
        let start = i * dim * 4;
        let emb: Vec<f32> = data[start..start + dim * 4]
            .chunks_exact(4)
            .map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]]))
            .collect();
        embeddings.push(emb);
    }
    Ok(embeddings)
}

fn save_disk_cache(path: &Path, hash: u64, embeddings: &[Vec<f32>]) -> Result<()> {
    let n = embeddings.len();
    let dim = embeddings.first().map(|e| e.len()).unwrap_or(0);

    let mut buf = Vec::with_capacity(16 + n * dim * 4);
    buf.extend_from_slice(&hash.to_le_bytes());
    buf.extend_from_slice(&(n as u32).to_le_bytes());
    buf.extend_from_slice(&(dim as u32).to_le_bytes());
    for emb in embeddings {
        for &v in emb {
            buf.extend_from_slice(&v.to_le_bytes());
        }
    }

    std::fs::write(path, buf)?;
    println!("Vocabulary embeddings cached to disk ({n} words, {dim} dims).");
    Ok(())
}

fn with_text_embedder<T>(f: impl FnOnce(&ClipImageEmbedder) -> Result<T>) -> Result<T> {
    let lock = TEXT_SEARCH_EMBEDDER.get_or_init(|| Mutex::new(None));
    let mut guard = lock.lock().map_err(|_| anyhow::anyhow!("Text embedder lock poisoned"))?;
    if guard.is_none() {
        println!("Initializing CLIP text embedder...");
        *guard = Some(ClipImageEmbedder::new()?);
    }
    f(guard.as_ref().unwrap())
}

pub struct ClipImageEmbedder {
    model: ClipModel,
    tokenizer: Tokenizer,
    device: Device,
    image_size: usize,
}

impl ClipImageEmbedder {
    pub fn new() -> Result<Self> {
        println!("Initializing CLIP image embedder...");
        let api = Api::new()?;
        let repo = api.repo(Repo::new(
            "laion/CLIP-ViT-B-32-laion2B-s34B-b79K".to_string(),
            RepoType::Model,
        ));
        println!("Resolving CLIP model weights from Hugging Face cache...");
        let model_path = repo.get("model.safetensors")?;
        let tokenizer_repo = api.repo(Repo::new(
            "openai/clip-vit-base-patch32".to_string(),
            RepoType::Model,
        ));
        let tokenizer_path = tokenizer_repo.get("tokenizer.json")?;

        let config = clip::ClipConfig::vit_base_patch32();
        let device = resolve_device()?;
        let vb = unsafe {
            VarBuilder::from_mmaped_safetensors(
                std::slice::from_ref(&model_path),
                DType::F32,
                &device,
            )?
        };
        let model = ClipModel::new(vb, &config)?;
        let tokenizer = Tokenizer::from_file(tokenizer_path).map_err(anyhow::Error::msg)?;
        println!("CLIP image embedder ready.");

        Ok(Self {
            model,
            tokenizer,
            device,
            image_size: config.image_size,
        })
    }

    pub fn embed_image(&self, path: &Path) -> Result<Vec<f32>> {
        Ok(self.embed_images(&[path.to_path_buf()])?.remove(0))
    }

    pub fn embed_images(&self, paths: &[PathBuf]) -> Result<Vec<Vec<f32>>> {
        let images = load_images(paths, self.image_size)?.to_device(&self.device)?;
        let features = self.model.get_image_features(&images)?;
        let normalized = clip::div_l2_norm(&features)?;

        let mut embeddings = Vec::with_capacity(paths.len());
        for index in 0..paths.len() {
            embeddings.push(normalized.get(index)?.flatten_all()?.to_vec1::<f32>()?);
        }
        Ok(embeddings)
    }

    pub fn embed_text(&self, query: &str) -> Result<Vec<f32>> {
        Ok(self.embed_texts_batch(&[query])?.remove(0))
    }

    /// Embed multiple text queries in a single CLIP forward pass.
    /// All sequences are padded to the same length (max 77 tokens).
    pub fn embed_texts_batch(&self, queries: &[&str]) -> Result<Vec<Vec<f32>>> {
        if queries.is_empty() {
            return Ok(vec![]);
        }

        let encodings: Vec<_> = queries
            .iter()
            .map(|q| self.tokenizer.encode(*q, true).map_err(anyhow::Error::msg))
            .collect::<Result<_>>()?;

        let max_len = encodings
            .iter()
            .map(|e| e.get_ids().len())
            .max()
            .unwrap_or(10)
            .min(77);

        let n = queries.len();
        let mut flat = vec![0u32; n * max_len];
        for (i, enc) in encodings.iter().enumerate() {
            let ids = enc.get_ids();
            let len = ids.len().min(max_len);
            for j in 0..len {
                flat[i * max_len + j] = ids[j] as u32;
            }
        }

        let input_ids = Tensor::new(flat, &self.device)?.reshape((n, max_len))?;
        let features = self.model.get_text_features(&input_ids)?;
        let normalized = clip::div_l2_norm(&features)?;

        (0..n)
            .map(|i| Ok(normalized.get(i)?.flatten_all()?.to_vec1::<f32>()?))
            .collect()
    }
}

fn resolve_device() -> Result<Device> {
    match Device::cuda_if_available(0) {
        Ok(device) if device.is_cuda() => {
            println!("CLIP embedder: using CUDA GPU (device 0).");
            return Ok(device);
        }
        Ok(_) => {
            println!("CLIP embedder: no compatible CUDA GPU found — using CPU.");
        }
        Err(e) => {
            println!("CLIP embedder: CUDA init failed ({e}) — using CPU.");
        }
    }
    Ok(Device::Cpu)
}

fn load_image(path: &Path, image_size: usize) -> Result<Tensor> {
    let image = image::ImageReader::open(path)?
        .with_guessed_format()?
        .decode()?;
    let image = image.resize_to_fill(
        image_size as u32,
        image_size as u32,
        image::imageops::FilterType::Triangle,
    );
    let image = image.to_rgb8().into_raw();
    let tensor = Tensor::from_vec(image, (image_size, image_size, 3), &Device::Cpu)?
        .permute((2, 0, 1))?
        .to_dtype(DType::F32)?
        .affine(2.0 / 255.0, -1.0)?;
    Ok(tensor)
}

fn load_images(paths: &[PathBuf], image_size: usize) -> Result<Tensor> {
    let mut images = Vec::with_capacity(paths.len());
    for path in paths {
        images.push(load_image(path, image_size)?);
    }
    Ok(Tensor::stack(&images, 0)?)
}

pub fn embedding_source_path(
    path: &str,
    thumbnail_path: Option<&str>,
    media_kind: &str,
) -> PathBuf {
    if media_kind == "video" {
        thumbnail_path
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from(path))
    } else {
        PathBuf::from(path)
    }
}
