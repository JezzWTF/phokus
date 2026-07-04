import { useState, type MouseEvent } from "react";
import { Reorder, useDragControls } from "framer-motion";
import { open } from "@tauri-apps/plugin-dialog";
import { useGalleryStore, type Folder, type IndexProgress } from "../../store";
import { ContextMenu, MenuItem, MenuSeparator } from "../menu";
import { InlineConfirm } from "../InlineConfirm";
import { InlineRename } from "../InlineRename";
import { Tooltip } from "../Tooltip";
import { CloseIcon, FolderIcon } from "../icons";

export function FolderItem({
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

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);

  const handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleLocateFolder = async () => {
    const picked = await open({ directory: true, multiple: false, title: `Locate "${folder.name}"` });
    if (picked && typeof picked === "string") {
      await updateFolderPath(folder.id, picked);
    }
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
          <Tooltip label={`Drag to reorder ${folder.name}`} followCursor delay={1000}>
          <button
            type="button"
            aria-label={`Reorder ${folder.name}`}
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
          </Tooltip>
        ) : null}
        {isMissing ? (
          <span className="shrink-0 text-amber-400">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </span>
        ) : (
          <FolderIcon className="w-3.5 h-3.5 shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          {renaming ? (
            <InlineRename
              name={folder.name}
              onRename={(next) => renameFolder(folder.id, next)}
              onClose={() => setRenaming(false)}
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
            <InlineConfirm
              onConfirm={() => { void removeFolder(folder.id); setConfirmingRemoval(false); }}
              onCancel={() => setConfirmingRemoval(false)}
            />
          ) : (
            <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <Tooltip label="Reindex" anchorToCursor>
                <button
                  className="p-1 rounded text-gray-600 hover:text-gray-300 hover:bg-white/8 transition-colors"
                  onClick={(e) => { e.stopPropagation(); void reindexFolder(folder.id); }}
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </Tooltip>
              <Tooltip label="Remove from app" anchorToCursor>
                <button
                  className="p-1 rounded text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  onClick={(e) => { e.stopPropagation(); setConfirmingRemoval(true); }}
                >
                  <CloseIcon className="w-3 h-3" strokeWidth={1.75} />
                </button>
              </Tooltip>
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

      {contextMenu && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} size="sm" onClose={() => setContextMenu(null)}>
          <MenuItem label="Reindex" onSelect={() => void reindexFolder(folder.id)} />
          <MenuItem label="Rename" onSelect={() => setRenaming(true)} />
          <MenuItem
            label={isPausedAll ? "Resume background work" : "Pause background work"}
            onSelect={() => setAllWorkersPaused(folder.id, !isPausedAll)}
          />
          <MenuItem
            label={isMuted ? "Unmute notifications" : "Mute notifications"}
            onSelect={() => toggleMutedFolder(folder.id)}
          />
          {folder.scan_error ? <MenuItem label="Locate Folder" onSelect={() => void handleLocateFolder()} /> : null}
          <MenuSeparator />
          <MenuItem label="Remove from app" danger onSelect={() => setConfirmingRemoval(true)} />
        </ContextMenu>
      )}
    </Reorder.Item>
  );
}


