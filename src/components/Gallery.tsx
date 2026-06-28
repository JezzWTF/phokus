import { useEffect, useLayoutEffect, useRef, useCallback, useMemo, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { convertFileSrc } from "@tauri-apps/api/core";
import { ImageRecord, parseSearchValue, tileSizeForZoom, useGalleryStore } from "../store";
import { BulkActionBar } from "./BulkActionBar";
import { Tooltip } from "./Tooltip";

const GAP = 6;

function formatDuration(durationMs: number | null): string | null {
  if (!durationMs || durationMs <= 0) return null;
  const totalSeconds = Math.floor(durationMs / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function ContextMenu({
  x,
  y,
  image,
  onClose,
}: {
  x: number;
  y: number;
  image: ImageRecord;
  onClose: () => void;
}) {
  const openImage = useGalleryStore((state) => state.openImage);
  const updateImageDetails = useGalleryStore((state) => state.updateImageDetails);
  const findSimilar = useGalleryStore((state) => state.findSimilar);
  const canFindSimilar = image.embedding_status === "ready";

  return (
    <div
      data-gallery-context-menu
      className="fixed z-40 min-w-52 rounded-xl border border-white/10 bg-gray-950/98 p-1 shadow-2xl backdrop-blur"
      style={{ left: x, top: y }}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        className="w-full rounded-lg px-3 py-2 text-left text-sm text-gray-200 hover:bg-white/5 hover:text-white transition-colors"
        onClick={() => { openImage(image); onClose(); }}
      >
        Open Preview
      </button>
      <button
        className="w-full rounded-lg px-3 py-2 text-left text-sm text-gray-200 hover:bg-white/5 hover:text-white transition-colors"
        onClick={async () => { await updateImageDetails(image.id, { favorite: !image.favorite }); onClose(); }}
      >
        {image.favorite ? "Remove Favorite" : "Add to Favorites"}
      </button>
      <button
        className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
          canFindSimilar
            ? "text-gray-200 hover:bg-white/5 hover:text-white"
            : "text-gray-600 cursor-not-allowed"
        }`}
        onClick={() => {
          if (!canFindSimilar) return;
          findSimilar(image.id, image.folder_id);
          onClose();
        }}
        disabled={!canFindSimilar}
      >
        {canFindSimilar ? "Find Similar" : "Embeddings not ready"}
      </button>
      <div className="my-1 h-px bg-white/[0.06]" />
      <div className="px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-gray-600">Rating</div>
      <div className="flex items-center gap-0.5 px-2 pb-1.5">
        {Array.from({ length: 5 }, (_, index) => {
          const rating = index + 1;
          return (
            <button
              key={rating}
              className="rounded-md p-1 transition-colors hover:bg-white/5"
              onClick={async () => { await updateImageDetails(image.id, { rating }); onClose(); }}
              title={`Set ${rating} star rating`}
            >
              <svg
                className={`h-4 w-4 ${rating <= image.rating ? "text-amber-300" : "text-white/20 hover:text-white/40"}`}
                fill="currentColor" viewBox="0 0 20 20"
              >
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.176 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81H7.03a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            </button>
          );
        })}
        {image.rating > 0 ? (
          <button
            className="ml-1 rounded-md p-1 text-gray-600 hover:bg-white/5 hover:text-gray-300 transition-colors"
            onClick={async () => { await updateImageDetails(image.id, { rating: 0 }); onClose(); }}
            title="Remove rating"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function ImageTile({
  image,
  onClick,
  onContextMenu,
}: {
  image: ImageRecord;
  onClick: () => void;
  onContextMenu: (event: React.MouseEvent<HTMLDivElement>) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const findSimilar = useGalleryStore((state) => state.findSimilar);
  const selected = useGalleryStore((state) => state.gallerySelectedIds.has(image.id));
  const selectionActive = useGalleryStore((state) => state.gallerySelectedIds.size > 0);
  const toggleGallerySelected = useGalleryStore((state) => state.toggleGallerySelected);
  const canFindSimilar = image.embedding_status === "ready";

  const src = image.thumbnail_path ? convertFileSrc(image.thumbnail_path) : null;

  return (
    <Tooltip label={image.filename} delay={500} block followCursor>
    <div
      className={`media-dark-surface group relative overflow-hidden rounded-xl bg-white/[0.04] text-left focus:outline-none transition-shadow ${
        selected ? "ring-2 ring-inset ring-blue-400/80" : ""
      }`}
      style={{ width: "100%", aspectRatio: "1 / 1" }}
      onContextMenu={onContextMenu}
    >
      {/* Full-tile click target — opens, or toggles selection while selecting.
          A real button (over the non-interactive tile div) keeps it keyboard-
          accessible without nesting buttons. */}
      <button
        type="button"
        className="absolute inset-0 z-10 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80"
        aria-label={`Open ${image.filename}`}
        onClick={(event) => {
          event.stopPropagation();
          if (selectionActive) toggleGallerySelected(image.id);
          else onClick();
        }}
        onDoubleClick={(event) => {
          event.stopPropagation();
          onClick();
        }}
      />
      {/* Selection corner — a top-left zone that reveals the checkbox only when
          hovered (not the whole tile) and toggles selection on click. The
          checkbox stays visible once the item is selected. */}
      <button
        type="button"
        role="checkbox"
        aria-checked={selected}
        aria-label={selected ? "Deselect" : "Select"}
        className="group/cb absolute top-0 left-0 z-20 h-11 w-11 cursor-pointer"
        onClick={(event) => {
          event.stopPropagation();
          toggleGallerySelected(image.id);
        }}
      >
        <div
          className={`absolute top-2 left-2 flex h-5 w-5 items-center justify-center rounded-full border transition-all duration-150 ${
            selected
              ? "border-blue-400 bg-blue-500 text-white opacity-100"
              : "border-white/70 bg-black/40 text-transparent opacity-0 backdrop-blur-sm group-hover/cb:opacity-100"
          }`}
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      </button>
      {/* Image / placeholder */}
      {src && !errored ? (
        <>
          {!loaded && <div className="absolute inset-0 animate-pulse bg-white/[0.04]" />}
          <img
            src={src}
            alt={image.filename}
            className={`h-full w-full object-cover transition-all duration-300 ${
              loaded ? "opacity-100 scale-100" : "opacity-0 scale-[1.02]"
            } group-hover:scale-[1.03]`}
            loading="lazy"
            onLoad={() => setLoaded(true)}
            onError={() => setErrored(true)}
          />
        </>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-white/[0.03] text-white/20">
          {image.media_kind === "video" ? (
            <svg className="h-7 w-7" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          ) : (
            <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          )}
        </div>
      )}

      {/* Video play icon — subtle at rest, visible on hover */}
      {image.media_kind === "video" && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="rounded-full bg-black/40 p-3 text-white backdrop-blur-sm opacity-50 group-hover:opacity-90 transition-opacity duration-200">
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      )}

      {/* Persistent badges — only shown when meaningful */}
      <div className="absolute top-2 right-2 flex flex-col items-end gap-1 pointer-events-none">
        {image.embedding_status === "failed" && (
          <div
            className="flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-amber-400 backdrop-blur-sm"
            title={image.embedding_error ?? "Embedding failed"}
          >
            <svg className="h-2.5 w-2.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
        )}
        {image.favorite && (
          <div className="rounded-full bg-black/50 p-1 text-rose-400 backdrop-blur-sm">
            <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" />
            </svg>
          </div>
        )}
        {image.rating > 0 && (
          <div className="flex items-center gap-0.5 rounded-md bg-black/60 px-1.5 py-1 text-amber-300 backdrop-blur-sm">
            {Array.from({ length: image.rating }, (_, index) => (
              <svg key={index} className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.176 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81H7.03a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            ))}
          </div>
        )}
        {image.media_kind === "video" && image.duration_ms && (
          <div className="rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white/80 backdrop-blur-sm">
            {formatDuration(image.duration_ms)}
          </div>
        )}
      </div>

      {/* Hover overlay — slides up from bottom */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none" />

      {/* Hover info — appears with overlay */}
      <div className="absolute bottom-0 left-0 right-0 p-2.5 translate-y-1 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all duration-200">
        <p className="truncate text-[12px] font-medium text-white leading-tight">{image.filename}</p>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          {image.rating > 0 ? (
            <div className="flex items-center gap-0.5">
              {Array.from({ length: image.rating }, (_, i) => (
                <svg key={i} className="h-2.5 w-2.5 text-amber-300" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.176 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81H7.03a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              ))}
            </div>
          ) : (
            <span />
          )}
          <button
            className={`relative z-20 rounded-md px-2 py-0.5 text-[10px] transition-colors pointer-events-auto backdrop-blur-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80 ${
              canFindSimilar
                ? "bg-white/10 text-white/80 hover:bg-white/20 hover:text-white"
                : "bg-white/5 text-white/30 cursor-not-allowed"
            }`}
            onClick={(event) => {
              event.stopPropagation();
              if (!canFindSimilar) return;
              findSimilar(image.id, image.folder_id);
            }}
            disabled={!canFindSimilar}
          >
            Similar
          </button>
        </div>
      </div>
    </div>
    </Tooltip>
  );
}

export function Gallery() {
  const images = useGalleryStore((state) => state.images);
  const loadMoreImages = useGalleryStore((state) => state.loadMoreImages);
  const openImage = useGalleryStore((state) => state.openImage);
  const totalImages = useGalleryStore((state) => state.totalImages);
  const loadingImages = useGalleryStore((state) => state.loadingImages);
  const zoomPreset = useGalleryStore((state) => state.zoomPreset);
  const search = useGalleryStore((state) => state.search);
  const collectionTitle = useGalleryStore((state) => state.collectionTitle);
  const imageLoadError = useGalleryStore((state) => state.imageLoadError);
  const galleryScrollResetKey = useGalleryStore((state) => state.galleryScrollResetKey);
  const isSimilarResults = collectionTitle === "Similar Images";
  const parsedSearch = parseSearchValue(search);

  const parentRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; image: ImageRecord } | null>(null);

  useLayoutEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    setContainerWidth(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      setContainerWidth(entries[0].contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const tileSize = tileSizeForZoom(zoomPreset);
  const cols = useMemo(
    () => Math.max(1, Math.floor((containerWidth - GAP) / (tileSize + GAP))),
    [containerWidth, tileSize],
  );
  const rowCount = Math.ceil(images.length / cols);

  const estimateSize = useCallback(() => tileSize + GAP, [tileSize]);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize,
    overscan: 3,
    paddingStart: GAP,
  });

  useEffect(() => {
    virtualizer.measure();
  }, [cols, virtualizer]);

  useEffect(() => {
    parentRef.current?.scrollTo({ top: 0, left: 0 });
  }, [galleryScrollResetKey]);

  const handleScroll = useCallback(() => {
    const el = parentRef.current;
    if (!el) return;
    if (el.scrollTop < 24) return;
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 600;
    if (nearBottom && !loadingImages && images.length < totalImages) {
      void loadMoreImages();
    }
  }, [images.length, loadMoreImages, loadingImages, totalImages]);

  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if ((event.target as HTMLElement | null)?.closest("[data-gallery-context-menu]")) return;
      setContextMenu(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setContextMenu(null);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div className="relative flex-1 min-h-0">
    <div ref={parentRef} className="absolute inset-0 overflow-y-auto overflow-x-hidden bg-gray-950">
      {images.length === 0 && loadingImages ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center px-8 absolute inset-0">
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 min-w-72">
            <div className="h-5 w-5 mx-auto rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
            <p className="mt-4 text-sm text-white/40 font-medium">
              {isSimilarResults
                ? "Finding similar images"
                : parsedSearch.mode === "semantic" && parsedSearch.query.length > 0
                ? `Searching for matches to "${parsedSearch.query}"`
                : parsedSearch.mode === "tag" && parsedSearch.query.length > 0
                ? `Searching tags for "${parsedSearch.query}"`
                : "Loading media"}
            </p>
            <p className="text-xs text-white/20 mt-1">
              {isSimilarResults
                ? "Comparing visual embeddings"
                : parsedSearch.mode === "semantic" && parsedSearch.query.length > 0
                ? "Semantic search can take a little longer than filename search"
                : parsedSearch.mode === "tag" && parsedSearch.query.length > 0
                ? "Matching against AI and user tags"
                : "Fetching results"}
            </p>
          </div>
        </div>
      ) : images.length === 0 && !loadingImages ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center px-8 absolute inset-0">
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8">
            <svg className="h-12 w-12 mx-auto text-white/10 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={0.75}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-sm text-white/30 font-medium">
              {imageLoadError
                ? "Could not load results"
                : isSimilarResults
                ? "No similar images found"
                : parsedSearch.mode === "semantic" && parsedSearch.query.length > 0
                ? "No semantic matches found"
                : parsedSearch.mode === "tag" && parsedSearch.query.length > 0
                ? "No tag matches found"
                : "No media found"}
            </p>
            <p className="text-xs text-white/15 mt-1">
              {imageLoadError
                ? imageLoadError
                : isSimilarResults
                ? "This item may be visually isolated, or more embeddings may need to finish processing"
                : parsedSearch.mode === "semantic" && parsedSearch.query.length > 0
                ? "Try a broader phrase, or wait for more embeddings to finish processing"
                : parsedSearch.mode === "tag" && parsedSearch.query.length > 0
                ? "Try a shorter tag, or wait for more tagging jobs to finish"
                : "Try adjusting your filters or add a new folder"}
            </p>
          </div>
        </div>
      ) : (
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const startIndex = virtualRow.index * cols;
            const rowImages = images.slice(startIndex, startIndex + cols);
            return (
              <div
                key={virtualRow.key}
                style={{
                  position: "absolute",
                  top: virtualRow.start,
                  width: "100%",
                  height: virtualRow.size,
                  display: "grid",
                  gridTemplateColumns: `repeat(${cols}, ${tileSize}px)`,
                  gap: GAP,
                  paddingLeft: GAP,
                  paddingRight: GAP,
                  paddingBottom: GAP,
                  boxSizing: "border-box",
                }}
              >
                {rowImages.map((image) => (
                  <ImageTile
                    key={image.id}
                    image={image}
                    onClick={() => openImage(image)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setContextMenu({ x: event.clientX, y: event.clientY, image });
                    }}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}

      {images.length > 0 && loadingImages ? (
        <div className="flex justify-center py-8">
          <div className="h-4 w-4 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
        </div>
      ) : null}

      {contextMenu ? (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          image={contextMenu.image}
          onClose={() => setContextMenu(null)}
        />
      ) : null}
    </div>

    {/* Pinned to the bottom of the gallery viewport — outside the scroll
        container so it stays put while the grid scrolls. */}
    <BulkActionBar />
    </div>
  );
}
