# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

**Phokus** — a Tauri v2 desktop image gallery app with a React/TypeScript frontend and a Rust backend. The app indexes local media folders, generates thumbnails via FFmpeg, computes visual embeddings for semantic search and similarity, and AI-tags images using the WD tagger (ONNX via `ort`). AI captioning code exists in the backend but the UI surface has been removed; the worker is commented out in `lib.rs`.

## Commands

```bash
# Development (Vite hot-reload + Rust auto-rebuild)
pnpm dev:app

# Frontend only (no Tauri window)
pnpm dev:vite

# Production build (CPU)
pnpm build:app:cpu

# Production build (CUDA / GPU-accelerated)
pnpm build:app:cuda

# Type-check frontend
pnpm build:vite
```

Use **pnpm** — never npm.

There are no test suites configured.

## Architecture

### Frontend (`src/`)

- **`store.ts`** — single Zustand store (`useGalleryStore`) that owns all app state and all `invoke()` calls to the Tauri backend. Every feature (folders, images, search, similar images, tags, captions, tagger, duplicates) is implemented as store actions here. React components are thin consumers.
- **`App.tsx`** — sets up Tauri event listeners (`subscribeToProgress`) and renders the top-level layout (sidebar + active view).
- **`src/components/`** — UI components: `Gallery`, `Lightbox`, `Sidebar`, `Toolbar`, `Timeline`, `ExploreView`, `DuplicateFinder`, `BackgroundTasks`, `SettingsModal`, `TitleBar`.
- **`src/components/menu/`** — shared floating-UI primitives: `useDismissable`, `MenuPanel`/`MenuItem`/`SubMenu`, the portal-based `ContextMenu`, and the app-wide `Dropdown`. Build menus, dropdowns, and popovers on these instead of hand-rolling.
- State management: Zustand v5, no selectors library — components call `useGalleryStore(s => s.field)` directly.
- Styling: Tailwind CSS v4 (Vite plugin, no config file).
- Virtualized gallery grid: `@tanstack/react-virtual`.
- Animation: `framer-motion`.

### Search modes

The search bar supports prefix syntax parsed by `parseSearchValue` in `store.ts`:
- No prefix / `f:` — filename search (paginated, DB-backed)
- `/s <query>` or `s: <query>` — semantic (embedding) search
- `/t <tag>` or `t: <tag>` — tag search

### Backend (`src-tauri/src/`)

Workers are started in `lib.rs` and run as background threads throughout the app lifetime:
- **thumbnail worker** (multiple threads, count from `StorageProfile::Balanced`)
- **metadata worker** — FFmpeg probe for video files
- **embedding worker** — generates CLIP-style visual embeddings (candle, HuggingFace hub)
- **tagging worker** — WD tagger via ONNX Runtime (`ort`), DirectML/CPU acceleration

Key modules:
| File | Purpose |
|------|---------|
| `db.rs` | SQLite pool (r2d2 + rusqlite), schema migrations, all query functions |
| `commands.rs` | All `#[tauri::command]` handlers — one-to-one with frontend `invoke()` calls |
| `indexer.rs` | Worker thread launchers and job dispatch |
| `embedder.rs` | Visual embedding generation (candle + HF hub models) |
| `vector.rs` | sqlite-vec integration + HNSW index for ANN search |
| `hnsw_index.rs` | In-memory HNSW index wrapper (hnsw_rs) |
| `tagger.rs` | WD tagger: ONNX model download, inference, CSV tag loading |
| `captioner.rs` | AI captioning (ONNX, disabled in workers but code intact) |
| `thumbnail.rs` | Thumbnail generation (image crate + fast_image_resize, FFmpeg for video) |
| `media.rs` | FFmpeg sidecar provisioning and probing |
| `storage.rs` | `StorageProfile` for tuning worker counts |

Database: SQLite with WAL mode, stored in the Tauri app data directory as `gallery.db`. Thumbnails stored alongside as `thumbnails/`.

### Tauri events (backend → frontend)

| Event | Payload |
|-------|---------|
| `index-progress` | `IndexProgress` |
| `media-job-progress` | `MediaJobProgressEvent` |
| `indexed-images` | `IndexedImagesBatch` |
| `media-updated` | `ThumbnailBatch` |
| `caption-model-progress` | `CaptionModelProgress` |
| `tagger-model-progress` | `TaggerModelProgress` |
| `duplicate_scan_progress` | `{ phase, processed, total, skipped }` |

### Key types

`ImageRecord` (mirrored in `store.ts` and `db.rs`) is the central data type. It carries embedding status, tagging status, caption data, and media metadata. The frontend type must stay in sync with the Rust struct serialization.

## Development notes

- Hot Reload is active during `dev:app` — do not restart the server for frontend changes. Restart only when adding Rust crates or changing Vite config.
- ML inference crates (`candle-*`, `ort`, `image`, `rayon`, `tokenizers`, `xxhash-rust`, `rusqlite`) use `opt-level = 3` in dev profile to keep inference performance acceptable.
- The caption worker is intentionally disabled (`lib.rs:73`) — the backend code is intact for future re-enabling.
- **Never use `any` type** in TypeScript — look up correct types.
