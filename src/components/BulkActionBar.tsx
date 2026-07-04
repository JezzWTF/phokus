import { useEffect, useRef, useState } from 'react'
import { useGalleryStore } from '../store'
import { BulkAlbumPopover } from './bulk/BulkAlbumPopover'
import { BulkDeleteConfirm } from './bulk/BulkDeleteConfirm'
import { BulkRatingPopover } from './bulk/BulkRatingPopover'
import { BulkSelectionSummary } from './bulk/BulkSelectionSummary'
import { BulkTagPopover } from './bulk/BulkTagPopover'
import { type BulkPanel } from './bulk/types'
import { useDismissable } from './menu'
import { Tooltip } from './Tooltip'
import { CloseIcon } from './icons'

export function BulkActionBar() {
  const selectedCount = useGalleryStore((state) => state.gallerySelectedIds.size)
  const selectedIds = useGalleryStore((state) => state.gallerySelectedIds)
  const clearGallerySelection = useGalleryStore((state) => state.clearGallerySelection)
  const selectAllGallery = useGalleryStore((state) => state.selectAllGallery)
  const loadedCount = useGalleryStore((state) => state.loadedCount)
  const totalImages = useGalleryStore((state) => state.totalImages)
  const bulkSetFavorite = useGalleryStore((state) => state.bulkSetFavorite)
  const bulkSetRating = useGalleryStore((state) => state.bulkSetRating)
  const bulkDeleteSelected = useGalleryStore((state) => state.bulkDeleteSelected)
  const activeView = useGalleryStore((state) => state.activeView)
  const selectedAlbumId = useGalleryStore((state) => state.selectedAlbumId)
  const addToAlbum = useGalleryStore((state) => state.addToAlbum)
  const removeFromAlbum = useGalleryStore((state) => state.removeFromAlbum)

  const [panel, setPanel] = useState<BulkPanel>(null)
  const [deleting, setDeleting] = useState(false)
  const barRef = useRef<HTMLDivElement>(null)

  // Close any open popover when clicking outside the bar or pressing Escape.
  useDismissable(barRef, () => setPanel(null), panel !== null)

  // Reset transient UI whenever the selection empties.
  useEffect(() => {
    if (selectedCount === 0) setPanel(null)
  }, [selectedCount])

  if (selectedCount === 0) return null

  const ids = Array.from(selectedIds)
  const inAlbumView = activeView === 'album' && selectedAlbumId !== null
  const togglePanel = (next: Exclude<BulkPanel, null>) =>
    setPanel((current) => (current === next ? null : next))

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await bulkDeleteSelected()
    } finally {
      setDeleting(false)
      setPanel(null)
    }
  }

  const handlePickAlbum = async (albumId: number) => {
    await addToAlbum(albumId, ids)
    setPanel(null)
  }

  const btn = 'rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors'
  const btnIdle = `${btn} text-gray-300 hover:bg-white/10 hover:text-white`
  const btnActive = `${btn} bg-white/10 text-white`

  return (
    <div
      ref={barRef}
      className="pointer-events-auto absolute bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-white/10 bg-gray-950/95 px-2 py-1.5 shadow-2xl shadow-black/50 backdrop-blur"
      onClick={(event) => event.stopPropagation()}
    >
      <BulkSelectionSummary
        loadedCount={loadedCount}
        selectedCount={selectedCount}
        totalImages={totalImages}
        onSelectAll={selectAllGallery}
      />

      <div className="h-5 w-px bg-white/10" />

      <div className="relative">
        <button
          className={panel === 'tag' ? btnActive : btnIdle}
          onClick={() => togglePanel('tag')}
        >
          Tag
        </button>
        {panel === 'tag' ? <BulkTagPopover onClose={() => setPanel(null)} /> : null}
      </div>

      <div className="relative">
        <button
          className={panel === 'rating' ? btnActive : btnIdle}
          onClick={() => togglePanel('rating')}
        >
          Rating
        </button>
        {panel === 'rating' ? (
          <BulkRatingPopover onSetRating={bulkSetRating} onClose={() => setPanel(null)} />
        ) : null}
      </div>
      <Tooltip label="Mark as favorite" followCursor>
        <button className={btnIdle} onClick={() => void bulkSetFavorite(true)}>
          Favorite
        </button>
      </Tooltip>
      <div className="relative">
        <button
          className={panel === 'album' ? btnActive : btnIdle}
          onClick={() => togglePanel('album')}
        >
          Add to album
        </button>
        {panel === 'album' ? <BulkAlbumPopover onPick={handlePickAlbum} /> : null}
      </div>

      {inAlbumView ? (
        <button
          className={`${btn} text-amber-300/90 hover:bg-amber-500/10 hover:text-amber-200`}
          onClick={() => void removeFromAlbum(selectedAlbumId, ids)}
        >
          Remove from album
        </button>
      ) : null}

      <div className="h-5 w-px bg-white/10" />

      <div className="relative">
        <Tooltip label="Delete files from disk" followCursor>
          <button
            className={
              panel === 'delete'
                ? `${btn} bg-red-500/15 text-red-300`
                : `${btn} text-gray-300 hover:bg-red-500/10 hover:text-red-300`
            }
            onClick={() => togglePanel('delete')}
            disabled={deleting}
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </Tooltip>
        {panel === 'delete' ? (
          <BulkDeleteConfirm
            deleting={deleting}
            selectedCount={selectedCount}
            onCancel={() => setPanel(null)}
            onDelete={handleDelete}
          />
        ) : null}
      </div>
      <Tooltip label="Clear selection" followCursor>
        <button
          className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-white/[0.06] hover:text-white"
          onClick={clearGallerySelection}
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </Tooltip>
    </div>
  )
}
