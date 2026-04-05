use crate::media::MediaTools;
use anyhow::{anyhow, Result};
use fast_image_resize as fir;
use fast_image_resize::IntoImageView;
use image::codecs::jpeg::JpegEncoder;
use image::ImageDecoder;
use std::path::{Path, PathBuf};

pub const THUMB_SIZE: u32 = 320;

pub struct GeneratedThumbnail {
    pub path: PathBuf,
    pub width: Option<i64>,
    pub height: Option<i64>,
}

pub fn generate_image_thumbnail(image_path: &Path, cache_dir: &Path) -> Result<GeneratedThumbnail> {
    let path_str = image_path.to_string_lossy();
    let out_path = thumb_path(cache_dir, &path_str);

    let original_dimensions = image::image_dimensions(image_path)
        .ok()
        .map(|(width, height)| (Some(width as i64), Some(height as i64)))
        .unwrap_or((None, None));

    if out_path.exists() {
        return Ok(GeneratedThumbnail {
            path: out_path,
            width: original_dimensions.0,
            height: original_dimensions.1,
        });
    }

    let reader = image::ImageReader::open(image_path)?.with_guessed_format()?;
    let mut decoder = reader.into_decoder()?;
    let orientation = decoder.orientation()?;
    let mut img = image::DynamicImage::from_decoder(decoder)?;
    img.apply_orientation(orientation);

    let src = image::DynamicImage::ImageRgba8(img.into_rgba8());
    let (dst_width, dst_height) = fit_dimensions(src.width(), src.height(), THUMB_SIZE);

    let mut dst = fir::images::Image::new(dst_width, dst_height, src.pixel_type().unwrap());
    let mut resizer = fir::Resizer::new();
    let options = fir::ResizeOptions::new()
        .resize_alg(fir::ResizeAlg::Convolution(fir::FilterType::Lanczos3));
    resizer.resize(&src, &mut dst, Some(&options))?;

    let thumb = image::RgbaImage::from_raw(dst_width, dst_height, dst.buffer().to_vec())
        .ok_or_else(|| anyhow!("failed to construct resized thumbnail buffer"))?;

    if let Some(parent) = out_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let thumb = image::DynamicImage::ImageRgba8(thumb).into_rgb8();
    let mut output_file = std::fs::File::create(&out_path)?;
    let mut encoder = JpegEncoder::new_with_quality(&mut output_file, 82);
    encoder.encode_image(&thumb)?;
    Ok(GeneratedThumbnail {
        path: out_path,
        width: original_dimensions.0,
        height: original_dimensions.1,
    })
}

pub fn generate_video_thumbnail(
    tools: &MediaTools,
    video_path: &Path,
    cache_dir: &Path,
) -> Result<GeneratedThumbnail> {
    let path_str = video_path.to_string_lossy();
    let out_path = video_poster_path(cache_dir, &path_str);

    if out_path.exists() {
        return Ok(GeneratedThumbnail {
            path: out_path,
            width: None,
            height: None,
        });
    }

    if let Some(parent) = out_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let output_path = out_path.to_string_lossy().into_owned();
    let attempts: [&[&str]; 3] = [
        &[
            "-y",
            "-ss",
            "00:00:00.000",
            "-i",
            path_str.as_ref(),
            "-frames:v",
            "1",
            "-vf",
            "thumbnail,scale=320:-1:force_original_aspect_ratio=decrease",
            "-q:v",
            "4",
            &output_path,
        ],
        &[
            "-y",
            "-ss",
            "00:00:00.250",
            "-i",
            path_str.as_ref(),
            "-frames:v",
            "1",
            "-vf",
            "thumbnail,scale=320:-1:force_original_aspect_ratio=decrease",
            "-q:v",
            "4",
            &output_path,
        ],
        &[
            "-y",
            "-i",
            path_str.as_ref(),
            "-frames:v",
            "1",
            "-vf",
            "thumbnail,scale=320:-1:force_original_aspect_ratio=decrease",
            "-q:v",
            "4",
            &output_path,
        ],
    ];

    let mut last_error = String::new();
    for args in attempts {
        let output = tools.ffmpeg_command().args(args).output()?;
        if output.status.success() && out_path.exists() {
            return Ok(GeneratedThumbnail {
                path: out_path,
                width: None,
                height: None,
            });
        }
        last_error = String::from_utf8_lossy(&output.stderr).to_string();
    }

    Err(anyhow!(
        "ffmpeg failed generating poster for {}: {}",
        path_str,
        last_error
    ))
}

pub fn thumb_path(cache_dir: &Path, image_path: &str) -> PathBuf {
    thumb_path_with_ext(cache_dir, image_path, "jpg")
}

pub fn video_poster_path(cache_dir: &Path, video_path: &str) -> PathBuf {
    thumb_path_with_ext(cache_dir, video_path, "jpg")
}

fn thumb_path_with_ext(cache_dir: &Path, input_path: &str, extension: &str) -> PathBuf {
    let hash = hash_path(input_path);
    cache_dir.join(format!("{}.{}", hash, extension))
}

fn hash_path(s: &str) -> String {
    format!("{:016x}", xxhash_rust::xxh3::xxh3_64(s.as_bytes()))
}

fn fit_dimensions(width: u32, height: u32, max_size: u32) -> (u32, u32) {
    if width <= max_size && height <= max_size {
        return (width.max(1), height.max(1));
    }

    if width >= height {
        let scaled_height = ((height as f64 / width as f64) * max_size as f64).round() as u32;
        (max_size, scaled_height.max(1))
    } else {
        let scaled_width = ((width as f64 / height as f64) * max_size as f64).round() as u32;
        (scaled_width.max(1), max_size)
    }
}
