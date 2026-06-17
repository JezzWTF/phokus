# Changelog

All notable changes to Phokus are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
(0.x: anything may change between minor versions).

## [Unreleased]

### Added

- Failed AI-tagging jobs can now be located from the background worker prompt,
  including a gallery filter for images with failed tags and an expanded list
  of failed filenames/errors.
- A new theme system adds Phokus, Subtle Light, and Conventional Dark chrome
  options across the app.
- First-run onboarding now includes an inline theme picker so new users can
  choose their preferred app chrome before continuing the tour.

### Changed

- Polished the new theme surfaces before release, including readable
  subtle-light secondary buttons, failed-worker action buttons, and onboarding
  controls.
- Onboarding preview media keeps the dark gallery/media surface regardless of
  the active chrome theme.

## [0.1.0] — 2026-06-14

First public release. Windows desktop, distributed as an unsigned NSIS
installer with a built-in updater.

### Added

- **Local media library** — add folders, recursive background indexing with
  live progress, and a filesystem watcher that keeps the library in sync as
  files are added, edited, moved, renamed, or removed (thumbnails and
  embeddings are preserved across renames).
- **Gallery** — virtualized grid (handles very large libraries), favorites,
  star ratings, video durations; filter by folder, type, favorites, or
  rating; sort by date added, date taken (EXIF), name, size, rating, or
  duration; compact / comfortable / detail density.
- **Search** — filename, semantic (`/s`, via CLIP visual embeddings), and tag
  (`/t`) search from one prefix-aware search bar.
- **Discovery** — similar-image search (by image or selected region), an
  Explore view with a visual cluster map and tag cloud, and a Timeline grouped
  by EXIF capture date. Explore, Timeline, and Duplicates are folder-scopable
  from their headers.
- **Lightbox** — keyboard navigation, zoom, pan, inline tag editing, and
  rating controls, plus a custom edge-to-edge video player (scrubbing, volume,
  speed, loop, fullscreen, keyboard support).
- **AI tagging** — WD tagger (ONNX, CPU/DirectML) with adjustable confidence
  threshold, batch size, and per-folder queue targeting. Optional.
- **Duplicate finder** — three-phase exact-duplicate scan
  (size → sample hash → full hash) with live progress and bulk delete.
- **Background pipeline** — strict-priority workers (thumbnails → metadata →
  embeddings → tags) with per-folder pausing from the sidebar context menu or
  the background-tasks bar.
- **Guided first-run onboarding** — background FFmpeg provisioning with live
  progress and retry, a walkthrough of the library, pipeline, search modes,
  views, and updates, plus an optional AI-tagger download. Re-runnable from
  Settings.
- **Updater** — checks GitHub Releases on launch and from Settings; a title-bar
  indicator lights up when a new version is ready, and one click downloads,
  installs the signed update, and relaunches.
- **Maintenance** — database compaction and orphaned-thumbnail cleanup from
  Settings, with live size/reclaimable stats.
- **Window state** persistence and single-instance handling.

[0.1.0]: https://github.com/JezzWTF/phokus/releases/tag/v0.1.0
