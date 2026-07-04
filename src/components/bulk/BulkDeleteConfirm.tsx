import { WarningIcon } from '../icons'

interface BulkDeleteConfirmProps {
  deleting: boolean
  selectedCount: number
  onCancel: () => void
  onDelete: () => Promise<void>
}

export function BulkDeleteConfirm({
  deleting,
  selectedCount,
  onCancel,
  onDelete,
}: BulkDeleteConfirmProps) {
  return (
    <div
      data-bulk-popover
      className="absolute bottom-full left-1/2 mb-2 w-64 -translate-x-1/2 rounded-xl border border-red-500/30 bg-gray-950/98 p-3 shadow-2xl backdrop-blur"
    >
      <div className="mb-1 flex items-center gap-1.5 text-red-300">
        <WarningIcon className="h-3.5 w-3.5 shrink-0" />
        <p className="text-xs font-semibold">Delete from disk</p>
      </div>
      <p className="mb-2.5 text-[11px] leading-relaxed text-gray-400">
        Permanently delete {selectedCount} file{selectedCount === 1 ? '' : 's'} from your computer.
        This removes the actual file{selectedCount === 1 ? '' : 's'} from disk and cannot be undone.
      </p>
      <div className="flex justify-end gap-1.5">
        <button
          className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          className="rounded-md bg-red-500/20 px-2.5 py-1 text-[11px] font-medium text-red-300 transition-colors hover:bg-red-500/30 hover:text-red-200 disabled:opacity-50"
          onClick={() => void onDelete()}
          disabled={deleting}
        >
          {deleting ? 'Deleting…' : `Delete ${selectedCount} from disk`}
        </button>
      </div>
    </div>
  )
}
