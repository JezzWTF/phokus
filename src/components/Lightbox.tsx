import { useEffect, useCallback, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useGalleryStore } from "../store";

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

export function Lightbox() {
  const selectedImage = useGalleryStore((state) => state.selectedImage);
  const closeImage = useGalleryStore((state) => state.closeImage);
  const images = useGalleryStore((state) => state.images);
  const openImage = useGalleryStore((state) => state.openImage);
  const updateImageDetails = useGalleryStore((state) => state.updateImageDetails);
  const [zoom, setZoom] = useState(1);
  const imageViewportRef = useRef<HTMLDivElement>(null);

  const currentIndex = selectedImage ? images.findIndex((image) => image.id === selectedImage.id) : -1;

  const goPrev = useCallback(() => {
    if (currentIndex > 0) openImage(images[currentIndex - 1]);
  }, [currentIndex, images, openImage]);

  const goNext = useCallback(() => {
    if (currentIndex >= 0 && currentIndex < images.length - 1) openImage(images[currentIndex + 1]);
  }, [currentIndex, images, openImage]);

  useEffect(() => {
    setZoom(1);
  }, [selectedImage?.id]);

  useEffect(() => {
    const viewport = imageViewportRef.current;
    if (!viewport || !selectedImage || selectedImage.media_kind !== "image") return;

    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
      event.preventDefault();
      setZoom((value) => {
        const delta = event.deltaY < 0 ? 0.15 : -0.15;
        return Math.min(4, Math.max(0.5, value + delta));
      });
    };

    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleWheel);
  }, [selectedImage]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!selectedImage) return;
      if (event.key === "Escape") closeImage();
      if (event.key === "ArrowLeft") goPrev();
      if (event.key === "ArrowRight") goNext();
      if (event.key === "+" || event.key === "=") setZoom((value) => Math.min(3, value + 0.25));
      if (event.key === "-") setZoom((value) => Math.max(0.75, value - 0.25));
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedImage, closeImage, goPrev, goNext]);

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
          onClick={closeImage}
        >
          <button
            className="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white transition-colors hover:bg-white/20 disabled:opacity-20"
            disabled={currentIndex <= 0}
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
                className="group relative flex flex-1 items-center justify-center overflow-auto p-10"
              >
                <AnimatePresence mode="wait">
                  <motion.div
                    key={selectedImage.id}
                    className="flex items-center justify-center"
                    initial={{ opacity: 0.3, scale: 0.985 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0.3, scale: 0.985 }}
                    transition={{ duration: 0.12 }}
                  >
                    {selectedImage.media_kind === "video" ? (
                      <video
                        src={convertFileSrc(selectedImage.path)}
                        controls
                        className="max-h-full max-w-full rounded-2xl shadow-2xl"
                        style={{ maxHeight: "calc(100vh - 10rem)" }}
                      />
                    ) : (
                      <>
                        <img
                          src={convertFileSrc(selectedImage.path)}
                          alt={selectedImage.filename}
                          className="max-w-full rounded-2xl shadow-2xl"
                          style={{
                            maxHeight: "calc(100vh - 10rem)",
                            transform: `scale(${zoom})`,
                            transformOrigin: "center center",
                          }}
                        />
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
                      </>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>

              <div className="flex w-72 shrink-0 flex-col border-l border-white/5 bg-gray-900/95 p-5">
                <div className="mb-5 flex items-center justify-between">
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
                  </div>
                  <button className="rounded p-1 text-gray-400 hover:text-white" onClick={closeImage}>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="space-y-4 text-sm">
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
                    <p className="text-white">{selectedImage.embedding_status}</p>
                  </div>

                  <div>
                    <p className="mb-1 text-xs uppercase tracking-wider text-gray-500">Path</p>
                    <p className="break-all text-xs text-gray-400">{selectedImage.path}</p>
                  </div>
                </div>

                <div className="mt-auto pt-4 text-center text-xs text-gray-600">
                  {currentIndex + 1} / {images.length}
                </div>
              </div>
            </div>
          </div>

          <button
            className="absolute right-80 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white transition-colors hover:bg-white/20 disabled:opacity-20"
            disabled={currentIndex >= images.length - 1}
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
