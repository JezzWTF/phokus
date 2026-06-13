# Phokus v0.1.0

> Draft for the GitHub Release body. Paste into the release, fill in the
> checksum, and trim as needed.

**Phokus is a local-first desktop media library for Windows** — point it at
your image and video folders and it builds a fast, searchable gallery with
thumbnails, semantic search, visual discovery, AI tagging, and duplicate
cleanup. Everything is processed on your machine; nothing is uploaded.

This is the **first public release**. Expect rough edges, and please file
issues.

## Install

1. Download `Phokus_0.1.0_x64-setup.exe` below.
2. Run it. **Windows SmartScreen will warn** that the publisher is
   unrecognized — this build is **not code-signed** (cost; signing is on the
   roadmap). Click **More info → Run anyway** to proceed.
3. Requires **Windows 10/11**. The installer fetches the WebView2 runtime
   automatically if needed.

On first launch, Phokus runs a short guided tour and downloads FFmpeg in the
background (one-time, ~tens of MB). AI tagging (~1.3 GB) is optional; the CLIP
model for semantic search (~580 MB) downloads automatically the first time
embeddings run. **All of this stays on your machine.**

## Highlights

- Virtualized gallery for very large libraries; favorites, ratings, filters, sorts
- Filename, semantic (`/s`), and tag (`/t`) search
- Similar-image search, Explore clusters + tag cloud, EXIF Timeline
- Lightbox with zoom/pan and a custom video player
- Optional on-device AI tagging (WD tagger)
- Exact-duplicate finder with bulk delete
- Built-in updater

See the [changelog](https://github.com/JezzWTF/phokus/blob/main/CHANGELOG.md)
for the full list.

## Privacy

Your media and all derived data (thumbnails, embeddings, tags, ratings) never
leave your machine. No account, no telemetry, no cloud. The only network
activity is the one-time tool/model downloads above and update checks against
this Releases page.

## Known limitations

- **Unsigned installer** — SmartScreen warning as described above.
- **Windows only** for now.
- CPU/DirectML inference in the shipped build; very large libraries take time
  to embed on first index.

## Verify your download (optional)

```
SHA-256 (Phokus_0.1.0_x64-setup.exe) = <fill in at publish time>
```
