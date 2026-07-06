//! Resilient file downloads via the system `curl` binary.
//!
//! Used for all large model/runtime downloads (tagger models, ONNX Runtime
//! DLLs, caption model). ureq's read timeout does not fire on a stalled large
//! transfer on Windows (schannel doesn't honor the socket read timeout), so a
//! stall there hangs forever. curl detects an inactivity stall
//! (`--speed-time`), resumes from the partial file (`-C -`), and retries
//! internally — the same behavior a browser gets.

use anyhow::Result;
use std::io::Read;
use std::path::Path;
use std::process::Command;

// Suppress the console window when spawning curl from the GUI app.
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Discard target for curl output we only need the headers of.
#[cfg(target_os = "windows")]
const NULL_DEVICE: &str = "NUL";
#[cfg(not(target_os = "windows"))]
const NULL_DEVICE: &str = "/dev/null";

/// Build a `curl` command with platform quirks applied. Windows resolves the
/// bare name to `curl.exe` (bundled since Windows 10 1803) and needs the
/// no-window flag; macOS ships curl; Linux is expected to have it installed.
fn curl_command() -> Command {
    #[allow(unused_mut)]
    let mut command = Command::new("curl");
    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);
    command
}

// Give up only after this many *consecutive* curl runs that download nothing;
// a run that makes any progress resets the counter, so a large file completes
// across however many resumes it takes. Kept low so a hard stall (e.g. a
// broken VM NIC) fails in a couple of minutes — surfacing a retryable error —
// rather than locking the UI on "preparing" for many minutes.
const MAX_STALL_RETRIES: usize = 3;

/// Resiliently download `url` to `destination` using the system `curl`.
///
/// We monitor the `.part` file's size for the progress bar and wrap curl in an
/// outer progress-aware retry as a backstop. The partial file survives an app
/// restart, so a later retry continues from disk.
pub fn download_file_resilient(
    url: &str,
    destination: &Path,
    mut on_progress: impl FnMut(u64, Option<u64>),
) -> Result<()> {
    if let Some(parent) = destination.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let part = match destination.extension() {
        Some(ext) => destination.with_extension(format!("{}.part", ext.to_string_lossy())),
        None => destination.with_extension("part"),
    };
    let name = destination
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| url.to_string());

    log::info!("{name}: resolving download size");
    let total = remote_content_length(url);

    // Reconcile any existing `.part` against the real size: exactly complete →
    // finish; oversized (stale/corrupt) → discard so curl restarts cleanly
    // (otherwise `curl -C -` would 416 forever).
    if let Some(total) = total {
        let size = std::fs::metadata(&part).map(|m| m.len()).unwrap_or(0);
        if size == total {
            std::fs::rename(&part, destination)?;
            return Ok(());
        }
        if size > total {
            let _ = std::fs::remove_file(&part);
        }
    }
    log::info!(
        "{name}: downloading via curl ({} bytes)",
        total
            .map(|t| t.to_string())
            .unwrap_or_else(|| "unknown size".into())
    );

    let mut stalls = 0usize;
    loop {
        let before = std::fs::metadata(&part).map(|m| m.len()).unwrap_or(0);
        match run_curl_download(url, &part, total, &mut on_progress) {
            Ok(()) => break,
            Err(error) => {
                let after = std::fs::metadata(&part).map(|m| m.len()).unwrap_or(0);
                if after > before {
                    log::warn!("{name}: curl interrupted at {after} bytes, resuming: {error}");
                    stalls = 0;
                } else {
                    stalls += 1;
                    log::warn!(
                        "{name}: curl made no progress ({stalls}/{MAX_STALL_RETRIES}): {error}"
                    );
                    if stalls >= MAX_STALL_RETRIES {
                        // Discard the partial so a future attempt restarts clean
                        // rather than getting stuck re-resuming a bad file.
                        let _ = std::fs::remove_file(&part);
                        return Err(error);
                    }
                }
                std::thread::sleep(std::time::Duration::from_secs(2));
            }
        }
    }

    if let Some(total) = total {
        let got = std::fs::metadata(&part).map(|m| m.len()).unwrap_or(0);
        if got < total {
            anyhow::bail!("{name}: incomplete after curl ({got}/{total} bytes)");
        }
    }
    std::fs::rename(&part, destination)?;
    Ok(())
}

/// Size probe via `curl -r 0-0` (a 1-byte Range request), parsing the total
/// from the `Content-Range: bytes 0-0/<total>` header. Uses curl rather than
/// ureq so no part of the download path depends on ureq (which hangs on this
/// VM's TLS stack). Returns None if the server doesn't report a size.
fn remote_content_length(url: &str) -> Option<u64> {
    let mut command = curl_command();
    command.args([
        "-sL",
        "-r",
        "0-0",
        "-D",
        "-",
        "-o",
        NULL_DEVICE,
        "--connect-timeout",
        "30",
        "--max-time",
        "30",
        "--",
        url,
    ]);
    let output = command.output().ok()?;
    let headers = String::from_utf8_lossy(&output.stdout);
    for line in headers.lines() {
        if let Some(rest) = line.to_ascii_lowercase().strip_prefix("content-range:") {
            if let Some(total) = rest.rsplit('/').next().map(str::trim) {
                if let Ok(n) = total.parse::<u64>() {
                    return Some(n);
                }
            }
        }
    }
    None
}

/// Run one `curl` download to `dest`, resuming from any partial file, while
/// reporting progress from the growing file size. Returns an error (leaving the
/// partial in place) if curl exits non-zero.
fn run_curl_download(
    url: &str,
    dest: &Path,
    total: Option<u64>,
    on_progress: &mut impl FnMut(u64, Option<u64>),
) -> Result<()> {
    let mut command = curl_command();
    command
        .arg("-fSL") // fail on HTTP errors, follow redirects, show errors
        .args(["-C", "-"]) // resume from the existing output file
        .args(["--retry", "3", "--retry-delay", "1", "--retry-connrefused"])
        .args(["--connect-timeout", "30"])
        // Abort (then --retry resumes) if under 1 KB/s for 30s — a real
        // inactivity timeout, which is what ureq couldn't deliver here.
        .args(["--speed-limit", "1024", "--speed-time", "30"])
        .arg("-s") // no progress meter (we watch the file instead)
        .arg("-o")
        .arg(dest)
        .arg("--")
        .arg(url)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped());

    let mut child = command
        .spawn()
        .map_err(|e| anyhow::anyhow!("failed to launch curl (required for downloads): {e}"))?;

    loop {
        if let Some(status) = child.try_wait()? {
            if status.success() {
                return Ok(());
            }
            let mut stderr = String::new();
            if let Some(mut pipe) = child.stderr.take() {
                let _ = pipe.read_to_string(&mut stderr);
            }
            anyhow::bail!(
                "curl exited with {}: {}",
                status
                    .code()
                    .map(|c| c.to_string())
                    .unwrap_or_else(|| "signal".into()),
                stderr.trim()
            );
        }
        let downloaded = std::fs::metadata(dest).map(|m| m.len()).unwrap_or(0);
        on_progress(downloaded, total);
        std::thread::sleep(std::time::Duration::from_millis(300));
    }
}

/// Download a NuGet package (a zip) resiliently, then extract the single file
/// at `archive_path` into `destination`.
pub fn download_nuget_file(
    source_url: &str,
    archive_path: &str,
    destination: &Path,
    on_progress: impl FnMut(u64, Option<u64>),
) -> Result<()> {
    let package = destination.with_extension("nupkg");
    download_file_resilient(source_url, &package, on_progress)?;

    log::info!("extracting {archive_path} from package");
    let file = std::fs::File::open(&package)?;
    let mut archive = zip::ZipArchive::new(file)?;
    let mut dll = archive.by_name(archive_path)?;
    let temp_destination = destination.with_extension("tmp");
    {
        let mut out = std::fs::File::create(&temp_destination)?;
        std::io::copy(&mut dll, &mut out)?;
    }
    std::fs::rename(&temp_destination, destination)?;
    let _ = std::fs::remove_file(&package);
    log::info!("extracted {archive_path}");
    Ok(())
}
