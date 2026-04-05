use std::path::Path;

/// Gets image dimensions without fully decoding.
pub fn get_dimensions(image_path: &Path) -> Option<(u32, u32)> {
    image::image_dimensions(image_path).ok()
}
