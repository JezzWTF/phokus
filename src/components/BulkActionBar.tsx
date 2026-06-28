import { useEffect, useRef, useState } from "react";
import { useGalleryStore } from "../store";
import { BulkTagPopover } from "./bulk/BulkTagPopover";

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
  const albums = useGalleryStore((state) => state.albums);
  const addToAlbum = useGalleryStore((state) => state.addToAlbum);
  const removeFromAlbum = useGalleryStore((state) => state.removeFromAlbum);
  const createAlbum = useGalleryStore((state) => state.createAlbum);

  const [panel, setPanel] = useState<Panel>(null);
  const [deleting, setDeleting] = useState(false);
  const [creatingAlbum, setCreatingAlbum] = useState(false);
  const [newAlbumName, setNewAlbumName] = useState("");
  const barRef = useRef<HTMLDivElement>(null);

  // Close any open popover when clicking outside the bar.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (barRef.current?.contains(event.target as Node)) return;
      setPanel(null);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

  // Reset transient UI whenever the selection empties.
  useEffect(() => {
    if (selectedCount === 0) {
      setPanel(null);
      setNewAlbumName("");
    }
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

  const handleCreateAlbum = async () => {
    const name = newAlbumName.trim();
    if (!name || creatingAlbum) return;
    setCreatingAlbum(true);
    try {
      const album = await createAlbum(name);
      await addToAlbum(album.id, ids);
      setNewAlbumName("");
      setPanel(null);
    } finally {
      setCreatingAlbum(false);
    }
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
          <button
            className="text-[11px] text-gray-500 transition-colors hover:text-gray-300"
            onClick={selectAllGallery}
            title={loadedCount < totalImages ? "Selects loaded items only" : "Select all loaded"}
          >
            Select all{loadedCount < totalImages ? " loaded" : ""}
          </button>
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
                <button
                  key={rating}
                  className="rounded-md p-1 text-white/25 transition-colors hover:bg-white/5 hover:text-amber-300"
                  onClick={async () => {
                    await bulkSetRating(rating);
                    setPanel(null);
                  }}
                  title={`Set ${rating} star${rating === 1 ? "" : "s"}`}
                >
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.176 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81H7.03a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                </button>
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

      <button className={btnIdle} onClick={() => void bulkSetFavorite(true)} title="Mark as favorite">
        Favorite
      </button>

      <div className="relative">
        <button className={panel === "album" ? btnActive : btnIdle} onClick={() => togglePanel("album")}>
          Add to album
        </button>
        {panel === "album" ? (
          <div
            data-bulk-popover
            className="absolute bottom-full left-1/2 mb-2 w-60 -translate-x-1/2 rounded-xl border border-white/10 bg-gray-950/98 p-2 shadow-2xl backdrop-blur"
          >
            <div className="max-h-48 overflow-y-auto">
              {albums.length === 0 ? (
                <p className="px-2 py-2 text-[11px] text-gray-600">No albums yet — create one below.</p>
              ) : (
                albums.map((album) => (
                  <button
                    key={album.id}
                    className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs text-gray-300 transition-colors hover:bg-white/5 hover:text-white"
                    onClick={() => void handlePickAlbum(album.id)}
                  >
                    <span className="truncate">{album.name}</span>
                    <span className="shrink-0 text-[10px] text-gray-600">{album.image_count}</span>
                  </button>
                ))
              )}
            </div>
            <form
              className="mt-1 flex gap-1 border-t border-white/[0.06] pt-2"
              onSubmit={(event) => {
                event.preventDefault();
                void handleCreateAlbum();
              }}
            >
              <input
                className="min-w-0 flex-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white placeholder-gray-600 focus:border-white/20 focus:outline-none"
                placeholder="New album…"
                value={newAlbumName}
                onChange={(event) => setNewAlbumName(event.target.value)}
                disabled={creatingAlbum}
              />
              <button
                type="submit"
                className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-gray-300 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
                disabled={creatingAlbum || !newAlbumName.trim()}
              >
                Add
              </button>
            </form>
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
        <button
          className={panel === "delete" ? `${btn} bg-red-500/15 text-red-300` : `${btn} text-gray-300 hover:bg-red-500/10 hover:text-red-300`}
          onClick={() => togglePanel("delete")}
          disabled={deleting}
          title="Delete files from disk"
        >
          {deleting ? "Deleting…" : "Delete"}
        </button>
        {panel === "delete" ? (
          <div
            data-bulk-popover
            className="absolute bottom-full left-1/2 mb-2 w-64 -translate-x-1/2 rounded-xl border border-red-500/30 bg-gray-950/98 p-3 shadow-2xl backdrop-blur"
          >
            <div className="mb-1 flex items-center gap-1.5 text-red-300">
              <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
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

      <button
        className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-white/[0.06] hover:text-white"
        onClick={clearGallerySelection}
        title="Clear selection"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
