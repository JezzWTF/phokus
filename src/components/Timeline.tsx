import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ImageRecord, tileSizeForZoom, useGalleryStore } from "../store";
import { ContextMenu, ImageTile } from "./Gallery";

const GAP = 6;
const HEADER_HEIGHT = 52;

interface TimelineGroup {
  key: string;
  label: string;
  images: ImageRecord[];
}

function buildLabel(key: string): string {
  if (key === "unknown") return "Unknown Date";
  const [yearStr, monthStr] = key.split("-");
  const date = new Date(Number(yearStr), Number(monthStr) - 1);
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function groupImages(images: ImageRecord[]): TimelineGroup[] {
  const map = new Map<string, ImageRecord[]>();
  for (const img of images) {
    const ds = img.taken_at ?? img.modified_at;
    const key = ds ? ds.substring(0, 7) : "unknown";
    let bucket = map.get(key);
    if (bucket === undefined) {
      bucket = [];
      map.set(key, bucket);
    }
    bucket.push(img);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, imgs]) => ({ key, label: buildLabel(key), images: imgs }));
}

export function Timeline() {
  const images = useGalleryStore((s) => s.images);
  const loadMoreImages = useGalleryStore((s) => s.loadMoreImages);
  const openImage = useGalleryStore((s) => s.openImage);
  const totalImages = useGalleryStore((s) => s.totalImages);
  const loadingImages = useGalleryStore((s) => s.loadingImages);
  const imageLoadError = useGalleryStore((s) => s.imageLoadError);
  const zoomPreset = useGalleryStore((s) => s.zoomPreset);

  const parentRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    image: ImageRecord;
  } | null>(null);

  // Measure container width before first paint to avoid a single-column flash.
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
    () => Math.max(1, Math.floor((containerWidth + GAP) / (tileSize + GAP))),
    [containerWidth, tileSize],
  );

  const groups = useMemo(() => groupImages(images), [images]);

  // estimateSize must be exact so virtualizer positions groups correctly.
  // Each group height = header + rowCount * (tileSize + GAP) where the last row's
  // GAP acts as spacing between this group and the next header.
  const estimateSize = useCallback(
    (index: number): number => {
      const group = groups[index];
      if (!group) return HEADER_HEIGHT;
      const rowCount = Math.ceil(group.images.length / cols);
      return HEADER_HEIGHT + rowCount * (tileSize + GAP);
    },
    [groups, cols, tileSize],
  );

  const virtualizer = useVirtualizer({
    count: groups.length,
    getScrollElement: () => parentRef.current,
    estimateSize,
    overscan: 2,
  });

  // Re-measure all items when cols changes so virtualizer positions stay accurate
  // after a window resize (react-virtual v3 doesn't invalidate cached sizes on its own).
  useEffect(() => {
    virtualizer.measure();
  }, [cols, virtualizer]);

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
    const close = (e: PointerEvent) => {
      if ((e.target as HTMLElement | null)?.closest("[data-gallery-context-menu]")) return;
      setContextMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div
      ref={parentRef}
      className="relative flex-1 overflow-y-auto overflow-x-hidden min-h-0 bg-[#07080f]"
    >
      {images.length === 0 && loadingImages ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center px-8 absolute inset-0">
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 min-w-72">
            <div className="h-5 w-5 mx-auto rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
            <p className="mt-4 text-sm text-white/40 font-medium">Loading timeline</p>
            <p className="text-xs text-white/20 mt-1">Fetching results</p>
          </div>
        </div>
      ) : images.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center px-8 absolute inset-0">
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8">
            <svg
              className="h-12 w-12 mx-auto text-white/10 mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={0.75}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <p className="text-sm text-white/30 font-medium">
              {imageLoadError ? "Could not load timeline" : "No media found"}
            </p>
            <p className="text-xs text-white/15 mt-1">
              {imageLoadError ?? "Add a folder to see your timeline"}
            </p>
          </div>
        </div>
      ) : (
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const group = groups[virtualItem.index];
            if (!group) return null;
            return (
              <div
                key={virtualItem.key}
                style={{
                  position: "absolute",
                  top: virtualItem.start,
                  width: "100%",
                  height: virtualItem.size,
                }}
              >
                {/* Group header */}
                <div
                  className="flex items-center gap-3 px-4"
                  style={{ height: HEADER_HEIGHT }}
                >
                  <span className="text-sm font-semibold text-white/80 shrink-0">
                    {group.label}
                  </span>
                  <span className="text-xs text-white/25 shrink-0 tabular-nums">
                    {group.images.length}
                  </span>
                  <div className="flex-1 h-px bg-white/[0.06]" />
                </div>

                {/* Image grid — paddingBottom:GAP gives the gap below the last row,
                    matching the row-to-row gap and making estimateSize exact. */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${cols}, ${tileSize}px)`,
                    gap: GAP,
                    paddingLeft: GAP,
                    paddingRight: GAP,
                    paddingBottom: GAP,
                  }}
                >
                  {group.images.map((image) => (
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
  );
}
