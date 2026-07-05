//! Shared ONNX Runtime provisioning: downloading the runtime + DirectML DLLs
//! and initializing `ort` from them.
//!
//! Both ONNX consumers go through here — the tagger (live) and the Florence-2
//! captioner (backend intact, UI disabled). The DLLs are Windows/DirectML
//! specific; a future cross-platform build needs a per-OS runtime strategy.

use crate::download;
use anyhow::Result;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

const ONNX_RUNTIME_NUGET_URL: &str =
    "https://www.nuget.org/api/v2/package/Microsoft.ML.OnnxRuntime.DirectML/1.24.2";
const DIRECTML_NUGET_URL: &str =
    "https://www.nuget.org/api/v2/package/Microsoft.AI.DirectML/1.15.4";

pub const ONNX_RUNTIME_DLL_FILE: &str = "onnxruntime/onnxruntime.dll";
pub const ONNX_RUNTIME_PROVIDERS_DLL_FILE: &str = "onnxruntime/onnxruntime_providers_shared.dll";
pub const DIRECTML_DLL_FILE: &str = "onnxruntime/DirectML.dll";

/// The shared runtime DLLs, as paths relative to [`runtime_dir`].
pub const RUNTIME_DLLS: &[&str] = &[
    ONNX_RUNTIME_DLL_FILE,
    ONNX_RUNTIME_PROVIDERS_DLL_FILE,
    DIRECTML_DLL_FILE,
];

/// `(destination_file, nuget_package_url, path_inside_package)` for each DLL.
pub const ONNX_RUNTIME_FILES: &[(&str, &str, &str)] = &[
    (
        ONNX_RUNTIME_DLL_FILE,
        ONNX_RUNTIME_NUGET_URL,
        "runtimes/win-x64/native/onnxruntime.dll",
    ),
    (
        ONNX_RUNTIME_PROVIDERS_DLL_FILE,
        ONNX_RUNTIME_NUGET_URL,
        "runtimes/win-x64/native/onnxruntime_providers_shared.dll",
    ),
    (
        DIRECTML_DLL_FILE,
        DIRECTML_NUGET_URL,
        "bin/x64-win/DirectML.dll",
    ),
];

// Mutex<bool> rather than OnceLock<Result>: a failed attempt (DLL not yet
// downloaded) must NOT be cached, or a later successful download could never
// recover within the same app session.
static ORT_RUNTIME_INIT: Mutex<bool> = Mutex::new(false);

/// Directory the shared runtime DLLs are provisioned into.
///
/// Historically the DLLs were downloaded as part of the Florence-2 caption
/// model, so they live inside that model's directory
/// (`models/florence-2-base-ft/onnxruntime/`). The location is kept even
/// though the tagger is now the main consumer, so existing installs don't
/// have to re-download the runtime.
pub fn runtime_dir(app_data_dir: &Path) -> PathBuf {
    crate::captioner::model_dir(app_data_dir)
}

/// Initialize `ort` from the already-downloaded runtime DLL in `local_dir`.
/// Fails if the DLL is missing — use [`provision_onnx_runtime_with_progress`]
/// to download it first on a clean install.
pub fn ensure_onnx_runtime(local_dir: &Path) -> Result<()> {
    let mut initialized = ORT_RUNTIME_INIT
        .lock()
        .map_err(|_| anyhow::anyhow!("ONNX runtime init lock poisoned"))?;
    if *initialized {
        return Ok(());
    }
    let dll_path = local_dir.join(ONNX_RUNTIME_DLL_FILE);
    if !dll_path.exists() {
        anyhow::bail!("ONNX Runtime DLL is missing: {}", dll_path.display());
    }
    ort::environment::init_from(&dll_path)
        .map_err(|error| anyhow::anyhow!(error.to_string()))?
        .with_name("phokus-florence")
        .commit();
    *initialized = true;
    Ok(())
}

/// Download any ONNX Runtime DLLs missing from `local_dir`, reporting per-file
/// byte progress as `(short_label, downloaded_bytes, total_bytes)`.
/// `total_bytes` is `None` when the server omits Content-Length. Unlike
/// `ensure_onnx_runtime` (init only), this actually provisions the files —
/// callers that can run on a clean install must call this first. The callback
/// fires per chunk; callers should throttle.
pub fn provision_onnx_runtime_with_progress(
    local_dir: &Path,
    mut on_progress: impl FnMut(&str, u64, Option<u64>),
) -> Result<()> {
    for (destination_file, source_url, archive_path) in ONNX_RUNTIME_FILES {
        let destination = local_dir.join(destination_file);
        if destination.exists() {
            continue;
        }
        // Strip the "onnxruntime/" prefix for a clean label.
        let label = destination_file
            .rsplit('/')
            .next()
            .unwrap_or(destination_file);
        download::download_nuget_file(
            source_url,
            archive_path,
            &destination,
            |downloaded, total| on_progress(label, downloaded, total),
        )?;
    }
    Ok(())
}

/// Number of ONNX Runtime DLLs still missing from `local_dir` (for progress
/// step counts before downloading).
pub fn missing_onnx_runtime_count(local_dir: &Path) -> usize {
    ONNX_RUNTIME_FILES
        .iter()
        .filter(|(destination_file, _, _)| !local_dir.join(destination_file).exists())
        .count()
}

/// Download all missing runtime DLLs without progress reporting.
pub fn download_onnx_runtime_files(local_dir: &Path) -> Result<()> {
    if !cfg!(target_os = "windows") {
        anyhow::bail!("ONNX Runtime DLL download is currently configured for Windows builds");
    }

    for (destination_file, source_url, archive_path) in ONNX_RUNTIME_FILES {
        let destination = local_dir.join(destination_file);
        download::download_nuget_file(source_url, archive_path, &destination, |_, _| {})?;
    }

    Ok(())
}
