import { ParsedSearch, searchModeLabel, useGalleryStore } from "../../store";
import { FolderScopeDropdown } from "../FolderScopeDropdown";

export function ToolbarTitle({ parsedSearch }: { parsedSearch: ParsedSearch }) {
  const search = useGalleryStore((state) => state.search);
  const totalImages = useGalleryStore((state) => state.totalImages);
  const loadedCount = useGalleryStore((state) => state.loadedCount);
  const selectedFolderId = useGalleryStore((state) => state.selectedFolderId);
  const collectionTitle = useGalleryStore((state) => state.collectionTitle);
  const folders = useGalleryStore((state) => state.folders);
  const activeView = useGalleryStore((state) => state.activeView);

  const selectedFolder = folders.find((folder) => folder.id === selectedFolderId);
  const title = collectionTitle ?? (selectedFolder ? selectedFolder.name : "All Media");
  const hasActiveSearch = search.trim().length > 0;

  return (
    <>
      <div className="flex min-w-0 shrink-0 items-baseline gap-2.5">
        <h2 className="max-w-32 truncate text-[15px] font-semibold text-white lg:max-w-48">{title}</h2>
        <span className="shrink-0 text-xs text-gray-600">
          {loadedCount < totalImages
            ? `${loadedCount.toLocaleString()} / ${totalImages.toLocaleString()}`
            : totalImages.toLocaleString()}
        </span>
        {hasActiveSearch ? (
          <span className="shrink-0 rounded-md border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-blue-300">
            {searchModeLabel(parsedSearch.mode)}
          </span>
        ) : null}
      </div>

      {activeView === "timeline" ? <FolderScopeDropdown /> : null}
    </>
  );
}
