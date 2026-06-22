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

    let img = decode_for_thumbnail(image_path)?;

    // RGB8 throughout: JPEG output has no alpha, so decoding/resizing RGBA
    // only to flatten at encode time wastes a third of the bandwidth.
    let src = image::DynamicImage::ImageRgb8(img.into_rgb8());
    let (dst_width, dst_height) = fit_dimensions(src.width(), src.height(), THUMB_SIZE);

    let mut dst = fir::images::Image::new(dst_width, dst_height, src.pixel_type().unwrap());
    let mut resizer = fir::Resizer::new();
    let options = fir::ResizeOptions::new()
        .resize_alg(fir::ResizeAlg::Convolution(fir::FilterType::CatmullRom));
    resizer.resize(&src, &mut dst, Some(&options))?;

    let thumb = image::RgbImage::from_raw(dst_width, dst_height, dst.buffer().to_vec())
        .ok_or_else(|| anyhow!("failed to construct resized thumbnail buffer"))?;

    if let Some(parent) = out_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let mut output_file = std::fs::File::create(&out_path)?;
    let mut encoder = JpegEncoder::new_with_quality(&mut output_file, 82);
    encoder.encode_image(&thumb)?;
    Ok(GeneratedThumbnail {
        path: out_path,
        width: original_dimensions.0,
        height: original_dimensions.1,
    })
}

/// Decodes an image for thumbnailing, with EXIF orientation already applied.
fn decode_for_thumbnail(image_path: &Path) -> Result<image::DynamicImage> {
    decode_image_scaled(image_path, THUMB_SIZE, false)
}

/// Decodes an image at reduced resolution, with EXIF orientation applied.
///
/// JPEGs take a fast path that decodes at reduced resolution (DCT scaling),
/// which skips most of the IDCT/upsampling work for large photos. Anything
/// that path can't handle falls back to the `image` crate at full size.
///
/// `cover` selects which side must stay at or above `target`: `false` keeps
/// the longest side (for aspect-fit consumers), `true` keeps the shortest
/// side (for fill-crop consumers like the CLIP preprocessor).
pub fn decode_image_scaled(
    image_path: &Path,
    target: u32,
    cover: bool,
) -> Result<image::DynamicImage> {
    if is_jpeg(image_path) {
        if let Some(img) = decode_jpeg_scaled(image_path, target, cover) {
            return Ok(img);
        }
    }

    let reader = image::ImageReader::open(image_path)?.with_guessed_format()?;
    let mut decoder = reader.into_decoder()?;
    let orientation = decoder.orientation()?;
    let mut img = image::DynamicImage::from_decoder(decoder)?;
    img.apply_orientation(orientation);
    Ok(img)
}

fn is_jpeg(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case("jpg") || ext.eq_ignore_ascii_case("jpeg"))
}

/// Decodes a JPEG at the smallest DCT scale that still covers `target`.
/// Returns `None` on any failure (corrupt file, CMYK without conversion
/// support, etc.) so the caller can fall back to the generic decoder.
/// mozjpeg reports errors by panicking, hence the `catch_unwind`.
fn decode_jpeg_scaled(image_path: &Path, target: u32, cover: bool) -> Option<image::DynamicImage> {
    let path = image_path.to_path_buf();
    let decoded = std::panic::catch_unwind(move || -> std::io::Result<(Vec<u8>, u32, u32)> {
        let mut decompress = mozjpeg::Decompress::new_path(&path)?;
        let (width, height) = decompress.size();
        let reference = if cover {
            width.min(height)
        } else {
            width.max(height)
        };
        decompress.scale(scale_numerator(reference, target));
        let mut started = decompress.rgb()?;
        let (out_width, out_height) = (started.width() as u32, started.height() as u32);
        let pixels = started.read_scanlines::<u8>()?;
        started.finish()?;
        Ok((pixels, out_width, out_height))
    })
    .ok()?
    .ok()?;

    let (pixels, width, height) = decoded;
    let buffer = image::RgbImage::from_raw(width, height, pixels)?;
    let mut img = image::DynamicImage::ImageRgb8(buffer);
    if let Some(orientation) = exif_orientation(image_path) {
        img.apply_orientation(orientation);
    }
    Some(img)
}

/// Smallest numerator (of /8) that keeps `reference` at or above `target`,
/// so the subsequent resize never upscales.
fn scale_numerator(reference: usize, target: u32) -> u8 {
    for numerator in 1..=8u8 {
        if reference * numerator as usize / 8 >= target as usize {
            return numerator;
        }
    }
    8
}

fn exif_orientation(path: &Path) -> Option<image::metadata::Orientation> {
    let file = std::fs::File::open(path).ok()?;
    let mut reader = std::io::BufReader::new(file);
    let exif = exif::Reader::new().read_from_container(&mut reader).ok()?;
    let field = exif.get_field(exif::Tag::Orientation, exif::In::PRIMARY)?;
    let value = field.value.get_uint(0)?;
    image::metadata::Orientation::from_exif(value as u8)
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
            "-threads",
            "2",
            "-ss",
            "00:00:00.000",
            "-i",
            path_str.as_ref(),
            "-frames:v",
            "1",
            "-vf",
            "scale=320:-1:force_original_aspect_ratio=decrease",
            "-q:v",
            "4",
            &output_path,
        ],
        &[
            "-y",
            "-threads",
            "2",
            "-ss",
            "00:00:00.250",
            "-i",
            path_str.as_ref(),
            "-frames:v",
            "1",
            "-vf",
            "scale=320:-1:force_original_aspect_ratio=decrease",
            "-q:v",
            "4",
            &output_path,
        ],
        &[
            "-y",
            "-threads",
            "2",
            "-i",
            path_str.as_ref(),
            "-frames:v",
            "1",
            "-vf",
            "scale=320:-1:force_original_aspect_ratio=decrease",
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
        "ffmpeg failed generating poster for {path_str}: {last_error}"
    ))
}

pub fn generate_avif_thumbnail(
    tools: &MediaTools,
    image_path: &Path,
    cache_dir: &Path,
) -> Result<GeneratedThumbnail> {
    let path_str = image_path.to_string_lossy();
    let out_path = thumb_path(cache_dir, &path_str);
    let original_dimensions = ffprobe_dimensions(tools, image_path);

    if out_path.exists() {
        return Ok(GeneratedThumbnail {
            path: out_path,
            width: original_dimensions.0,
            height: original_dimensions.1,
        });
    }

    if let Some(parent) = out_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let output_path = out_path.to_string_lossy().into_owned();
    let output = tools
        .ffmpeg_command()
        .args([
            "-y",
            "-threads",
            "2",
            "-i",
            path_str.as_ref(),
            "-frames:v",
            "1",
            "-vf",
            "scale=320:-1:force_original_aspect_ratio=decrease",
            "-q:v",
            "4",
            &output_path,
        ])
        .output()?;

    if output.status.success() && out_path.exists() {
        return Ok(GeneratedThumbnail {
            path: out_path,
            width: original_dimensions.0,
            height: original_dimensions.1,
        });
    }

    Err(anyhow!(
        "ffmpeg failed generating AVIF thumbnail for {path_str}: {}",
        String::from_utf8_lossy(&output.stderr)
    ))
}

fn ffprobe_dimensions(tools: &MediaTools, image_path: &Path) -> (Option<i64>, Option<i64>) {
    let output = tools
        .ffprobe_command()
        .args([
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height",
            "-of",
            "csv=p=0:s=x",
            &image_path.to_string_lossy(),
        ])
        .output();
    let Ok(output) = output else {
        return (None, None);
    };

    if !output.status.success() {
        return (None, None);
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut parts = stdout.trim().split('x');
    let width = parts.next().and_then(|part| part.parse::<i64>().ok());
    let height = parts.next().and_then(|part| part.parse::<i64>().ok());
    (width, height)
}

pub fn thumb_path(cache_dir: &Path, image_path: &str) -> PathBuf {
    thumb_path_with_ext(cache_dir, image_path, "jpg")
}

pub fn video_poster_path(cache_dir: &Path, video_path: &str) -> PathBuf {
    thumb_path_with_ext(cache_dir, video_path, "jpg")
}

fn thumb_path_with_ext(cache_dir: &Path, input_path: &str, extension: &str) -> PathBuf {
    let hash = hash_path(input_path);
    cache_dir.join(format!("{hash}.{extension}"))
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scale_numerator_picks_smallest_sufficient() {
        assert_eq!(scale_numerator(6000, THUMB_SIZE), 1);
        assert_eq!(scale_numerator(640, THUMB_SIZE), 4);
        assert_eq!(scale_numerator(320, THUMB_SIZE), 8);
        assert_eq!(scale_numerator(100, THUMB_SIZE), 8);
        // Cover mode reference: shortest side must reach 224 for CLIP.
        assert_eq!(scale_numerator(1200, 224), 2);
    }

    #[test]
    fn jpeg_fast_path_decodes_at_reduced_resolution() {
        let dir = std::env::temp_dir().join("phokus-thumb-test");
        std::fs::create_dir_all(&dir).unwrap();
        let src_path = dir.join("large.jpg");
        let img =
            image::RgbImage::from_fn(1600, 1200, |x, _| image::Rgb([(x % 256) as u8, 64, 128]));
        img.save(&src_path).unwrap();

        // 1600 max dim -> numerator 2 -> 400x300 decode output
        let decoded = decode_jpeg_scaled(&src_path, THUMB_SIZE, false)
            .expect("fast path should handle plain JPEG");
        assert_eq!((decoded.width(), decoded.height()), (400, 300));

        // Cover mode: shortest side (1200) must stay >= 224 -> numerator 2
        let covered =
            decode_jpeg_scaled(&src_path, 224, true).expect("fast path should handle plain JPEG");
        assert_eq!((covered.width(), covered.height()), (400, 300));

        let cache = dir.join("cache");
        let _ = std::fs::remove_file(thumb_path(&cache, &src_path.to_string_lossy()));
        let result = generate_image_thumbnail(&src_path, &cache).unwrap();
        assert_eq!(result.width, Some(1600));
        assert_eq!(result.height, Some(1200));
        let (thumb_w, thumb_h) = image::image_dimensions(&result.path).unwrap();
        assert_eq!((thumb_w, thumb_h), (320, 240));
    }
}
