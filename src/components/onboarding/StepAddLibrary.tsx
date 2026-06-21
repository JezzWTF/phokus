import { useGalleryStore } from "../../store";
import { FakeTile } from "./fakes";

export function StepAddLibrary() {
  const folders = useGalleryStore((s) => s.folders);
  const setFolderPickerOpen = useGalleryStore((s) => s.setFolderPickerOpen);

  const handlePick = () => {
    setFolderPickerOpen(true);
  };

  return (
    <div>
      <p className="text-sm leading-relaxed text-gray-300">
        A library is just a folder on disk — Phokus watches it and keeps itself in sync as files are
        added, renamed, or removed. Nothing is moved or copied.
      </p>

      <div className="mt-5 flex items-center justify-between gap-6 border-y border-white/[0.05] py-4 light-theme:border-gray-300/70">
        <div className="min-w-0">
          {folders.length > 0 ? (
            <>
              <p className="text-sm text-white">
                {folders.length === 1 ? `“${folders[0].name}” added` : `${folders.length} folders in your library`}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Indexing runs in the background — you can add more folders from the sidebar any time.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-white">Add your first folder</p>
              <p className="mt-1 text-xs text-gray-500">
                Pick somewhere with photos or videos. You can add more later from the sidebar.
              </p>
            </>
          )}
        </div>
        <button
          className="shrink-0 rounded-md border border-emerald-400/35 bg-emerald-500/15 px-3 py-1.5 text-xs text-emerald-200 transition-colors hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-45 light-theme:border-emerald-600/50 light-theme:bg-emerald-100 light-theme:text-emerald-700 light-theme:hover:bg-emerald-200"
          onClick={handlePick}
        >
          {folders.length > 0 ? "Add another folder" : "Choose a folder"}
        </button>
      </div>

      <p className="mt-5 text-xs leading-relaxed text-gray-500">
        As indexing runs, the gallery fills in roughly like this — tiles appear immediately and sharpen
        as thumbnails are generated:
      </p>
      <div className="media-dark-surface mt-3 grid grid-cols-6 gap-1.5">
        <FakeTile index={0} />
        <FakeTile index={1} favorite />
        <FakeTile index={2} duration="0:42" />
        <FakeTile index={3} rating={4} />
        <FakeTile index={4} loaded={false} />
        <FakeTile index={5} loaded={false} />
      </div>
    </div>
  );
}
