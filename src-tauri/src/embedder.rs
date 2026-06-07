use anyhow::Result;
use candle_core::{DType, Device, Tensor};
use candle_nn::VarBuilder;
use candle_transformers::models::clip::{self, ClipModel};
use hf_hub::{api::sync::Api, Repo, RepoType};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use tokenizers::Tokenizer;

static TEXT_SEARCH_EMBEDDER: OnceLock<Mutex<Option<ClipImageEmbedder>>> = OnceLock::new();

/// Embed a text query using a lazily-initialized, cached CLIP embedder.
pub fn embed_text_query(query: &str) -> Result<Vec<f32>> {
    with_text_embedder(|e| e.embed_text(query))
}

fn with_text_embedder<T>(f: impl FnOnce(&ClipImageEmbedder) -> Result<T>) -> Result<T> {
    let lock = TEXT_SEARCH_EMBEDDER.get_or_init(|| Mutex::new(None));
    let mut guard = lock
        .lock()
        .map_err(|_| anyhow::anyhow!("Text embedder lock poisoned"))?;
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

    /// Embed a cropped region of an image without writing a temp file to disk.
    /// `crop_x`, `crop_y`, `crop_w`, `crop_h` are normalized 0.0–1.0 coordinates.
    pub fn embed_image_crop(
        &self,
        path: &Path,
        crop_x: f32,
        crop_y: f32,
        crop_w: f32,
        crop_h: f32,
    ) -> Result<Vec<f32>> {
        let img = image::ImageReader::open(path)?
            .with_guessed_format()?
            .decode()?;

        let img_w = img.width() as f32;
        let img_h = img.height() as f32;

        let x = ((crop_x * img_w) as u32).min(img.width().saturating_sub(1));
        let y = ((crop_y * img_h) as u32).min(img.height().saturating_sub(1));
        let w = ((crop_w * img_w) as u32).max(1).min(img.width() - x);
        let h = ((crop_h * img_h) as u32).max(1).min(img.height() - y);

        let cropped = img.crop_imm(x, y, w, h);
        let resized = cropped.resize_to_fill(
            self.image_size as u32,
            self.image_size as u32,
            image::imageops::FilterType::Triangle,
        );

        let raw = resized.to_rgb8().into_raw();
        let tensor = candle_core::Tensor::from_vec(
            raw,
            (self.image_size, self.image_size, 3),
            &candle_core::Device::Cpu,
        )?
        .permute((2, 0, 1))?
        .to_dtype(candle_core::DType::F32)?
        .affine(2.0 / 255.0, -1.0)?;

        let batch = tensor.unsqueeze(0)?.to_device(&self.device)?;
        let features = self.model.get_image_features(&batch)?;
        let normalized = candle_transformers::models::clip::div_l2_norm(&features)?;
        Ok(normalized.get(0)?.flatten_all()?.to_vec1::<f32>()?)
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

/// Returns the path that should be fed to the CLIP image embedder for a given media file.
///
/// For videos the thumbnail image is used (because CLIP only understands still images).
/// If a video has no thumbnail yet, an error is returned — the caller should mark the
/// embedding job as failed rather than trying to decode the raw video file.
pub fn embedding_source_path(
    path: &str,
    thumbnail_path: Option<&str>,
    media_kind: &str,
) -> Result<PathBuf> {
    if media_kind == "video" {
        match thumbnail_path {
            Some(thumb) => Ok(PathBuf::from(thumb)),
            None => Err(anyhow::anyhow!(
                "No thumbnail available yet for video '{}' — embedding deferred until thumbnail is generated",
                std::path::Path::new(path)
                    .file_name()
                    .map(|n| n.to_string_lossy())
                    .unwrap_or_default()
            )),
        }
    } else {
        Ok(PathBuf::from(path))
    }
}
