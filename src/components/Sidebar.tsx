import { useGalleryStore } from "../store";
import { Tooltip } from "./Tooltip";
import { PlusIcon } from "./icons";
import { AlbumSection } from "./sidebar/AlbumSection";
import { LibrarySection } from "./sidebar/LibrarySection";
import { NavItem } from "./sidebar/NavItem";

export function Sidebar() {
  const setFolderPickerOpen = useGalleryStore((state) => state.setFolderPickerOpen);
  const selectedFolderId = useGalleryStore((state) => state.selectedFolderId);
  const selectFolder = useGalleryStore((state) => state.selectFolder);
  const activeView = useGalleryStore((state) => state.activeView);
  const setView = useGalleryStore((state) => state.setView);

  return (
    <aside className="w-52 shrink-0 flex flex-col bg-gray-950 border-r border-white/[0.06] lg:w-60">
      <div className="flex items-center justify-between px-4 h-12 border-b border-white/[0.06] shrink-0">
        <span className="text-[13px] font-semibold text-white/80 tracking-wide">Phokus</span>
        <Tooltip label="Add Media Folder" anchorToCursor>
        <button
          onClick={() => setFolderPickerOpen(true)}
          className="p-1.5 rounded-lg text-gray-500 hover:text-gray-200 hover:bg-white/8 transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
        </button>
        </Tooltip>
      </div>

      <div className="px-2 pt-2 pb-1 space-y-px">
        <NavItem
          label="All Media"
          active={activeView === "gallery" && selectedFolderId === null}
          onClick={() => selectFolder(null)}
          iconPath="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
        <NavItem
          label="Explore"
          active={activeView === "explore"}
          onClick={() => setView("explore")}
          iconPath="M7 20l4-16m2 16l4-16M6 9h14M4 15h14"
        />
        <NavItem
          label="Timeline"
          active={activeView === "timeline"}
          onClick={() => setView("timeline")}
          iconPath="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
        <NavItem
          label="Duplicates"
          active={activeView === "duplicates"}
          onClick={() => setView("duplicates")}
          iconPath="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
        />
      </div>

      <LibrarySection />
      <AlbumSection />
    </aside>
  );
}
