fn main() {
    tauri_build::build();

    // When the candle-cuda feature is enabled, verify the CUDA Toolkit is present
    // so the developer gets a clear message rather than an obscure cudarc/cc error.
    if std::env::var("CARGO_FEATURE_CANDLE_CUDA").is_ok() {
        let cuda_path = std::env::var("CUDA_PATH"); // Set by the CUDA Toolkit installer on Windows
        let nvcc_found = std::process::Command::new("nvcc")
            .arg("--version")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);

        if cuda_path.is_ok() || nvcc_found {
            if let Ok(path) = &cuda_path {
                println!("cargo:warning=CUDA Toolkit found at {path} — GPU acceleration enabled.");
            } else {
                println!(
                    "cargo:warning=CUDA Toolkit (nvcc) found in PATH — GPU acceleration enabled."
                );
            }
        } else {
            println!("cargo:warning=━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            println!("cargo:warning=  candle-cuda feature is enabled but no CUDA Toolkit found.");
            println!("cargo:warning=  Install CUDA Toolkit from https://developer.nvidia.com/cuda-downloads");
            println!(
                "cargo:warning=  Or build without GPU support: cargo build --no-default-features"
            );
            println!("cargo:warning=━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        }
    }
}
