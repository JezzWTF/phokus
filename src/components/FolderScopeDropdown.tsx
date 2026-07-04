import { useMemo } from 'react'
import { useGalleryStore } from '../store'
import { Dropdown, DropdownOption } from './menu'

/**
 * In-view folder scope picker for feature views (Timeline / Explore /
 * Duplicates). Changes the scope via setViewFolderScope, which keeps the
 * current view active — unlike sidebar folder clicks, which jump to Gallery.
 */
export function FolderScopeDropdown() {
  const folders = useGalleryStore((state) => state.folders)
  const selectedFolderId = useGalleryStore((state) => state.selectedFolderId)
  const setViewFolderScope = useGalleryStore((state) => state.setViewFolderScope)

  const options = useMemo<DropdownOption<number | null>[]>(
    () => [
      { value: null, label: 'All Media' },
      ...folders.map((folder) => ({
        value: folder.id,
        label: folder.name,
        hint: <span className="tabular-nums">{folder.image_count.toLocaleString()}</span>,
      })),
    ],
    [folders]
  )

  return (
    <Dropdown
      value={selectedFolderId}
      options={options}
      onChange={setViewFolderScope}
      ariaLabel="Folder scope"
      trigger="ghost"
      size="md"
      triggerTooltip="Change folder scope"
      triggerClassName="max-w-56"
      panelClassName="min-w-52 max-h-80 overflow-y-auto"
      triggerIcon={
        <svg
          className="h-3.5 w-3.5 shrink-0 text-gray-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
          />
        </svg>
      }
    />
  )
}
