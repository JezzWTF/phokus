use crate::ai_tag_filter;
use anyhow::Result;
use hf_hub::{api::sync::Api, Repo, RepoType};
use image::{imageops::FilterType, DynamicImage, ImageReader};
use ort::ep;
use ort::session::{builder::GraphOptimizationLevel, Session};
use ort::value::Tensor;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Instant;

pub const WD_TAGGER_MODEL_ID: &str = "SmilingWolf/wd-swinv2-tagger-v3";
pub const WD_TAGGER_MODEL_NAME: &str = "wd-swinv2-tagger-v3";

const TAGGER_ACCELERATION_FILE: &str = "settings/tagger_acceleration.txt";
const TAGGER_THRESHOLD_FILE: &str = "settings/tagger_threshold.txt";
const TAGGER_BATCH_SIZE_FILE: &str = "settings/tagger_batch_size.txt";
const TAGGER_MODEL_FILE: &str = "settings/tagger_model.txt";

pub const JOYTAG_MODEL_ID: &str = "fancyfeast/joytag";
pub const JOYTAG_MODEL_NAME: &str = "joytag";

// JoyTag preprocessing differs from the WD tagger: it expects RGB (not BGR),
// CLIP-style mean/std normalization on [0,1] values (not raw [0,255]), and an
// NCHW layout (not NHWC). These are the OpenAI CLIP normalization constants.
const JOYTAG_MEAN: [f32; 3] = [0.481_454_66, 0.457_827_5, 0.408_210_73];
const JOYTAG_STD: [f32; 3] = [0.268_629_54, 0.261_302_6, 0.275_777_1];
// JoyTag's recommended detection threshold (used as the default; the user's
// tagger_threshold setting still overrides it).
const JOYTAG_DEFAULT_THRESHOLD: f32 = 0.4;

// Shared ONNX Runtime DLLs (live in the caption model's `onnxruntime/` dir and
// are reused by the tagger). The per-model weight + label files are listed by
// `TaggerModel::download_files`.
const TAGGER_RUNTIME_DLLS: &[&str] = &[
    "onnxruntime/onnxruntime.dll",
    "onnxruntime/onnxruntime_providers_shared.dll",
    "onnxruntime/DirectML.dll",
];

// Tags in these Danbooru categories are kept in the output.
// Category 0 = general, category 4 = character.
// Category 9 = rating (explicit/questionable/sensitive/general) – used for
// `ai_rating` but NOT emitted as individual tags.
const GENERAL_CATEGORY: u8 = 0;
const CHARACTER_CATEGORY: u8 = 4;
const RATING_CATEGORY: u8 = 9;

pub const DEFAULT_THRESHOLD: f32 = 0.35;
pub const DEFAULT_MAX_TAGS: usize = 30;

/// How many images are fed to the GPU in a single forward pass, regardless of
/// how many the worker claims from the DB at once. The WD model is compute-
/// bound on a shared GPU, so a wide batch buys little throughput but holds the
/// GPU (and therefore the WebView2 compositor) hostage for its whole duration,
/// freezing the UI. Small chunks keep each DirectML dispatch short — lower this
/// for a smoother UI under heavy tagging, raise it for marginally higher
/// throughput on a dedicated GPU.
pub const TAGGER_INFER_CHUNK: usize = 4;

/// Brief pause between inference chunks so the compositor and other workers can
/// claim the GPU/CPU between dispatches. Negligible against per-chunk inference.
pub const TAGGER_INFER_YIELD_MS: u64 = 40;

/// Set to `true` by `set_tagger_acceleration` so the tagging worker loop
/// knows to drop its cached `WdTagger` and reload with the new EP.
pub static TAGGER_SESSION_DIRTY: AtomicBool = AtomicBool::new(false);

// ---------------------------------------------------------------------------
// Settings types
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum TaggerAcceleration {
    #[default]
    Auto,
    Cpu,
    Directml,
}

impl TaggerAcceleration {
    fn as_str(self) -> &'static str {
        match self {
            Self::Auto => "auto",
            Self::Cpu => "cpu",
            Self::Directml => "directml",
        }
    }
}

/// Which tagging model is active. Both produce a `TaggerOutput` (tags + an
/// explicitness rating); they differ in vocabulary, preprocessing, and how the
/// rating is derived. WD is Danbooru-trained (anime-leaning); JoyTag uses the
/// Danbooru schema but generalizes to photographic content and is stronger on
/// NSFW concepts.
#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum TaggerModel {
    #[default]
    Wd,
    JoyTag,
}

impl TaggerModel {
    fn as_str(self) -> &'static str {
        match self {
            Self::Wd => "wd",
            Self::JoyTag => "joytag",
        }
    }

    /// Hugging Face repo the model files are fetched from.
    fn repo_id(self) -> &'static str {
        match self {
            Self::Wd => WD_TAGGER_MODEL_ID,
            Self::JoyTag => JOYTAG_MODEL_ID,
        }
    }

    /// Stable display/identifier name.
    fn model_name(self) -> &'static str {
        match self {
            Self::Wd => WD_TAGGER_MODEL_NAME,
            Self::JoyTag => JOYTAG_MODEL_NAME,
        }
    }

    /// Subdirectory under `models/` where this model's files live.
    fn dir_name(self) -> &'static str {
        match self {
            Self::Wd => "wd-swinv2-tagger-v3",
            Self::JoyTag => "joytag",
        }
    }

    /// Files fetched from `repo_id` (the shared ONNX Runtime DLLs are handled
    /// separately). `model.onnx` is the weights; the second is the label list.
    fn download_files(self) -> &'static [&'static str] {
        match self {
            Self::Wd => &["model.onnx", "selected_tags.csv"],
            Self::JoyTag => &["model.onnx", "top_tags.txt"],
        }
    }
}

// ---------------------------------------------------------------------------
// Status / probe types exposed to the frontend
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct TaggerModelStatus {
    pub model_id: &'static str,
    pub model_name: &'static str,
    pub local_dir: String,
    pub ready: bool,
    pub missing_files: Vec<String>,
}

#[derive(Clone, Serialize)]
pub struct TaggerModelProgress {
    pub total_files: usize,
    pub completed_files: usize,
    pub current_file: Option<String>,
    // Byte progress for the file currently downloading. None for files whose
    // size isn't known up front (or between files).
    pub downloaded_bytes: Option<u64>,
    pub total_bytes: Option<u64>,
    pub done: bool,
}

// ---------------------------------------------------------------------------
// Runtime probe types exposed to the frontend
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct TaggerRuntimeProbe {
    pub ready: bool,
    pub acceleration: TaggerAcceleration,
    pub session: TaggerRuntimeSessionProbe,
}

#[derive(Serialize)]
pub struct TaggerRuntimeSessionProbe {
    pub file: &'static str,
    pub inputs: Vec<String>,
    pub outputs: Vec<String>,
}

// ---------------------------------------------------------------------------
// Tag record returned to callers
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
pub struct TagResult {
    pub tag: String,
    pub confidence: f32,
}

#[derive(Debug, Clone, Serialize)]
pub struct TaggerOutput {
    pub tags: Vec<TagResult>,
    /// Highest-scoring rating label: "general" | "sensitive" | "questionable" | "explicit"
    pub rating: String,
}

// ---------------------------------------------------------------------------
// Internal label table built from selected_tags.csv
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
struct TagEntry {
    name: String,
    category: u8,
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/// Directory of the *active* tagger model's files (driven by the
/// `tagger_model` setting), e.g. `…/models/wd-swinv2-tagger-v3`.
pub fn model_dir(app_data_dir: &Path) -> PathBuf {
    app_data_dir
        .join("models")
        .join(tagger_model(app_data_dir).dir_name())
}

// ---------------------------------------------------------------------------
// Settings persistence
// ---------------------------------------------------------------------------

pub fn tagger_model(app_data_dir: &Path) -> TaggerModel {
    let path = app_data_dir.join(TAGGER_MODEL_FILE);
    let Ok(value) = std::fs::read_to_string(path) else {
        return TaggerModel::default();
    };
    match value.trim().to_ascii_lowercase().as_str() {
        "joytag" => TaggerModel::JoyTag,
        _ => TaggerModel::Wd,
    }
}

pub fn set_tagger_model(app_data_dir: &Path, model: TaggerModel) -> Result<TaggerModel> {
    let path = app_data_dir.join(TAGGER_MODEL_FILE);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, model.as_str())?;
    // Switching models means the cached session is for the wrong model; the
    // worker drops and rebuilds it on the next batch (same flag as an EP change).
    TAGGER_SESSION_DIRTY.store(true, Ordering::Relaxed);
    Ok(model)
}

pub fn tagger_acceleration(app_data_dir: &Path) -> TaggerAcceleration {
    let path = app_data_dir.join(TAGGER_ACCELERATION_FILE);
    let Ok(value) = std::fs::read_to_string(path) else {
        return TaggerAcceleration::default();
    };
    match value.trim().to_ascii_lowercase().as_str() {
        "cpu" => TaggerAcceleration::Cpu,
        "directml" => TaggerAcceleration::Directml,
        _ => TaggerAcceleration::Auto,
    }
}

pub fn set_tagger_acceleration(
    app_data_dir: &Path,
    acceleration: TaggerAcceleration,
) -> Result<TaggerAcceleration> {
    let path = app_data_dir.join(TAGGER_ACCELERATION_FILE);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, acceleration.as_str())?;
    TAGGER_SESSION_DIRTY.store(true, Ordering::Relaxed);
    Ok(acceleration)
}

pub fn tagger_threshold(app_data_dir: &Path) -> f32 {
    let path = app_data_dir.join(TAGGER_THRESHOLD_FILE);
    let Ok(value) = std::fs::read_to_string(path) else {
        return DEFAULT_THRESHOLD;
    };
    value
        .trim()
        .parse::<f32>()
        .unwrap_or(DEFAULT_THRESHOLD)
        .clamp(0.01, 1.0)
}

pub fn set_tagger_threshold(app_data_dir: &Path, threshold: f32) -> Result<f32> {
    let clamped = threshold.clamp(0.01, 1.0);
    let path = app_data_dir.join(TAGGER_THRESHOLD_FILE);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, clamped.to_string())?;
    TAGGER_SESSION_DIRTY.store(true, Ordering::Relaxed);
    Ok(clamped)
}

pub fn tagger_batch_size(app_data_dir: &Path) -> usize {
    let path = app_data_dir.join(TAGGER_BATCH_SIZE_FILE);
    let Ok(value) = std::fs::read_to_string(path) else {
        return 8;
    };
    value.trim().parse::<usize>().unwrap_or(8).clamp(1, 100)
}

pub fn set_tagger_batch_size(app_data_dir: &Path, batch_size: usize) -> Result<usize> {
    let clamped = batch_size.clamp(1, 100);
    let path = app_data_dir.join(TAGGER_BATCH_SIZE_FILE);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, clamped.to_string())?;
    Ok(clamped)
}

// ---------------------------------------------------------------------------
// Model status / download
// ---------------------------------------------------------------------------

pub fn tagger_model_status(app_data_dir: &Path) -> TaggerModelStatus {
    let model = tagger_model(app_data_dir);
    let local_dir = model_dir(app_data_dir);
    // The ONNX runtime DLLs live in the caption model dir; reuse them.
    let caption_model_dir = app_data_dir.join("models").join("florence-2-base-ft");

    let mut missing_files: Vec<String> = TAGGER_RUNTIME_DLLS
        .iter()
        .filter(|file| !caption_model_dir.join(file).exists())
        .map(|file| (*file).to_string())
        .collect();
    missing_files.extend(
        model
            .download_files()
            .iter()
            .filter(|file| !local_dir.join(file).exists())
            .map(|file| (*file).to_string()),
    );

    TaggerModelStatus {
        model_id: model.repo_id(),
        model_name: model.model_name(),
        local_dir: local_dir.to_string_lossy().to_string(),
        ready: missing_files.is_empty(),
        missing_files,
    }
}

pub fn prepare_tagger_model_with_progress(
    app_data_dir: &Path,
    emit_progress: impl Fn(TaggerModelProgress),
) -> Result<TaggerModelStatus> {
    let model = tagger_model(app_data_dir);
    let local_dir = model_dir(app_data_dir);
    std::fs::create_dir_all(&local_dir)?;

    // The tagger shares the ONNX runtime DLLs with the captioner; download
    // them here so the tagger works even on a clean install where the caption
    // model has never been fetched (ensure_onnx_runtime only initializes).
    let download_files = model.download_files();
    let caption_model_dir = crate::captioner::model_dir(app_data_dir);
    std::fs::create_dir_all(&caption_model_dir)?;

    // Unified step count across DLLs and tagger files so the bar is coherent.
    let dll_count = crate::captioner::missing_onnx_runtime_count(&caption_model_dir);
    let model_pending = download_files
        .iter()
        .filter(|file| !local_dir.join(file).exists())
        .count();
    let total_files = dll_count + model_pending;
    let mut completed_files = 0usize;

    emit_progress(TaggerModelProgress {
        total_files,
        completed_files,
        current_file: None,
        downloaded_bytes: None,
        total_bytes: None,
        done: total_files == 0,
    });

    // ── ONNX runtime DLLs (small, but non-trivial on a slow link) ──
    {
        let mut last_emit = Instant::now() - std::time::Duration::from_secs(1);
        crate::captioner::provision_onnx_runtime_with_progress(
            &caption_model_dir,
            |label, downloaded, total| {
                if last_emit.elapsed() >= std::time::Duration::from_millis(200) {
                    last_emit = Instant::now();
                    emit_progress(TaggerModelProgress {
                        total_files,
                        completed_files,
                        current_file: Some(format!("ONNX Runtime: {label}")),
                        downloaded_bytes: Some(downloaded),
                        total_bytes: total,
                        done: false,
                    });
                }
            },
        )?;
        completed_files += dll_count;
    }
    log::info!("Tagger: ONNX runtime DLLs ready; initializing runtime");
    crate::captioner::ensure_onnx_runtime(&caption_model_dir)?;
    log::info!("Tagger: runtime initialized; downloading model files");

    // ── Tagger model files (model.onnx is ~446 MB) ──
    // Download directly from the resolved URL with our resilient downloader
    // (timeout + resume), rather than hf-hub's download_with_progress, whose
    // agent has no read timeout and would hang on a stalled connection.
    let api = Api::new()?;
    let repo = api.repo(Repo::new(model.repo_id().to_string(), RepoType::Model));

    for file in download_files {
        let destination = local_dir.join(file);
        if destination.exists() {
            continue;
        }
        let url = repo.url(file);
        let label = (*file).to_string();
        let mut last_emit = Instant::now() - std::time::Duration::from_secs(1);
        crate::captioner::download_file_resilient(&url, &destination, |downloaded, total| {
            if last_emit.elapsed() >= std::time::Duration::from_millis(200) {
                last_emit = Instant::now();
                emit_progress(TaggerModelProgress {
                    total_files,
                    completed_files,
                    current_file: Some(label.clone()),
                    downloaded_bytes: Some(downloaded),
                    total_bytes: total,
                    done: false,
                });
            }
        })?;
        completed_files += 1;
    }

    emit_progress(TaggerModelProgress {
        total_files,
        completed_files,
        current_file: None,
        downloaded_bytes: None,
        total_bytes: None,
        done: true,
    });

    Ok(tagger_model_status(app_data_dir))
}

pub fn delete_tagger_model(app_data_dir: &Path) -> Result<TaggerModelStatus> {
    let local_dir = model_dir(app_data_dir);
    if local_dir.exists() {
        std::fs::remove_dir_all(&local_dir)?;
    }
    Ok(tagger_model_status(app_data_dir))
}

pub fn probe_tagger_runtime(app_data_dir: &Path) -> Result<TaggerRuntimeProbe> {
    let status = tagger_model_status(app_data_dir);
    if !status.ready {
        anyhow::bail!(
            "WD Tagger model is missing {} required file(s): {}",
            status.missing_files.len(),
            status.missing_files.join(", ")
        );
    }

    let local_dir = model_dir(app_data_dir);
    let caption_model_dir = app_data_dir.join("models").join("florence-2-base-ft");
    crate::captioner::ensure_onnx_runtime(&caption_model_dir)?;

    let acceleration = tagger_acceleration(app_data_dir);
    let model_path = local_dir.join("model.onnx");

    // Verify that the model file exists and has non-zero size before trying
    // to create an ORT session (better error message on corruption).
    let metadata = std::fs::metadata(&model_path)?;
    if metadata.len() == 0 {
        anyhow::bail!("model.onnx is empty");
    }

    // Actually create a session to verify the EP loads correctly.
    let loaded_acceleration = match acceleration {
        TaggerAcceleration::Cpu => {
            create_tagger_session(&model_path, TaggerAcceleration::Cpu)?;
            TaggerAcceleration::Cpu
        }
        TaggerAcceleration::Auto => {
            // Try DirectML explicitly; if it fails the real session would have
            // fallen back to CPU silently — report what would actually run.
            let directml_ok =
                create_tagger_session(&model_path, TaggerAcceleration::Directml).is_ok();
            if directml_ok {
                TaggerAcceleration::Directml
            } else {
                create_tagger_session(&model_path, TaggerAcceleration::Cpu)?;
                TaggerAcceleration::Cpu
            }
        }
        TaggerAcceleration::Directml => {
            create_tagger_session(&model_path, TaggerAcceleration::Directml)?;
            TaggerAcceleration::Directml
        }
    };

    Ok(TaggerRuntimeProbe {
        ready: true,
        acceleration: loaded_acceleration,
        session: TaggerRuntimeSessionProbe {
            file: "model.onnx",
            inputs: vec!["pixel_values".to_string()],
            outputs: vec![format!("output [EP: {:?}]", loaded_acceleration)],
        },
    })
}

// ---------------------------------------------------------------------------
// Tagger trait + shared batch skeleton
// ---------------------------------------------------------------------------

/// A loaded tagging model. Implementations differ in vocabulary, preprocessing,
/// and how the explicitness rating is derived, but all turn a batch of image
/// paths into one `TaggerOutput` per path (in order), with per-image failures
/// reflected in the individual `Result`s. Built for the active model by
/// [`create_active_tagger`].
pub trait Tagger {
    fn run_batch(&mut self, image_paths: &[PathBuf], max_tags: usize) -> Vec<Result<TaggerOutput>>;

    /// Stable name of this model, written to the DB as `ai_tagger_model` so
    /// tags can be attributed to (and re-tagged across) models.
    fn model_name(&self) -> &'static str;
}

/// Build the tagger for the currently-selected model.
pub fn create_active_tagger(app_data_dir: &Path) -> Result<Box<dyn Tagger>> {
    match tagger_model(app_data_dir) {
        TaggerModel::Wd => Ok(Box::new(WdTagger::new(app_data_dir)?)),
        TaggerModel::JoyTag => Ok(Box::new(JoyTagger::new(app_data_dir)?)),
    }
}

/// Shared batch skeleton: pack the successfully-preprocessed images into one
/// contiguous buffer, run a single batched forward pass via `infer`, and fall
/// back to per-image inference if the batch fails (e.g. a model pinned to
/// batch=1). Returns one result per input slot, in order — a decode failure
/// stays attached to its own slot. `infer(pixels, count)` runs `count`
/// contiguous images (`count * stride` floats) and returns `count` outputs.
fn assemble_batch(
    preprocessed: Vec<Result<Vec<f32>>>,
    stride: usize,
    model_label: &str,
    mut infer: impl FnMut(&[f32], usize) -> Result<Vec<TaggerOutput>>,
) -> Vec<Result<TaggerOutput>> {
    let mut batch_slots: Vec<usize> = Vec::new();
    let mut batch_pixels: Vec<f32> = Vec::with_capacity(preprocessed.len() * stride);
    for (i, result) in preprocessed.iter().enumerate() {
        if let Ok(pixels) = result {
            batch_slots.push(i);
            batch_pixels.extend_from_slice(pixels);
        }
    }

    // Seed each slot with its decode error; inference overwrites decoded slots.
    let mut results: Vec<Result<TaggerOutput>> = preprocessed
        .into_iter()
        .map(|r| match r {
            Ok(_) => Err(anyhow::anyhow!(
                "tagging inference did not run for this image"
            )),
            Err(error) => Err(error),
        })
        .collect();

    if batch_slots.is_empty() {
        return results; // nothing decoded
    }

    match infer(&batch_pixels, batch_slots.len()) {
        Ok(outputs) => {
            // `infer` must return exactly one output per packed image; the zip
            // below would otherwise silently leave trailing slots as errors.
            debug_assert_eq!(outputs.len(), batch_slots.len());
            for (&slot, output) in batch_slots.iter().zip(outputs) {
                results[slot] = Ok(output);
            }
        }
        Err(batch_error) => {
            log::warn!(
                "{model_label} batch inference failed for {} images, falling back to per-image: {batch_error}",
                batch_slots.len()
            );
            for (k, &slot) in batch_slots.iter().enumerate() {
                let one = &batch_pixels[k * stride..(k + 1) * stride];
                results[slot] = infer(one, 1).and_then(|mut out| {
                    out.drain(..)
                        .next()
                        .ok_or_else(|| anyhow::anyhow!("tagger produced no output for image"))
                });
            }
        }
    }

    results
}

// ---------------------------------------------------------------------------
// WD tagger implementation
// ---------------------------------------------------------------------------

pub struct WdTagger {
    session: Session,
    labels: Vec<TagEntry>,
    threshold: f32,
    input_size: usize,
}

impl WdTagger {
    pub fn new(app_data_dir: &Path) -> Result<Self> {
        let started_at = Instant::now();

        let status = tagger_model_status(app_data_dir);
        if !status.ready {
            anyhow::bail!(
                "WD tagger model is missing {} required file(s): {}",
                status.missing_files.len(),
                status.missing_files.join(", ")
            );
        }

        let local_dir = model_dir(app_data_dir);

        // The ONNX runtime DLLs are shared with the captioner; use the
        // captioner's shared ORT init lock to avoid double-initialisation.
        let caption_model_dir = app_data_dir.join("models").join("florence-2-base-ft");
        crate::captioner::ensure_onnx_runtime(&caption_model_dir).map_err(|e| {
            anyhow::anyhow!(
                "ONNX Runtime not initialised — download the Florence-2 caption model first \
                 to get the shared runtime DLLs. Original error: {e}"
            )
        })?;

        let acceleration = tagger_acceleration(app_data_dir);
        let threshold = tagger_threshold(app_data_dir);
        let model_path = local_dir.join("model.onnx");
        let labels_path = local_dir.join("selected_tags.csv");

        let session = create_tagger_session(&model_path, acceleration)?;

        // Determine the input spatial size (and batch axis, for diagnostics) from
        // the ONNX model graph. WD v3 models use (N, H, W, 3) with H == W,
        // typically 448, and a dynamic batch dimension (reported as -1/0) which
        // batched inference relies on.
        let (input_size, batch_axis) = {
            let inputs = session.inputs();
            inputs
                .first()
                .and_then(|inp| {
                    if let ort::value::ValueType::Tensor { shape, .. } = inp.dtype() {
                        let size = shape.get(1).copied().filter(|&d| d > 0).map(|d| d as usize);
                        Some((size.unwrap_or(448), shape.first().copied()))
                    } else {
                        None
                    }
                })
                .unwrap_or((448, None))
        };

        let labels = load_labels(&labels_path)?;

        log::info!(
            "WD tagger loaded in {:?} ({} labels, input {}x{}, batch axis {:?}, {:?} acceleration)",
            started_at.elapsed(),
            labels.len(),
            input_size,
            input_size,
            batch_axis,
            acceleration,
        );

        Ok(Self {
            session,
            labels,
            threshold,
            input_size,
        })
    }

    /// Run `count` already-preprocessed images (contiguous `[count, H, W, 3]`
    /// pixels) through the model in one forward pass.
    fn infer_batch(
        &mut self,
        pixels: &[f32],
        count: usize,
        max_tags: usize,
    ) -> Result<Vec<TaggerOutput>> {
        let input = Tensor::from_array((
            [count, self.input_size, self.input_size, 3usize],
            pixels.to_vec().into_boxed_slice(),
        ))
        .map_err(|error| anyhow::anyhow!("{error}"))?;

        let input_name: String = self.session.inputs()[0].name().to_string();
        let outputs = self
            .session
            .run(ort::inputs! { input_name.as_str() => input })
            .map_err(|error| anyhow::anyhow!("{error}"))?;

        let (_, probs) = outputs[0]
            .try_extract_tensor::<f32>()
            .map_err(|error| anyhow::anyhow!("{error}"))?;

        let n_labels = self.labels.len();
        if probs.len() != count * n_labels {
            anyhow::bail!(
                "Model output length {} does not match {} images x {} labels",
                probs.len(),
                count,
                n_labels
            );
        }

        // Borrow disjoint fields (not all of `self`) so this doesn't conflict
        // with the mutable session borrow `outputs` still holds.
        let labels = &self.labels;
        let threshold = self.threshold;
        Ok(probs
            .chunks_exact(n_labels)
            .map(|row| Self::tags_from_probs(labels, threshold, row, max_tags))
            .collect())
    }

    /// Convert one image's class probabilities into its rating + sorted tags.
    /// Associated (not `&self`) so callers can hold a disjoint session borrow.
    fn tags_from_probs(
        labels: &[TagEntry],
        threshold: f32,
        probs: &[f32],
        max_tags: usize,
    ) -> TaggerOutput {
        // Rating (category 9): pick the argmax label as the rating.
        let rating = labels
            .iter()
            .zip(probs.iter())
            .filter(|(entry, _)| entry.category == RATING_CATEGORY)
            .max_by(|(_, a), (_, b)| a.total_cmp(b))
            .map(|(entry, _)| entry.name.clone())
            .unwrap_or_else(|| "general".to_string());

        // General + character tags above threshold, sorted by confidence.
        let mut tags: Vec<TagResult> = labels
            .iter()
            .zip(probs.iter())
            .filter(|(entry, prob)| {
                (entry.category == GENERAL_CATEGORY || entry.category == CHARACTER_CATEGORY)
                    && **prob >= threshold
                    && !ai_tag_filter::is_removed_ai_tag(&entry.name)
            })
            .map(|(entry, prob)| TagResult {
                tag: entry.name.clone(),
                confidence: *prob,
            })
            .collect();

        tags.sort_by(|a, b| b.confidence.total_cmp(&a.confidence));
        tags.truncate(max_tags);

        TaggerOutput { tags, rating }
    }
}

impl Tagger for WdTagger {
    fn run_batch(&mut self, image_paths: &[PathBuf], max_tags: usize) -> Vec<Result<TaggerOutput>> {
        if image_paths.is_empty() {
            return Vec::new();
        }
        let input_size = self.input_size;
        let preprocessed: Vec<Result<Vec<f32>>> = image_paths
            .par_iter()
            .map(|path| preprocess_image(path, input_size))
            .collect();
        assemble_batch(
            preprocessed,
            input_size * input_size * 3,
            "WD tagger",
            |pixels, count| self.infer_batch(pixels, count, max_tags),
        )
    }

    fn model_name(&self) -> &'static str {
        WD_TAGGER_MODEL_NAME
    }
}

// ---------------------------------------------------------------------------
// JoyTag implementation
// JoyTag uses the Danbooru tag schema but generalizes to photographic content
// and is strong on NSFW concepts. It has no rating output, so the explicitness
// rating is derived from its NSFW tags (see `joytag_rating`). Input is NCHW,
// RGB, CLIP-normalized — see `preprocess_joytag`.
// ---------------------------------------------------------------------------

pub struct JoyTagger {
    session: Session,
    labels: Vec<String>,
    threshold: f32,
    input_size: usize,
}

impl JoyTagger {
    pub fn new(app_data_dir: &Path) -> Result<Self> {
        let started_at = Instant::now();

        let status = tagger_model_status(app_data_dir);
        if !status.ready {
            anyhow::bail!(
                "JoyTag model is missing {} required file(s): {}",
                status.missing_files.len(),
                status.missing_files.join(", ")
            );
        }

        let local_dir = model_dir(app_data_dir);

        // Shared ONNX runtime DLLs (see WdTagger::new).
        let caption_model_dir = app_data_dir.join("models").join("florence-2-base-ft");
        crate::captioner::ensure_onnx_runtime(&caption_model_dir).map_err(|e| {
            anyhow::anyhow!(
                "ONNX Runtime not initialised — download the Florence-2 caption model first \
                 to get the shared runtime DLLs. Original error: {e}"
            )
        })?;

        let acceleration = tagger_acceleration(app_data_dir);
        let threshold = joytag_threshold(app_data_dir);
        let model_path = local_dir.join("model.onnx");
        let labels_path = local_dir.join("top_tags.txt");

        let session = create_tagger_session(&model_path, acceleration)?;

        // JoyTag uses NCHW (N, 3, H, W); the spatial size lives at axis 2.
        let (input_size, batch_axis) = {
            let inputs = session.inputs();
            inputs
                .first()
                .and_then(|inp| {
                    if let ort::value::ValueType::Tensor { shape, .. } = inp.dtype() {
                        let size = shape.get(2).copied().filter(|&d| d > 0).map(|d| d as usize);
                        Some((size.unwrap_or(448), shape.first().copied()))
                    } else {
                        None
                    }
                })
                .unwrap_or((448, None))
        };

        let labels = load_joytag_labels(&labels_path)?;

        log::info!(
            "JoyTag loaded in {:?} ({} tags, input {}x{}, batch axis {:?}, {:?} acceleration)",
            started_at.elapsed(),
            labels.len(),
            input_size,
            input_size,
            batch_axis,
            acceleration,
        );

        Ok(Self {
            session,
            labels,
            threshold,
            input_size,
        })
    }

    /// Run `count` already-preprocessed images (contiguous `[count, 3, H, W]`
    /// pixels) through the model in one forward pass.
    fn infer_batch(
        &mut self,
        pixels: &[f32],
        count: usize,
        max_tags: usize,
    ) -> Result<Vec<TaggerOutput>> {
        let input = Tensor::from_array((
            [count, 3usize, self.input_size, self.input_size],
            pixels.to_vec().into_boxed_slice(),
        ))
        .map_err(|error| anyhow::anyhow!("{error}"))?;

        let input_name: String = self.session.inputs()[0].name().to_string();
        let outputs = self
            .session
            .run(ort::inputs! { input_name.as_str() => input })
            .map_err(|error| anyhow::anyhow!("{error}"))?;

        let (_, logits) = outputs[0]
            .try_extract_tensor::<f32>()
            .map_err(|error| anyhow::anyhow!("{error}"))?;

        let n_labels = self.labels.len();
        if logits.len() != count * n_labels {
            anyhow::bail!(
                "Model output length {} does not match {} images x {} labels",
                logits.len(),
                count,
                n_labels
            );
        }

        let labels = &self.labels;
        let threshold = self.threshold;
        Ok(logits
            .chunks_exact(n_labels)
            .map(|row| joytag_tags_from_logits(labels, threshold, row, max_tags))
            .collect())
    }
}

impl Tagger for JoyTagger {
    fn run_batch(&mut self, image_paths: &[PathBuf], max_tags: usize) -> Vec<Result<TaggerOutput>> {
        if image_paths.is_empty() {
            return Vec::new();
        }
        let input_size = self.input_size;
        let preprocessed: Vec<Result<Vec<f32>>> = image_paths
            .par_iter()
            .map(|path| preprocess_joytag(path, input_size))
            .collect();
        assemble_batch(
            preprocessed,
            input_size * input_size * 3,
            "JoyTag",
            |pixels, count| self.infer_batch(pixels, count, max_tags),
        )
    }

    fn model_name(&self) -> &'static str {
        JOYTAG_MODEL_NAME
    }
}

// ---------------------------------------------------------------------------
// Session creation – mirrors captioner's `create_session`
// ---------------------------------------------------------------------------

fn create_tagger_session(path: &Path, acceleration: TaggerAcceleration) -> Result<Session> {
    let builder = Session::builder().map_err(|error| anyhow::anyhow!("{error}"))?;
    let builder = builder
        .with_optimization_level(GraphOptimizationLevel::Level3)
        .map_err(|error| anyhow::anyhow!("{error}"))?;

    let use_directml = matches!(
        acceleration,
        TaggerAcceleration::Auto | TaggerAcceleration::Directml
    );

    // Intra-op thread count. For DirectML the matmuls run on the GPU, so a
    // single CPU thread for the few CPU-side ops avoids needlessly contending
    // with the other workers. The CPU EP, however, is compute-bound and would
    // otherwise be pinned to one core (~15x slower than it needs to be), so give
    // it most of the logical cores while leaving a couple free for the UI and a
    // possible concurrent scan. Tagging is the lowest-priority worker, so when
    // it runs the heavier workers are idle. (Auto only lands on CPU when
    // DirectML is unavailable — rare on Windows — and stays single-threaded;
    // CPU-bound users can select the CPU provider explicitly for the speedup.)
    let intra_threads = match acceleration {
        TaggerAcceleration::Cpu => std::thread::available_parallelism()
            .map(|p| p.get().saturating_sub(2).max(1))
            .unwrap_or(2),
        TaggerAcceleration::Auto | TaggerAcceleration::Directml => 1,
    };

    let builder = builder
        .with_memory_pattern(!use_directml)
        .map_err(|error| anyhow::anyhow!("{error}"))?;
    let builder = builder
        .with_parallel_execution(false)
        .map_err(|error| anyhow::anyhow!("{error}"))?;
    let builder = builder
        .with_intra_threads(intra_threads)
        .map_err(|error| anyhow::anyhow!("{error}"))?;

    let mut builder = match acceleration {
        TaggerAcceleration::Cpu => {
            log::info!("Tagger: using CPU execution provider ({intra_threads} intra-op threads)");
            builder
        }
        TaggerAcceleration::Auto => builder
            .with_execution_providers([ep::DirectML::default().build().fail_silently()])
            .unwrap_or_else(|error| {
                log::info!("Tagger: DirectML unavailable, falling back to CPU");
                error.recover()
            }),
        TaggerAcceleration::Directml => builder
            .with_execution_providers([ep::DirectML::default().build().error_on_failure()])
            .map_err(|error| anyhow::anyhow!("{error}"))?,
    };

    let session = builder
        .commit_from_file(path)
        .map_err(|error| anyhow::anyhow!("{error}"))?;

    Ok(session)
}
// ---------------------------------------------------------------------------
// Label loading
// ---------------------------------------------------------------------------

fn load_labels(path: &Path) -> Result<Vec<TagEntry>> {
    let mut reader = csv::Reader::from_path(path)?;
    let mut entries = Vec::new();
    for result in reader.records() {
        let record = result?;
        // CSV columns: tag_id, name, category, count
        let name = record
            .get(1)
            .ok_or_else(|| anyhow::anyhow!("Missing name column in selected_tags.csv"))?
            .replace('_', " ");
        let category: u8 = record
            .get(2)
            .ok_or_else(|| anyhow::anyhow!("Missing category column in selected_tags.csv"))?
            .parse()
            .unwrap_or(0);
        entries.push(TagEntry { name, category });
    }
    if entries.is_empty() {
        anyhow::bail!("selected_tags.csv is empty or could not be parsed");
    }
    Ok(entries)
}

// ---------------------------------------------------------------------------
// JoyTag: label loading, threshold, rating derivation
// ---------------------------------------------------------------------------

/// JoyTag labels: one tag per line, index == output position. Underscores are
/// replaced with spaces to match the display style used elsewhere.
fn load_joytag_labels(path: &Path) -> Result<Vec<String>> {
    let content = std::fs::read_to_string(path)?;
    let labels: Vec<String> = content
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(|line| line.replace('_', " "))
        .collect();
    if labels.is_empty() {
        anyhow::bail!("top_tags.txt is empty or could not be parsed");
    }
    Ok(labels)
}

/// JoyTag detection threshold. Honours the shared `tagger_threshold` setting if
/// the user has set it, otherwise uses JoyTag's recommended default (0.4).
fn joytag_threshold(app_data_dir: &Path) -> f32 {
    match std::fs::read_to_string(app_data_dir.join(TAGGER_THRESHOLD_FILE)) {
        Ok(value) => value
            .trim()
            .parse::<f32>()
            .unwrap_or(JOYTAG_DEFAULT_THRESHOLD)
            .clamp(0.01, 1.0),
        Err(_) => JOYTAG_DEFAULT_THRESHOLD,
    }
}

fn sigmoid(x: f32) -> f32 {
    1.0 / (1.0 + (-x).exp())
}

// Explicitness buckets for deriving a rating from JoyTag's tags (highest match
// wins). Names use spaces, since underscores are stripped on load. Tunable.
const JOYTAG_EXPLICIT_TAGS: &[&str] = &[
    "sex",
    "vaginal",
    "anal",
    "oral",
    "fellatio",
    "cunnilingus",
    "penis",
    "pussy",
    "cum",
    "ejaculation",
    "erection",
    "handjob",
    "paizuri",
    "masturbation",
];
const JOYTAG_QUESTIONABLE_TAGS: &[&str] = &[
    "nude",
    "completely nude",
    "nipples",
    "topless",
    "bottomless",
    "pubic hair",
    "areola",
    "areolae",
];
const JOYTAG_SENSITIVE_TAGS: &[&str] = &[
    "lingerie",
    "underwear",
    "panties",
    "swimsuit",
    "bikini",
    "cleavage",
    "bra",
    "midriff",
];

/// Derive an explicitness rating from JoyTag's tags. JoyTag has no rating
/// output, so this maps its NSFW-content tags onto the WD-style buckets.
fn joytag_rating(tags: &[TagResult]) -> String {
    let has = |bucket: &[&str]| tags.iter().any(|t| bucket.contains(&t.tag.as_str()));
    if has(JOYTAG_EXPLICIT_TAGS) {
        "explicit".to_string()
    } else if has(JOYTAG_QUESTIONABLE_TAGS) {
        "questionable".to_string()
    } else if has(JOYTAG_SENSITIVE_TAGS) {
        "sensitive".to_string()
    } else {
        "general".to_string()
    }
}

/// Convert one image's JoyTag logits into sorted tags + a derived rating.
fn joytag_tags_from_logits(
    labels: &[String],
    threshold: f32,
    logits: &[f32],
    max_tags: usize,
) -> TaggerOutput {
    let mut tags: Vec<TagResult> = labels
        .iter()
        .zip(logits.iter())
        .filter_map(|(name, logit)| {
            let confidence = sigmoid(*logit);
            (confidence >= threshold && !ai_tag_filter::is_removed_ai_tag(name)).then(|| {
                TagResult {
                    tag: name.clone(),
                    confidence,
                }
            })
        })
        .collect();
    tags.sort_by(|a, b| b.confidence.total_cmp(&a.confidence));

    // Derive the rating from all kept tags before truncating to max_tags.
    let rating = joytag_rating(&tags);
    tags.truncate(max_tags);

    TaggerOutput { tags, rating }
}

// ---------------------------------------------------------------------------
// Image preprocessing
// Both taggers pad to square with white and resize to the model input size;
// they differ only in channel order, value range, and tensor layout.
// ---------------------------------------------------------------------------

/// Decode an image, composite any alpha onto white, pad to a centered square,
/// and resize to `target_size`. Shared by both taggers.
fn decode_pad_resize(image_path: &Path, target_size: usize) -> Result<image::RgbImage> {
    let image = ImageReader::open(image_path)?.decode()?;

    // Composite any alpha channel onto a white background.
    let image_rgba = image.to_rgba8();
    let (width, height) = image_rgba.dimensions();
    let mut canvas_rgba =
        image::RgbaImage::from_pixel(width, height, image::Rgba([255, 255, 255, 255]));
    image::imageops::overlay(&mut canvas_rgba, &image_rgba, 0, 0);
    let image_rgb = DynamicImage::ImageRgba8(canvas_rgba).to_rgb8();

    // Pad to a centered square.
    let max_dim = width.max(height);
    let pad_left = (max_dim - width) / 2;
    let pad_top = (max_dim - height) / 2;
    let mut square = image::RgbImage::from_pixel(max_dim, max_dim, image::Rgb([255, 255, 255]));
    image::imageops::overlay(&mut square, &image_rgb, pad_left as i64, pad_top as i64);

    // Resize to model input size (CatmullRom ≈ PIL BICUBIC).
    Ok(image::imageops::resize(
        &square,
        target_size as u32,
        target_size as u32,
        FilterType::CatmullRom,
    ))
}

/// WD tagger input: (N, H, W, 3) float32, raw [0,255] values, BGR order.
fn preprocess_image(image_path: &Path, target_size: usize) -> Result<Vec<f32>> {
    let resized = decode_pad_resize(image_path, target_size)?;
    let mut pixel_values = vec![0.0f32; target_size * target_size * 3];
    for (x, y, pixel) in resized.enumerate_pixels() {
        let base = (y as usize * target_size + x as usize) * 3;
        // BGR order
        pixel_values[base] = f32::from(pixel[2]); // B
        pixel_values[base + 1] = f32::from(pixel[1]); // G
        pixel_values[base + 2] = f32::from(pixel[0]); // R
    }
    Ok(pixel_values)
}

/// JoyTag input: (N, 3, H, W) float32, RGB, CLIP-normalized ((x/255 − mean)/std).
fn preprocess_joytag(image_path: &Path, target_size: usize) -> Result<Vec<f32>> {
    let resized = decode_pad_resize(image_path, target_size)?;
    let plane = target_size * target_size;
    let mut pixel_values = vec![0.0f32; 3 * plane];
    for (x, y, pixel) in resized.enumerate_pixels() {
        let idx = y as usize * target_size + x as usize;
        // Channel-major (NCHW): R plane, then G, then B.
        for c in 0..3 {
            pixel_values[c * plane + idx] =
                (f32::from(pixel[c]) / 255.0 - JOYTAG_MEAN[c]) / JOYTAG_STD[c];
        }
    }
    Ok(pixel_values)
}
