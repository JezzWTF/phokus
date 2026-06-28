//! Dominant-color palette extraction for color search.
//!
//! Colors are sampled from the already-generated thumbnail (small, fast) rather
//! than the full image. We coarse-quantize pixels into an RGB histogram, then
//! return the most populated bins as representative colors with their weight
//! (fraction of sampled pixels). Search then filters images whose palette has a
//! color within a distance threshold of the query color.

use image::RgbImage;
use std::collections::HashMap;
use std::path::Path;

#[derive(Debug, Clone, Copy)]
pub struct PaletteColor {
    pub r: u8,
    pub g: u8,
    pub b: u8,
    /// Fraction of sampled pixels (0.0–1.0) that fell in this color's bin.
    pub weight: f32,
}

/// Bits kept per channel when binning. 4 bits → 16 levels/channel → 4096 bins:
/// coarse enough to group near-identical shades, fine enough to separate hues.
const QUANT_BITS: u32 = 4;
/// Cap on sampled pixels so very large frames stay cheap; thumbnails are tiny so
/// this rarely bites, but the backfill may read arbitrary thumbnail sizes.
const MAX_SAMPLES: usize = 50_000;

/// Extract up to `k` dominant colors from an RGB image, most-common first.
pub fn extract_palette(img: &RgbImage, k: usize) -> Vec<PaletteColor> {
    let pixels = img.as_raw();
    let pixel_count = pixels.len() / 3;
    if pixel_count == 0 {
        return Vec::new();
    }
    let step = (pixel_count / MAX_SAMPLES).max(1);
    let shift = 8 - QUANT_BITS;

    // bin key → (sum_r, sum_g, sum_b, count); summing lets us return the bin's
    // average color rather than the quantized corner.
    let mut bins: HashMap<u16, (u64, u64, u64, u64)> = HashMap::new();
    let mut total: u64 = 0;
    for pixel in pixels.chunks_exact(3).step_by(step) {
        let (r, g, b) = (pixel[0], pixel[1], pixel[2]);
        let key = (((r as u16) >> shift) << (QUANT_BITS * 2))
            | (((g as u16) >> shift) << QUANT_BITS)
            | ((b as u16) >> shift);
        let entry = bins.entry(key).or_insert((0, 0, 0, 0));
        entry.0 += r as u64;
        entry.1 += g as u64;
        entry.2 += b as u64;
        entry.3 += 1;
        total += 1;
    }
    if total == 0 {
        return Vec::new();
    }

    let mut entries: Vec<(u64, u64, u64, u64)> = bins.into_values().collect();
    entries.sort_unstable_by_key(|entry| std::cmp::Reverse(entry.3));
    entries
        .into_iter()
        .take(k)
        .map(|(sum_r, sum_g, sum_b, count)| PaletteColor {
            r: (sum_r / count) as u8,
            g: (sum_g / count) as u8,
            b: (sum_b / count) as u8,
            weight: count as f32 / total as f32,
        })
        .collect()
}

/// Decode a thumbnail file and extract its palette. Used by the backfill pass.
pub fn extract_palette_from_file(thumbnail_path: &Path, k: usize) -> Option<Vec<PaletteColor>> {
    let img = image::ImageReader::open(thumbnail_path)
        .ok()?
        .decode()
        .ok()?;
    Some(extract_palette(&img.into_rgb8(), k))
}

/// Number of palette colors stored per image.
pub const PALETTE_SIZE: usize = 5;

/// Max squared RGB distance for a palette color to count as matching a query
/// color (~70 units in RGB space). Tunable feel/precision of color search.
pub const MATCH_DISTANCE_SQ: i64 = 4900;

/// Minimum weight (fraction of pixels) a palette color must have to match, so
/// trivial specks of a color don't trigger a match.
pub const MATCH_MIN_WEIGHT: f64 = 0.05;
