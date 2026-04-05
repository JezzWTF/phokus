import { useEffect, useRef, useCallback, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { ImageRecord, tileSizeForZoom, useGalleryStore } from "../store";

const GAP = 8;

function RatingStars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, index) => {
        const filled = index < rating;
        return (
          <svg
            key={index}
            className={`h-3 w-3 ${filled ? "text-amber-300" : "text-white/25"}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.176 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81H7.03a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        );
      })}
    </div>
  );
}

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

function ContextMenu({
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
  const { openImage, updateImageDetails } = useGalleryStore();

  return (
    <div
      className="fixed z-40 min-w-56 rounded-2xl border border-white/10 bg-gray-950/95 p-2 shadow-2xl backdrop-blur"
      style={{ left: x, top: y }}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        className="w-full rounded-xl px-3 py-2 text-left text-sm text-gray-200 hover:bg-white/5"
        onClick={() => {
          openImage(image);
          onClose();
        }}
      >
        Open Preview
      </button>
      <button
        className="w-full rounded-xl px-3 py-2 text-left text-sm text-gray-200 hover:bg-white/5"
        onClick={async () => {
          await updateImageDetails(image.id, { favorite: !image.favorite });
          onClose();
        }}
      >
        {image.favorite ? "Remove Favorite" : "Add to Favorites"}
      </button>
      <div className="my-2 h-px bg-white/5" />
      <div className="px-3 pb-1 pt-1 text-[11px] uppercase tracking-[0.2em] text-gray-500">Rating</div>
      <div className="flex gap-1 px-2 pb-1">
        {Array.from({ length: 5 }, (_, index) => {
          const rating = index + 1;
          return (
            <button
              key={rating}
              className={`rounded-lg px-2 py-1 text-sm ${rating <= image.rating ? "bg-amber-400/15 text-amber-300" : "bg-white/5 text-gray-400 hover:text-white"}`}
              onClick={async () => {
                await updateImageDetails(image.id, { rating });
                onClose();
              }}
            >
              {rating}
            </button>
          );
        })}
        {image.rating > 0 ? (
          <button
            className="ml-auto rounded-lg p-1.5 text-gray-400 hover:bg-white/5 hover:text-white"
            onClick={async () => {
              await updateImageDetails(image.id, { rating: 0 });
              onClose();
            }}
            title="Remove rating"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ImageTile({
  image,
  onClick,
  onContextMenu,
}: {
  image: ImageRecord;
  onClick: () => void;
  onContextMenu: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  const src = image.thumbnail_path
    ? convertFileSrc(image.thumbnail_path)
    : image.media_kind === "image" && image.path
      ? convertFileSrc(image.path)
      : null;

  return (
    <button
      className="group relative overflow-hidden rounded-2xl border border-white/5 bg-white/[0.03] text-left"
      style={{ width: "100%", aspectRatio: "1 / 1" }}
      onClick={onClick}
      onContextMenu={onContextMenu}
      title={image.filename}
    >
      {src && !errored ? (
        <>
          {!loaded ? <div className="absolute inset-0 animate-pulse bg-white/5" /> : null}
          <img
            src={src}
            alt={image.filename}
            className={`h-full w-full object-cover transition-opacity duration-200 ${loaded ? "opacity-100" : "opacity-0"}`}
            loading="lazy"
            onLoad={() => setLoaded(true)}
            onError={() => setErrored(true)}
          />
        </>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-fuchsia-500/10 via-white/5 to-cyan-500/10 text-gray-300">
          {image.media_kind === "video" ? (
            <div className="rounded-full border border-white/10 bg-black/30 p-4 text-white shadow-lg">
              <svg className="h-8 w-8" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          ) : (
            <svg className="h-9 w-9" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          )}
        </div>
      )}

      {image.media_kind === "video" ? (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="rounded-full border border-white/10 bg-black/35 p-3 text-white shadow-lg backdrop-blur-sm">
            <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      ) : null}

      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent opacity-80 transition-opacity group-hover:opacity-100" />

      <div className="absolute left-3 right-3 top-3 flex items-start justify-between gap-2">
        <div className="rounded-full border border-white/10 bg-black/35 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-white/80">
          {image.media_kind}
        </div>
        <div className="flex items-center gap-1">
          {image.media_kind === "video" && image.duration_ms ? (
            <div className="rounded-full border border-white/10 bg-black/35 px-2 py-1 text-[10px] font-medium text-white/80">
              {formatDuration(image.duration_ms)}
            </div>
          ) : null}
          {image.favorite ? (
            <div className="rounded-full border border-white/10 bg-black/35 p-1 text-rose-300">
              <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" />
              </svg>
            </div>
          ) : null}
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-3">
        <p className="truncate text-sm font-medium text-white">{image.filename}</p>
        <div className="mt-1 flex items-center justify-between gap-2 text-xs text-white/70">
          <RatingStars rating={image.rating} />
          <span>{image.embedding_status === "ready" ? "indexed" : image.embedding_status}</span>
        </div>
      </div>
    </button>
  );
}

export function Gallery() {
  const images = useGalleryStore((state) => state.images);
  const loadMoreImages = useGalleryStore((state) => state.loadMoreImages);
  const openImage = useGalleryStore((state) => state.openImage);
  const totalImages = useGalleryStore((state) => state.totalImages);
  const loadingImages = useGalleryStore((state) => state.loadingImages);
  const zoomPreset = useGalleryStore((state) => state.zoomPreset);

  const parentRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; image: ImageRecord } | null>(null);

  const handleScroll = useCallback(() => {
    const element = parentRef.current;
    if (!element) return;
    const nearBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 600;
    if (nearBottom && !loadingImages && images.length < totalImages) {
      void loadMoreImages();
    }
  }, [images.length, loadMoreImages, loadingImages, totalImages]);

  useEffect(() => {
    const element = parentRef.current;
    if (!element) return;
    element.addEventListener("scroll", handleScroll, { passive: true });
    return () => element.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  useEffect(() => {
    const close = () => setContextMenu(null);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextMenu(null);
      }
    };
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  if (images.length === 0 && !loadingImages) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-gray-600">
        <svg className="h-16 w-16 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={0.75}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        <p className="text-sm">No media found</p>
        <p className="text-xs opacity-60">Try another filter, or add a folder from the library menu.</p>
      </div>
    );
  }

  return (
    <div ref={parentRef} className="relative flex-1 overflow-y-auto overflow-x-hidden min-h-0 bg-[#060816]">
      <div
        className="grid content-start"
        style={{
          padding: GAP,
          gap: GAP,
          gridTemplateColumns: `repeat(auto-fill, minmax(${tileSizeForZoom(zoomPreset)}px, 1fr))`,
        }}
      >
        {images.map((image) => (
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

      {loadingImages ? (
        <div className="flex justify-center py-6">
          <div className="h-5 w-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
        </div>
      ) : null}

      {contextMenu ? (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} image={contextMenu.image} onClose={() => setContextMenu(null)} />
      ) : null}
    </div>
  );
}
