import { Reorder } from "framer-motion";
import { useGalleryStore } from "../../store";
import { Dropdown } from "../menu";
import { FolderItem } from "./FolderItem";
import { useFolderOrdering } from "./useFolderOrdering";

export function LibrarySection() {
  const folders = useGalleryStore((state) => state.folders);
  const selectedFolderId = useGalleryStore((state) => state.selectedFolderId);
  const indexingProgress = useGalleryStore((state) => state.indexingProgress);
  const reorderFolders = useGalleryStore((state) => state.reorderFolders);

  const {
    customOrdering,
    displayedFolders,
    draggedFolderId,
    finishReorder,
    folderListRef,
    handleReorder,
    librarySort,
    moveFolderByKeyboard,
    pointerYRef,
    setDraggedFolderId,
    setLibrarySort,
  } = useFolderOrdering(folders, reorderFolders);

  return (
    <>
      {folders.length > 0 && (
        <div className="flex items-center justify-between gap-2 px-5 pt-3 pb-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-gray-600">Libraries</span>
          <Dropdown
            value={librarySort}
            onChange={setLibrarySort}
            ariaLabel="Library order"
            trigger="compact"
            panelClassName="min-w-0"
            options={[
              { value: "az", label: "A-Z" },
              { value: "za", label: "Z-A" },
              { value: "custom", label: "Custom" },
            ]}
          />
        </div>
      )}

      <Reorder.Group
        ref={folderListRef}
        as="div"
        axis="y"
        values={displayedFolders.map((folder) => folder.id)}
        onReorder={customOrdering ? handleReorder : () => {}}
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
              customOrdering={customOrdering}
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
    </>
  );
}
