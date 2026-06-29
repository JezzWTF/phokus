# Changelog

All notable changes to Phokus are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
(0.x: anything may change between minor versions).

## [Unreleased]

### Added

- **Albums** — curate your own collections. A new Albums section in the sidebar
  (with cover thumbnails, kept visually distinct from Libraries) lets you create,
  rename, reorder (drag the row), and open albums; albums can span multiple
  folders. Add images from the gallery's bulk action bar or from the lightbox,
  remove them from within an album, and use Manage mode to multi-select and
  delete albums in one go. Deleting an album never touches your files — only the
  grouping is removed.
- **Multi-select & bulk actions in the gallery** — hover a thumbnail's top-left
  corner to reveal a selection checkbox (click it to start selecting); while
  selecting, click tiles to toggle and double-click to open. A floating action
  bar then lets you tag (with autocomplete), rate, favorite, add to an album, or
  delete the whole selection at once. Works in similar-image, region, and album
  views too.
- **Colour search** — filter the gallery (and Timeline) by dominant colour via a
  collapsible swatch palette plus a custom colour picker in the toolbar; existing
  libraries are backfilled automatically in the background.
- **Album-scoped similar search** — when finding visually similar images or
  searching by a selected region from an album, you can now keep results scoped
  to that album, switch back to the source folder, or search all media.
- **Tag management** — Explore → Tag Cloud gains a Manage mode with a flat tag
  list where you can rename a tag, merge it into another (rename it to an
  existing tag's name), or delete it from every image. Changes apply across the
  whole library.
- **Camera info in the lightbox** — the image info panel now shows EXIF details
  (camera, lens, aperture, shutter, ISO, focal length) and, when a photo is
  geotagged, its GPS coordinates as a link that opens the location in your
  browser. Read on demand from the file, so it works on already-indexed images
  without re-indexing.
- **What's New** — after updating, Phokus now greets you with a "What's new"
  toast that opens an in-app release-notes screen for the new version, with the
  changes grouped into collapsible Added / Changed / Fixed sections.
- **Build badge in Settings** — the version line in Settings → Updates now shows
  whether the running build is the CPU or CUDA (GPU-accelerated) variant.
- **Choose your tagging model** — Settings → AI Workspace now lets you switch the
  AI tagger between the WD tagger (anime-focused) and **JoyTag**, which also
  handles photographic content and is stronger on NSFW concepts — a better fit
  for real-photo libraries. Each model downloads on demand, and tags are
  attributed to the model that produced them. JoyTag has no built-in rating, so
  its explicitness rating is derived from its tags.

### Changed

- **Safer deletion** — deleting media now asks for confirmation and spells out
  that it permanently removes the file(s) from disk. This covers the new gallery
  bulk delete and the Duplicate Finder, which previously deleted on a single
  click with no confirmation or warning.
- The updater now shows a real download progress bar with a percentage in
  Settings → Updates (previously it only said "Downloading").
- **Smaller-screen layout** — the toolbar adapts on narrow windows: the filter
  chips scroll horizontally instead of squashing (so "Similar: Folder/All" no
  longer stack), the search box shrinks, and the colour-search swatches now open
  in a compact popover rather than expanding inline and running off-screen. The
  sidebar and the lightbox info panel also narrow to give the gallery more room.
- **Explore cluster layout** — clusters are now sized by image count (busier
  clusters are larger and stack on top) and repositioned to avoid overlapping, so
  every cluster stays viewable and clickable even in dense libraries.
- **Faster CPU tagging** — when AI tagging runs on the CPU provider (no usable
  GPU) it now uses multiple cores instead of being pinned to one, several times
  faster on multi-core machines. A couple of cores are left free so the rest of
  the app stays responsive. GPU (DirectML) tagging is unchanged.

### Fixed

- **Rating no longer scrambles search results** — rating or favoriting an image
  while viewing similar-image, region, semantic, tag, or album results no longer
  re-sorts the view back into the default order; the current result ordering is
  preserved.
- The update download/install progress toast now reappears when you start an
  update from the title-bar indicator or Settings after dismissing the earlier
  "Update available" prompt — previously progress only showed in Settings.
- Subtle Light theme — fixed several surfaces and buttons that stayed dark or
  became unreadable on hover, including new dialogs and the green action buttons
  across the updater and onboarding.
- **Endless self-indexing loop** — adding a folder that contains Phokus's own
  app-data directory (for example, your whole user profile) no longer makes the
  app index its own thumbnail cache, generate thumbnails of those thumbnails, and
  loop forever. That directory is now skipped by both the folder scanner and the
  filesystem watcher.
- **Background tasks now lead with the active folder** — when one folder's
  workers are paused while another is actively processing, the active folder
  takes the main slot in the background-tasks bar instead of the paused one.
- **Oversized window on smaller screens** — on a fresh install the window opened
  at a fixed size that was taller than the usable area on displays like
  1366×768, leaving part of it off-screen. It now clamps to the monitor's work
  area (excluding the taskbar) and centres there when it would overflow; larger
  displays and any remembered size/position are left untouched.
- **Explore readability in Subtle Light** — fixed washed-out and unreadable
  elements in the Explore view on the light theme. Cluster cards now use a soft
  dark caption scrim (the previous cream overlay fogged the photos), with a
  legible label, count, and "Open" button; Tag Cloud words use darker accents and
  a higher opacity floor instead of near-invisible pale text.
- **Explore polish** — the Tag Cloud now uses the in-app tooltip instead of the
  native browser one (and reads "1 image", not "1 images"), and the folder-scope
  dropdown no longer opens behind the cluster cards.
- **AI tagging no longer freezes the app** — tagging now runs inference in small
  GPU micro-batches with a brief yield between them, instead of one wide batch
  that monopolised the GPU (and with it the whole UI) for seconds at a time. The
  app stays responsive while tagging runs, throughput is steadier (the old wide
  batches caused periodic slowdowns), and the first batch after launch starts
  faster.

## [0.1.1] — 2026-06-23

### Added

- **Custom multi-folder picker** — replaces the native OS dialog with an
  in-app folder browser that lets you navigate, stage folders from multiple
  locations, and add them all in one go. Duplicate roots are skipped
  automatically; partially-failed batches remove successfully-added entries
  from the staging panel so only failed folders remain to retry.
- **Rebuild semantic index** maintenance action in Settings — drops and
  recreates the vector tables at the current model dimension, then re-queues
  every image for embedding. Fixes "dimension mismatch" search errors that
  occur after switching between CLIP models with different output sizes.
- **Video playback settings** — new Video Playback group in Settings with two
  persisted toggles: "Autoplay in lightbox" (default on) and "Start muted"
  (default off). Settings apply to the next opened video rather than the
  current one.
- **Timeline scrubber** — a year/month rail on the Timeline view that jumps to
  any period in the library. Timeline now loads the full filtered set so the
  scrubber spans the whole library instead of just the first page.
- **Folder reordering** in the sidebar — drag-and-drop (with edge auto-scroll)
  or keyboard (↑/↓ on the drag handle), with the custom order persisted across
  sessions; the Libraries list also gains A–Z / Z–A / Custom sort.
- Failed AI-tagging jobs can now be located from the background worker prompt,
  including a gallery filter for images with failed tags and an expanded list
  of failed filenames/errors.
- A new theme system adds Phokus, Subtle Light, and Conventional Dark chrome
  options across the app.
- First-run onboarding now includes an inline theme picker so new users can
  choose their preferred app chrome before continuing the tour.

### Changed

- Settings sections are reordered — General is now the first and default
  section instead of AI Workspace.
- The Duplicate Finder group list is now virtualised — only on-screen cards
  mount, so large result sets (e.g. 5,000+ pairs) scroll without lag rather
  than mounting every thumbnail at once.
- The gallery grid is now row-virtualised, so very large libraries scroll
  smoothly and only on-screen thumbnails are rendered.
- Polished the new theme surfaces before release, including readable
  subtle-light secondary buttons, failed-worker action buttons, and onboarding
  controls.
- Onboarding preview media keeps the dark gallery/media surface regardless of
  the active chrome theme.

### Fixed

- **AVIF thumbnails** — AVIF files are now processed correctly by routing
  thumbnail generation through the bundled FFmpeg path instead of the Rust
  image decoder (which has no dav1d dependency). Previously-failed AVIF jobs
  are requeued on startup; JPEG derivatives are fed to the embedding and
  tagging pipeline while the lightbox continues to display the original file.
- Accent text is now readable in the Subtle Light theme.
- Folder picker chevron tooltip now correctly shows "No subfolders" for leaf
  entries instead of "Open folder" in both branches.
- Folder picker Unix breadcrumb root now shows "/" instead of always "Home"
  for non-home paths such as `/mnt/data`.
- Video embedding jobs are no longer claimed before their thumbnail exists, and
  any that previously failed for that reason are requeued on startup — videos no
  longer churn through failed embeddings.
- Subtle Light theme consistency — the lightbox metadata panel now follows the
  light chrome while the image canvas stays dark (matching Conventional Dark),
  and gallery/timeline media badges, duplicate-finder thumbnails, and the window
  restore icon now theme correctly instead of staying Phokus-dark.
- Timeline scrolling is now smooth on large libraries — it virtualizes per row
  of tiles instead of per month, so a month with thousands of photos no longer
  mounts every tile at once (thumbnails now load in incrementally as you scroll,
  matching the All Media grid).
- Background worker updates (thumbnails, metadata, embeddings, tags) no longer
  re-sort the entire loaded image set on every batch. In Timeline, which loads
  the whole library, this re-sort caused severe lag and could crash the app
  during background indexing.

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

[0.1.1]: https://github.com/JezzWTF/phokus/releases/tag/v0.1.1
[0.1.0]: https://github.com/JezzWTF/phokus/releases/tag/v0.1.0
