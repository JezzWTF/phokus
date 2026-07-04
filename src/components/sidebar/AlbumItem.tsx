import { useState } from "react";
import { Reorder, useDragControls } from "framer-motion";
import { useGalleryStore, type Album } from "../../store";
import { mediaSrc } from "../../lib/mediaSrc";
import { ContextMenu, MenuItem, MenuSeparator } from "../menu";
import { InlineConfirm } from "../InlineConfirm";
import { InlineRename } from "../InlineRename";
import { Tooltip } from "../Tooltip";
import { CheckIcon, PhotoIcon } from "../icons";

export function AlbumItem({
  album,
  manageMode = false,
  selectedForManage = false,
  onToggleManage,
  reorderable = false,
  onDragStart,
  onDragEnd,
}: {
  album: Album;
  manageMode?: boolean;
  selectedForManage?: boolean;
  onToggleManage?: () => void;
  reorderable?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  const dragControls = useDragControls();
  const viewAlbum = useGalleryStore((state) => state.viewAlbum);
  const renameAlbum = useGalleryStore((state) => state.renameAlbum);
  const deleteAlbum = useGalleryStore((state) => state.deleteAlbum);
  const activeView = useGalleryStore((state) => state.activeView);
  const selectedAlbumId = useGalleryStore((state) => state.selectedAlbumId);
  const selected = !manageMode && activeView === "album" && selectedAlbumId === album.id;

  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);

  const cover = mediaSrc(album.cover_thumbnail_path);

  const row = (
    <div
      role={manageMode ? "checkbox" : "button"}
      tabIndex={renaming ? -1 : 0}
      aria-checked={manageMode ? selectedForManage : undefined}
      aria-current={!manageMode && selected ? "page" : undefined}
      className={`group relative flex items-center gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer transition-all duration-150 ${
        selectedForManage
          ? "bg-blue-500/10 text-white ring-1 ring-inset ring-blue-400/50"
          : selected
            ? "bg-white/8 text-white"
            : "text-gray-500 hover:text-gray-200 hover:bg-white/5"
      }`}
      onClick={() => {
        if (manageMode) {
          onToggleManage?.();
        } else if (!renaming) {
          viewAlbum(album.id);
        }
      }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (renaming || (e.key !== "Enter" && e.key !== " ")) return;
        e.preventDefault();
        if (manageMode) {
          onToggleManage?.();
        } else {
          viewAlbum(album.id);
        }
      }}
      onContextMenu={(e) => {
        if (manageMode) return;
        e.preventDefault();
        e.stopPropagation();
        setMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      {/* Manage-mode selection checkbox */}
      {manageMode ? (
        <div
          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
            selectedForManage ? "border-blue-400 bg-blue-500 text-white" : "border-white/30 text-transparent"
          }`}
        >
          <CheckIcon className="h-2.5 w-2.5" strokeWidth={3} />
        </div>
      ) : null}

      {/* Drag handle — hover-revealed, reorders albums */}
      {reorderable ? (
        <Tooltip label="Drag to reorder" anchorToCursor>
        <button
          type="button"
          aria-label={`Reorder ${album.name}`}
          className="-ml-1 flex h-6 w-3.5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-gray-700 opacity-0 transition-opacity hover:text-gray-400 group-hover:opacity-100"
          onPointerDown={(e) => {
            e.stopPropagation();
            onDragStart?.();
            dragControls.start(e);
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <svg className="h-3 w-3" viewBox="0 0 12 12" fill="currentColor">
            <circle cx="3" cy="3" r="1" /><circle cx="9" cy="3" r="1" />
            <circle cx="3" cy="6" r="1" /><circle cx="9" cy="6" r="1" />
            <circle cx="3" cy="9" r="1" /><circle cx="9" cy="9" r="1" />
          </svg>
        </button>
      </Tooltip>
    ) : null}

      {/* Cover thumbnail — distinguishes albums from folder rows */}
      <div className="h-7 w-7 shrink-0 overflow-hidden rounded-md bg-white/[0.05] ring-1 ring-white/10">
        {cover ? (
          <img src={cover} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-white/20">
            <PhotoIcon className="h-3.5 w-3.5" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {renaming ? (
          <InlineRename
            name={album.name}
            onRename={(next) => renameAlbum(album.id, next)}
            onClose={() => setRenaming(false)}
          />
        ) : (
          <div className={`truncate text-[13px] font-medium leading-tight ${selected ? "text-white" : ""}`}>
            {album.name}
          </div>
        )}
        <div className="text-[11px] text-gray-600 mt-0.5">{album.image_count.toLocaleString()}</div>
      </div>

      {!renaming && confirmingRemoval ? (
        <InlineConfirm
          onConfirm={() => { void deleteAlbum(album.id); setConfirmingRemoval(false); }}
          onCancel={() => setConfirmingRemoval(false)}
        />
      ) : null}

      {menu ? (
        <ContextMenu x={menu.x} y={menu.y} size="sm" onClose={() => setMenu(null)}>
          <MenuItem label="Rename" onSelect={() => setRenaming(true)} />
          <MenuSeparator />
          <MenuItem label="Delete album" danger onSelect={() => setConfirmingRemoval(true)} />
        </ContextMenu>
      ) : null}
    </div>
  );

  if (reorderable) {
    return (
      <Reorder.Item
        as="div"
        value={album.id}
        drag="y"
        dragControls={dragControls}
        dragListener={false}
        dragElastic={0.08}
        onDragEnd={onDragEnd}
        layout
        transition={{ layout: { type: "spring", stiffness: 520, damping: 38, mass: 0.55 } }}
      >
        {row}
      </Reorder.Item>
    );
  }
  return row;
}


