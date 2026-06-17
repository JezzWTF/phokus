# Phokus

A local-first desktop media library for browsing, filtering, and curating image and video folders.

## Features

### Library
- Add and remove media folders; background indexing with live progress
- **Live file tracking** — a filesystem watcher keeps the library in sync as files are added, changed, or removed; renames and moves are handled in place, preserving thumbnails and embeddings
- Browse all media or filter by folder, type (image/video), favorites, or star rating
- Sort by date added, date taken (EXIF), name, size, rating, or duration
- Grid density controls (compact / comfortable / detail)
- Desktop notifications, batched per folder, with per-folder mute and a global pause

### Search & discovery
- **Filename search**, **semantic search** (`/s query`), and **tag search** (`/t tag`)
- **Similar image search** — find visually similar media by image or a selected region
- **Explore view** — visual cluster map and tag cloud for browsing by theme
- **Timeline view** — media grouped chronologically by capture date (EXIF)
- **Duplicate finder** — three-phase exact-duplicate scan (size → sample hash → full hash) with live progress and bulk delete
- Explore, Timeline, and Duplicates are folder-scopable directly from their headers — no need to bounce through the sidebar

### Viewing & curation
- Lightbox with keyboard navigation, zoom, inline tag editing, and rating controls
- **Custom video player** — immersive edge-to-edge playback with scrubbing, volume, playback speed, loop, and fullscreen; auto-hiding controls and full keyboard support
- **AI tagging** via WD tagger (ONNX, CPU/DirectML) with confidence threshold, batch size, and per-folder queue targeting

### Maintenance
- Database compaction and orphaned-thumbnail cleanup from Settings, with live size/reclaimable stats
- Per-folder pausing of background work (thumbnails, metadata, embeddings, tagging)

## Supported formats

| Images | Videos |
|--------|--------|
| jpg, jpeg, png, gif, bmp | mp4, mov, m4v |
| tiff, tif, webp, avif | webm |

## Installation

Phokus is a **Windows desktop app**. Download the latest installer from the
[Releases page](https://github.com/JezzWTF/phokus/releases/latest) and run it.

**Requirements:** Windows 10 or 11. The installer will fetch the WebView2
runtime automatically if it isn't already present (it ships with Windows 11).

### A note on the unsigned build

Phokus 0.1.0 installers are **not code-signed**. Code-signing certificates are
an ongoing expense that's hard to justify for an unfunded open-source project,
so signing is on the roadmap rather than in place today.

In practice this means Windows SmartScreen will show a blue
**"Windows protected your PC"** warning the first time you run the installer.
To proceed: click **More info → Run anyway**. If a release publishes a SHA-256
checksum, you can verify the download against it first.

### First run

On first launch Phokus downloads a few tools and models — all one-time, and all
processed on your machine:

- **FFmpeg** (~tens of MB) for video thumbnails and metadata — downloaded in the
  background; the guided first-run tour shows progress.
- **WD tagger model** (~1.3 GB) — **optional**, only if you enable AI tagging.
- **CLIP embedding model** (~580 MB) — downloaded automatically the first time
  visual embeddings run (powers semantic search and similar images).

## Privacy & local-first

Phokus is local-first by design. **Your media and everything derived from it —
thumbnails, embeddings, tags, ratings — never leave your machine.** There is no
account, no telemetry, and no cloud sync.

The only network activity is:

- **One-time tool/model downloads** on first use (FFmpeg, the CLIP and WD
  models, and the ONNX runtime), fetched from their official sources
  (FFmpeg builds, Hugging Face, NuGet). These pull *tools to your machine* —
  none of your images are uploaded.
- **Update checks** against the GitHub Releases page, so the app can offer new
  versions. This can be ignored if you never update.

Everything Phokus stores lives in its app-data directory (`gallery.db`,
`thumbnails/`, `models/`, `settings/`). Removing that directory resets the app
completely; your original media folders are never modified.

## Stack

- Tauri 2 + Rust backend
- React 19 + TypeScript + Zustand
- SQLite + `sqlite-vec` (vector search) + HNSW index
- ONNX Runtime (`ort`) for AI tagging
- Candle (Rust ML) for CLIP visual embeddings
- mozjpeg for fast scaled JPEG decoding
- FFmpeg sidecar for video thumbnails and metadata
- Vite + Tailwind CSS v4

## Development

**Prerequisites:** Node.js 20+, pnpm, Rust toolchain, Tauri system prerequisites for Windows.

```bash
pnpm install

# Run with hot-reload (frontend + Rust)
pnpm dev:app

# Frontend only
pnpm dev:vite

# Production build
pnpm build:app

# Type-check the frontend
pnpm build:vite
```

## How it works

1. Add a folder from the sidebar — the Rust indexer walks it recursively.
2. Supported files are written to SQLite with metadata (path, dimensions, media type, EXIF capture date, etc.).
3. Background workers process the queue as a strict priority pipeline — thumbnails first, then video metadata, then visual embeddings, then AI tags — so each stage runs at full speed instead of competing for CPU, disk, and the database.
4. Progress events stream back to the UI while the gallery updates incrementally.
5. A filesystem watcher picks up later changes (new files, edits, deletions, renames) and keeps the index current without rescans.
6. Embeddings power semantic search and the similar-images feature via an HNSW index.
