import { useGalleryStore } from '../store'
import { Tooltip } from './Tooltip'
import { PlusIcon } from './icons'
import { AlbumSection } from './sidebar/AlbumSection'
import { LibrarySection } from './sidebar/LibrarySection'
import { NavItem } from './sidebar/NavItem'

export function Sidebar() {
  const setFolderPickerOpen = useGalleryStore((state) => state.setFolderPickerOpen)
  const selectedFolderId = useGalleryStore((state) => state.selectedFolderId)
  const selectFolder = useGalleryStore((state) => state.selectFolder)
  const activeView = useGalleryStore((state) => state.activeView)
  const setView = useGalleryStore((state) => state.setView)

  return (
    <aside className="flex w-52 shrink-0 flex-col border-r border-white/[0.06] bg-gray-950 lg:w-60">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/[0.06] px-4">
        <span className="text-[13px] font-semibold tracking-wide text-white/80">Phokus</span>
        <Tooltip label="Add Media Folder" anchorToCursor>
          <button
            onClick={() => setFolderPickerOpen(true)}
            className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-white/8 hover:text-gray-200"
          >
            <PlusIcon className="h-4 w-4" />
          </button>
        </Tooltip>
      </div>

      <div className="space-y-px px-2 pt-2 pb-1">
        <NavItem
          label="All Media"
          active={activeView === 'gallery' && selectedFolderId === null}
          onClick={() => selectFolder(null)}
          iconPath="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
        <NavItem
          label="Explore"
          active={activeView === 'explore'}
          onClick={() => setView('explore')}
          iconPath="M7 20l4-16m2 16l4-16M6 9h14M4 15h14"
        />
        <NavItem
          label="Timeline"
          active={activeView === 'timeline'}
          onClick={() => setView('timeline')}
          iconPath="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
        <NavItem
          label="Duplicates"
          active={activeView === 'duplicates'}
          onClick={() => setView('duplicates')}
          iconPath="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
        />
      </div>

      <LibrarySection />
      <AlbumSection />
    </aside>
  )
}
