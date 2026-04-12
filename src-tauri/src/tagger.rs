use anyhow::Result;
use hf_hub::{api::sync::Api, Repo, RepoType};
use image::{imageops::FilterType, DynamicImage, ImageReader};
use ort::ep;
use ort::session::{builder::GraphOptimizationLevel, Session};
use ort::value::Tensor;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Instant;

pub const WD_TAGGER_MODEL_ID: &str = "SmilingWolf/wd-swinv2-tagger-v3";
pub const WD_TAGGER_MODEL_NAME: &str = "wd-swinv2-tagger-v3";

const TAGGER_ACCELERATION_FILE: &str = "settings/tagger_acceleration.txt";
const TAGGER_THRESHOLD_FILE: &str = "settings/tagger_threshold.txt";
const TAGGER_BATCH_SIZE_FILE: &str = "settings/tagger_batch_size.txt";

// Files required on disk before the tagger can run.  The ONNX runtime DLLs
// are shared with the captioner and live in the same `onnxruntime/` directory.
const TAGGER_REQUIRED_FILES: &[&str] = &[
    "onnxruntime/onnxruntime.dll",
    "onnxruntime/onnxruntime_providers_shared.dll",
    "onnxruntime/DirectML.dll",
    "model.onnx",
    "selected_tags.csv",
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

/// Set to `true` by `set_tagger_acceleration` so the tagging worker loop
/// knows to drop its cached `WdTagger` and reload with the new EP.
pub static TAGGER_SESSION_DIRTY: AtomicBool = AtomicBool::new(false);

// ---------------------------------------------------------------------------
// Settings types
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum TaggerAcceleration {
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

impl Default for TaggerAcceleration {
    fn default() -> Self {
        Self::Auto
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

pub fn model_dir(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("models").join("wd-swinv2-tagger-v3")
}

// ---------------------------------------------------------------------------
// Settings persistence
// ---------------------------------------------------------------------------

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
    Ok(clamped)
}

pub fn tagger_batch_size(app_data_dir: &Path) -> usize {
    let path = app_data_dir.join(TAGGER_BATCH_SIZE_FILE);
    let Ok(value) = std::fs::read_to_string(path) else {
        return 8;
    };
    value
        .trim()
        .parse::<usize>()
        .unwrap_or(8)
        .clamp(1, 100)
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
    let local_dir = model_dir(app_data_dir);
    // The ONNX runtime DLLs live in the caption model dir; reuse them.
    let caption_model_dir = app_data_dir.join("models").join("florence-2-base-ft");
    let missing_files = TAGGER_REQUIRED_FILES
        .iter()
        .filter(|file| {
            let path = if file.starts_with("onnxruntime/") {
                caption_model_dir.join(file)
            } else {
                local_dir.join(file)
            };
            !path.exists()
        })
        .map(|file| (*file).to_string())
        .collect::<Vec<_>>();

    TaggerModelStatus {
        model_id: WD_TAGGER_MODEL_ID,
        model_name: WD_TAGGER_MODEL_NAME,
        local_dir: local_dir.to_string_lossy().to_string(),
        ready: missing_files.is_empty(),
        missing_files,
    }
}

pub fn prepare_tagger_model_with_progress(
    app_data_dir: &Path,
    emit_progress: impl Fn(TaggerModelProgress),
) -> Result<TaggerModelStatus> {
    let local_dir = model_dir(app_data_dir);
    std::fs::create_dir_all(&local_dir)?;

    // Only download the two tagger-specific files; ONNX runtime DLLs are
    // already handled by the captioner download flow.
    const DOWNLOAD_FILES: &[&str] = &["model.onnx", "selected_tags.csv"];

    let api = Api::new()?;
    let repo = api.repo(Repo::new(WD_TAGGER_MODEL_ID.to_string(), RepoType::Model));

    let mut completed_files = DOWNLOAD_FILES
        .iter()
        .filter(|file| local_dir.join(file).exists())
        .count();

    emit_progress(TaggerModelProgress {
        total_files: DOWNLOAD_FILES.len(),
        completed_files,
        current_file: None,
        done: completed_files == DOWNLOAD_FILES.len(),
    });

    for file in DOWNLOAD_FILES {
        let destination = local_dir.join(file);
        if destination.exists() {
            continue;
        }
        emit_progress(TaggerModelProgress {
            total_files: DOWNLOAD_FILES.len(),
            completed_files,
            current_file: Some((*file).to_string()),
            done: false,
        });
        let cached = repo.get(file)?;
        std::fs::copy(cached, destination)?;
        completed_files += 1;
        emit_progress(TaggerModelProgress {
            total_files: DOWNLOAD_FILES.len(),
            completed_files,
            current_file: Some((*file).to_string()),
            done: completed_files == DOWNLOAD_FILES.len(),
        });
    }

    emit_progress(TaggerModelProgress {
        total_files: DOWNLOAD_FILES.len(),
        completed_files,
        current_file: None,
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
// Top-level inference entry point
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Tagger implementation
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

        // Determine the input spatial size from the ONNX model graph.
        // WD v3 models use (1, H, W, 3) where H == W, typically 448.
        let input_size = {
            let inputs = session.inputs();
            let dim = inputs
                .first()
                .and_then(|inp| {
                    if let ort::value::ValueType::Tensor { shape, .. } = inp.dtype() {
                        shape
                            .get(1)
                            .and_then(|&d| if d > 0 { Some(d as usize) } else { None })
                    } else {
                        None
                    }
                })
                .unwrap_or(448);
            dim
        };

        let labels = load_labels(&labels_path)?;

        println!(
            "WD tagger loaded in {:?} ({} labels, input {}x{}, {:?} acceleration)",
            started_at.elapsed(),
            labels.len(),
            input_size,
            input_size,
            acceleration,
        );

        Ok(Self {
            session,
            labels,
            threshold,
            input_size,
        })
    }

    pub fn run(&mut self, image_path: &Path, max_tags: usize) -> Result<TaggerOutput> {
        let started_at = Instant::now();

        let image_array = preprocess_image(image_path, self.input_size)?;
        let batch_size = 1usize;
        let input = Tensor::from_array((
            [batch_size, self.input_size, self.input_size, 3usize],
            image_array.into_boxed_slice(),
        ))
        .map_err(|error| anyhow::anyhow!("{error}"))?;

        let input_name: String = self.session.inputs()[0].name().to_string();
        let outputs = self
            .session
            .run(ort::inputs! { input_name.as_str() => input })
            .map_err(|error| anyhow::anyhow!("{error}"))?;

        let (_, probabilities) = outputs[0]
            .try_extract_tensor::<f32>()
            .map_err(|error| anyhow::anyhow!("{error}"))?;

        let probs: &[f32] = &probabilities;

        if probs.len() != self.labels.len() {
            anyhow::bail!(
                "Model output length {} does not match label count {}",
                probs.len(),
                self.labels.len()
            );
        }

        // Collect rating scores (category 9) - pick the argmax as the rating.
        let rating = self
            .labels
            .iter()
            .zip(probs.iter())
            .filter(|(entry, _)| entry.category == RATING_CATEGORY)
            .max_by(|(_, a), (_, b)| a.total_cmp(b))
            .map(|(entry, _)| entry.name.clone())
            .unwrap_or_else(|| "general".to_string());

        // Collect general + character tags above threshold, sorted by confidence.
        let mut tags: Vec<TagResult> = self
            .labels
            .iter()
            .zip(probs.iter())
            .filter(|(entry, prob)| {
                (entry.category == GENERAL_CATEGORY || entry.category == CHARACTER_CATEGORY)
                    && **prob >= self.threshold
            })
            .map(|(entry, prob)| TagResult {
                tag: entry.name.clone(),
                confidence: *prob,
            })
            .collect();

        tags.sort_by(|a, b| b.confidence.total_cmp(&a.confidence));
        tags.truncate(max_tags);

        println!(
            "WD tagger: {} tags (threshold={}, rating={}) in {:?} for {}",
            tags.len(),
            self.threshold,
            rating,
            started_at.elapsed(),
            image_path.display(),
        );

        Ok(TaggerOutput { tags, rating })
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
        TaggerAcceleration::Cpu => {
            println!("WD tagger: using CPU execution provider");
            builder
        }
        TaggerAcceleration::Auto => builder
            .with_execution_providers([ep::DirectML::default().build().fail_silently()])
            .unwrap_or_else(|error| {
                println!("WD tagger: DirectML unavailable, falling back to CPU");
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
// Image preprocessing
// WD tagger expects: (1, H, W, 3) float32, raw [0,255] values, BGR channel
// order, padded to square with white (255,255,255).
// ---------------------------------------------------------------------------

fn preprocess_image(image_path: &Path, target_size: usize) -> Result<Vec<f32>> {
    let image = ImageReader::open(image_path)?.decode()?;

    // Composite any alpha channel onto a white background.
    let image_rgba = image.to_rgba8();
    let (width, height) = image_rgba.dimensions();
    let mut canvas_rgba =
        image::RgbaImage::from_pixel(width, height, image::Rgba([255, 255, 255, 255]));
    image::imageops::overlay(&mut canvas_rgba, &image_rgba, 0, 0);
    let image_rgb = DynamicImage::ImageRgba8(canvas_rgba).to_rgb8();

    // Pad to square.
    let max_dim = width.max(height);
    let pad_left = (max_dim - width) / 2;
    let pad_top = (max_dim - height) / 2;
    let mut square = image::RgbImage::from_pixel(max_dim, max_dim, image::Rgb([255, 255, 255]));
    image::imageops::overlay(&mut square, &image_rgb, pad_left as i64, pad_top as i64);

    // Resize to model input size.
    let resized = image::imageops::resize(
        &square,
        target_size as u32,
        target_size as u32,
        FilterType::CatmullRom,
    );

    // Flatten to (H, W, 3) float32 in BGR order, values in [0, 255].
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
