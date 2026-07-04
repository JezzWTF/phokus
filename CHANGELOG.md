# Changelog

All notable changes to Phokus are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
(0.x: anything may change between minor versions).

## [Unreleased]

### Added

- **What's New** — after updating, Phokus now greets you with a "What's new"
  toast that opens a tidy in-app tour of the new version. Added, Changed, and
  Fixed notes are grouped into collapsible sections, so you can skim the good
  bits without playing "spot the difference".
- **Quick theme switch** — right-click the settings cog in the title bar to
  swap between Phokus, Subtle Light, and Conventional Dark instantly. No Settings
  detour required.
- **Albums** — make your own cross-folder collections without moving a single
  file. Albums live in their own sidebar section with cover thumbnails, can be
  created, renamed, reordered, opened, and cleaned up in Manage mode, and deleting
  one only removes the grouping.
- **Gallery multi-select** — hover a thumbnail's top-left corner to start
  selecting, then use the floating action bar to tag, rate, favorite, add to an
  album, or delete a whole batch at once. It also works in similar-image, region,
  and album views, because bulk work should not disappear the moment you need it.
- **Colour search** — narrow the Gallery, Timeline, or tag results by dominant
  colour using toolbar swatches or a custom picker. Great for those "I know it
  was mostly blue" moments.
- **Album-aware similar search** — similar-image and region searches started from
  an album can now stay inside that album, jump back to the source folder, or
  search everything.
- **Tag manager** — Explore's Tag Cloud now has a Manage mode for renaming,
  merging, and deleting tags across the whole library.
- **Camera info in the lightbox** — the info panel now shows EXIF details like
  camera, lens, aperture, shutter speed, ISO, and focal length. Geotagged photos
  also get a browser link for their GPS coordinates, and already-indexed images
  do not need a re-index.
- **Build badge in Settings** — Settings -> Updates now shows whether you are
  running the CPU build or the CUDA build.
- **Choose your tagging model** — Settings -> AI Workspace now lets you pick
  between the anime-focused WD tagger and JoyTag, which is better suited to photo
  libraries and stronger on NSFW concepts (if that's your thing, we don't judge).
- **Related tags in Explore** — Hover over a tag in the Tag Cloud to see the tags
  that most often appear with it, complete with connection lines and image counts.
  Handy for finding little clusters you did not know were there.
- **Pause workers for longer** — Settings -> General can now remember per-folder
  worker pauses across app restarts, useful for folders you want to keep in the
  library but leave out of background processing for now.
- **Editable folder path** — the folder picker now has an address bar, so you can
  paste a path directly while still using breadcrumbs for quick jumps.
- **Slideshow mode** — turn the lightbox into a fullscreen, image-only slideshow
  from whatever collection you are already browsing.
- **Add to album from the right-click menu** — right-click any image in the
  Gallery or Timeline and file it straight into an album from the new "Add to
  Album" submenu. One image, one click, zero ceremony.

### Changed

- **Menus got their act together** — right-click menus (images, folders,
  albums, the theme switcher) and every dropdown (sort, folder scope, settings,
  sidebar) now share one style with one set of manners: they stay on screen
  instead of wandering off the edge, all close on Escape, and right-click menus
  can do proper submenus now. Subtle Light dresses them all the same way too,
  instead of saving the nice outfit for one dropdown.
- **Neater lightbox details** — image and video metadata now sits in two columns,
  so the info panel shows more at a glance with less scrolling.
- **Faster Explore revisits** — returning to a folder's visual clusters should
  feel much faster now, even in big libraries.
- **Calmer Tag Cloud during AI tagging** — Explore no longer keeps hammering the
  tag list while a folder is actively being tagged, so tagging stays smoother and
  the cloud catches up once the work settles.
- **Faster first-time clustering** — large libraries build their first visual
  clusters much more quickly, while still keeping the groups nicely balanced.
- **Better tag browsing** — the Tag manager now has live search, sorting
  (most-used, least-used, A-Z, and Z-A), smooth scrolling for huge tag lists, and
  it keeps your filter/sort in place while you edit.
- **Safer deletion** — deleting media now asks for confirmation and clearly says
  the file is being removed from disk. This covers gallery bulk delete and the
  Duplicate Finder.
- **Clearer update progress** — Settings -> Updates now shows a real download
  progress bar with a percentage instead of the old lonely "Downloading" label.
- **Better narrow-window layout** — the toolbar, filters, search box, colour
  picker, sidebar, and lightbox info panel now adapt more gracefully when the
  window is short on space.
- **Tidier Explore clusters** — busier clusters get more room, dense groups
  overlap less, and everything should stay easier to read and click.
- **Faster CPU tagging** — CPU-only AI tagging can now use multiple cores while
  leaving some breathing room for the rest of the app. GPU tagging is unchanged.
- **Smoother tooltips** — Phokus now uses its custom tooltip style across more of
  the app instead of falling back to the native browser tooltip.

### Fixed

- **Explore no longer flashes the last folder** — switching folders now clears
  the old clusters/tags and shows a loading state while the new folder catches
  up.
- **Ratings keep your search order** — rating or favoriting an image no longer
  reshuffles similar-image, region, semantic, tag, or album results.
- **Update progress comes back when you need it** — if you dismiss the update
  prompt and later start the update from the title bar or Settings, the progress
  toast now reappears instead of hiding away in Settings.
- **Subtle Light cleanup** — fixed dark or hard-to-read surfaces, hover states,
  dialogs, updater buttons, onboarding controls, and green action buttons in the
  light theme.
- **No more self-indexing loops** — if you add a broad folder like your user
  profile, Phokus now skips its own app-data directory instead of indexing its
  thumbnail cache forever.
- **Background tasks show the active work first** — when one folder is paused and
  another is processing, the active folder gets the main spot in the background
  tasks bar.
- **First launch fits smaller screens** — fresh installs now clamp the window to
  the usable monitor area, so 1366x768-style displays do not lose part of the app
  below the taskbar.
- **Explore is clearer in Subtle Light** — cluster captions, buttons, cloud
  words, hover glows, and the new connection lines now use stronger light-theme
  colours.
- **Explore got a few sharp edges sanded down** — Cluster Cloud uses the in-app
  tooltip, singular counts now say "1 image", and the folder-scope dropdown no
  longer hides behind cluster cards.
- **AI tagging stays responsive** — GPU tagging now works in smaller bursts with
  brief pauses between them, so the UI keeps moving and the first batch starts
  sooner.
- **Noisy AI tags get cleaned up** — generic low-signal tags from WD and JoyTag
  are filtered before they are saved, and matching older generated tags are
  cleaned up on startup. Your manually-added tags are left alone.
- **Selected Folders starts empty** — choosing "Selected Folders" for AI tagging
  no longer pre-selects the first folder. You decide exactly what gets queued.
- **A couple of tiny UI papercuts are gone** — the zoom buttons now show the
  right tile size when you hover them, and the folder picker no longer adds an
  odd trailing slash to Windows drive breadcrumbs.

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
