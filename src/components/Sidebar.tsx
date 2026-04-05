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
      className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
        selected
          ? "bg-blue-600 text-white"
          : "hover:bg-white/5 text-gray-300 hover:text-white"
      }`}
      onClick={() => selectFolder(folder.id)}
    >
      <svg
        className="w-4 h-4 shrink-0 opacity-70"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M3 7a2 2 0 012-2h3.586a1 1 0 01.707.293l1.414 1.414A1 1 0 0011.414 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
        />
      </svg>

      <div className="flex-1 min-w-0">
        <div className="truncate text-sm font-medium">{folder.name}</div>
        {isIndexing ? (
          <div className="text-xs opacity-60">
            {progress.indexed}/{progress.total} indexed
          </div>
        ) : (
          <div className="text-xs opacity-50">
            {folder.image_count.toLocaleString()} items
          </div>
        )}
        {isIndexing && (
          <div className="h-0.5 bg-white/20 rounded mt-1 overflow-hidden">
            <div
              className="h-full bg-blue-400 transition-all duration-300"
              style={{
                width: `${progress.total > 0 ? (progress.indexed / progress.total) * 100 : 0}%`,
              }}
            />
          </div>
        )}
      </div>

      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button
          className="p-1 rounded hover:bg-white/10"
          title="Re-index"
          onClick={(e) => {
            e.stopPropagation();
            reindexFolder(folder.id);
          }}
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>
        <button
          className="p-1 rounded hover:bg-red-500/20 hover:text-red-400"
          title="Remove folder"
          onClick={(e) => {
            e.stopPropagation();
            removeFolder(folder.id);
          }}
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
  const { folders, selectedFolderId, addFolder, indexingProgress, totalImages, selectFolder } =
    useGalleryStore();

  const handleAddFolder = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select Media Folder",
    });
    if (selected && typeof selected === "string") {
      await addFolder(selected);
    }
  };

  return (
    <aside className="w-72 shrink-0 flex flex-col bg-gray-900 border-r border-white/5">
      {/* Header */}
      <div className="px-4 py-4 border-b border-white/5">
        <h1 className="text-white font-semibold text-base">Image Gallery</h1>
        <p className="text-gray-500 text-xs mt-0.5">
          {folders.reduce((s, f) => s + f.image_count, 0).toLocaleString()} total items
        </p>
      </div>

      {/* All photos link */}
      <div className="px-3 pt-3">
        <div
          className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
            selectedFolderId === null
              ? "bg-blue-600 text-white"
              : "hover:bg-white/5 text-gray-300 hover:text-white"
          }`}
          onClick={() => selectFolder(null)}
        >
          <svg className="w-4 h-4 shrink-0 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="text-sm font-medium">All Media</span>
          {selectedFolderId === null && (
            <span className="ml-auto text-xs opacity-60">{totalImages.toLocaleString()}</span>
          )}
        </div>
      </div>

      {/* Folder list */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5 min-h-0">
        {folders.length === 0 ? (
          <p className="text-gray-600 text-xs px-3 py-4 text-center">
            No folders added yet
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

        {/* Add folder button */}
      <div className="px-3 pb-4 pt-2 border-t border-white/5">
        <button
          onClick={handleAddFolder}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Media Folder
        </button>
      </div>
    </aside>
  );
}
