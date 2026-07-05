use crate::onnx_runtime::{
    self, DIRECTML_DLL_FILE, ONNX_RUNTIME_DLL_FILE, ONNX_RUNTIME_PROVIDERS_DLL_FILE,
};
use anyhow::Result;
use hf_hub::{api::sync::Api, Repo, RepoType};
use image::{imageops::FilterType, ImageReader};
use ort::ep;
use ort::session::SessionInputValue;
use ort::session::SessionOutputs;
use ort::session::{builder::GraphOptimizationLevel, Session};
use ort::value::{Shape, Tensor};
use serde::{Deserialize, Serialize};
use std::borrow::Cow;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Instant;
use tokenizers::Tokenizer;

pub const FLORENCE_MODEL_ID: &str = "onnx-community/Florence-2-base-ft";
pub const FLORENCE_CAPTION_MODEL_NAME: &str = "florence-2-base-ft-onnx-q4";
const CAPTION_ACCELERATION_FILE: &str = "settings/caption_acceleration.txt";
const CAPTION_DETAIL_FILE: &str = "settings/caption_detail.txt";

const REQUIRED_FILES: &[&str] = &[
    ONNX_RUNTIME_DLL_FILE,
    ONNX_RUNTIME_PROVIDERS_DLL_FILE,
    DIRECTML_DLL_FILE,
    "config.json",
    "generation_config.json",
    "preprocessor_config.json",
    "tokenizer.json",
    "tokenizer_config.json",
    "special_tokens_map.json",
    "onnx/vision_encoder_fp16.onnx",
    "onnx/encoder_model_q4.onnx",
    "onnx/decoder_model_q4.onnx",
    "onnx/decoder_model_merged_q4.onnx",
    "onnx/embed_tokens_fp16.onnx",
];

/// Set to `true` by `set_caption_acceleration` so the caption worker loop
/// knows to drop its cached `FlorenceCaptioner` and reload with the new EP.
pub static CAPTION_SESSION_DIRTY: AtomicBool = AtomicBool::new(false);

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum CaptionAcceleration {
    #[default]
    Auto,
    Cpu,
    Directml,
}

impl CaptionAcceleration {
    fn as_str(self) -> &'static str {
        match self {
            Self::Auto => "auto",
            Self::Cpu => "cpu",
            Self::Directml => "directml",
        }
    }
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum CaptionDetail {
    Short,
    Detailed,
    #[default]
    Paragraph,
}

impl CaptionDetail {
    fn as_str(self) -> &'static str {
        match self {
            Self::Short => "short",
            Self::Detailed => "detailed",
            Self::Paragraph => "paragraph",
        }
    }

    fn prompt(self) -> &'static str {
        match self {
            Self::Short => "What does the image describe?",
            Self::Detailed => "Describe in detail what is shown in the image.",
            Self::Paragraph => "Describe with a paragraph what is shown in the image.",
        }
    }

    fn max_new_tokens(self) -> usize {
        match self {
            Self::Short => 32,
            Self::Detailed => 56,
            Self::Paragraph => 96,
        }
    }
}

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
    pub acceleration: CaptionAcceleration,
    pub detail: CaptionDetail,
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
    pub acceleration: CaptionAcceleration,
}

#[derive(Clone)]
struct TensorData {
    shape: Vec<i64>,
    values: Vec<f32>,
}

pub struct FlorenceCaptioner {
    tokenizer: Tokenizer,
    caption_detail: CaptionDetail,
    vision_session: Session,
    embed_session: Session,
    encoder_session: Session,
    decoder_prefill_session: Session,
    decoder_session: Session,
}

pub fn model_dir(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("models").join("florence-2-base-ft")
}

pub fn caption_acceleration(app_data_dir: &Path) -> CaptionAcceleration {
    let path = app_data_dir.join(CAPTION_ACCELERATION_FILE);
    let Ok(value) = std::fs::read_to_string(path) else {
        return CaptionAcceleration::default();
    };

    match value.trim().to_ascii_lowercase().as_str() {
        "cpu" => CaptionAcceleration::Cpu,
        "directml" => CaptionAcceleration::Directml,
        _ => CaptionAcceleration::Auto,
    }
}

pub fn set_caption_acceleration(
    app_data_dir: &Path,
    acceleration: CaptionAcceleration,
) -> Result<CaptionAcceleration> {
    let path = app_data_dir.join(CAPTION_ACCELERATION_FILE);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, acceleration.as_str())?;
    CAPTION_SESSION_DIRTY.store(true, Ordering::Relaxed);
    Ok(acceleration)
}

pub fn caption_detail(app_data_dir: &Path) -> CaptionDetail {
    let path = app_data_dir.join(CAPTION_DETAIL_FILE);
    let Ok(value) = std::fs::read_to_string(path) else {
        return CaptionDetail::default();
    };

    match value.trim().to_ascii_lowercase().as_str() {
        "short" => CaptionDetail::Short,
        "paragraph" => CaptionDetail::Paragraph,
        _ => CaptionDetail::Detailed,
    }
}

pub fn set_caption_detail(app_data_dir: &Path, detail: CaptionDetail) -> Result<CaptionDetail> {
    let path = app_data_dir.join(CAPTION_DETAIL_FILE);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, detail.as_str())?;
    CAPTION_SESSION_DIRTY.store(true, Ordering::Relaxed);
    Ok(detail)
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
        if onnx_runtime::ONNX_RUNTIME_FILES
            .iter()
            .any(|(runtime_file, _, _)| runtime_file == file)
        {
            onnx_runtime::download_onnx_runtime_files(&local_dir)?;
            completed_files = REQUIRED_FILES
                .iter()
                .filter(|file| local_dir.join(file).exists())
                .count();
        } else {
            let cached = repo.get(file)?;
            std::fs::copy(cached, destination)?;
            completed_files += 1;
        }
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
    onnx_runtime::ensure_onnx_runtime(&local_dir)?;
    let tokenizer =
        Tokenizer::from_file(local_dir.join("tokenizer.json")).map_err(anyhow::Error::msg)?;

    let acceleration = caption_acceleration(app_data_dir);

    // For the vision encoder (the only session that runs on the GPU EP) we
    // create an actual ORT session so we can verify which EP was actually
    // loaded, rather than just echoing the settings file.
    let vision_session = probe_vision_session(
        &local_dir.join("onnx/vision_encoder_fp16.onnx"),
        acceleration,
    )?;

    // The remaining entries are DLLs and CPU-only text/decoder models — probe
    // them with the lightweight file-size check as before.
    let other_files = [
        "onnxruntime/onnxruntime.dll",
        "onnxruntime/onnxruntime_providers_shared.dll",
        "onnxruntime/DirectML.dll",
        "onnx/embed_tokens_fp16.onnx",
        "onnx/encoder_model_q4.onnx",
        "onnx/decoder_model_q4.onnx",
        "onnx/decoder_model_merged_q4.onnx",
    ];
    let mut sessions = vec![vision_session];
    for file in other_files {
        sessions.push(probe_session(file, &local_dir.join(file))?);
    }

    Ok(CaptionRuntimeProbe {
        ready: true,
        acceleration,
        detail: caption_detail(app_data_dir),
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
    onnx_runtime::ensure_onnx_runtime(&local_dir)?;
    let pixels = preprocess_image(image_path)?;
    let input_shape = vec![1, 3, 768, 768];
    let input = Tensor::from_array(([1usize, 3, 768, 768], pixels.into_boxed_slice()))
        .map_err(|error| anyhow::anyhow!("{error}"))?;
    let acceleration = caption_acceleration(app_data_dir);
    let mut session = create_session(
        &local_dir.join("onnx/vision_encoder_fp16.onnx"),
        acceleration,
        true,
    )?;
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
        acceleration,
    })
}

pub fn generate_caption(app_data_dir: &Path, image_path: &Path) -> Result<String> {
    let mut captioner = FlorenceCaptioner::new(app_data_dir)?;
    captioner.generate(image_path)
}

impl FlorenceCaptioner {
    pub fn new(app_data_dir: &Path) -> Result<Self> {
        let started_at = Instant::now();
        let status = caption_model_status(app_data_dir);
        if !status.ready {
            anyhow::bail!(
                "Florence-2 model is missing {} required file(s)",
                status.missing_files.len()
            );
        }

        let local_dir = model_dir(app_data_dir);
        onnx_runtime::ensure_onnx_runtime(&local_dir)?;
        let tokenizer =
            Tokenizer::from_file(local_dir.join("tokenizer.json")).map_err(anyhow::Error::msg)?;
        let caption_detail = caption_detail(app_data_dir);

        let sessions_started_at = Instant::now();
        let acceleration = caption_acceleration(app_data_dir);
        let vision_session = create_session(
            &local_dir.join("onnx/vision_encoder_fp16.onnx"),
            acceleration,
            true,
        )?;
        let embed_session = create_session(
            &local_dir.join("onnx/embed_tokens_fp16.onnx"),
            acceleration,
            false,
        )?;
        let encoder_session = create_session(
            &local_dir.join("onnx/encoder_model_q4.onnx"),
            acceleration,
            false,
        )?;
        let decoder_prefill_session = create_session(
            &local_dir.join("onnx/decoder_model_q4.onnx"),
            acceleration,
            false,
        )?;
        let decoder_session = create_session(
            &local_dir.join("onnx/decoder_model_merged_q4.onnx"),
            acceleration,
            false,
        )?;
        log::info!(
            "Florence sessions loaded in {:?} with {:?} acceleration (total init {:?})",
            sessions_started_at.elapsed(),
            acceleration,
            started_at.elapsed()
        );

        Ok(Self {
            tokenizer,
            caption_detail,
            vision_session,
            embed_session,
            encoder_session,
            decoder_prefill_session,
            decoder_session,
        })
    }

    pub fn generate(&mut self, image_path: &Path) -> Result<String> {
        let started_at = Instant::now();
        log::info!("Florence caption started: {}", image_path.display());
        let image_features = run_vision_encoder(&mut self.vision_session, image_path)?;
        log::info!("Florence vision encoder done in {:?}", started_at.elapsed());
        let prompt_ids = self
            .tokenizer
            .encode(self.caption_detail.prompt(), false)
            .map_err(anyhow::Error::msg)?
            .get_ids()
            .iter()
            .map(|id| i64::from(*id))
            .collect::<Vec<_>>();
        let prompt_embeds = run_token_embedder(&mut self.embed_session, &prompt_ids)?;
        log::info!(
            "Florence token embeddings done in {:?}",
            started_at.elapsed()
        );
        let encoder_embeds = concatenate_sequence_embeddings(&image_features, &prompt_embeds)?;
        let encoder_attention_mask = vec![1_i64; encoder_embeds.shape[1] as usize];
        let encoder_hidden_states = run_encoder(
            &mut self.encoder_session,
            &encoder_embeds,
            &encoder_attention_mask,
        )?;
        log::info!("Florence encoder done in {:?}", started_at.elapsed());

        let generated_ids = run_decoder(
            &mut self.decoder_prefill_session,
            &mut self.decoder_session,
            &mut self.embed_session,
            &encoder_hidden_states,
            &encoder_attention_mask,
            self.caption_detail.max_new_tokens(),
        )?;
        log::info!("Florence decoder done in {:?}", started_at.elapsed());

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
        "onnxruntime/onnxruntime.dll" => (
            vec!["OrtGetApiBase".to_string()],
            vec!["ORT DirectML 1.24.2".to_string()],
        ),
        "onnxruntime/onnxruntime_providers_shared.dll" => (
            vec!["providers".to_string()],
            vec!["shared provider bridge".to_string()],
        ),
        "onnxruntime/DirectML.dll" => (
            vec!["DirectX 12".to_string()],
            vec!["DirectML 1.15.4".to_string()],
        ),
        "onnx/decoder_model_q4.onnx" => (
            vec![
                "encoder_attention_mask".to_string(),
                "encoder_hidden_states".to_string(),
                "inputs_embeds".to_string(),
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

/// Create an actual ORT session for the vision encoder and return a probe
/// entry that reflects which execution provider was successfully loaded.
/// This is the only session that can legitimately run on DirectML; all
/// text/decoder sessions intentionally use CPU only.
fn probe_vision_session(
    path: &Path,
    acceleration: CaptionAcceleration,
) -> Result<CaptionRuntimeSessionProbe> {
    let metadata = std::fs::metadata(path)?;
    if metadata.len() == 0 {
        anyhow::bail!("{} is empty", path.display());
    }

    // Try to create the session with the requested acceleration.  If DirectML
    // was requested but fails we report what actually loaded.
    let loaded_acceleration = match acceleration {
        CaptionAcceleration::Cpu => {
            create_session(path, CaptionAcceleration::Cpu, false)?;
            CaptionAcceleration::Cpu
        }
        CaptionAcceleration::Auto => {
            // `fail_silently` — session will fall back to CPU if DirectML
            // is unavailable; we detect this by trying Directml explicitly.
            let directml_ok = create_session(path, CaptionAcceleration::Directml, true).is_ok();
            if directml_ok {
                CaptionAcceleration::Directml
            } else {
                create_session(path, CaptionAcceleration::Cpu, false)?;
                CaptionAcceleration::Cpu
            }
        }
        CaptionAcceleration::Directml => {
            create_session(path, CaptionAcceleration::Directml, true)?;
            CaptionAcceleration::Directml
        }
    };

    Ok(CaptionRuntimeSessionProbe {
        file: "onnx/vision_encoder_fp16.onnx",
        inputs: vec!["pixel_values".to_string()],
        outputs: vec![format!("image_features [EP: {:?}]", loaded_acceleration)],
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
    decoder_prefill_session: &mut Session,
    decoder_session: &mut Session,
    embed_session: &mut Session,
    encoder_hidden_states: &TensorData,
    encoder_attention_mask: &[i64],
    max_new_tokens: usize,
) -> Result<Vec<i64>> {
    const DECODER_LAYERS: usize = 6;
    const DECODER_START_TOKEN_ID: i64 = 2;
    const FORCED_BOS_TOKEN_ID: i64 = 0;
    const EOS_TOKEN_ID: i64 = 2;

    let mut generated = Vec::new();
    let encoder_attention_mask_tensor = Tensor::from_array((
        [1usize, encoder_attention_mask.len()],
        encoder_attention_mask.to_vec().into_boxed_slice(),
    ))
    .map_err(|error| anyhow::anyhow!("{error}"))?;
    let encoder_hidden_states_tensor = tensor_from_data(encoder_hidden_states)?;
    let prefill_inputs_embeds = run_token_embedder(embed_session, &[DECODER_START_TOKEN_ID])?;
    let prefill_inputs_embeds_tensor = tensor_from_data(&prefill_inputs_embeds)?;
    let prefill_started_at = Instant::now();
    let prefill_outputs = decoder_prefill_session
        .run(ort::inputs! {
            "encoder_attention_mask" => encoder_attention_mask_tensor,
            "encoder_hidden_states" => encoder_hidden_states_tensor,
            "inputs_embeds" => prefill_inputs_embeds_tensor
        })
        .map_err(|error| anyhow::anyhow!("{error}"))?;
    log::info!(
        "Florence decoder prefill done in {:?}",
        prefill_started_at.elapsed()
    );
    let _prefill_logits = tensor_data(&prefill_outputs[0])?;
    let mut next_input_id = FORCED_BOS_TOKEN_ID;
    let encoder_kv = collect_present_key_values(&prefill_outputs, DECODER_LAYERS)?;
    let mut decoder_kv = encoder_kv.clone();

    for _ in 0..max_new_tokens {
        if next_input_id == EOS_TOKEN_ID {
            break;
        }
        generated.push(next_input_id);

        let inputs_embeds = run_token_embedder(embed_session, &[next_input_id])?;
        let encoder_attention_mask_tensor = Tensor::from_array((
            [1usize, encoder_attention_mask.len()],
            encoder_attention_mask.to_vec().into_boxed_slice(),
        ))
        .map_err(|error| anyhow::anyhow!("{error}"))?;
        let encoder_hidden_states_tensor = tensor_from_data(encoder_hidden_states)?;
        let inputs_embeds_tensor = tensor_from_data(&inputs_embeds)?;
        let use_cache_branch_tensor = Tensor::from_array(([1usize], vec![true].into_boxed_slice()))
            .map_err(|error| anyhow::anyhow!("{error}"))?;

        let mut inputs = ort::inputs! {
            "encoder_attention_mask" => encoder_attention_mask_tensor,
            "encoder_hidden_states" => encoder_hidden_states_tensor,
            "inputs_embeds" => inputs_embeds_tensor,
            "use_cache_branch" => use_cache_branch_tensor
        };

        for layer in 0..DECODER_LAYERS {
            push_tensor_input(
                &mut inputs,
                format!("past_key_values.{layer}.decoder.key"),
                decoder_kv[layer * 4].clone(),
            )?;
            push_tensor_input(
                &mut inputs,
                format!("past_key_values.{layer}.decoder.value"),
                decoder_kv[layer * 4 + 1].clone(),
            )?;
            push_tensor_input(
                &mut inputs,
                format!("past_key_values.{layer}.encoder.key"),
                encoder_kv[layer * 4 + 2].clone(),
            )?;
            push_tensor_input(
                &mut inputs,
                format!("past_key_values.{layer}.encoder.value"),
                encoder_kv[layer * 4 + 3].clone(),
            )?;
        }

        let outputs = decoder_session
            .run(inputs)
            .map_err(|error| anyhow::anyhow!("{error}"))?;
        let logits = tensor_data(&outputs["logits"])?;
        next_input_id = argmax_last_token(&logits)?;
        decoder_kv = collect_present_key_values(&outputs, DECODER_LAYERS)?;
    }

    log::info!("Florence decoder produced {} token(s)", generated.len());
    Ok(generated)
}

fn create_session(
    path: &Path,
    acceleration: CaptionAcceleration,
    allow_directml: bool,
) -> Result<Session> {
    let builder = Session::builder().map_err(|error| anyhow::anyhow!("{error}"))?;
    let builder = builder
        .with_optimization_level(GraphOptimizationLevel::Level3)
        .map_err(|error| anyhow::anyhow!("{error}"))?;
    let use_directml = allow_directml
        && matches!(
            acceleration,
            CaptionAcceleration::Auto | CaptionAcceleration::Directml
        );
    let builder = builder
        .with_memory_pattern(!use_directml)
        .map_err(|error| anyhow::anyhow!("{error}"))?;
    let builder = builder
        .with_parallel_execution(false)
        .map_err(|error| anyhow::anyhow!("{error}"))?;
    let builder = builder
        .with_intra_threads(1)
        .map_err(|error| anyhow::anyhow!("{error}"))?;
    let mut builder = match acceleration {
        CaptionAcceleration::Cpu => builder,
        CaptionAcceleration::Auto if use_directml => builder
            .with_execution_providers([ep::DirectML::default().build().fail_silently()])
            .unwrap_or_else(|error| error.recover()),
        CaptionAcceleration::Directml if use_directml => builder
            .with_execution_providers([ep::DirectML::default().build().error_on_failure()])
            .map_err(|error| anyhow::anyhow!("{error}"))?,
        CaptionAcceleration::Auto | CaptionAcceleration::Directml => {
            // `allow_directml` is false for the 4 text/decoder sessions —
            // they intentionally run on CPU regardless of the setting.
            log::info!(
                "Florence: using CPU for {} (DirectML disabled for this session type)",
                path.display()
            );
            builder
        }
    };
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

fn collect_present_key_values(
    outputs: &SessionOutputs<'_>,
    layers: usize,
) -> Result<Vec<TensorData>> {
    let expected = layers * 4;
    if outputs.len() < expected + 1 {
        anyhow::bail!(
            "Decoder returned {} output(s), expected at least {}",
            outputs.len(),
            expected + 1
        );
    }

    (1..=expected)
        .map(|index| tensor_data(&outputs[index]))
        .collect::<Result<Vec<_>>>()
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
