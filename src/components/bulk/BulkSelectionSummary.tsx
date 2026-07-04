import { Tooltip } from '../Tooltip'

interface BulkSelectionSummaryProps {
  loadedCount: number
  selectedCount: number
  totalImages: number
  onSelectAll: () => void
}

export function BulkSelectionSummary({
  loadedCount,
  selectedCount,
  totalImages,
  onSelectAll,
}: BulkSelectionSummaryProps) {
  const showSelectAll = loadedCount < totalImages || loadedCount > selectedCount

  return (
    <div className="flex items-center gap-2 px-1.5">
      <span className="text-xs font-medium text-white">{selectedCount} selected</span>
      {showSelectAll ? (
        <Tooltip
          label={loadedCount < totalImages ? 'Selects loaded items only' : 'Select all loaded'}
        >
          <button
            className="text-[11px] text-gray-500 transition-colors hover:text-gray-300"
            onClick={onSelectAll}
          >
            Select all{loadedCount < totalImages ? ' loaded' : ''}
          </button>
        </Tooltip>
      ) : null}
    </div>
  )
}
