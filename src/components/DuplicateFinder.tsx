import { useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useGalleryStore } from '../store'
import {
  DuplicateScanEmptyState,
  DuplicateScanIntroState,
  DuplicateScanLoadingState,
} from './duplicateFinder/DuplicateFinderEmptyStates'
import { DuplicateFinderHeader } from './duplicateFinder/DuplicateFinderHeader'
import { DuplicateGroupCard } from './duplicateFinder/DuplicateGroupCard'
import { duplicateProgressLabel } from './duplicateFinder/format'

export function DuplicateFinder() {
  const duplicateGroups = useGalleryStore((state) => state.duplicateGroups)
  const duplicateScanning = useGalleryStore((state) => state.duplicateScanning)
  const duplicateScanProgress = useGalleryStore((state) => state.duplicateScanProgress)
  const duplicateScanError = useGalleryStore((state) => state.duplicateScanError)
  const duplicateScanWarning = useGalleryStore((state) => state.duplicateScanWarning)
  const duplicateSelectedIds = useGalleryStore((state) => state.duplicateSelectedIds)
  const duplicateLastScanned = useGalleryStore((state) => state.duplicateLastScanned)
  const selectedFolderId = useGalleryStore((state) => state.selectedFolderId)
  const scanDuplicates = useGalleryStore((state) => state.scanDuplicates)
  const clearDuplicateSelection = useGalleryStore((state) => state.clearDuplicateSelection)
  const selectKeepFirstAllGroups = useGalleryStore((state) => state.selectKeepFirstAllGroups)
  const deleteSelectedDuplicates = useGalleryStore((state) => state.deleteSelectedDuplicates)

  const [deleting, setDeleting] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleteResult, setDeleteResult] = useState<string | null>(null)

  // Virtualize the group list so a large result set (e.g. thousands of pairs)
  // only mounts the on-screen cards. Group cards vary in height (number of
  // copies wraps across rows), so heights are measured dynamically.
  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: duplicateGroups.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 220,
    overscan: 4,
  })

  const selectedCount = duplicateSelectedIds.size
  const hasResults = duplicateGroups.length > 0
  const hasScanned =
    hasResults ||
    duplicateLastScanned !== null ||
    (!duplicateScanning && duplicateScanProgress !== null)
  const handleDelete = async () => {
    setDeleting(true)
    setConfirmingDelete(false)
    setDeleteResult(null)
    try {
      const deleted = await deleteSelectedDuplicates()
      setDeleteResult(`Deleted ${deleted} file${deleted === 1 ? '' : 's'}.`)
    } catch (e) {
      setDeleteResult(String(e))
    } finally {
      setDeleting(false)
    }
  }

  const progressLabel = duplicateProgressLabel(duplicateScanProgress)

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-gray-950">
      <DuplicateFinderHeader
        confirmingDelete={confirmingDelete}
        deleteResult={deleteResult}
        deleting={deleting}
        duplicateGroups={duplicateGroups}
        duplicateLastScanned={duplicateLastScanned}
        duplicateScanError={duplicateScanError}
        duplicateScanning={duplicateScanning}
        duplicateScanProgress={duplicateScanProgress}
        duplicateScanWarning={duplicateScanWarning}
        hasResults={hasResults}
        hasScanned={hasScanned}
        onClearSelection={clearDuplicateSelection}
        onConfirmDelete={() => setConfirmingDelete(false)}
        onDelete={handleDelete}
        onScan={() => {
          setDeleteResult(null)
          void scanDuplicates(selectedFolderId)
        }}
        onSelectKeepFirstAll={selectKeepFirstAllGroups}
        selectedCount={selectedCount}
        setConfirmingDelete={setConfirmingDelete}
      />

      {duplicateScanning && !hasResults ? (
        <DuplicateScanLoadingState progressLabel={progressLabel} />
      ) : !hasScanned ? (
        <DuplicateScanIntroState />
      ) : duplicateGroups.length === 0 ? (
        <DuplicateScanEmptyState />
      ) : (
        <div ref={scrollRef} className="overflow-y-auto px-6 py-5">
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const group = duplicateGroups[virtualItem.index]
              if (!group) return null
              return (
                <div
                  key={group.file_hash}
                  data-index={virtualItem.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualItem.start}px)`,
                    paddingBottom: 16,
                  }}
                >
                  <DuplicateGroupCard group={group} />
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
