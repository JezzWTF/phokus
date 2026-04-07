use anyhow::Result;
use hf_hub::{api::sync::Api, Repo, RepoType};
use image::{imageops::FilterType, ImageReader};
use ort::session::SessionInputValue;
use ort::session::{builder::GraphOptimizationLevel, Session};
use ort::value::{Shape, Tensor};
use serde::Serialize;
use std::borrow::Cow;
use std::path::{Path, PathBuf};
use tokenizers::Tokenizer;

pub const FLORENCE_MODEL_ID: &str = "onnx-community/Florence-2-base-ft";
pub const FLORENCE_CAPTION_MODEL_NAME: &str = "florence-2-base-ft-onnx-q4";

const REQUIRED_FILES: &[&str] = &[
    "config.json",
    "generation_config.json",
    "preprocessor_config.json",
    "tokenizer.json",
    "tokenizer_config.json",
    "special_tokens_map.json",
    "onnx/vision_encoder_fp16.onnx",
    "onnx/encoder_model_q4.onnx",
    "onnx/decoder_model_merged_q4.onnx",
    "onnx/embed_tokens_fp16.onnx",
];

#[derive(Serialize)]
pub struct CaptionModelStatus {
    pub model_id: &'static str,
    pub model_name: &'static str,
    pub local_dir: String,
    pub ready: bool,
    pub missing_files: Vec<String>,
}

#[derive(Clone, Serialize)]
pub struct CaptionModelProgress {
    pub total_files: usize,
    pub completed_files: usize,
    pub current_file: Option<String>,
    pub done: bool,
}

#[derive(Serialize)]
pub struct CaptionRuntimeProbe {
    pub ready: bool,
    pub tokenizer_vocab_size: usize,
    pub sessions: Vec<CaptionRuntimeSessionProbe>,
}

#[derive(Serialize)]
pub struct CaptionRuntimeSessionProbe {
    pub file: &'static str,
    pub inputs: Vec<String>,
    pub outputs: Vec<String>,
}

#[derive(Serialize)]
pub struct CaptionVisionProbe {
    pub input_shape: Vec<i64>,
    pub output_shape: Vec<i64>,
    pub output_values: usize,
}

#[derive(Clone)]
struct TensorData {
    shape: Vec<i64>,
    values: Vec<f32>,
}

pub struct FlorenceCaptioner {
    tokenizer: Tokenizer,
    vision_session: Session,
    embed_session: Session,
    encoder_session: Session,
    decoder_session: Session,
}

pub fn model_dir(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("models").join("florence-2-base-ft")
}

pub fn caption_model_status(app_data_dir: &Path) -> CaptionModelStatus {
    let local_dir = model_dir(app_data_dir);
    let missing_files = REQUIRED_FILES
        .iter()
        .filter(|file| !local_dir.join(file).exists())
        .map(|file| (*file).to_string())
        .collect::<Vec<_>>();

    CaptionModelStatus {
        model_id: FLORENCE_MODEL_ID,
        model_name: FLORENCE_CAPTION_MODEL_NAME,
        local_dir: local_dir.to_string_lossy().to_string(),
        ready: missing_files.is_empty(),
        missing_files,
    }
}

pub fn prepare_caption_model_with_progress(
    app_data_dir: &Path,
    emit_progress: impl Fn(CaptionModelProgress),
) -> Result<CaptionModelStatus> {
    let local_dir = model_dir(app_data_dir);
    std::fs::create_dir_all(&local_dir)?;

    let api = Api::new()?;
    let repo = api.repo(Repo::new(FLORENCE_MODEL_ID.to_string(), RepoType::Model));
    let mut completed_files = REQUIRED_FILES
        .iter()
        .filter(|file| local_dir.join(file).exists())
        .count();

    emit_progress(CaptionModelProgress {
        total_files: REQUIRED_FILES.len(),
        completed_files,
        current_file: None,
        done: completed_files == REQUIRED_FILES.len(),
    });

    for file in REQUIRED_FILES {
        let destination = local_dir.join(file);
        if destination.exists() {
            continue;
        }
        emit_progress(CaptionModelProgress {
            total_files: REQUIRED_FILES.len(),
            completed_files,
            current_file: Some((*file).to_string()),
            done: false,
        });
        if let Some(parent) = destination.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let cached = repo.get(file)?;
        std::fs::copy(cached, destination)?;
        completed_files += 1;
        emit_progress(CaptionModelProgress {
            total_files: REQUIRED_FILES.len(),
            completed_files,
            current_file: Some((*file).to_string()),
            done: completed_files == REQUIRED_FILES.len(),
        });
    }

    emit_progress(CaptionModelProgress {
        total_files: REQUIRED_FILES.len(),
        completed_files,
        current_file: None,
        done: true,
    });

    Ok(caption_model_status(app_data_dir))
}

pub fn delete_caption_model(app_data_dir: &Path) -> Result<CaptionModelStatus> {
    let local_dir = model_dir(app_data_dir);
    if local_dir.exists() {
        std::fs::remove_dir_all(&local_dir)?;
    }
    Ok(caption_model_status(app_data_dir))
}

pub fn probe_caption_runtime(app_data_dir: &Path) -> Result<CaptionRuntimeProbe> {
    let status = caption_model_status(app_data_dir);
    if !status.ready {
        anyhow::bail!(
            "Florence-2 model is missing {} required file(s)",
            status.missing_files.len()
        );
    }

    let local_dir = model_dir(app_data_dir);
    let tokenizer =
        Tokenizer::from_file(local_dir.join("tokenizer.json")).map_err(anyhow::Error::msg)?;

    let sessions = [
        "onnx/vision_encoder_fp16.onnx",
        "onnx/embed_tokens_fp16.onnx",
        "onnx/encoder_model_q4.onnx",
        "onnx/decoder_model_merged_q4.onnx",
    ]
    .into_iter()
    .map(|file| probe_session(file, &local_dir.join(file)))
    .collect::<Result<Vec<_>>>()?;

    Ok(CaptionRuntimeProbe {
        ready: true,
        tokenizer_vocab_size: tokenizer.get_vocab_size(false),
        sessions,
    })
}

pub fn probe_caption_vision(app_data_dir: &Path, image_path: &Path) -> Result<CaptionVisionProbe> {
    let status = caption_model_status(app_data_dir);
    if !status.ready {
        anyhow::bail!(
            "Florence-2 model is missing {} required file(s)",
            status.missing_files.len()
        );
    }

    let local_dir = model_dir(app_data_dir);
    let pixels = preprocess_image(image_path)?;
    let input_shape = vec![1, 3, 768, 768];
    let input = Tensor::from_array(([1usize, 3, 768, 768], pixels.into_boxed_slice()))
        .map_err(|error| anyhow::anyhow!("{error}"))?;
    let mut session = create_session(&local_dir.join("onnx/vision_encoder_fp16.onnx"))?;
    let outputs = session
        .run(ort::inputs! {
            "pixel_values" => input
        })
        .map_err(|error| anyhow::anyhow!("{error}"))?;
    let (output_shape, output_values) = outputs[0]
        .try_extract_tensor::<f32>()
        .map_err(|error| anyhow::anyhow!("{error}"))?;

    Ok(CaptionVisionProbe {
        input_shape,
        output_shape: output_shape.to_vec(),
        output_values: output_values.len(),
    })
}

pub fn generate_caption(app_data_dir: &Path, image_path: &Path) -> Result<String> {
    let mut captioner = FlorenceCaptioner::new(app_data_dir)?;
    captioner.generate(image_path)
}

impl FlorenceCaptioner {
    pub fn new(app_data_dir: &Path) -> Result<Self> {
        let status = caption_model_status(app_data_dir);
        if !status.ready {
            anyhow::bail!(
                "Florence-2 model is missing {} required file(s)",
                status.missing_files.len()
            );
        }

        let local_dir = model_dir(app_data_dir);
        let tokenizer =
            Tokenizer::from_file(local_dir.join("tokenizer.json")).map_err(anyhow::Error::msg)?;

        let vision_session = create_session(&local_dir.join("onnx/vision_encoder_fp16.onnx"))?;
        let embed_session = create_session(&local_dir.join("onnx/embed_tokens_fp16.onnx"))?;
        let encoder_session = create_session(&local_dir.join("onnx/encoder_model_q4.onnx"))?;
        let decoder_session = create_session(&local_dir.join("onnx/decoder_model_merged_q4.onnx"))?;

        Ok(Self {
            tokenizer,
            vision_session,
            embed_session,
            encoder_session,
            decoder_session,
        })
    }

    pub fn generate(&mut self, image_path: &Path) -> Result<String> {
        let image_features = run_vision_encoder(&mut self.vision_session, image_path)?;
        let prompt_ids = self
            .tokenizer
            .encode("What does the image describe?", false)
            .map_err(anyhow::Error::msg)?
            .get_ids()
            .iter()
            .map(|id| i64::from(*id))
            .collect::<Vec<_>>();
        let prompt_embeds = run_token_embedder(&mut self.embed_session, &prompt_ids)?;
        let encoder_embeds = concatenate_sequence_embeddings(&prompt_embeds, &image_features)?;
        let encoder_attention_mask = vec![1_i64; encoder_embeds.shape[1] as usize];
        let encoder_hidden_states = run_encoder(
            &mut self.encoder_session,
            &encoder_embeds,
            &encoder_attention_mask,
        )?;

        let generated_ids = run_decoder(
            &mut self.decoder_session,
            &mut self.embed_session,
            &encoder_hidden_states,
            &encoder_attention_mask,
        )?;

        let generated_u32 = generated_ids
            .into_iter()
            .map(|id| id as u32)
            .collect::<Vec<_>>();
        let caption = self
            .tokenizer
            .decode(&generated_u32, true)
            .map_err(anyhow::Error::msg)?
            .trim()
            .to_string();

        if caption.is_empty() {
            anyhow::bail!("Florence-2 generated an empty caption");
        }

        Ok(clean_caption(&caption))
    }
}

fn probe_session(file: &'static str, path: &Path) -> Result<CaptionRuntimeSessionProbe> {
    let metadata = std::fs::metadata(path)?;
    if metadata.len() == 0 {
        anyhow::bail!("{} is empty", path.display());
    }

    let (inputs, outputs) = match file {
        "onnx/vision_encoder_fp16.onnx" => (
            vec!["pixel_values".to_string()],
            vec!["image_features".to_string()],
        ),
        "onnx/embed_tokens_fp16.onnx" => (
            vec!["input_ids".to_string()],
            vec!["inputs_embeds".to_string()],
        ),
        "onnx/encoder_model_q4.onnx" => (
            vec!["attention_mask".to_string(), "inputs_embeds".to_string()],
            vec!["last_hidden_state".to_string()],
        ),
        "onnx/decoder_model_merged_q4.onnx" => (
            vec![
                "encoder_attention_mask".to_string(),
                "encoder_hidden_states".to_string(),
                "inputs_embeds".to_string(),
                "past_key_values".to_string(),
                "use_cache_branch".to_string(),
            ],
            vec!["logits".to_string(), "present_key_values".to_string()],
        ),
        _ => (Vec::new(), Vec::new()),
    };

    Ok(CaptionRuntimeSessionProbe {
        file,
        inputs,
        outputs,
    })
}

fn run_vision_encoder(session: &mut Session, image_path: &Path) -> Result<TensorData> {
    let pixels = preprocess_image(image_path)?;
    let input = Tensor::from_array(([1usize, 3, 768, 768], pixels.into_boxed_slice()))
        .map_err(|error| anyhow::anyhow!("{error}"))?;
    let outputs = session
        .run(ort::inputs! {
            "pixel_values" => input
        })
        .map_err(|error| anyhow::anyhow!("{error}"))?;
    tensor_data(&outputs[0])
}

fn run_token_embedder(session: &mut Session, token_ids: &[i64]) -> Result<TensorData> {
    let input_ids = Tensor::from_array((
        [1usize, token_ids.len()],
        token_ids.to_vec().into_boxed_slice(),
    ))
    .map_err(|error| anyhow::anyhow!("{error}"))?;
    let outputs = session
        .run(ort::inputs! {
            "input_ids" => input_ids
        })
        .map_err(|error| anyhow::anyhow!("{error}"))?;
    tensor_data(&outputs[0])
}

fn run_encoder(
    session: &mut Session,
    inputs_embeds: &TensorData,
    attention_mask: &[i64],
) -> Result<TensorData> {
    let attention_mask_tensor = Tensor::from_array((
        [1usize, attention_mask.len()],
        attention_mask.to_vec().into_boxed_slice(),
    ))
    .map_err(|error| anyhow::anyhow!("{error}"))?;
    let inputs_embeds_tensor = tensor_from_data(inputs_embeds)?;
    let outputs = session
        .run(ort::inputs! {
            "attention_mask" => attention_mask_tensor,
            "inputs_embeds" => inputs_embeds_tensor
        })
        .map_err(|error| anyhow::anyhow!("{error}"))?;
    tensor_data(&outputs[0])
}

fn run_decoder(
    decoder_session: &mut Session,
    embed_session: &mut Session,
    encoder_hidden_states: &TensorData,
    encoder_attention_mask: &[i64],
) -> Result<Vec<i64>> {
    const DECODER_LAYERS: usize = 6;
    const DECODER_HEADS: usize = 12;
    const HEAD_DIM: usize = 64;
    const DECODER_START_TOKEN_ID: i64 = 2;
    const EOS_TOKEN_ID: i64 = 2;
    const MAX_NEW_TOKENS: usize = 32;

    let mut generated = Vec::new();
    let mut next_input_id = DECODER_START_TOKEN_ID;
    let mut past: Vec<TensorData> = Vec::new();
    let mut use_cache_branch = false;

    for _ in 0..MAX_NEW_TOKENS {
        let inputs_embeds = run_token_embedder(embed_session, &[next_input_id])?;
        let encoder_attention_mask_tensor = Tensor::from_array((
            [1usize, encoder_attention_mask.len()],
            encoder_attention_mask.to_vec().into_boxed_slice(),
        ))
        .map_err(|error| anyhow::anyhow!("{error}"))?;
        let encoder_hidden_states_tensor = tensor_from_data(encoder_hidden_states)?;
        let inputs_embeds_tensor = tensor_from_data(&inputs_embeds)?;
        let use_cache_branch_tensor =
            Tensor::from_array(([1usize], vec![use_cache_branch].into_boxed_slice()))
                .map_err(|error| anyhow::anyhow!("{error}"))?;

        let mut inputs = ort::inputs! {
            "encoder_attention_mask" => encoder_attention_mask_tensor,
            "encoder_hidden_states" => encoder_hidden_states_tensor,
            "inputs_embeds" => inputs_embeds_tensor,
            "use_cache_branch" => use_cache_branch_tensor
        };

        if past.is_empty() {
            for layer in 0..DECODER_LAYERS {
                push_tensor_input(
                    &mut inputs,
                    format!("past_key_values.{layer}.decoder.key"),
                    TensorData::zeros(vec![1, DECODER_HEADS as i64, 0, HEAD_DIM as i64]),
                )?;
                push_tensor_input(
                    &mut inputs,
                    format!("past_key_values.{layer}.decoder.value"),
                    TensorData::zeros(vec![1, DECODER_HEADS as i64, 0, HEAD_DIM as i64]),
                )?;
                push_tensor_input(
                    &mut inputs,
                    format!("past_key_values.{layer}.encoder.key"),
                    TensorData::zeros(vec![1, DECODER_HEADS as i64, 0, HEAD_DIM as i64]),
                )?;
                push_tensor_input(
                    &mut inputs,
                    format!("past_key_values.{layer}.encoder.value"),
                    TensorData::zeros(vec![1, DECODER_HEADS as i64, 0, HEAD_DIM as i64]),
                )?;
            }
        } else {
            for layer in 0..DECODER_LAYERS {
                for cache_name in [
                    "decoder.key",
                    "decoder.value",
                    "encoder.key",
                    "encoder.value",
                ] {
                    let past_index = layer * 4
                        + match cache_name {
                            "decoder.key" => 0,
                            "decoder.value" => 1,
                            "encoder.key" => 2,
                            "encoder.value" => 3,
                            _ => unreachable!(),
                        };
                    push_tensor_input(
                        &mut inputs,
                        format!("past_key_values.{layer}.{cache_name}"),
                        past[past_index].clone(),
                    )?;
                }
            }
        }

        let outputs = decoder_session
            .run(inputs)
            .map_err(|error| anyhow::anyhow!("{error}"))?;
        let logits = tensor_data(&outputs["logits"])?;
        let token_id = argmax_last_token(&logits)?;
        if token_id == EOS_TOKEN_ID {
            break;
        }
        generated.push(token_id);
        next_input_id = token_id;

        past.clear();
        for layer in 0..DECODER_LAYERS {
            for cache_name in [
                "decoder.key",
                "decoder.value",
                "encoder.key",
                "encoder.value",
            ] {
                past.push(tensor_data(
                    &outputs[format!("present.{layer}.{cache_name}").as_str()],
                )?);
            }
        }
        use_cache_branch = true;
    }

    Ok(generated)
}

fn create_session(path: &Path) -> Result<Session> {
    let builder = Session::builder().map_err(|error| anyhow::anyhow!("{error}"))?;
    let builder = builder
        .with_optimization_level(GraphOptimizationLevel::Level3)
        .map_err(|error| anyhow::anyhow!("{error}"))?;
    let mut builder = builder
        .with_intra_threads(1)
        .map_err(|error| anyhow::anyhow!("{error}"))?;
    let session = builder
        .commit_from_file(path)
        .map_err(|error| anyhow::anyhow!("{error}"))?;
    Ok(session)
}

fn concatenate_sequence_embeddings(text: &TensorData, image: &TensorData) -> Result<TensorData> {
    if text.shape.len() != 3 || image.shape.len() != 3 {
        anyhow::bail!("Expected 3D text and image embeddings");
    }
    if text.shape[0] != image.shape[0] || text.shape[2] != image.shape[2] {
        anyhow::bail!("Text and image embedding dimensions do not match");
    }

    let text_tokens = text.shape[1] as usize;
    let image_tokens = image.shape[1] as usize;
    let dim = text.shape[2] as usize;
    let mut values = Vec::with_capacity((text_tokens + image_tokens) * dim);
    values.extend_from_slice(&text.values);
    values.extend_from_slice(&image.values);

    Ok(TensorData {
        shape: vec![text.shape[0], text.shape[1] + image.shape[1], text.shape[2]],
        values,
    })
}

fn tensor_data(value: &ort::value::DynValue) -> Result<TensorData> {
    let (shape, values) = value
        .try_extract_tensor::<f32>()
        .map_err(|error| anyhow::anyhow!("{error}"))?;
    Ok(TensorData {
        shape: shape.to_vec(),
        values: values.to_vec(),
    })
}

fn tensor_from_data(data: &TensorData) -> Result<Tensor<f32>> {
    Tensor::from_array((
        Shape::new(data.shape.clone()),
        data.values.clone().into_boxed_slice(),
    ))
    .map_err(|error| anyhow::anyhow!("{error}"))
}

fn push_tensor_input(
    inputs: &mut Vec<(Cow<'_, str>, SessionInputValue<'_>)>,
    name: String,
    data: TensorData,
) -> Result<()> {
    inputs.push((Cow::Owned(name), tensor_from_data(&data)?.into()));
    Ok(())
}

fn argmax_last_token(logits: &TensorData) -> Result<i64> {
    if logits.shape.len() != 3 {
        anyhow::bail!("Expected decoder logits to be 3D");
    }
    let sequence_length = logits.shape[1] as usize;
    let vocab_size = logits.shape[2] as usize;
    if sequence_length == 0 || vocab_size == 0 {
        anyhow::bail!("Decoder logits are empty");
    }
    let start = (sequence_length - 1) * vocab_size;
    let (index, _) = logits.values[start..start + vocab_size]
        .iter()
        .enumerate()
        .max_by(|(_, a), (_, b)| a.total_cmp(b))
        .ok_or_else(|| anyhow::anyhow!("Decoder logits are empty"))?;
    Ok(index as i64)
}

fn clean_caption(caption: &str) -> String {
    caption
        .trim()
        .trim_matches(|ch| matches!(ch, '<' | '>' | '|' | ' '))
        .to_string()
}

fn preprocess_image(image_path: &Path) -> Result<Vec<f32>> {
    let image = ImageReader::open(image_path)?.decode()?.to_rgb8();
    let resized = image::imageops::resize(&image, 768, 768, FilterType::CatmullRom);
    let mut pixel_values = vec![0.0f32; 3 * 768 * 768];
    let mean = [0.485f32, 0.456, 0.406];
    let std = [0.229f32, 0.224, 0.225];

    for (x, y, pixel) in resized.enumerate_pixels() {
        let x = x as usize;
        let y = y as usize;
        let base = y * 768 + x;
        for channel in 0..3 {
            let value = f32::from(pixel[channel]) / 255.0;
            pixel_values[channel * 768 * 768 + base] = (value - mean[channel]) / std[channel];
        }
    }

    Ok(pixel_values)
}

impl TensorData {
    fn zeros(shape: Vec<i64>) -> Self {
        let values_len = shape.iter().map(|value| (*value).max(0) as usize).product();
        Self {
            shape,
            values: vec![0.0; values_len],
        }
    }
}
