# Phokus v0.2.0

> Draft for the GitHub Release body. Fill in the checksums and trim as needed.

**Phokus is a local-first desktop media library for Windows** — point it at
your image and video folders and it builds a fast, searchable gallery with
thumbnails, semantic search, visual discovery, AI tagging, and duplicate
cleanup. Everything is processed on your machine; nothing is uploaded.

0.2.0 is the biggest update since launch: albums, gallery multi-select with
bulk actions, colour search, a second AI tagging model (JoyTag), a full tag
manager, camera EXIF details in the lightbox, a slideshow mode, and a large
batch of performance and theme fixes. Updating from 0.1.x? The built-in
updater will fetch this for you — and afterwards, a new in-app "What's New"
tour shows you around.

## Install / update

- **Updating from 0.1.x:** the in-app updater will offer 0.2.0 on launch — one
  click downloads, installs, and relaunches.
- **Fresh install:** download `Phokus_0.2.0_x64-setup.exe` below and run it.
  **Windows SmartScreen will warn** that the publisher is unrecognized — this
  build is **not code-signed**. Click **More info → Run anyway**.
- Requires **Windows 10/11**. WebView2 is fetched automatically if missing.

NVIDIA users wanting GPU embedding/tagging speed can use the
`Phokus_0.2.0_x64-cuda-setup.exe` variant instead (larger download; bundles the
CUDA runtime DLLs). Settings → Updates now shows which build you are running.

## Highlights

### Added
- **Albums** — cross-folder collections without moving files: their own
  sidebar section with cover thumbnails, create/rename/reorder/manage, and
  album-aware similar-image search.
- **Gallery multi-select** — hover a thumbnail's corner to start selecting,
  then bulk tag, rate, favorite, add to an album, or delete from a floating
  action bar. Works in similar-image, region, and album views too.
- **Colour search** — filter the Gallery, Timeline, or tag results by dominant
  colour via toolbar swatches or a custom picker.
- **Choose your tagging model** — pick between the anime-focused WD tagger and
  **JoyTag** (better for photo libraries), each with its own confidence
  threshold, plus a **Reset AI tags** action that never touches manual tags.
- **Tag manager** — rename, merge, and delete tags across the library, with
  live search and sorting; Explore's Tag Cloud also shows **related tags** on
  hover.
- **Camera info in the lightbox** — EXIF camera, lens, aperture, shutter
  speed, ISO, focal length, and a map link for geotagged photos.
- **Slideshow mode**, **What's New tour after updates**, **quick theme switch**
  from the title bar, an editable path bar in the folder picker, persistent
  per-folder worker pauses, and add-to-album from the right-click menu.

### Changed
- **Settings reorganised** into General, Media, Updates & Setup, Storage, and
  AI Workspace pages.
- **Menus unified** — all context menus and dropdowns share one style, stay on
  screen, close on Escape, and support submenus.
- **Faster Explore** — quicker cluster revisits, much faster first-time
  clustering on large libraries, and a calmer Tag Cloud during active tagging.
- **Faster CPU tagging** (multi-core with headroom) and smoother GPU tagging.
- **Safer deletion** — deleting media now asks for confirmation and says
  clearly that files are removed from disk.
- Better narrow-window layouts, a real update download progress bar, and a
  two-column lightbox info panel.

### Fixed
- **No more self-indexing loops** — Phokus now skips its own thumbnail cache
  when you add a broad folder like your user profile.
- **Ratings keep your search order** — rating an image mid-search no longer
  reshuffles similar-image, region, semantic, tag, or album results.
- **AI tagging stays responsive** — big GPU tagging jobs no longer freeze the
  UI, and noisy low-signal tags are filtered (older ones cleaned up on
  startup).
- First launch now fits smaller screens, Explore no longer flashes the
  previous folder, and a long list of Subtle Light readability fixes.

See the [changelog](https://github.com/JezzWTF/phokus/blob/main/CHANGELOG.md)
for the full list.

## Checksums

```
SHA-256 (Phokus_0.2.0_x64-setup.exe)      = TBD
SHA-256 (Phokus_0.2.0_x64-cuda-setup.exe) = TBD
```
