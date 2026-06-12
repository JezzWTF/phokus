import { useEffect, useCallback, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useGalleryStore, ImageTag, AiRating } from "../store";
import { VideoPlayer } from "./VideoPlayer";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "Unknown";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatDuration(durationMs: number | null): string {
  if (!durationMs || durationMs <= 0) return "Pending / unavailable";
  const totalSeconds = Math.floor(durationMs / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function embeddingLabel(status: string, model: string | null): string {
  if (status === "ready") {
    return model ? `Ready (${model})` : "Ready";
  }
  if (status === "failed") {
    return "Failed";
  }
  if (status === "processing") {
    return "Processing";
  }
  return "Queued";
}

function ratingPill(rating: AiRating): { label: string; className: string } {
  switch (rating) {
    case "general":
      return { label: "General", className: "border-emerald-400/25 bg-emerald-500/10 text-emerald-300" };
    case "sensitive":
      return { label: "Sensitive", className: "border-sky-400/25 bg-sky-500/10 text-sky-300" };
    case "questionable":
      return { label: "Questionable", className: "border-amber-400/25 bg-amber-500/10 text-amber-300" };
    case "explicit":
      return { label: "Explicit", className: "border-red-400/25 bg-red-500/10 text-red-300" };
  }
}

interface DragRect {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

/** Compute a CSS-pixel rect (relative to the viewport container) from a DragRect. */
function normaliseRect(r: DragRect): { left: number; top: number; width: number; height: number } {
  return {
    left: Math.min(r.startX, r.endX),
    top: Math.min(r.startY, r.endY),
    width: Math.abs(r.endX - r.startX),
    height: Math.abs(r.endY - r.startY),
  };
}

/** Convert a CSS-pixel drag rect (relative to viewport container) to normalised 0–1 crop coords
 *  relative to the actual rendered <img> element bounds. */
function rectToNormalisedCrop(
  rect: DragRect,
  imgEl: HTMLImageElement,
): { x: number; y: number; w: number; h: number } | null {
  const imgBounds = imgEl.getBoundingClientRect();
  if (imgBounds.width === 0 || imgBounds.height === 0) return null;

  // rect coords are already in viewport space (client coords)
  const rawX = Math.min(rect.startX, rect.endX);
  const rawY = Math.min(rect.startY, rect.endY);
  const rawW = Math.abs(rect.endX - rect.startX);
  const rawH = Math.abs(rect.endY - rect.startY);

  // Clamp to image bounds
  const clampedX = Math.max(rawX, imgBounds.left);
  const clampedY = Math.max(rawY, imgBounds.top);
  const clampedRight = Math.min(rawX + rawW, imgBounds.right);
  const clampedBottom = Math.min(rawY + rawH, imgBounds.bottom);

  const croppedW = clampedRight - clampedX;
  const croppedH = clampedBottom - clampedY;

  if (croppedW <= 0 || croppedH <= 0) return null;

  // Normalize by the CSS transform scale — getBoundingClientRect already returns
  // the scaled (on-screen) size, so we normalize directly against that.
  return {
    x: (clampedX - imgBounds.left) / imgBounds.width,
    y: (clampedY - imgBounds.top) / imgBounds.height,
    w: croppedW / imgBounds.width,
    h: croppedH / imgBounds.height,
  };
}

/** Minimum selection size as a fraction of the viewport container dimension. */
const MIN_SELECTION_FRACTION = 0.02;

export function Lightbox() {
  const selectedImage = useGalleryStore((state) => state.selectedImage);
  const closeImage = useGalleryStore((state) => state.closeImage);
  const images = useGalleryStore((state) => state.images);
  const openImage = useGalleryStore((state) => state.openImage);
  const loadSimilarImages = useGalleryStore((state) => state.loadSimilarImages);
  const loadSimilarByRegion = useGalleryStore((state) => state.loadSimilarByRegion);
  const similarScope = useGalleryStore((state) => state.similarScope);
  const updateImageDetails = useGalleryStore((state) => state.updateImageDetails);
  const getImageTags = useGalleryStore((state) => state.getImageTags);
  const addUserTag = useGalleryStore((state) => state.addUserTag);
  const removeTag = useGalleryStore((state) => state.removeTag);
  const taggerModelStatus = useGalleryStore((state) => state.taggerModelStatus);
  const queueTaggingForImage = useGalleryStore((state) => state.queueTaggingForImage);

  // Tracks the image id that is currently displayed, used to discard async
  // tag mutations that resolve after the user has navigated to another image.
  const currentImageIdRef = useRef<number | null>(null);
  currentImageIdRef.current = selectedImage?.id ?? null;

  const [zoom, setZoom] = useState(1);
  const [imageTags, setImageTags] = useState<ImageTag[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [tagAdding, setTagAdding] = useState(false);
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const [taggingQueued, setTaggingQueued] = useState(false);

  // Region selection state
  const [regionSelectMode, setRegionSelectMode] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragRect, setDragRect] = useState<DragRect | null>(null);
  const [regionSearching, setRegionSearching] = useState(false);

  const imageViewportRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const currentIndex = selectedImage ? images.findIndex((image) => image.id === selectedImage.id) : -1;
  const canFindSimilar = selectedImage?.embedding_status === "ready";
  const canSearchRegion = canFindSimilar && selectedImage?.media_kind === "image";

  const goPrev = useCallback(() => {
    if (currentIndex > 0) openImage(images[currentIndex - 1]);
  }, [currentIndex, images, openImage]);

  const goNext = useCallback(() => {
    if (currentIndex >= 0 && currentIndex < images.length - 1) openImage(images[currentIndex + 1]);
  }, [currentIndex, images, openImage]);

  const exitRegionMode = useCallback(() => {
    setRegionSelectMode(false);
    setIsDragging(false);
    setDragRect(null);
  }, []);

  useEffect(() => {
    setZoom(1);
    setImageTags([]);
    setTagInput("");
    setTagsExpanded(false);
    setTaggingQueued(false);
    exitRegionMode();
    setRegionSearching(false);
  }, [selectedImage?.id, exitRegionMode]);

  useEffect(() => {
    if (!selectedImage) return;
    // Capture the ID so a stale response for image A cannot overwrite B's tags
    // when the user navigates before the request resolves.
    let cancelled = false;
    void getImageTags(selectedImage.id)
      .then((tags) => { if (!cancelled) setImageTags(tags); })
      .catch(() => { if (!cancelled) setImageTags([]); });
    return () => { cancelled = true; };
  }, [selectedImage?.id, selectedImage?.ai_tagged_at, getImageTags]);

  // Reset the queued state once the worker finishes so the button is usable again
  useEffect(() => {
    if (selectedImage?.ai_tagged_at) setTaggingQueued(false);
  }, [selectedImage?.ai_tagged_at]);

  useEffect(() => {
    const viewport = imageViewportRef.current;
    if (!viewport || !selectedImage || selectedImage.media_kind !== "image") return;

    const handleWheel = (event: WheelEvent) => {
      if (regionSelectMode) return; // don't zoom during selection
      if (!event.ctrlKey && Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
      event.preventDefault();
      setZoom((value) => {
        const delta = event.deltaY < 0 ? 0.15 : -0.15;
        return Math.min(4, Math.max(0.5, value + delta));
      });
    };

    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleWheel);
  }, [selectedImage, regionSelectMode]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!selectedImage) return;
      if (event.key === "Escape") {
        if (regionSelectMode) {
          exitRegionMode();
        } else {
          closeImage();
        }
      }
      if (regionSelectMode) return; // block nav keys during selection
      // Shift+arrows are reserved for video seeking (handled by VideoPlayer)
      if (event.key === "ArrowLeft" && !event.shiftKey) goPrev();
      if (event.key === "ArrowRight" && !event.shiftKey) goNext();
      if (event.key === "+" || event.key === "=") setZoom((value) => Math.min(3, value + 0.25));
      if (event.key === "-") setZoom((value) => Math.max(0.75, value - 0.25));
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedImage, closeImage, goPrev, goNext, regionSelectMode, exitRegionMode]);

  // ── Region selection pointer handlers ───────────────────────────────────────
  const handleRegionPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!regionSelectMode) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsDragging(true);
      setDragRect({
        startX: event.clientX,
        startY: event.clientY,
        endX: event.clientX,
        endY: event.clientY,
      });
    },
    [regionSelectMode],
  );

  const handleRegionPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging) return;
      setDragRect((prev) =>
        prev ? { ...prev, endX: event.clientX, endY: event.clientY } : null,
      );
    },
    [isDragging],
  );

  const handleRegionPointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging || !dragRect || !selectedImage || !imgRef.current) {
        setIsDragging(false);
        return;
      }
      event.currentTarget.releasePointerCapture(event.pointerId);

      const finalRect: DragRect = { ...dragRect, endX: event.clientX, endY: event.clientY };
      const crop = rectToNormalisedCrop(finalRect, imgRef.current);

      setIsDragging(false);
      setDragRect(null);

      // Ignore tiny accidental clicks
      const containerBounds = imageViewportRef.current?.getBoundingClientRect();
      const containerSize = containerBounds
        ? Math.min(containerBounds.width, containerBounds.height)
        : 500;
      const selW = Math.abs(finalRect.endX - finalRect.startX);
      const selH = Math.abs(finalRect.endY - finalRect.startY);
      if (!crop || selW < containerSize * MIN_SELECTION_FRACTION || selH < containerSize * MIN_SELECTION_FRACTION) {
        exitRegionMode();
        return;
      }

      exitRegionMode();
      setRegionSearching(true);

      const folderId =
        similarScope === "current_folder" ? selectedImage.folder_id : null;
      void loadSimilarByRegion(selectedImage.id, crop, folderId, selectedImage.folder_id)
        .finally(() => setRegionSearching(false));
    },
    [isDragging, dragRect, selectedImage, similarScope, loadSimilarByRegion, exitRegionMode],
  );

  // Build the CSS rect for the selection overlay (viewport-relative)
  const selectionOverlay =
    isDragging && dragRect ? normaliseRect(dragRect) : null;

  return (
    <AnimatePresence>
      {selectedImage ? (
        <motion.div
          key="lightbox"
          className="fixed inset-0 z-50 flex bg-black/90 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={regionSelectMode ? undefined : closeImage}
        >
          <button
            className="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white transition-colors hover:bg-white/20 disabled:opacity-20"
            disabled={currentIndex <= 0 || regionSelectMode}
            onClick={(event) => {
              event.stopPropagation();
              goPrev();
            }}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <div className="flex flex-1 flex-col" onClick={(event) => event.stopPropagation()}>
            <div className="flex flex-1 overflow-hidden">
              <div
                ref={imageViewportRef}
                className={`group relative flex flex-1 items-center justify-center overflow-auto p-10 ${
                  regionSelectMode ? "cursor-crosshair select-none" : ""
                }`}
                onPointerDown={handleRegionPointerDown}
                onPointerMove={handleRegionPointerMove}
                onPointerUp={handleRegionPointerUp}
              >
                {/* Region selection mode hint */}
                {regionSelectMode && (
                  <div className="pointer-events-none absolute inset-x-0 top-4 z-20 flex justify-center">
                    <div className="flex items-center gap-2 rounded-full border border-white/15 bg-black/70 px-4 py-2 text-xs text-gray-300 backdrop-blur">
                      <svg className="h-3.5 w-3.5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                      </svg>
                      Draw a region to search — <kbd className="ml-1 rounded border border-white/20 bg-white/10 px-1.5 py-0.5 font-mono text-[10px]">Esc</kbd> to cancel
                    </div>
                  </div>
                )}

                {/* Selection rectangle overlay */}
                {selectionOverlay && selectionOverlay.width > 4 && selectionOverlay.height > 4 && (
                  <div
                    className="pointer-events-none fixed z-30 rounded border-2 border-violet-400 bg-violet-400/15 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
                    style={{
                      left: selectionOverlay.left,
                      top: selectionOverlay.top,
                      width: selectionOverlay.width,
                      height: selectionOverlay.height,
                    }}
                  />
                )}

                <AnimatePresence mode="wait">
                  <motion.div
                    key={selectedImage.id}
                    className={
                      selectedImage.media_kind === "video"
                        ? "absolute inset-0"
                        : "flex items-center justify-center"
                    }
                    initial={{ opacity: 0.3, scale: 0.985 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0.3, scale: 0.985 }}
                    transition={{ duration: 0.12 }}
                  >
                    {selectedImage.media_kind === "video" ? (
                      <VideoPlayer src={convertFileSrc(selectedImage.path)} />
                    ) : (
                      <>
                        <img
                          ref={imgRef}
                          src={convertFileSrc(selectedImage.path)}
                          alt={selectedImage.filename}
                          className="max-w-full rounded-2xl shadow-2xl"
                          style={{
                            maxHeight: "calc(100vh - 10rem)",
                            transform: `scale(${zoom})`,
                            transformOrigin: "center center",
                            // Slightly dim the image while in region select mode
                            ...(regionSelectMode ? { opacity: 0.85 } : {}),
                          }}
                        />
                        {!regionSelectMode && (
                          <div className="pointer-events-none absolute right-6 top-6 opacity-0 transition-opacity group-hover:opacity-100">
                            <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-white/10 bg-black/55 px-2 py-1 backdrop-blur">
                              <button
                                className="px-2 text-sm text-gray-300 hover:text-white"
                                onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))}
                              >
                                -
                              </button>
                              <span className="min-w-14 text-center text-xs text-gray-300">{Math.round(zoom * 100)}%</span>
                              <button
                                className="px-2 text-sm text-gray-300 hover:text-white"
                                onClick={() => setZoom((value) => Math.min(4, value + 0.25))}
                              >
                                +
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>

              <div className="flex w-72 shrink-0 flex-col border-l border-white/5 bg-gray-900/95">
                <div className="flex shrink-0 items-center justify-between px-5 pt-5 pb-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">{selectedImage.filename}</p>
                    <p className="text-xs text-gray-500">Details</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className={`rounded-full border p-2 ${selectedImage.favorite ? "border-rose-400/40 bg-rose-500/10 text-rose-300" : "border-white/10 bg-white/5 text-gray-400 hover:text-white"}`}
                      onClick={() => void updateImageDetails(selectedImage.id, { favorite: !selectedImage.favorite })}
                      title={selectedImage.favorite ? "Remove favorite" : "Add favorite"}
                    >
                      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" />
                      </svg>
                    </button>
                    <button
                      className={`rounded-full border px-3 py-1.5 text-xs ${
                        canFindSimilar
                          ? "border-white/10 bg-white/5 text-gray-300 hover:text-white"
                          : "border-white/5 bg-white/[0.03] text-gray-600 cursor-not-allowed"
                      }`}
                      onClick={() => {
                        if (!canFindSimilar) return;
                        void loadSimilarImages(selectedImage.id, similarScope === "current_folder" ? selectedImage.folder_id : null, true, selectedImage.folder_id);
                      }}
                      disabled={!canFindSimilar}
                    >
                      {canFindSimilar ? "Similar" : "Embeddings not ready"}
                    </button>
                  </div>
                  <button className="rounded p-1 text-gray-400 hover:text-white" onClick={closeImage}>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Search region button row */}
                {canSearchRegion && (
                  <div className="shrink-0 px-5 pb-3">
                    <button
                      className={`w-full rounded-lg border px-3 py-2 text-xs transition-colors ${
                        regionSelectMode
                          ? "border-violet-400/40 bg-violet-500/15 text-violet-300 hover:bg-violet-500/20"
                          : regionSearching
                          ? "border-white/5 bg-white/[0.03] text-gray-500 cursor-not-allowed"
                          : "border-white/10 bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white"
                      }`}
                      onClick={() => {
                        if (regionSearching) return;
                        setRegionSelectMode((prev) => !prev);
                        setDragRect(null);
                        setIsDragging(false);
                      }}
                      disabled={regionSearching}
                      title={regionSelectMode ? "Cancel region selection" : "Draw a region on the image to search for similar content"}
                    >
                      {regionSearching ? (
                        <span className="flex items-center justify-center gap-1.5">
                          <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                          </svg>
                          Searching region…
                        </span>
                      ) : regionSelectMode ? (
                        <span className="flex items-center justify-center gap-1.5">
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          Cancel selection
                        </span>
                      ) : (
                        <span className="flex items-center justify-center gap-1.5">
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                          </svg>
                          Search within image
                        </span>
                      )}
                    </button>
                  </div>
                )}

                <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 space-y-4 text-sm">
                  <div>
                    <p className="mb-1 text-xs uppercase tracking-wider text-gray-500">Rating</p>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: 5 }, (_, index) => {
                        const rating = index + 1;
                        return (
                          <button
                            key={rating}
                            className="rounded-md p-1"
                            onClick={() => void updateImageDetails(selectedImage.id, { rating })}
                            title={`Set ${rating} star rating`}
                          >
                            <svg
                              className={`h-5 w-5 ${rating <= selectedImage.rating ? "text-amber-300" : "text-white/20 hover:text-white/50"}`}
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.176 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81H7.03a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                          </button>
                        );
                      })}
                      {selectedImage.rating > 0 ? (
                        <button
                          className="ml-2 rounded-md border border-white/10 p-1.5 text-gray-400 hover:bg-white/5 hover:text-white"
                          onClick={() => void updateImageDetails(selectedImage.id, { rating: 0 })}
                          title="Remove rating"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div>
                    <p className="mb-1 text-xs uppercase tracking-wider text-gray-500">Dimensions</p>
                    <p className="text-white">
                      {selectedImage.width && selectedImage.height
                        ? `${selectedImage.width} x ${selectedImage.height}px`
                        : "Pending / unavailable"}
                    </p>
                  </div>

                  {selectedImage.media_kind === "video" ? (
                    <>
                      <div>
                        <p className="mb-1 text-xs uppercase tracking-wider text-gray-500">Duration</p>
                        <p className="text-white">{formatDuration(selectedImage.duration_ms)}</p>
                      </div>

                      <div>
                        <p className="mb-1 text-xs uppercase tracking-wider text-gray-500">Video codec</p>
                        <p className="text-white">{selectedImage.video_codec ?? "Pending / unavailable"}</p>
                      </div>

                      <div>
                        <p className="mb-1 text-xs uppercase tracking-wider text-gray-500">Audio codec</p>
                        <p className="text-white">{selectedImage.audio_codec ?? "None / unavailable"}</p>
                      </div>

                      {selectedImage.metadata_error ? (
                        <div>
                          <p className="mb-1 text-xs uppercase tracking-wider text-gray-500">Metadata</p>
                          <p className="text-amber-300">{selectedImage.metadata_error}</p>
                        </div>
                      ) : null}
                    </>
                  ) : null}

                  <div>
                    <p className="mb-1 text-xs uppercase tracking-wider text-gray-500">Type</p>
                    <p className="text-white">{selectedImage.mime_type}</p>
                  </div>

                  <div>
                    <p className="mb-1 text-xs uppercase tracking-wider text-gray-500">File size</p>
                    <p className="text-white">{formatBytes(selectedImage.file_size)}</p>
                  </div>

                  <div>
                    <p className="mb-1 text-xs uppercase tracking-wider text-gray-500">Modified</p>
                    <p className="text-white">{formatDate(selectedImage.modified_at)}</p>
                  </div>

                  <div>
                    <p className="mb-1 text-xs uppercase tracking-wider text-gray-500">Embedding</p>
                    <p className="text-white">{embeddingLabel(selectedImage.embedding_status, selectedImage.embedding_model)}</p>
                    {selectedImage.embedding_error ? (
                      <p className="mt-1 text-xs text-amber-300">{selectedImage.embedding_error}</p>
                    ) : null}
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs uppercase tracking-wider text-gray-500">Tags</p>
                      <div className="flex items-center gap-1.5">
                        {selectedImage.ai_rating ? (
                          <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${ratingPill(selectedImage.ai_rating).className}`}>
                            {ratingPill(selectedImage.ai_rating).label}
                          </span>
                        ) : null}
                        {selectedImage.media_kind === "image" ? (
                          <button
                            className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-gray-400 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                            disabled={!(taggerModelStatus?.ready ?? false) || taggingQueued}
                            title={!(taggerModelStatus?.ready ?? false) ? "WD Tagger model not downloaded" : "Queue AI tagging for this image"}
                            onClick={() => {
                              setTaggingQueued(true);
                              void queueTaggingForImage(selectedImage.id).catch(() => undefined);
                            }}
                          >
                            {taggingQueued ? "Queued" : "AI tags"}
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {imageTags.length > 0 ? (
                      <>
                        <div className="flex flex-wrap gap-1.5">
                          {(tagsExpanded ? imageTags : imageTags.slice(0, 8)).map((t) => (
                            <span
                              key={t.id}
                              className={`group flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs ${
                                t.source === "ai"
                                  ? "border-sky-400/20 bg-sky-500/8 text-sky-300"
                                  : "border-white/10 bg-white/5 text-gray-300"
                              }`}
                              title={t.source === "ai" && t.confidence !== null ? `AI confidence: ${(t.confidence * 100).toFixed(0)}%` : undefined}
                            >
                              {t.tag}
                              <button
                                className="text-gray-600 opacity-0 transition-opacity hover:text-white group-hover:opacity-100"
                                onClick={() => {
                                  void removeTag(t.id).then(() =>
                                    setImageTags((prev) => prev.filter((x) => x.id !== t.id)),
                                  );
                                }}
                                title="Remove tag"
                              >
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </span>
                          ))}
                        </div>
                        {imageTags.length > 8 && (
                          <button
                            className="mt-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                            onClick={() => setTagsExpanded((v) => !v)}
                          >
                            {tagsExpanded ? "Show less" : `+${imageTags.length - 8} more`}
                          </button>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-gray-600">No tags yet</p>
                    )}

                    <form
                      className="mt-2 flex gap-1.5"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const raw = tagInput.trim();
                        if (!raw || tagAdding) return;
                        setTagAdding(true);
                        const taggedImageId = selectedImage.id;
                        void addUserTag(taggedImageId, raw)
                          .then((newTag) => {
                            // Discard if the user navigated away before the request resolved.
                            if (currentImageIdRef.current !== taggedImageId) return;
                            setImageTags((prev) => [...prev, newTag]);
                            setTagInput("");
                          })
                          .catch(() => undefined)
                          .finally(() => setTagAdding(false));
                      }}
                    >
                      <input
                        className="min-w-0 flex-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white placeholder-gray-600 focus:border-white/20 focus:outline-none"
                        placeholder="Add tag…"
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        disabled={tagAdding}
                      />
                      <button
                        type="submit"
                        className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-gray-300 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={tagAdding || !tagInput.trim()}
                      >
                        Add
                      </button>
                    </form>
                  </div>

                  <div>
                    <p className="mb-1 text-xs uppercase tracking-wider text-gray-500">Path</p>
                    <p className="break-all text-xs text-gray-400">{selectedImage.path}</p>
                  </div>
                </div>

                <div className="shrink-0 mt-auto px-5 pb-4 pt-2 text-center text-xs text-gray-600">
                  {currentIndex + 1} / {images.length}
                </div>
              </div>
            </div>
          </div>

          <button
            className="absolute right-80 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white transition-colors hover:bg-white/20 disabled:opacity-20"
            disabled={currentIndex >= images.length - 1 || regionSelectMode}
            onClick={(event) => {
              event.stopPropagation();
              goNext();
            }}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
