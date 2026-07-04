import { useEffect, useRef, useState } from "react";
import { useGalleryStore } from "../store";
import { AlbumPicker } from "./AlbumPicker";
import { BulkTagPopover } from "./bulk/BulkTagPopover";
import { useDismissable } from "./menu";
import { Tooltip } from "./Tooltip"
import { CloseIcon, StarIcon, WarningIcon } from "./icons";

type Panel = "tag" | "rating" | "album" | "delete" | null;

export function BulkActionBar() {
  const selectedCount = useGalleryStore((state) => state.gallerySelectedIds.size);
  const selectedIds = useGalleryStore((state) => state.gallerySelectedIds);
  const clearGallerySelection = useGalleryStore((state) => state.clearGallerySelection);
  const selectAllGallery = useGalleryStore((state) => state.selectAllGallery);
  const loadedCount = useGalleryStore((state) => state.loadedCount);
  const totalImages = useGalleryStore((state) => state.totalImages);
  const bulkSetFavorite = useGalleryStore((state) => state.bulkSetFavorite);
  const bulkSetRating = useGalleryStore((state) => state.bulkSetRating);
  const bulkDeleteSelected = useGalleryStore((state) => state.bulkDeleteSelected);
  const activeView = useGalleryStore((state) => state.activeView);
  const selectedAlbumId = useGalleryStore((state) => state.selectedAlbumId);
  const addToAlbum = useGalleryStore((state) => state.addToAlbum);
  const removeFromAlbum = useGalleryStore((state) => state.removeFromAlbum);

  const [panel, setPanel] = useState<Panel>(null);
  const [deleting, setDeleting] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  // Close any open popover when clicking outside the bar or pressing Escape.
  useDismissable(barRef, () => setPanel(null), panel !== null);

  // Reset transient UI whenever the selection empties.
  useEffect(() => {
    if (selectedCount === 0) setPanel(null);
  }, [selectedCount]);

  if (selectedCount === 0) return null;

  const ids = Array.from(selectedIds);
  const inAlbumView = activeView === "album" && selectedAlbumId !== null;
  const togglePanel = (next: Exclude<Panel, null>) => setPanel((current) => (current === next ? null : next));

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await bulkDeleteSelected();
    } finally {
      setDeleting(false);
      setPanel(null);
    }
  };

  const handlePickAlbum = async (albumId: number) => {
    await addToAlbum(albumId, ids);
    setPanel(null);
  };

  const btn = "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors";
  const btnIdle = `${btn} text-gray-300 hover:bg-white/10 hover:text-white`;
  const btnActive = `${btn} bg-white/10 text-white`;

  return (
    <div
      ref={barRef}
      className="pointer-events-auto absolute bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-white/10 bg-gray-950/95 px-2 py-1.5 shadow-2xl shadow-black/50 backdrop-blur"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-center gap-2 px-1.5">
        <span className="text-xs font-medium text-white">{selectedCount} selected</span>
        {loadedCount < totalImages || loadedCount > selectedCount ? (
          <Tooltip label={loadedCount < totalImages ? "Selects loaded items only" : "Select all loaded"}>
          <button
            className="text-[11px] text-gray-500 transition-colors hover:text-gray-300"
            onClick={selectAllGallery}
          >
            Select all{loadedCount < totalImages ? " loaded" : ""}
          </button>
        </Tooltip>
      ) : null}
      </div>

      <div className="h-5 w-px bg-white/10" />

      <div className="relative">
        <button className={panel === "tag" ? btnActive : btnIdle} onClick={() => togglePanel("tag")}>
          Tag
        </button>
        {panel === "tag" ? <BulkTagPopover onClose={() => setPanel(null)} /> : null}
      </div>

      <div className="relative">
        <button className={panel === "rating" ? btnActive : btnIdle} onClick={() => togglePanel("rating")}>
          Rating
        </button>
        {panel === "rating" ? (
          <div
            data-bulk-popover
            className="absolute bottom-full left-1/2 mb-2 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-white/10 bg-gray-950/98 p-2 shadow-2xl backdrop-blur"
          >
            {Array.from({ length: 5 }, (_, index) => {
              const rating = index + 1;
              return (
                <Tooltip label={`Set ${rating} star${rating === 1 ? "" : "s"}`}>
                <button
                  key={rating}
                  className="rounded-md p-1 text-white/25 transition-colors hover:bg-white/5 hover:text-amber-300"
                  onClick={async () => {
                    await bulkSetRating(rating);
                    setPanel(null);
                  }}
                >
                  <StarIcon className="h-4 w-4" />
                </button>
                </Tooltip>
              );
            })}
            <button
              className="ml-1 rounded-md border border-white/10 px-2 py-1 text-[11px] text-gray-400 transition-colors hover:bg-white/5 hover:text-white"
              onClick={async () => {
                await bulkSetRating(0);
                setPanel(null);
              }}
            >
              Clear
            </button>
          </div>
        ) : null}
      </div>
      <Tooltip label="Mark as favorite" followCursor>
        <button className={btnIdle} onClick={() => void bulkSetFavorite(true)}>
          Favorite
        </button>
      </Tooltip>
      <div className="relative">
        <button className={panel === "album" ? btnActive : btnIdle} onClick={() => togglePanel("album")}>
          Add to album
        </button>
        {panel === "album" ? (
          <div
            data-bulk-popover
            className="absolute bottom-full left-1/2 mb-2 w-60 -translate-x-1/2 rounded-xl border border-white/10 bg-gray-950/98 p-2 shadow-2xl backdrop-blur"
          >
            <AlbumPicker onPick={handlePickAlbum} />
          </div>
        ) : null}
      </div>

      {inAlbumView ? (
        <button
          className={`${btn} text-amber-300/90 hover:bg-amber-500/10 hover:text-amber-200`}
          onClick={() => void removeFromAlbum(selectedAlbumId, ids)}
        >
          Remove from album
        </button>
      ) : null}

      <div className="h-5 w-px bg-white/10" />

      <div className="relative">
        <Tooltip label="Delete files from disk" followCursor>
        <button
          className={panel === "delete" ? `${btn} bg-red-500/15 text-red-300` : `${btn} text-gray-300 hover:bg-red-500/10 hover:text-red-300`}
          onClick={() => togglePanel("delete")}
          disabled={deleting}
        >
          {deleting ? "Deleting…" : "Delete"}
        </button>
        </Tooltip>
        {panel === "delete" ? (
          <div
            data-bulk-popover
            className="absolute bottom-full left-1/2 mb-2 w-64 -translate-x-1/2 rounded-xl border border-red-500/30 bg-gray-950/98 p-3 shadow-2xl backdrop-blur"
          >
            <div className="mb-1 flex items-center gap-1.5 text-red-300">
              <WarningIcon className="h-3.5 w-3.5 shrink-0" />
              <p className="text-xs font-semibold">Delete from disk</p>
            </div>
            <p className="mb-2.5 text-[11px] leading-relaxed text-gray-400">
              Permanently delete {selectedCount} file{selectedCount === 1 ? "" : "s"} from your computer.
              This removes the actual file{selectedCount === 1 ? "" : "s"} from disk and cannot be undone.
            </p>
            <div className="flex justify-end gap-1.5">
              <button
                className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
                onClick={() => setPanel(null)}
              >
                Cancel
              </button>
              <button
                className="rounded-md bg-red-500/20 px-2.5 py-1 text-[11px] font-medium text-red-300 transition-colors hover:bg-red-500/30 hover:text-red-200 disabled:opacity-50"
                onClick={() => void handleDelete()}
                disabled={deleting}
              >
                {deleting ? "Deleting…" : `Delete ${selectedCount} from disk`}
              </button>
            </div>
          </div>
        ) : null}
      </div>
        <Tooltip label="Clear selection" followCursor>
      <button
        className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-white/[0.06] hover:text-white"
        onClick={clearGallerySelection}
      >
        <CloseIcon className="h-4 w-4" />
      </button>
      </Tooltip>
    </div>
  );
}
