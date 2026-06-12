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
| tiff, tif, webp, avif, heic, heif | webm |

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
