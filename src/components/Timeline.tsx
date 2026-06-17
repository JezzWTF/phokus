import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ImageRecord, tileSizeForZoom, useGalleryStore } from "../store";
import { ContextMenu, ImageTile } from "./Gallery";

const GAP = 6;
const HEADER_HEIGHT = 52;
const SCRUBBER_WIDTH = 48;
const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"] as const;

interface TimelineGroup {
  key: string;
  label: string;
  images: ImageRecord[];
}

interface ScrubberMonth {
  monthNum: number;
  label: string;
  groupIndex: number;
}

interface ScrubberYear {
  year: string;
  firstGroupIndex: number;
  months: ScrubberMonth[];
}

function buildLabel(key: string): string {
  if (key === "unknown") return "Unknown Date";
  const [yearStr, monthStr] = key.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!isFinite(year) || !isFinite(month) || month < 1 || month > 12) return "Unknown Date";
  const date = new Date(year, month - 1);
  if (isNaN(date.getTime())) return "Unknown Date";
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
    .sort(([a], [b]) => {
      if (a === "unknown") return 1;
      if (b === "unknown") return -1;
      return a < b ? -1 : a > b ? 1 : 0;
    })
    .map(([key, imgs]) => ({ key, label: buildLabel(key), images: imgs }));
}

function buildScrubberYears(groups: TimelineGroup[]): ScrubberYear[] {
  const byYear = new Map<string, ScrubberYear>();
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    if (group.key === "unknown") continue;
    const year = group.key.substring(0, 4);
    const monthNum = Number(group.key.substring(5, 7));
    if (!byYear.has(year)) {
      byYear.set(year, { year, firstGroupIndex: i, months: [] });
    }
    byYear.get(year)!.months.push({
      monthNum,
      label: MONTH_SHORT[monthNum - 1] ?? "",
      groupIndex: i,
    });
  }
  // Keep insertion order so the scrubber runs the same direction as the scrolled
  // content (oldest at top with taken_asc), keeping the active highlight aligned.
  return Array.from(byYear.values());
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
  const [activeGroupIndex, setActiveGroupIndex] = useState(0);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    image: ImageRecord;
  } | null>(null);

  // parentRef is the scroll container. Its clientWidth already excludes the
  // scrubber because they are flex siblings, so no further adjustment is needed.
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
  const groups = useMemo(() => groupImages(images), [images]);
  const scrubberYears = useMemo(() => buildScrubberYears(groups), [groups]);
  // Show as soon as there's more than one month to jump between — not gated on
  // a full year. With taken_asc sort the loaded set is oldest-first, so this
  // reflects whatever range is currently loaded.
  const showScrubber = groups.length > 1;

  const cols = useMemo(
    () => Math.max(1, Math.floor((containerWidth - GAP) / (tileSize + GAP))),
    [containerWidth, tileSize],
  );

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

  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  const estimateSizeRef = useRef(estimateSize);
  estimateSizeRef.current = estimateSize;

  useEffect(() => {
    virtualizer.measure();
  }, [cols, virtualizer]);

  const handleScroll = useCallback(() => {
    const el = parentRef.current;
    if (!el) return;

    const scrollTop = el.scrollTop;
    const g = groupsRef.current;
    const es = estimateSizeRef.current;
    let cumHeight = 0;
    let newActive = 0;
    for (let i = 0; i < g.length; i++) {
      const h = es(i);
      if (cumHeight + h > scrollTop + HEADER_HEIGHT / 2) {
        newActive = i;
        break;
      }
      cumHeight += h;
      newActive = i;
    }
    setActiveGroupIndex(newActive);

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

  const scrollToGroup = useCallback(
    (index: number) => {
      virtualizer.scrollToIndex(index, { align: "start" });
    },
    [virtualizer],
  );

  return (
    // Outer flex-row: fills remaining height in <main>'s flex-col, then
    // splits horizontally between the scroll area and the scrubber.
    <div className="flex flex-1 min-h-0 bg-gray-950">
      {/* Scroll container — flex-1 takes all width except the scrubber */}
      <div
        ref={parentRef}
        className="relative flex-1 overflow-y-auto overflow-x-hidden min-h-0"
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
      </div>

      {/* Scrubber — flex sibling so it stays visible while the left panel scrolls */}
      {showScrubber ? (
        <div
          className="overflow-y-auto border-l border-white/[0.04] py-2 flex flex-col items-center gap-0.5"
          style={{ width: SCRUBBER_WIDTH }}
        >
          {scrubberYears.map((yearEntry) => (
            <ScrubberYearBlock
              key={yearEntry.year}
              yearEntry={yearEntry}
              activeGroupIndex={activeGroupIndex}
              onScrollTo={scrollToGroup}
            />
          ))}
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

interface ScrubberYearBlockProps {
  yearEntry: ScrubberYear;
  activeGroupIndex: number;
  onScrollTo: (index: number) => void;
}

function ScrubberYearBlock({ yearEntry, activeGroupIndex, onScrollTo }: ScrubberYearBlockProps) {
  const isYearActive = yearEntry.months.some((m) => m.groupIndex === activeGroupIndex);

  return (
    <div className="w-full flex flex-col items-center">
      <button
        className={`w-full text-center py-0.5 text-[10px] font-semibold tracking-wide transition-colors ${
          isYearActive ? "text-white/80" : "text-white/30 hover:text-white/55"
        }`}
        onClick={() => onScrollTo(yearEntry.firstGroupIndex)}
        title={yearEntry.year}
      >
        {yearEntry.year}
      </button>

      <div
        className="grid gap-[3px] pb-1.5"
        style={{ gridTemplateColumns: "repeat(3, 10px)" }}
      >
        {Array.from({ length: 12 }, (_, i) => {
          const monthNum = i + 1;
          const monthEntry = yearEntry.months.find((m) => m.monthNum === monthNum);
          const isActive = monthEntry !== undefined && monthEntry.groupIndex === activeGroupIndex;
          if (!monthEntry) {
            return <span key={monthNum} className="h-[10px] w-[10px]" />;
          }
          return (
            <button
              key={monthNum}
              title={`${monthEntry.label} ${yearEntry.year}`}
              onClick={() => onScrollTo(monthEntry.groupIndex)}
              className={`h-[10px] w-[10px] rounded-full transition-colors ${
                isActive ? "bg-white/70" : "bg-white/15 hover:bg-white/40"
              }`}
            />
          );
        })}
      </div>
    </div>
  );
}
