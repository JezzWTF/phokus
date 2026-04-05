# Phokus

## Overview

Phokus is a Tauri desktop app for building a fast, local media library from folders on disk. It indexes images and videos, stores metadata in SQLite, and gives you a dense browsing workflow with filtering, favorites, ratings, and a lightbox preview.

The current app is optimized for:

- local folders instead of cloud import flows
- large visual libraries
- quick review and curation
- mixed image and video browsing

## Current features

- Add and remove media folders
- Background indexing with progress updates
- Browse all media or filter by folder
- Search by filename
- Filter by images, videos, or favorites
- Sort by modified date, name, or file size
- Grid density controls
- Lightbox preview with keyboard navigation
- Favorite and star-rating metadata saved in SQLite
- Virtualized/local-first architecture built on Tauri + React

## Supported formats

Images:

- `jpg`
- `jpeg`
- `png`
- `gif`
- `bmp`
- `tiff`
- `tif`
- `webp`
- `avif`
- `heic`
- `heif`

Videos:

- `mp4`
- `mov`
- `m4v`
- `webm`

## Stack

- Tauri 2
- React 19
- TypeScript
- Zustand
- Rust
- SQLite + `sqlite-vec`
- Vite

## Project structure

- `src/`: React UI, state, and components
- `src-tauri/src/commands.rs`: Tauri command surface
- `src-tauri/src/db.rs`: SQLite schema and queries
- `src-tauri/src/indexer.rs`: folder crawling and batch indexing
- `src-tauri/src/vector.rs`: vector table setup for future semantic workflows

## Development

### Prerequisites

- Node.js 20+
- `pnpm`
- Rust toolchain
- Tauri system prerequisites for Windows

### Install

```bash
pnpm install
```

### Run in development

```bash
pnpm tauri dev
```

### Build

```bash
pnpm tauri build
```

## How it works

1. Add a folder from the sidebar or Library menu.
2. The Rust indexer walks the directory recursively.
3. Supported files are written into SQLite with metadata such as path, size, dimensions, media type, rating, and favorite state.
4. Progress events stream back to the UI while the gallery updates incrementally.
5. The gallery view loads media in pages and opens items in a lightbox for review.

## Notes

- This is currently a local desktop library, not a sync product.
- Search is filename-based right now.
- The vector table and embedding fields exist, but semantic search is not wired into the UI yet.
- Some visible UI copy may still use the old working name until the frontend text is updated.

## Positioning

The clearest product description today is:

> A local-first desktop media library for browsing, filtering, and curating image and video folders.

That description is more accurate than "gallery" alone and gives you a better base for future branding, onboarding copy, and a landing page.
