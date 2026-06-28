import { useEffect, useMemo, useRef, useState } from "react";
import { Reorder, useDragControls } from "framer-motion";
import { open } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useGalleryStore, Folder, Album, IndexProgress } from "../store";
import { ThemedDropdown } from "./ThemedDropdown";

interface ContextMenuState {
  folderId: number;
  x: number;
  y: number;
}

type LibrarySort = "az" | "za" | "custom";
const LIBRARY_SORT_KEY = "phokus-library-sort";

function FolderContextMenu({
  menu,
  folder,
  isMuted,
  isPausedAll,
  onClose,
  onRename,
  onReindex,
  onLocate,
  onToggleMute,
  onTogglePauseAll,
  onRemove,
}: {
  menu: ContextMenuState;
  folder: Folder;
  isMuted: boolean;
  isPausedAll: boolean;
  onClose: () => void;
  onRename: () => void;
  onReindex: () => void;
  onLocate: () => void;
  onToggleMute: () => void;
  onTogglePauseAll: () => void;
  onRemove: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", handleDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  const item = (label: string, onClick: () => void, danger = false) => (
    <button
      className={`w-full text-left px-3 py-1.5 text-[12px] rounded-md transition-colors ${
        danger
          ? "text-red-400 hover:bg-red-500/15 hover:text-red-300"
          : "text-gray-300 hover:bg-white/8 hover:text-white"
      }`}
      onClick={() => { onClick(); onClose(); }}
    >
      {label}
    </button>
  );

  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-[160px] py-1 px-1 rounded-lg bg-gray-900 border border-white/10 shadow-xl shadow-black/50"
      style={{ left: menu.x, top: menu.y }}
    >
      {item("Reindex", onReindex)}
      {item("Rename", onRename)}
      {item(isPausedAll ? "Resume background work" : "Pause background work", onTogglePauseAll)}
      {item(isMuted ? "Unmute notifications" : "Mute notifications", onToggleMute)}
      {folder.scan_error && item("Locate Folder", onLocate)}
      <div className="my-1 border-t border-white/[0.06]" />
      {item("Remove from app", onRemove, true)}
    </div>
  );
}

function FolderItem({
  folder,
  selected,
  progress,
  customOrdering,
  dragging,
  onDragStart,
  onDragEnd,
  onKeyboardMove,
}: {
  folder: Folder;
  selected: boolean;
  progress: IndexProgress | undefined;
  customOrdering: boolean;
  dragging: boolean;
  onDragStart: (pointerY: number) => void;
  onDragEnd: () => void;
  onKeyboardMove: (direction: -1 | 1) => void;
}) {
  const dragControls = useDragControls();
  const { selectFolder, removeFolder, reindexFolder, renameFolder, updateFolderPath, toggleMutedFolder } = useGalleryStore();
  const mutedFolderIds = useGalleryStore((state) => state.mutedFolderIds);
  const setAllWorkersPaused = useGalleryStore((state) => state.setAllWorkersPaused);
  const folderWorkers = useGalleryStore((state) => state.workerPaused[folder.id]);
  const isMuted = mutedFolderIds.includes(folder.id);
  // "Fully paused" only when every worker for this folder is paused.
  const isPausedAll = !!folderWorkers &&
    folderWorkers.thumbnail && folderWorkers.metadata && folderWorkers.embedding && folderWorkers.tagging;
  const isIndexing = progress && !progress.done;
  const isMissing = !!folder.scan_error && !isIndexing;

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(folder.name);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming) {
      setRenameValue(folder.name);
      setTimeout(() => renameInputRef.current?.select(), 0);
    }
  }, [renaming, folder.name]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Keep menu inside viewport
    const x = Math.min(e.clientX, window.innerWidth - 180);
    const y = Math.min(e.clientY, window.innerHeight - 160);
    setContextMenu({ folderId: folder.id, x, y });
  };

  const handleLocateFolder = async () => {
    const picked = await open({ directory: true, multiple: false, title: `Locate "${folder.name}"` });
    if (picked && typeof picked === "string") {
      await updateFolderPath(folder.id, picked);
    }
  };

  const commitRename = async () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== folder.name) {
      await renameFolder(folder.id, trimmed);
    }
    setRenaming(false);
  };

  const handleRenameKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); void commitRename(); }
    if (e.key === "Escape") { setRenaming(false); }
  };

  return (
    <Reorder.Item
      as="div"
      value={folder.id}
      drag={customOrdering ? "y" : false}
      dragControls={dragControls}
      dragListener={false}
      dragElastic={0.08}
      onDragEnd={onDragEnd}
      layout
      transition={{ layout: { type: "spring", stiffness: 520, damping: 38, mass: 0.55 } }}
      className={`relative z-0 ${dragging ? "z-20" : ""}`}
      style={{ position: "relative" }}
    >
      <div
        className={`group relative flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-all duration-150 ${
          selected
            ? "bg-white/8 text-white"
            : "text-gray-500 hover:text-gray-200 hover:bg-white/5"
        } ${dragging ? "scale-[1.02] bg-white/[0.11] text-white shadow-xl shadow-black/25 ring-1 ring-white/15" : ""}`}
        onClick={() => !renaming && selectFolder(folder.id)}
        onContextMenu={handleContextMenu}
      >
        {customOrdering ? (
          <button
            type="button"
            aria-label={`Reorder ${folder.name}`}
            title={`Drag to reorder ${folder.name}`}
            className={`-ml-1 flex h-7 w-5 shrink-0 touch-none items-center justify-center rounded-md transition-colors ${
              dragging
                ? "cursor-grabbing bg-white/10 text-gray-300"
                : "cursor-grab text-gray-700 hover:bg-white/[0.06] hover:text-gray-400"
            }`}
            onPointerDown={(event) => {
              event.stopPropagation();
              onDragStart(event.clientY);
              dragControls.start(event);
            }}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
              event.preventDefault();
              event.stopPropagation();
              onKeyboardMove(event.key === "ArrowUp" ? -1 : 1);
            }}
          >
            <svg className="h-3 w-3" viewBox="0 0 12 12" fill="currentColor">
              <circle cx="3" cy="3" r="1" /><circle cx="9" cy="3" r="1" />
              <circle cx="3" cy="9" r="1" /><circle cx="9" cy="9" r="1" />
            </svg>
          </button>
        ) : null}
        {isMissing ? (
          <span className="shrink-0 text-amber-400">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </span>
        ) : (
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M3 7a2 2 0 012-2h3.586a1 1 0 01.707.293l1.414 1.414A1 1 0 0011.414 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
          </svg>
        )}

        <div className="flex-1 min-w-0">
          {renaming ? (
            <input
              ref={renameInputRef}
              className="w-full bg-white/10 text-white text-[13px] font-medium rounded px-1 py-0 outline-none ring-1 ring-blue-500/60 leading-tight"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={handleRenameKey}
              onBlur={() => void commitRename()}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <div className={`truncate text-[13px] font-medium leading-tight ${selected ? "text-white" : ""}`}>
              {folder.name}
            </div>
          )}
          {isIndexing ? (
            <>
              <div className="text-[11px] text-gray-600 mt-0.5">{progress.indexed}/{progress.total}</div>
              <div className="h-px bg-white/10 rounded mt-1.5 overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${progress.total > 0 ? (progress.indexed / progress.total) * 100 : 0}%` }}
                />
              </div>
            </>
          ) : (
            <div className="text-[11px] text-gray-600 mt-0.5">{folder.image_count.toLocaleString()}</div>
          )}
        </div>

        {/* Hover action buttons */}
        {!renaming && (
          confirmingRemoval ? (
            <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
              <button
                className="px-1.5 py-0.5 text-[10px] rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 hover:text-red-300 transition-colors"
                onClick={() => { void removeFolder(folder.id); setConfirmingRemoval(false); }}
              >
                Confirm
              </button>
              <button
                className="px-1.5 py-0.5 text-[10px] rounded bg-white/5 text-gray-500 hover:bg-white/10 hover:text-gray-300 transition-colors"
                onClick={() => setConfirmingRemoval(false)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                className="p-1 rounded text-gray-600 hover:text-gray-300 hover:bg-white/8 transition-colors"
                title="Reindex"
                onClick={(e) => { e.stopPropagation(); void reindexFolder(folder.id); }}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              <button
                className="p-1 rounded text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                title="Remove from app"
                onClick={(e) => { e.stopPropagation(); setConfirmingRemoval(true); }}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                    d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )
        )}
      </div>

      {isMissing && (
        <div className="mx-2 mb-1 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <p className="text-[11px] text-amber-400 font-medium mb-1.5">Folder not found</p>
          <p className="text-[10px] text-gray-500 mb-2 leading-snug">
            This folder may have been moved or renamed. Locate it to resume, or remove it from the app.
          </p>
          <div className="flex gap-1.5">
            <button
              className="flex-1 px-2 py-1 rounded-md text-[10px] font-medium bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 hover:text-amber-200 transition-colors"
              onClick={(e) => { e.stopPropagation(); void handleLocateFolder(); }}
            >
              Locate Folder
            </button>
            <button
              className="flex-1 px-2 py-1 rounded-md text-[10px] font-medium bg-white/5 text-gray-400 hover:bg-red-500/15 hover:text-red-400 transition-colors"
              onClick={(e) => { e.stopPropagation(); setConfirmingRemoval(true); }}
            >
              Remove
            </button>
          </div>
        </div>
      )}

      {contextMenu && contextMenu.folderId === folder.id && (
        <FolderContextMenu
          menu={contextMenu}
          folder={folder}
          isMuted={isMuted}
          isPausedAll={isPausedAll}
          onClose={() => setContextMenu(null)}
          onRename={() => setRenaming(true)}
          onReindex={() => void reindexFolder(folder.id)}
          onLocate={() => void handleLocateFolder()}
          onToggleMute={() => toggleMutedFolder(folder.id)}
          onTogglePauseAll={() => setAllWorkersPaused(folder.id, !isPausedAll)}
          onRemove={() => setConfirmingRemoval(true)}
        />
      )}
    </Reorder.Item>
  );
}

function AlbumContextMenu({
  x,
  y,
  onClose,
  onRename,
  onDelete,
}: {
  x: number;
  y: number;
  onClose: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  const item = (label: string, onClick: () => void, danger = false) => (
    <button
      className={`w-full text-left px-3 py-1.5 text-[12px] rounded-md transition-colors ${
        danger
          ? "text-red-400 hover:bg-red-500/15 hover:text-red-300"
          : "text-gray-300 hover:bg-white/8 hover:text-white"
      }`}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
        onClose();
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-[160px] py-1 px-1 rounded-lg bg-gray-900 border border-white/10 shadow-xl shadow-black/50"
      style={{ left: x, top: y }}
    >
      {item("Rename", onRename)}
      <div className="my-1 border-t border-white/[0.06]" />
      {item("Delete album", onDelete, true)}
    </div>
  );
}

function AlbumItem({
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
  const [renameValue, setRenameValue] = useState(album.name);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming) {
      setRenameValue(album.name);
      setTimeout(() => renameInputRef.current?.select(), 0);
    }
  }, [renaming, album.name]);

  const commitRename = async () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== album.name) {
      await renameAlbum(album.id, trimmed);
    }
    setRenaming(false);
  };

  const cover = album.cover_thumbnail_path ? convertFileSrc(album.cover_thumbnail_path) : null;

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
        setMenu({ x: Math.min(e.clientX, window.innerWidth - 180), y: Math.min(e.clientY, window.innerHeight - 120) });
      }}
    >
      {/* Manage-mode selection checkbox */}
      {manageMode ? (
        <div
          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
            selectedForManage ? "border-blue-400 bg-blue-500 text-white" : "border-white/30 text-transparent"
          }`}
        >
          <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      ) : null}

      {/* Drag handle — hover-revealed, reorders albums */}
      {reorderable ? (
        <button
          type="button"
          aria-label={`Reorder ${album.name}`}
          title="Drag to reorder"
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
      ) : null}

      {/* Cover thumbnail — distinguishes albums from folder rows */}
      <div className="h-7 w-7 shrink-0 overflow-hidden rounded-md bg-white/[0.05] ring-1 ring-white/10">
        {cover ? (
          <img src={cover} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-white/20">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {renaming ? (
          <input
            ref={renameInputRef}
            className="w-full bg-white/10 text-white text-[13px] font-medium rounded px-1 py-0 outline-none ring-1 ring-blue-500/60 leading-tight"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); void commitRename(); }
              if (e.key === "Escape") setRenaming(false);
            }}
            onBlur={() => void commitRename()}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <div className={`truncate text-[13px] font-medium leading-tight ${selected ? "text-white" : ""}`}>
            {album.name}
          </div>
        )}
        <div className="text-[11px] text-gray-600 mt-0.5">{album.image_count.toLocaleString()}</div>
      </div>

      {!renaming && confirmingRemoval ? (
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            className="px-1.5 py-0.5 text-[10px] rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 hover:text-red-300 transition-colors"
            onClick={() => { void deleteAlbum(album.id); setConfirmingRemoval(false); }}
          >
            Confirm
          </button>
          <button
            className="px-1.5 py-0.5 text-[10px] rounded bg-white/5 text-gray-500 hover:bg-white/10 hover:text-gray-300 transition-colors"
            onClick={() => setConfirmingRemoval(false)}
          >
            Cancel
          </button>
        </div>
      ) : null}

      {menu ? (
        <AlbumContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onRename={() => setRenaming(true)}
          onDelete={() => setConfirmingRemoval(true)}
        />
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

export function Sidebar() {
  const folders = useGalleryStore((state) => state.folders);
  const selectedFolderId = useGalleryStore((state) => state.selectedFolderId);
  const setFolderPickerOpen = useGalleryStore((state) => state.setFolderPickerOpen);
  const indexingProgress = useGalleryStore((state) => state.indexingProgress);
  const selectFolder = useGalleryStore((state) => state.selectFolder);
  const activeView = useGalleryStore((state) => state.activeView);
  const setView = useGalleryStore((state) => state.setView);
  const reorderFolders = useGalleryStore((state) => state.reorderFolders);
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
  const [orderedAlbums, setOrderedAlbums] = useState(albums);
  const orderedAlbumsRef = useRef(albums);
  const [draggingAlbum, setDraggingAlbum] = useState(false);

  // Keep the local drag order in sync with the store except mid-drag, so a
  // background album refresh doesn't yank the row out from under the pointer.
  useEffect(() => {
    if (draggingAlbum) return;
    setOrderedAlbums(albums);
    orderedAlbumsRef.current = albums;
  }, [albums, draggingAlbum]);

  const handleAlbumReorder = (ids: number[]) => {
    const byId = new Map(orderedAlbumsRef.current.map((album) => [album.id, album]));
    const next = ids
      .map((id) => byId.get(id))
      .filter((album): album is Album => album !== undefined);
    orderedAlbumsRef.current = next;
    setOrderedAlbums(next);
  };

  const finishAlbumReorder = () => {
    setDraggingAlbum(false);
    const nextIds = orderedAlbumsRef.current.map((album) => album.id);
    // Read live store order (not the render-time closure) in case albums changed.
    const currentIds = useGalleryStore.getState().albums.map((album) => album.id);
    const snapshotIds = albums.map((album) => album.id);
    if (
      snapshotIds.length !== currentIds.length ||
      snapshotIds.some((id, index) => id !== currentIds[index])
    ) {
      orderedAlbumsRef.current = useGalleryStore.getState().albums;
      setOrderedAlbums(orderedAlbumsRef.current);
      return;
    }
    if (
      nextIds.length !== currentIds.length ||
      nextIds.some((id, index) => id !== currentIds[index])
    ) {
      void reorderAlbums(nextIds);
    }
  };
  const [librarySort, setLibrarySortState] = useState<LibrarySort>(() => {
    const saved = window.localStorage.getItem(LIBRARY_SORT_KEY);
    return saved === "za" || saved === "custom" ? saved : "az";
  });
  const [customFolders, setCustomFolders] = useState(folders);
  const [draggedFolderId, setDraggedFolderId] = useState<number | null>(null);
  const folderListRef = useRef<HTMLDivElement>(null);
  const customFoldersRef = useRef(folders);
  const pointerYRef = useRef(0);
  const autoScrollFrameRef = useRef<number | null>(null);
  const keyboardPersistRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (keyboardPersistRef.current) clearTimeout(keyboardPersistRef.current);
    },
    [],
  );

  useEffect(() => {
    if (draggedFolderId !== null) return;
    setCustomFolders(folders);
    customFoldersRef.current = folders;
  }, [folders, draggedFolderId]);

  useEffect(() => {
    if (draggedFolderId === null) return;

    const handlePointerMove = (event: PointerEvent) => {
      pointerYRef.current = event.clientY;
    };

    const autoScroll = () => {
      const list = folderListRef.current;
      if (list) {
        const rect = list.getBoundingClientRect();
        const edgeSize = Math.min(64, rect.height * 0.2);
        const topDistance = pointerYRef.current - rect.top;
        const bottomDistance = rect.bottom - pointerYRef.current;
        let velocity = 0;

        if (topDistance < edgeSize) {
          velocity = -Math.pow((edgeSize - Math.max(0, topDistance)) / edgeSize, 1.6) * 14;
        } else if (bottomDistance < edgeSize) {
          velocity = Math.pow((edgeSize - Math.max(0, bottomDistance)) / edgeSize, 1.6) * 14;
        }

        if (velocity !== 0) list.scrollTop += velocity;
      }
      autoScrollFrameRef.current = requestAnimationFrame(autoScroll);
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    autoScrollFrameRef.current = requestAnimationFrame(autoScroll);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      if (autoScrollFrameRef.current !== null) cancelAnimationFrame(autoScrollFrameRef.current);
      autoScrollFrameRef.current = null;
    };
  }, [draggedFolderId]);

  const displayedFolders = useMemo(() => {
    if (librarySort === "custom") return customFolders;
    return [...folders].sort((a, b) => {
      const result = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
      return librarySort === "az" ? result : -result;
    });
  }, [customFolders, folders, librarySort]);

  const setLibrarySort = (sort: LibrarySort) => {
    window.localStorage.setItem(LIBRARY_SORT_KEY, sort);
    setLibrarySortState(sort);
  };

  const handleReorder = (orderedIds: number[]) => {
    const byId = new Map(customFoldersRef.current.map((folder) => [folder.id, folder]));
    const next = orderedIds
      .map((id) => byId.get(id))
      .filter((folder): folder is Folder => folder !== undefined);
    customFoldersRef.current = next;
    setCustomFolders(next);
  };

  const finishReorder = () => {
    const nextIds = customFoldersRef.current.map((folder) => folder.id);
    setDraggedFolderId(null);
    const currentIds = folders.map((folder) => folder.id);
    if (nextIds.some((id, index) => id !== currentIds[index])) {
      void reorderFolders(nextIds);
    }
  };

  const moveFolderByKeyboard = (folderId: number, direction: -1 | 1) => {
    const current = customFoldersRef.current;
    const currentIndex = current.findIndex((folder) => folder.id === folderId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= current.length) return;

    const next = [...current];
    [next[currentIndex], next[nextIndex]] = [next[nextIndex], next[currentIndex]];
    customFoldersRef.current = next;
    setCustomFolders(next);
    // Debounce the DB write so a held arrow key doesn't fire one per keystroke;
    // the local order updates immediately, only the persist waits to settle.
    if (keyboardPersistRef.current) clearTimeout(keyboardPersistRef.current);
    keyboardPersistRef.current = setTimeout(() => {
      keyboardPersistRef.current = null;
      void reorderFolders(customFoldersRef.current.map((folder) => folder.id));
    }, 400);
  };

  const handleAddFolder = () => {
    setFolderPickerOpen(true);
  };

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
    <aside className="w-60 shrink-0 flex flex-col bg-gray-950 border-r border-white/[0.06]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-12 border-b border-white/[0.06] shrink-0">
        <span className="text-[13px] font-semibold text-white/80 tracking-wide">Phokus</span>
        <button
          onClick={handleAddFolder}
          className="p-1.5 rounded-lg text-gray-500 hover:text-gray-200 hover:bg-white/8 transition-colors"
          title="Add Media Folder"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {/* Nav */}
      <div className="px-2 pt-2 pb-1 space-y-px">
        <div
          className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-all duration-150 ${
            activeView === "gallery" && selectedFolderId === null
              ? "bg-white/8 text-white"
              : "text-gray-500 hover:text-gray-200 hover:bg-white/5"
          }`}
          onClick={() => selectFolder(null)}
        >
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className={`text-[13px] font-medium ${activeView === "gallery" && selectedFolderId === null ? "text-white" : ""}`}>
            All Media
          </span>
        </div>

        <div
          className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-all duration-150 ${
            activeView === "explore"
              ? "bg-white/8 text-white"
              : "text-gray-500 hover:text-gray-200 hover:bg-white/5"
          }`}
          onClick={() => setView("explore")}
        >
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
          </svg>
          <span className={`text-[13px] font-medium ${activeView === "explore" ? "text-white" : ""}`}>
            Explore
          </span>
        </div>

        <div
          className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-all duration-150 ${
            activeView === "timeline"
              ? "bg-white/8 text-white"
              : "text-gray-500 hover:text-gray-200 hover:bg-white/5"
          }`}
          onClick={() => setView("timeline")}
        >
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className={`text-[13px] font-medium ${activeView === "timeline" ? "text-white" : ""}`}>
            Timeline
          </span>
        </div>

        <div
          className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-all duration-150 ${
            activeView === "duplicates"
              ? "bg-white/8 text-white"
              : "text-gray-500 hover:text-gray-200 hover:bg-white/5"
          }`}
          onClick={() => setView("duplicates")}
        >
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <span className={`text-[13px] font-medium ${activeView === "duplicates" ? "text-white" : ""}`}>
            Duplicates
          </span>
        </div>
      </div>

      {/* Section label */}
      {folders.length > 0 && (
        <div className="flex items-center justify-between gap-2 px-5 pt-3 pb-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-gray-600">Libraries</span>
          <ThemedDropdown
            value={librarySort}
            onChange={(value) => setLibrarySort(value as LibrarySort)}
            ariaLabel="Library order"
            compact
            options={[
              { value: "az", label: "A-Z" },
              { value: "za", label: "Z-A" },
              { value: "custom", label: "Custom" },
            ]}
          />
        </div>
      )}

      {/* Folder list */}
      <Reorder.Group
        ref={folderListRef}
        as="div"
        axis="y"
        values={displayedFolders.map((folder) => folder.id)}
        onReorder={librarySort === "custom" ? handleReorder : () => {}}
        layoutScroll
        className="flex-1 overflow-y-auto px-2 pb-2 space-y-px min-h-0"
      >
        {folders.length === 0 ? (
          <p className="text-gray-700 text-xs px-3 py-6 text-center leading-relaxed">
            Add a folder to get started
          </p>
        ) : (
          displayedFolders.map((folder) => (
            <FolderItem
              key={folder.id}
              folder={folder}
              selected={selectedFolderId === folder.id}
              progress={indexingProgress[folder.id]}
              customOrdering={librarySort === "custom"}
              dragging={draggedFolderId === folder.id}
              onDragStart={(pointerY) => {
                pointerYRef.current = pointerY;
                setDraggedFolderId(folder.id);
              }}
              onDragEnd={finishReorder}
              onKeyboardMove={(direction) => moveFolderByKeyboard(folder.id, direction)}
            />
          ))
        )}
      </Reorder.Group>

      {/* Albums — a visually distinct block, separated from Libraries by a
          heavier divider and given cover-thumbnail rows so the two never
          read as one list. */}
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
                <button
                  onClick={() => setManageAlbums(true)}
                  className="rounded p-0.5 text-gray-600 transition-colors hover:bg-white/8 hover:text-gray-200"
                  title="Manage albums"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              ) : null}
              <button
                onClick={startCreatingAlbum}
                className="rounded p-0.5 text-gray-600 transition-colors hover:bg-white/8 hover:text-gray-200"
                title="New album"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Manage action row */}
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
    </aside>
  );
}
