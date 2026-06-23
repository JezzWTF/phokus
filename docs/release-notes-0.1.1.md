# Phokus v0.1.1

> Draft for the GitHub Release body. Fill in the checksums and trim as needed.

**Phokus is a local-first desktop media library for Windows** — point it at
your image and video folders and it builds a fast, searchable gallery with
thumbnails, semantic search, visual discovery, AI tagging, and duplicate
cleanup. Everything is processed on your machine; nothing is uploaded.

This is a quality-of-life release on top of 0.1.0: a new in-app folder
picker, themes, smoother scrolling on large libraries, and a batch of fixes.
If you're updating from 0.1.0, the built-in updater will fetch this for you.

## Install / update

- **Updating from 0.1.0:** the in-app updater will offer 0.1.1 on launch — one
  click downloads, installs, and relaunches.
- **Fresh install:** download `Phokus_0.1.1_x64-setup.exe` below and run it.
  **Windows SmartScreen will warn** that the publisher is unrecognized — this
  build is **not code-signed**. Click **More info → Run anyway**.
- Requires **Windows 10/11**. WebView2 is fetched automatically if missing.

NVIDIA users wanting GPU embedding speed can use the
`Phokus_0.1.1_x64-cuda-setup.exe` variant instead (larger download; bundles the
CUDA runtime DLLs).

## Highlights

### Added
- **Custom multi-folder picker** — navigate and stage folders from multiple
  locations and add them in one go, replacing the native OS dialog.
- **Themes** — Phokus, Subtle Light, and Conventional Dark chrome, with an
  inline theme picker in first-run onboarding.
- **Timeline scrubber** — a year/month rail to jump anywhere in the library.
- **Folder reordering** in the sidebar (drag-and-drop or keyboard), persisted,
  plus A–Z / Z–A / Custom sort for the Libraries list.
- **Video playback settings** — autoplay-in-lightbox and start-muted toggles.
- **Rebuild semantic index** maintenance action — fixes "dimension mismatch"
  search errors after switching CLIP models.
- Locate and filter images with failed AI-tagging jobs.

### Changed
- Gallery grid and Duplicate Finder list are now row-virtualised — large
  libraries and large result sets (5,000+ pairs) scroll without lag.
- Settings now open on General by default.

### Fixed
- **AVIF thumbnails** now generate correctly (routed through bundled FFmpeg);
  previously-failed AVIF jobs are requeued on startup.
- Video embedding jobs no longer churn through failed states before their
  thumbnail exists; previously-failed ones are requeued.
- Timeline scrolling is smooth on large libraries (per-row virtualisation);
  background batches no longer re-sort the whole loaded set.
- Numerous Subtle Light theme readability/parity fixes.

See the [changelog](https://github.com/JezzWTF/phokus/blob/main/CHANGELOG.md)
for the full list.

## Checksums

```
SHA-256 (Phokus_0.1.1_x64-setup.exe)      = <fill in>
SHA-256 (Phokus_0.1.1_x64-cuda-setup.exe) = <fill in>
```
