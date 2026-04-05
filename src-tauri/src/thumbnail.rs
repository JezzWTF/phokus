use anyhow::{anyhow, Result};
use image::ImageFormat;
use std::path::{Path, PathBuf};
use std::process::Command;

pub const THUMB_SIZE: u32 = 320;

pub fn thumb_path(cache_dir: &Path, image_path: &str) -> PathBuf {
    thumb_path_with_ext(cache_dir, image_path, "webp")
}

pub fn video_poster_path(cache_dir: &Path, video_path: &str) -> PathBuf {
    thumb_path_with_ext(cache_dir, video_path, "jpg")
}

fn thumb_path_with_ext(cache_dir: &Path, input_path: &str, extension: &str) -> PathBuf {
    let hash = hash_path(input_path);
    cache_dir.join(format!("{}.{}", hash, extension))
}

fn hash_path(s: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();
    s.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

pub fn generate_thumbnail(image_path: &Path, cache_dir: &Path) -> Result<PathBuf> {
    let path_str = image_path.to_string_lossy();
    let out_path = thumb_path(cache_dir, &path_str);

    if out_path.exists() {
        return Ok(out_path);
    }

    let img = image::open(image_path)?;
    let thumb = img.thumbnail(THUMB_SIZE, THUMB_SIZE);

    if let Some(parent) = out_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    thumb.save_with_format(&out_path, ImageFormat::WebP)?;
    Ok(out_path)
}

pub fn generate_video_poster(video_path: &Path, cache_dir: &Path) -> Result<PathBuf> {
    let path_str = video_path.to_string_lossy();
    let out_path = video_poster_path(cache_dir, &path_str);

    if out_path.exists() {
        return Ok(out_path);
    }

    if let Some(parent) = out_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let status = Command::new("ffmpeg")
        .args([
            "-y",
            "-ss",
            "00:00:01.000",
            "-i",
            &path_str,
            "-frames:v",
            "1",
            "-vf",
            "scale=320:-1:force_original_aspect_ratio=decrease",
            "-q:v",
            "4",
            out_path.to_string_lossy().as_ref(),
        ])
        .status()?;

    if !status.success() {
        return Err(anyhow!("ffmpeg failed generating poster for {}", path_str));
    }

    Ok(out_path)
}

/// Gets image dimensions without fully decoding.
pub fn get_dimensions(image_path: &Path) -> Option<(u32, u32)> {
    image::image_dimensions(image_path).ok()
}
