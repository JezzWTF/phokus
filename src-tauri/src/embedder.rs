use anyhow::Result;
use candle_core::{DType, Device, Tensor};
use candle_nn::VarBuilder;
use candle_transformers::models::clip::{self, ClipModel};
use hf_hub::{api::sync::Api, Repo, RepoType};
use std::path::{Path, PathBuf};

pub struct ClipImageEmbedder {
    model: ClipModel,
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
        println!("CLIP image embedder ready.");

        Ok(Self {
            model,
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
}

fn resolve_device() -> Result<Device> {
    let cuda_device = Device::cuda_if_available(0)?;
    if cuda_device.is_cuda() {
        println!("CLIP embedder using CUDA device.");
        return Ok(cuda_device);
    }

    #[cfg(target_os = "macos")]
    {
        let metal_device = Device::metal_if_available(0)?;
        if metal_device.is_metal() {
            println!("CLIP embedder using Metal device.");
            return Ok(metal_device);
        }
    }

    println!("CLIP embedder using CPU device.");
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
