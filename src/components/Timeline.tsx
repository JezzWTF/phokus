import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ImageRecord, tileSizeForZoom, useGalleryStore } from "../store";
import { ImageTile } from "./gallery/ImageTile";
import { ImageContextMenu } from "./ImageContextMenu";
import { ScrubberYearBlock } from "./timeline/ScrubberYearBlock";
import { TimelineEmptyState, TimelineLoadingState } from "./timeline/TimelineEmptyState";
import { buildScrubberYears, buildTimelineRows, groupImages } from "./timeline/timelineModel";

const GAP = 6;
const HEADER_HEIGHT = 52;
const SCRUBBER_WIDTH = 48;

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

  const { rows, rowToGroupIndex, groupFirstRow } = useMemo(
    () => buildTimelineRows(groups, cols),
    [groups, cols],
  );

  const estimateSize = useCallback(
    (index: number): number =>
      rows[index]?.type === "header" ? HEADER_HEIGHT : tileSize + GAP,
    [rows, tileSize],
  );

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize,
    overscan: 6,
    paddingStart: GAP,
  });

  // Refs so the scroll handler can read the latest mappings without re-binding.
  const rowToGroupIndexRef = useRef(rowToGroupIndex);
  rowToGroupIndexRef.current = rowToGroupIndex;
  const groupFirstRowRef = useRef(groupFirstRow);
  groupFirstRowRef.current = groupFirstRow;

  useEffect(() => {
    virtualizer.measure();
  }, [cols, virtualizer]);

  const handleScroll = useCallback(() => {
    const el = parentRef.current;
    if (!el) return;

    // Active month = the group owning the first row still visible at the top.
    const scrollTop = el.scrollTop;
    const items = virtualizer.getVirtualItems();
    let activeRow = items.length > 0 ? items[0].index : 0;
    for (const item of items) {
      if (item.start + item.size > scrollTop + HEADER_HEIGHT / 2) {
        activeRow = item.index;
        break;
      }
    }
    setActiveGroupIndex(rowToGroupIndexRef.current[activeRow] ?? 0);

    if (scrollTop < 24) return;
    const nearBottom = scrollTop + el.clientHeight >= el.scrollHeight - 600;
    if (nearBottom && !loadingImages && images.length < totalImages) {
      void loadMoreImages();
    }
  }, [virtualizer, images.length, loadMoreImages, loadingImages, totalImages]);

  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  const scrollToGroup = useCallback(
    (groupIndex: number) => {
      const row = groupFirstRowRef.current[groupIndex] ?? 0;
      virtualizer.scrollToIndex(row, { align: "start" });
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
          <TimelineLoadingState />
        ) : images.length === 0 ? (
          <TimelineEmptyState imageLoadError={imageLoadError} />
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const row = rows[virtualItem.index];
              if (!row) return null;
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
                  {row.type === "header" ? (
                    <div
                      className="flex items-center gap-3 px-4"
                      style={{ height: HEADER_HEIGHT }}
                    >
                      <span className="text-sm font-semibold text-white/80 shrink-0">
                        {row.group.label}
                      </span>
                      <span className="text-xs text-white/25 shrink-0 tabular-nums">
                        {row.group.images.length}
                      </span>
                      <div className="flex-1 h-px bg-white/[0.06]" />
                    </div>
                  ) : (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: `repeat(${cols}, ${tileSize}px)`,
                        gap: GAP,
                        paddingLeft: GAP,
                        paddingRight: GAP,
                        paddingBottom: GAP,
                        boxSizing: "border-box",
                      }}
                    >
                      {row.images.map((image) => (
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
                  )}
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
        <ImageContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          image={contextMenu.image}
          onClose={() => setContextMenu(null)}
        />
      ) : null}
    </div>
  );
}
