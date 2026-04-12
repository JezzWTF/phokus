import { open } from "@tauri-apps/plugin-dialog";
import { useGalleryStore, Folder, IndexProgress } from "../store";

function FolderItem({
  folder,
  selected,
  progress,
}: {
  folder: Folder;
  selected: boolean;
  progress: IndexProgress | undefined;
}) {
  const { selectFolder, removeFolder, reindexFolder } = useGalleryStore();
  const isIndexing = progress && !progress.done;

  return (
    <div
      className={`group relative flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-all duration-150 ${
        selected
          ? "bg-white/8 text-white"
          : "text-gray-500 hover:text-gray-200 hover:bg-white/5"
      }`}
      onClick={() => selectFolder(folder.id)}
    >
      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M3 7a2 2 0 012-2h3.586a1 1 0 01.707.293l1.414 1.414A1 1 0 0011.414 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
      </svg>

      <div className="flex-1 min-w-0">
        <div className={`truncate text-[13px] font-medium leading-tight ${selected ? "text-white" : ""}`}>
          {folder.name}
        </div>
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

      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button
          className="p-1 rounded-md hover:bg-white/10 text-gray-500 hover:text-gray-200"
          title="Re-index"
          onClick={(e) => { e.stopPropagation(); reindexFolder(folder.id); }}
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
        <button
          className="p-1 rounded-md hover:bg-red-500/15 text-gray-500 hover:text-red-400"
          title="Remove folder"
          onClick={(e) => { e.stopPropagation(); removeFolder(folder.id); }}
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
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
