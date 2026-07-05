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

# UI Lab — browser-only frontend with mocked Tauri backend (http://127.0.0.1:1422)
pnpm dev:ui

# Production build (CPU)
pnpm build:app:cpu

# Production build (CUDA / GPU-accelerated)
pnpm build:app:cuda

# Type-check frontend
pnpm build:vite

# Frontend unit tests (Vitest; only picks up src/**/*.test.ts)
pnpm test:unit
pnpm test:unit:watch

# Rust unit tests (in-memory SQLite; --no-default-features skips CUDA)
pnpm test:rust

# E2E tests (Playwright against the UI Lab; auto-starts the server)
pnpm test:e2e
pnpm exec playwright test tests/ui-lab.spec.ts        # single file
pnpm exec playwright test -g "filename search"        # single test by name

# Formatting (Prettier + prettier-plugin-tailwindcss; cargo fmt for Rust)
pnpm format:all
```

Use **pnpm** — never npm.

Three test layers, none of which exercise the real Tauri window:
- **Vitest unit tests** — co-located `*.test.ts` next to the pure logic they cover (`src/store/helpers.ts`, formatters, path utils); fixture factories in `src/test/factories.ts`.
- **Rust unit tests** — inline `#[cfg(test)]` modules; DB tests run against in-memory SQLite via the shared `db::test_support` fixture (`test_conn()` + `test_image()`), which registers sqlite-vec and applies both migrations. Reuse it for any new DB-touching tests.
- **Playwright e2e smoke tests** in `tests/` — run against the UI Lab (browser mocks).

## Architecture

### Frontend (`src/`)

- **`src/store/`** — single Zustand store (`useGalleryStore`) that owns all app state and all `invoke()` calls to the Tauri backend, split into per-feature slices combined in `index.ts` (which exports `useGalleryStore` and the `GalleryStore` type). `types.ts` holds all interfaces/type unions (including `ImageRecord`); `helpers.ts` holds pure functions and cross-slice module state (search parsing, image sort/merge, request-token guards). Slices: `librarySlice` (folders), `gallerySlice` (image paging/filters/bulk actions), `searchSlice` (search + similar-images), `exploreSlice` (visual clusters, tag cloud, tags), `albumSlice`, `duplicateSlice`, `taggerSlice`, `captionSlice`, `settingsSlice`, `appSlice` (updates, onboarding, ffmpeg, worker pauses); `events.ts` wires the Tauri event listeners (`subscribeToProgress`). Components still call `useGalleryStore(s => s.field)` against one flat state object — the slice split is internal. React components are thin consumers.
- **`App.tsx`** — sets up Tauri event listeners (`subscribeToProgress`) and renders the top-level layout (sidebar + active view).
- **`src/components/`** — UI components: `Gallery`, `Lightbox`, `Sidebar`, `Toolbar`, `Timeline`, `ExploreView`, `DuplicateFinder`, `BackgroundTasks`, `SettingsModal`, `TitleBar`.
- **`src/components/menu/`** — shared floating-UI primitives: `useDismissable`, `MenuPanel`/`MenuItem`/`SubMenu`, the portal-based `ContextMenu`, and the app-wide `Dropdown`. Build menus, dropdowns, and popovers on these instead of hand-rolling.
- State management: Zustand v5, no selectors library — components call `useGalleryStore(s => s.field)` directly.
- Styling: Tailwind CSS v4 (Vite plugin, no config file).
- Virtualized gallery grid: `@tanstack/react-virtual`.
- Animation: `framer-motion`.

### UI Lab (`src/dev/`)

`pnpm dev:ui` runs the real frontend (same `App.tsx`, store, components, CSS) in a plain browser with Tauri fully mocked — no Rust backend or Tauri window. `src/main.tsx` imports `src/dev/setupMockTauri.ts` before `App` in `ui` mode; `mockBackend.ts` implements an in-memory command backend, with fixtures in `mockFixtures.ts`/`mockScenarios.ts`. Pick a seeded state via `?scenario=` (`rich` default; also `empty`, `new-user`, `just-updated`, `busy`, `duplicates`, `album`, `errors`, `huge`) and a What's New entry via `?changelog=`. `Ctrl+Shift+D` opens the demo panel. Full guide: `docs/ui-lab.md`.

Rules that keep UI Lab working:
- Components that render thumbnails/covers/posters must use `mediaSrc(...)` from `src/lib/mediaSrc.ts`, never `convertFileSrc(...)` directly.
- New Tauri commands invoked from the frontend need a mock in `src/dev/mockBackend.ts` (unmocked commands log console errors, which fail the e2e tests).

UI Lab is for visual/layout work and agent browser inspection. Native behavior (file pickers, real thumbnails, window controls, updater) must still be validated in `pnpm dev:app`.

### Search modes

The search bar supports prefix syntax parsed by `parseSearchValue` in `src/store/helpers.ts`:
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
| `download.rs` | Resilient file downloads via the system `curl` (resume, stall detection) |
| `onnx_runtime.rs` | Shared ONNX Runtime DLL provisioning + `ort` init (used by tagger and captioner; DLLs live in the caption model dir for legacy reasons) |
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

`ImageRecord` (mirrored in `src/store/types.ts` and `db.rs`) is the central data type. It carries embedding status, tagging status, caption data, and media metadata. The frontend type must stay in sync with the Rust struct serialization.

## Development notes

- Hot Reload is active during `dev:app` — do not restart the server for frontend changes. Restart only when adding Rust crates or changing Vite config.
- ML inference crates (`candle-*`, `ort`, `image`, `rayon`, `tokenizers`, `xxhash-rust`, `rusqlite`) use `opt-level = 3` in dev profile to keep inference performance acceptable.
- The caption worker is intentionally disabled (`lib.rs:73`) — the backend code is intact for future re-enabling.
- **Never use `any` type** in TypeScript — look up correct types.
- `website/` is a separate Vite project for the marketing site (phokus.jezz.wtf): `pnpm dev:web` / `pnpm build:web`. It is not part of the app build.
- `pnpm changelog:add -- --type fixed --message "..."` appends an entry to the `[Unreleased]` section of `CHANGELOG.md`, which also feeds the in-app What's New modal (types: added, changed, deprecated, removed, fixed, security).
