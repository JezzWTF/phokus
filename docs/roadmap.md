# Phokus Roadmap

## Purpose

This file tracks the agreed implementation phases for Phokus so work can continue cleanly across sessions and machines.

## Product Direction

Phokus is a local-first desktop media library for images and videos with:

1. fast folder indexing
2. rich browsing and preview UX
3. background thumbnail and metadata processing
4. CLIP-powered similarity search via `sqlite-vec`

## Phase 1: Core Indexing And Gallery Stability

Status: done

Goals:

1. fix folder add/index so media actually appears
2. fix gallery rendering/layout issues
3. stream indexed items into the gallery incrementally
4. stop full-gallery refresh churn during indexing

Completed:

1. fixed broken DB image queries
2. fixed blank gallery rendering path
3. simplified the grid rendering path
4. changed indexing updates to stream into the current gallery

## Phase 2: Media Model And UI Expansion

Status: mostly done

Goals:

1. support images and videos as first-class media types
2. expand the shell UI so future features fit naturally
3. add favorites, ratings, context actions, and richer preview behavior

Completed:

1. media kind support in backend and frontend
2. favorites and ratings persisted in SQLite
3. top menu bar and richer toolbar
4. right-click context menu in the gallery
5. improved lightbox with zoom, rating, favorite controls, and video playback

Remaining polish:

1. broader UI redesign pass later
2. continue refining background task presentation

## Phase 3: Media Processing Foundation

Status: in progress

Goals:

1. stable thumbnail pipeline for images and videos
2. video metadata extraction
3. visible background task tracking
4. optimized indexing and reindexing, especially for large/external drives
5. stable shipping story for FFmpeg/FFprobe

Completed:

1. image thumbnail generation upgraded to `fast_image_resize`
2. EXIF orientation handling added for images
3. stable thumbnail cache hashing via `xxh3`
4. video poster generation via sidecar-managed FFmpeg
5. video metadata extraction via FFprobe
6. background task panel added
7. reindexing changed from rebuild-from-zero to reconciliation against DB state
8. active folder indexing is prioritized over thumbnail/metadata workers
9. cold-index path optimized by moving image dimension extraction out of the scan path
10. FFmpeg/FFprobe provisioning now uses `ffmpeg-sidecar`

Still to do before moving on fully:

1. optimize thumbnail throughput further
2. optimize cold indexing on large/external drives further if needed
3. validate that fresh indexing, reindexing, video posters, and metadata all behave well at scale

Current next optimization pass:

1. atomic thumbnail job claiming
2. multiple thumbnail workers
3. batch DB writes in thumbnail worker
4. switch image thumbnails from WebP to JPEG if benchmarking confirms it helps

## Phase 4: Embeddings And Similarity Search

Status: not started

Goals:

1. CLIP embedding worker
2. `sqlite-vec` writes
3. image-to-image similarity search
4. later text-to-image search

Foundation already in place:

1. `sqlite-vec` table scaffold exists
2. embedding status columns exist
3. embedding jobs table exists

Implementation plan:

1. add CLIP runtime/inference path
2. process embedding jobs in background
3. write embeddings to `sqlite-vec`
4. add `find_similar_images(image_id, limit)` command
5. expose similar-image action in gallery/lightbox UI

## Phase 5: Discovery And Library Features

Status: later

Planned areas:

1. tags
2. albums / collections
3. richer metadata filters
4. better search UX
5. similarity-driven browsing workflows

## Immediate Priorities

Work these in order:

1. finish indexing/thumbnail throughput optimization
2. validate media processing behavior on large folders and external drives
3. move into embeddings

## Notes

Current backend direction is fixed as:

1. SQLite for source-of-truth metadata and job state
2. `sqlite-vec` for vector search
3. sidecar-managed FFmpeg/FFprobe for video poster/metadata processing

Current architectural principle:

1. scan fast first
2. queue expensive downstream work
3. process heavy work after active indexing when possible
