import { AnimatePresence, motion } from "framer-motion";
import { RefObject } from "react";
import { ImageRecord } from "../../store";
import { mediaSrc } from "../../lib/mediaSrc";
import { VideoPlayer } from "../VideoPlayer";
import { Tooltip } from "../Tooltip";
import { SelectionOverlay, ViewTransform } from "./types";
import { MAX_ZOOM, MIN_ZOOM, zoomViewAt } from "./viewTransform";

interface LightboxViewportProps {
  selectedImage: ImageRecord;
  imageViewportRef: RefObject<HTMLDivElement | null>;
  imgRef: RefObject<HTMLImageElement | null>;
  view: ViewTransform;
  zoom: number;
  regionSelectMode: boolean;
  isPanning: boolean;
  selectionOverlay: SelectionOverlay | null;
  canStartSlideshow: boolean;
  onStartSlideshow: () => void;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
  setView: React.Dispatch<React.SetStateAction<ViewTransform>>;
  clampPan: (view: ViewTransform) => ViewTransform;
}

export function LightboxViewport({
  selectedImage,
  imageViewportRef,
  imgRef,
  view,
  zoom,
  regionSelectMode,
  isPanning,
  selectionOverlay,
  canStartSlideshow,
  onStartSlideshow,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  setView,
  clampPan,
}: LightboxViewportProps) {
  return (
    <div
      ref={imageViewportRef}
      className={`group relative flex flex-1 items-center justify-center overflow-hidden p-10 ${
        regionSelectMode
          ? "cursor-crosshair select-none"
          : isPanning
          ? "cursor-grabbing select-none"
          : zoom > 1 && selectedImage.media_kind === "image"
          ? "cursor-grab"
          : ""
      }`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
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
            <VideoPlayer src={mediaSrc(selectedImage.path) ?? ""} />
          ) : (
            <img
              ref={imgRef}
              src={mediaSrc(selectedImage.path) ?? ""}
              alt={selectedImage.filename}
              className="max-w-full rounded-2xl shadow-2xl"
              draggable={false}
              style={{
                maxHeight: "calc(100vh - 10rem)",
                transform: `translate(${view.panX}px, ${view.panY}px) scale(${zoom})`,
                transformOrigin: "center center",
                ...(regionSelectMode ? { opacity: 0.85 } : {}),
              }}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {!regionSelectMode && (
        <div className="pointer-events-none absolute right-6 top-6 opacity-75 transition-opacity group-hover:opacity-100">
          <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-white/10 bg-black/55 p-1 shadow-2xl shadow-black/25 backdrop-blur">
            <Tooltip label={canStartSlideshow ? "Start slideshow" : "No images available for slideshow"} followCursor>
              <button
                aria-label="Start slideshow"
                className={`rounded-full p-2 transition-colors ${
                  canStartSlideshow
                    ? "text-gray-300 hover:bg-white/10 hover:text-white"
                    : "cursor-not-allowed text-gray-600"
                }`}
                disabled={!canStartSlideshow}
                onClick={(event) => {
                  event.stopPropagation();
                  onStartSlideshow();
                }}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 5.5v13l10-6.5-10-6.5z" />
                </svg>
              </button>
            </Tooltip>
            {selectedImage.media_kind === "image" ? (
              <>
                <div className="mx-0.5 h-5 w-px bg-white/10" />
                <button
                  aria-label="Zoom out"
                  className="rounded-full px-2 py-1 text-sm text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
                  onClick={() => setView((currentView) => clampPan(zoomViewAt(currentView, Math.max(MIN_ZOOM, currentView.zoom - 0.25), 0, 0)))}
                >
                  -
                </button>
                <span className="min-w-14 text-center text-xs text-gray-300">{Math.round(zoom * 100)}%</span>
                <button
                  aria-label="Zoom in"
                  className="rounded-full px-2 py-1 text-sm text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
                  onClick={() => setView((currentView) => clampPan(zoomViewAt(currentView, Math.min(MAX_ZOOM, currentView.zoom + 0.25), 0, 0)))}
                >
                  +
                </button>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
