# Phokus

A local-first desktop media library for browsing, filtering, and curating image and video folders.

## Features

- Add and remove media folders; background indexing with live progress
- Browse all media or filter by folder, type (image/video), favorites, or star rating
- **Filename search**, **semantic search** (`/s query`), and **tag search** (`/t tag`)
- **Similar image search** — find visually similar media by image or selected region
- **AI tagging** via WD tagger (ONNX, CPU/DirectML) with confidence threshold control
- **Explore view** — visual cluster map and tag cloud for browsing by theme
- **Duplicate finder** — scan for exact duplicates by file hash with bulk delete
- Lightbox preview with keyboard navigation, inline tag editing, and rating controls
- Sort by date, name, size, rating, or duration
- Grid density controls (compact / comfortable / detail)

## Supported formats

| Images | Videos |
|--------|--------|
| jpg, jpeg, png, gif, bmp | mp4, mov, m4v |
| tiff, tif, webp, avif, heic, heif | webm |

## Stack

- Tauri 2 + Rust backend
- React 19 + TypeScript + Zustand
- SQLite + `sqlite-vec` (vector search)
- ONNX Runtime (`ort`) for AI tagging
- Candle (Rust ML) for visual embeddings
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
```

## How it works

1. Add a folder from the sidebar — the Rust indexer walks it recursively.
2. Supported files are written to SQLite with metadata (path, dimensions, media type, etc.).
3. Background workers generate thumbnails, compute visual embeddings, and run AI tagging.
4. Progress events stream back to the UI while the gallery updates incrementally.
5. Embeddings power semantic search and the similar images feature via an HNSW index.
