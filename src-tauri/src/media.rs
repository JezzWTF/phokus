use anyhow::{anyhow, Result};
use ffmpeg_sidecar::download::{auto_download_with_progress, FfmpegDownloadProgressEvent};
use ffmpeg_sidecar::ffprobe::ffprobe_path;
use ffmpeg_sidecar::paths::ffmpeg_path;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

static FFMPEG_READY: AtomicBool = AtomicBool::new(false);
static FFMPEG_DOWNLOADING: AtomicBool = AtomicBool::new(false);
// Set when a provision attempt fails, so the frontend can distinguish
// "failed before the event listener attached" from "about to start".
static FFMPEG_FAILED: AtomicBool = AtomicBool::new(false);

/// True once both ffmpeg and ffprobe binaries are present on disk. Workers
/// gate video jobs on this so a missing/in-flight download never fails jobs.
pub fn ffmpeg_ready() -> bool {
    FFMPEG_READY.load(Ordering::Relaxed)
}

pub fn ffmpeg_downloading() -> bool {
    FFMPEG_DOWNLOADING.load(Ordering::Relaxed)
}

pub fn ffmpeg_failed() -> bool {
    FFMPEG_FAILED.load(Ordering::Relaxed)
}

#[derive(Debug, Clone, Serialize)]
pub struct FfmpegProgressPayload {
    pub phase: String,
    pub downloaded_bytes: Option<u64>,
    pub total_bytes: Option<u64>,
    pub error: Option<String>,
}

impl FfmpegProgressPayload {
    fn phase(phase: &str) -> Self {
        Self {
            phase: phase.to_string(),
            downloaded_bytes: None,
            total_bytes: None,
            error: None,
        }
    }
}

const FFMPEG_PROGRESS_EVENT: &str = "ffmpeg-progress";

/// Provision FFmpeg in the background, streaming progress to the frontend as
/// `ffmpeg-progress` events. Idempotent: re-invoking while a download is in
/// flight is a no-op, and re-invoking after success only re-emits `done`.
pub fn spawn_ffmpeg_provision(app: AppHandle) {
    // Fast path: binaries already on disk (previous run, or a manual install).
    if ffmpeg_path().exists() && ffprobe_path().exists() {
        FFMPEG_READY.store(true, Ordering::Relaxed);
        let _ = app.emit(FFMPEG_PROGRESS_EVENT, FfmpegProgressPayload::phase("done"));
        return;
    }

    if FFMPEG_DOWNLOADING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return; // a download is already running
    }
    FFMPEG_FAILED.store(false, Ordering::SeqCst);

    std::thread::spawn(move || {
        // The Downloading callback fires very frequently; throttle emissions.
        // Cell because the download callback is Fn, not FnMut.
        let last_emit = std::cell::Cell::new(Instant::now() - Duration::from_secs(1));
        let result = auto_download_with_progress(|event| match event {
            FfmpegDownloadProgressEvent::Starting => {
                log::info!("Downloading bundled FFmpeg...");
                let _ = app.emit(
                    FFMPEG_PROGRESS_EVENT,
                    FfmpegProgressPayload::phase("starting"),
                );
            }
            FfmpegDownloadProgressEvent::Downloading {
                total_bytes,
                downloaded_bytes,
            } => {
                if last_emit.get().elapsed() >= Duration::from_millis(250) {
                    last_emit.set(Instant::now());
                    let _ = app.emit(
                        FFMPEG_PROGRESS_EVENT,
                        FfmpegProgressPayload {
                            phase: "downloading".to_string(),
                            downloaded_bytes: Some(downloaded_bytes),
                            total_bytes: Some(total_bytes),
                            error: None,
                        },
                    );
                }
            }
            FfmpegDownloadProgressEvent::UnpackingArchive => {
                log::info!("Unpacking bundled FFmpeg...");
                let _ = app.emit(
                    FFMPEG_PROGRESS_EVENT,
                    FfmpegProgressPayload::phase("unpacking"),
                );
            }
            FfmpegDownloadProgressEvent::Done => {
                log::info!("Bundled FFmpeg ready.");
            }
        });

        FFMPEG_DOWNLOADING.store(false, Ordering::SeqCst);
        match result {
            Ok(()) => {
                FFMPEG_READY.store(true, Ordering::Relaxed);
                let _ = app.emit(FFMPEG_PROGRESS_EVENT, FfmpegProgressPayload::phase("done"));
            }
            Err(error) => {
                FFMPEG_FAILED.store(true, Ordering::SeqCst);
                log::error!("FFmpeg provisioning failed: {error}");
                let _ = app.emit(
                    FFMPEG_PROGRESS_EVENT,
                    FfmpegProgressPayload {
                        phase: "error".to_string(),
                        downloaded_bytes: None,
                        total_bytes: None,
                        error: Some(error.to_string()),
                    },
                );
            }
        }
    });
}

// On Windows, GUI apps spawn subprocesses with a visible console window by default.
// CREATE_NO_WINDOW suppresses that for every ffmpeg/ffprobe invocation.
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Clone)]
pub struct MediaTools {
    ffmpeg_path: PathBuf,
    ffprobe_path: PathBuf,
}

#[derive(Debug, Clone)]
pub struct VideoMetadata {
    pub duration_ms: Option<i64>,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub video_codec: Option<String>,
    pub audio_codec: Option<String>,
}

impl MediaTools {
    pub fn resolve() -> Self {
        Self {
            ffmpeg_path: ffmpeg_path(),
            ffprobe_path: ffprobe_path(),
        }
    }

    pub fn ffmpeg_command(&self) -> Command {
        let mut cmd = Command::new(&self.ffmpeg_path);
        #[cfg(target_os = "windows")]
        cmd.creation_flags(CREATE_NO_WINDOW);
        cmd
    }

    pub fn ffprobe_command(&self) -> Command {
        let mut cmd = Command::new(&self.ffprobe_path);
        #[cfg(target_os = "windows")]
        cmd.creation_flags(CREATE_NO_WINDOW);
        cmd
    }
}

pub fn probe_video_metadata(tools: &MediaTools, video_path: &Path) -> Result<VideoMetadata> {
    let output = tools
        .ffprobe_command()
        .args([
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            &video_path.to_string_lossy(),
        ])
        .output()?;

    if !output.status.success() {
        return Err(anyhow!(
            "ffprobe failed for {}: {}",
            video_path.display(),
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let probe: FfprobeOutput = serde_json::from_slice(&output.stdout)?;
    let video_stream = probe
        .streams
        .iter()
        .find(|stream| stream.codec_type.as_deref() == Some("video"));
    let audio_stream = probe
        .streams
        .iter()
        .find(|stream| stream.codec_type.as_deref() == Some("audio"));

    let duration_ms = probe
        .format
        .and_then(|format| format.duration)
        .and_then(|duration| parse_duration_ms(&duration))
        .or_else(|| {
            video_stream
                .and_then(|stream| stream.duration.as_deref())
                .and_then(parse_duration_ms)
        });

    Ok(VideoMetadata {
        duration_ms,
        width: video_stream.and_then(|stream| stream.width),
        height: video_stream.and_then(|stream| stream.height),
        video_codec: video_stream.and_then(|stream| stream.codec_name.clone()),
        audio_codec: audio_stream.and_then(|stream| stream.codec_name.clone()),
    })
}

fn parse_duration_ms(value: &str) -> Option<i64> {
    let seconds = value.parse::<f64>().ok()?;
    Some((seconds * 1000.0).round() as i64)
}

#[derive(Deserialize)]
struct FfprobeOutput {
    format: Option<FfprobeFormat>,
    #[serde(default)]
    streams: Vec<FfprobeStream>,
}

#[derive(Deserialize)]
struct FfprobeFormat {
    duration: Option<String>,
}

#[derive(Deserialize)]
struct FfprobeStream {
    codec_type: Option<String>,
    codec_name: Option<String>,
    duration: Option<String>,
    width: Option<i64>,
    height: Option<i64>,
}
