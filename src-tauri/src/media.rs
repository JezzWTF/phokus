use anyhow::{anyhow, Result};
use ffmpeg_sidecar::download::{auto_download_with_progress, FfmpegDownloadProgressEvent};
use ffmpeg_sidecar::ffprobe::ffprobe_path;
use ffmpeg_sidecar::paths::ffmpeg_path;
use serde::Deserialize;
use std::path::{Path, PathBuf};
use std::process::Command;

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

    pub fn ensure_installed() -> Result<()> {
        auto_download_with_progress(|event| match event {
            FfmpegDownloadProgressEvent::Starting => {
                println!("Downloading bundled FFmpeg...");
            }
            FfmpegDownloadProgressEvent::Downloading {
                total_bytes,
                downloaded_bytes,
            } => {
                println!(
                    "Downloading bundled FFmpeg: {}/{} bytes",
                    downloaded_bytes, total_bytes
                );
            }
            FfmpegDownloadProgressEvent::UnpackingArchive => {
                println!("Unpacking bundled FFmpeg...");
            }
            FfmpegDownloadProgressEvent::Done => {
                println!("Bundled FFmpeg ready.");
            }
        })
    }

    pub fn ffmpeg_command(&self) -> Command {
        Command::new(&self.ffmpeg_path)
    }

    pub fn ffprobe_command(&self) -> Command {
        Command::new(&self.ffprobe_path)
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
