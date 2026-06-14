import { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useGalleryStore, Folder, IndexProgress } from "../store";

interface ContextMenuState {
  folderId: number;
  x: number;
  y: number;
}

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
}: {
  folder: Folder;
  selected: boolean;
  progress: IndexProgress | undefined;
}) {
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
    <>
      <div
        className={`group relative flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-all duration-150 ${
          selected
            ? "bg-white/8 text-white"
            : "text-gray-500 hover:text-gray-200 hover:bg-white/5"
        }`}
        onClick={() => !renaming && selectFolder(folder.id)}
        onContextMenu={handleContextMenu}
      >
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
    </>
  );
}

export function Sidebar() {
  const folders = useGalleryStore((state) => state.folders);
  const selectedFolderId = useGalleryStore((state) => state.selectedFolderId);
  const addFolder = useGalleryStore((state) => state.addFolder);
  const indexingProgress = useGalleryStore((state) => state.indexingProgress);
  const selectFolder = useGalleryStore((state) => state.selectFolder);
  const activeView = useGalleryStore((state) => state.activeView);
  const setView = useGalleryStore((state) => state.setView);

  const handleAddFolder = async () => {
    const selected = await open({ directory: true, multiple: false, title: "Select Media Folder" });
    if (selected && typeof selected === "string") {
      await addFolder(selected);
    }
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
        <div className="px-5 pt-3 pb-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-gray-600">Libraries</span>
        </div>
      )}

      {/* Folder list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-px min-h-0">
        {folders.length === 0 ? (
          <p className="text-gray-700 text-xs px-3 py-6 text-center leading-relaxed">
            Add a folder to get started
          </p>
        ) : (
          folders.map((folder) => (
            <FolderItem
              key={folder.id}
              folder={folder}
              selected={selectedFolderId === folder.id}
              progress={indexingProgress[folder.id]}
            />
          ))
        )}
      </div>
    </aside>
  );
}
