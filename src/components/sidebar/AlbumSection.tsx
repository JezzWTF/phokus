import { useRef, useState } from "react";
import { Reorder } from "framer-motion";
import { useGalleryStore } from "../../store";
import { Tooltip } from "../Tooltip";
import { PlusIcon } from "../icons";
import { AlbumItem } from "./AlbumItem";
import { useAlbumOrdering } from "./useAlbumOrdering";

export function AlbumSection() {
  const albums = useGalleryStore((state) => state.albums);
  const createAlbum = useGalleryStore((state) => state.createAlbum);
  const deleteAlbums = useGalleryStore((state) => state.deleteAlbums);
  const reorderAlbums = useGalleryStore((state) => state.reorderAlbums);
  const [creatingAlbum, setCreatingAlbum] = useState(false);
  const [createAlbumPending, setCreateAlbumPending] = useState(false);
  const [newAlbumName, setNewAlbumName] = useState("");
  const newAlbumInputRef = useRef<HTMLInputElement>(null);
  const [manageAlbums, setManageAlbums] = useState(false);
  const [manageSelectedIds, setManageSelectedIds] = useState<Set<number>>(new Set());
  const [confirmingAlbumDelete, setConfirmingAlbumDelete] = useState(false);
  const { finishAlbumReorder, handleAlbumReorder, orderedAlbums, setDraggingAlbum } = useAlbumOrdering(albums, reorderAlbums);

  const startCreatingAlbum = () => {
    setCreatingAlbum(true);
    setNewAlbumName("");
    setTimeout(() => newAlbumInputRef.current?.focus(), 0);
  };

  const handleCreateAlbum = async () => {
    const name = newAlbumName.trim();
    if (!name) {
      setCreatingAlbum(false);
      return;
    }
    if (createAlbumPending) return;
    setCreateAlbumPending(true);
    try {
      const album = await createAlbum(name);
      setNewAlbumName("");
      setCreatingAlbum(false);
      useGalleryStore.getState().viewAlbum(album.id);
    } finally {
      setCreateAlbumPending(false);
    }
  };

  const exitManageAlbums = () => {
    setManageAlbums(false);
    setManageSelectedIds(new Set());
    setConfirmingAlbumDelete(false);
  };

  const toggleManageSelected = (albumId: number) => {
    setManageSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(albumId)) next.delete(albumId);
      else next.add(albumId);
      return next;
    });
    setConfirmingAlbumDelete(false);
  };

  const handleDeleteSelectedAlbums = async () => {
    const ids = Array.from(manageSelectedIds);
    if (ids.length === 0) return;
    await deleteAlbums(ids);
    exitManageAlbums();
  };

  return (
    <div className="shrink-0 border-t-2 border-white/[0.08] bg-white/[0.015]">
      <div className="flex items-center justify-between gap-2 px-5 pt-3 pb-1">
        <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-gray-600">
          {manageAlbums ? `${manageSelectedIds.size} selected` : "Albums"}
        </span>
        {manageAlbums ? (
          <button
            onClick={exitManageAlbums}
            className="rounded px-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500 transition-colors hover:text-gray-200"
          >
            Done
          </button>
        ) : (
          <div className="flex items-center gap-0.5">
            {albums.length > 0 ? (
              <Tooltip label="Manage albums">
              <button
                onClick={() => setManageAlbums(true)}
                className="rounded p-0.5 text-gray-600 transition-colors hover:bg-white/8 hover:text-gray-200"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
              </Tooltip>
            ) : null}
            <Tooltip label="New album">
            <button
              onClick={startCreatingAlbum}
              className="rounded p-0.5 text-gray-600 transition-colors hover:bg-white/8 hover:text-gray-200"
            >
              <PlusIcon className="h-3.5 w-3.5" />
            </button>
            </Tooltip>
          </div>
        )}
      </div>

      {manageAlbums ? (
        <div className="px-3 pb-1.5">
          {confirmingAlbumDelete ? (
            <div className="rounded-lg border border-red-500/25 bg-red-500/[0.06] p-2">
              <p className="mb-2 text-[11px] leading-relaxed text-gray-400">
                Delete {manageSelectedIds.size} album{manageSelectedIds.size === 1 ? "" : "s"}? Your images stay in
                the library — only the album{manageSelectedIds.size === 1 ? "" : "s"} {manageSelectedIds.size === 1 ? "is" : "are"} removed.
              </p>
              <div className="flex justify-end gap-1.5">
                <button
                  className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
                  onClick={() => setConfirmingAlbumDelete(false)}
                >
                  Cancel
                </button>
                <button
                  className="rounded-md bg-red-500/20 px-2 py-1 text-[11px] font-medium text-red-300 transition-colors hover:bg-red-500/30 hover:text-red-200"
                  onClick={() => void handleDeleteSelectedAlbums()}
                >
                  Delete {manageSelectedIds.size}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <button
                className="text-[11px] text-gray-500 transition-colors hover:text-gray-300"
                onClick={() =>
                  setManageSelectedIds((prev) =>
                    prev.size === albums.length ? new Set() : new Set(albums.map((a) => a.id)),
                  )
                }
              >
                {manageSelectedIds.size === albums.length ? "Deselect all" : "Select all"}
              </button>
              <button
                className="rounded-md border border-red-400/25 bg-red-500/10 px-2 py-1 text-[11px] text-red-300 transition-colors hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-40"
                onClick={() => setConfirmingAlbumDelete(true)}
                disabled={manageSelectedIds.size === 0}
              >
                Delete {manageSelectedIds.size > 0 ? manageSelectedIds.size : ""}
              </button>
            </div>
          )}
        </div>
      ) : null}

      <div className="max-h-52 overflow-y-auto px-2 pb-2 space-y-px">
        {creatingAlbum ? (
          <form
            className="flex gap-1 px-1 py-1"
            onSubmit={(e) => {
              e.preventDefault();
              void handleCreateAlbum();
            }}
          >
            <input
              ref={newAlbumInputRef}
              className="min-w-0 flex-1 rounded border border-white/10 bg-white/10 px-1.5 py-1 text-[13px] text-white outline-none ring-1 ring-blue-500/40 placeholder-gray-600"
              placeholder="Album name…"
              value={newAlbumName}
              onChange={(e) => setNewAlbumName(e.target.value)}
              disabled={createAlbumPending}
              onKeyDown={(e) => {
                if (createAlbumPending) return;
                if (e.key === "Escape") {
                  setCreatingAlbum(false);
                  setNewAlbumName("");
                }
              }}
              onBlur={() => void handleCreateAlbum()}
            />
          </form>
        ) : null}

        {albums.length === 0 && !creatingAlbum ? (
          <p className="px-3 py-3 text-center text-[11px] leading-relaxed text-gray-700">
            Select images and “Add to album” to start curating
          </p>
        ) : manageAlbums ? (
          albums.map((album) => (
            <AlbumItem
              key={album.id}
              album={album}
              manageMode
              selectedForManage={manageSelectedIds.has(album.id)}
              onToggleManage={() => toggleManageSelected(album.id)}
            />
          ))
        ) : (
          <Reorder.Group
            as="div"
            axis="y"
            values={orderedAlbums.map((album) => album.id)}
            onReorder={handleAlbumReorder}
            className="space-y-px"
          >
            {orderedAlbums.map((album) => (
              <AlbumItem
                key={album.id}
                album={album}
                reorderable
                onDragStart={() => setDraggingAlbum(true)}
                onDragEnd={finishAlbumReorder}
              />
            ))}
          </Reorder.Group>
        )}
      </div>
    </div>
  );
}
