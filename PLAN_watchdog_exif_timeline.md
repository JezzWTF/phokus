# Feature Plan: Watchdog + EXIF + Timeline

Branch: `feat/watchdog-exif-timeline`
Base: merged PR #8 (discovery features) into `main`

---

## Overview

Three related features being implemented together:

1. **Phase 1 — EXIF date extraction** ✅ DONE (commit `9ee5b08`)
2. **Phase 2 — Filesystem watchdog** ✅ DONE (commit `ae9e806`)
3. **Phase 3 — Timeline view** ✅ DONE

---

## Phase 1: EXIF Date Extraction ✅

### What it does
Extracts the capture date from EXIF metadata during indexing and stores it as
`taken_at` (nullable TEXT, ISO 8601) on each image. Exposes "Taken: newest /
oldest" sort options.

### Key files changed
- `src-tauri/Cargo.toml` — added `kamadak-exif = "0.5"`
- `src-tauri/src/db.rs`:
  - Added `taken_at: Option<String>` to `ImageRecord` struct (after `modified_at`)
  - `ensure_column` migration + `idx_images_taken_at` index
  - Updated `upsert_image`, `map_image_row` (all indices shifted +1 after taken_at), all 3 SELECT statements
  - Added `taken_asc` / `taken_desc` sort cases using `COALESCE(taken_at, created_at)`
- `src-tauri/src/indexer.rs`:
  - Added `extract_exif_date(path) -> Option<String>` — tries DateTimeOriginal → DateTimeDigitized → DateTime; rejects all-zero sentinel dates ("0000:00:00 00:00:00")
  - `build_record` now populates `taken_at: extract_exif_date(path)`
- `src/store.ts` — added `taken_at: string | null` to `ImageRecord`, `"taken_desc" | "taken_asc"` to `SortOrder`, sort cases in `compareImages` using `a.taken_at ?? a.created_at`
- `src/components/Toolbar.tsx` — added "Taken: newest" / "Taken: oldest" to sort dropdown

### Notes
- Existing images won't have `taken_at` until re-indexed (file_size or mtime must change to trigger re-extraction)
- `upsert_image` uses `taken_at = excluded.taken_at` (not COALESCE) — if file content changes, fresh EXIF is used

---

## Phase 2: Filesystem Watchdog ✅

### What it does
Watches all registered folders using OS-native events (`ReadDirectoryChangesW`
on Windows). New, modified, and deleted files are reflected automatically
without manual reindexing. Zero CPU when idle.

### Key design
- **Adaptive blocking**: `recv()` when no events pending (truly idle), switches
  to `recv_timeout(earliest_deadline)` only when debounce timers are running
- **500 ms per-path debounce** coalesces rapid OS event bursts
- **Change detection**: `build_record(path, folder_id, existing.as_ref())` skips
  upsert if file_size + mtime unchanged → no thumbnail/embedding re-queues, no
  metadata clobber
- `Access` events filtered out (reads don't change content)

### Key files changed
- `src-tauri/Cargo.toml` — added `notify = "6"`
- `src-tauri/src/db.rs` — added `get_indexed_entry_by_path` and `get_image_id_by_path`
- `src-tauri/src/indexer.rs` — added `WatcherHandle`, `WatcherInner`, `start_watcher`, `process_watcher_path`
- `src-tauri/src/lib.rs` — starts watcher after other workers, manages `WatcherHandle` in app state
- `src-tauri/src/commands.rs` — `add_folder`, `remove_folder`, `update_folder_path` now accept `State<'_, WatcherHandle>` and call `watcher.add_folder / remove_folder / update_folder`
- `src/store.ts` — `subscribeToProgress` listens for `"watcher-deleted"` event (`number[]` payload), removes images from state, clears `selectedImage` if deleted

---

## Phase 3: Timeline View ✅ DONE

### What it should do
A new gallery view that groups images by date (year → month → day), virtualised
for performance, using the `taken_at` / `created_at` data from Phase 1.

### Suggested approach

**Backend**
- No new Tauri commands needed — images are already sorted by `taken_asc` /
  `taken_desc` and carry `taken_at` / `created_at`
- Optionally: a `get_timeline_buckets` command that returns counts per
  year/month for a navigation sidebar (nice-to-have, not essential for MVP)

**Frontend — grouping logic**
- New view type: add `"timeline"` to `ActiveView` type in `store.ts`
- Grouping function: takes `ImageRecord[]`, returns `TimelineGroup[]`:
  ```ts
  interface TimelineGroup {
    label: string;        // e.g. "June 2023"
    dateKey: string;      // e.g. "2023-06" for keying
    images: ImageRecord[];
  }
  ```
  Use `taken_at ?? created_at` for the date. Group by `YYYY-MM` (month granularity works well).

**Frontend — virtualised rendering**
- Use `@tanstack/react-virtual` (already a dependency)
- Virtualise at the *row* level (each row = one group header + a row of tiles,
  or a row of tiles within a group)
- Simplest pattern: flatten groups into a mixed list of `{ type: 'header', label }` and `{ type: 'image', image }` items, then use `useVirtualizer` on that flat list
- Tile size uses the existing `tileSizeForZoom` / `zoomPreset` from the store

**Frontend — navigation**
- Sidebar can list the groups (year/month) as anchor links — clicking jumps
  `virtualizer.scrollToIndex(groupStartIndex)`
- Or keep it simple for MVP: just scroll, the headers are visible as you go

**Frontend — state**
- `sort` should auto-switch to `"taken_desc"` when entering timeline view
  (can be a `useEffect` in the Timeline component)
- When leaving timeline view, restore the previous sort

**Suggested component structure**
```
src/components/Timeline.tsx
  - TimelineView (main component, uses useVirtualizer)
  - TimelineGroupHeader (date label row)
  - reuses existing Gallery tile/card components
```

**Toolbar**
- Add "Timeline" to the view switcher alongside the existing gallery/explore/duplicates tabs
- Or add it to the `Sidebar` nav

### Existing hooks to reuse
- `tileSizeForZoom(zoomPreset)` for tile size
- `matchesFilters` for respecting active folder/media/favorites filters
- The existing `Gallery` grid tile component for rendering individual images
- `openImage` store action for lightbox

---

## General notes for a new session

- **Always run `feature-dev:code-reviewer` sweep before every commit** — see `MEMORY.md`
- **Use pnpm**, never npm
- **No `any` types** in TypeScript
- Hot reload is active during `pnpm dev:app` — don't restart for frontend changes
- CUDA `cargo check` failure is **pre-existing** (broken nvcc environment) and
  unrelated to this feature work — filter it out with `grep -v candle` when checking
- The `map_image_row` in `db.rs` uses **positional column indices** — any new
  column added to the SELECT must have its index maintained exactly
- `sqlite-vec` virtual table DML is unreliable inside transactions — vector
  operations must happen outside `unchecked_transaction()`
- `ImageRecord` is mirrored in `db.rs` (Rust) and `store.ts` (TypeScript) —
  both must stay in sync
