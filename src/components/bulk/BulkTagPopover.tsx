import { BulkTagFields } from './BulkTagFields'
import { Tooltip } from '../Tooltip'
import { CloseIcon } from '../icons'

// Inline popover surface for bulk tagging — the default editing surface.
// Anchored above the bar by the parent; closes on outside click via the
// data-bulk-popover guard handled in BulkActionBar.
export function BulkTagPopover({ onClose }: { onClose: () => void }) {
  return (
    <div
      data-bulk-popover
      className="absolute bottom-full left-1/2 mb-2 w-72 -translate-x-1/2 rounded-xl border border-white/10 bg-gray-950/98 p-3 shadow-2xl backdrop-blur"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] tracking-wider text-gray-500 uppercase">Add tags</p>
        <Tooltip label="Close" anchorToCursor>
          <button className="text-gray-600 transition-colors hover:text-white" onClick={onClose}>
            <CloseIcon className="h-3.5 w-3.5" />
          </button>
        </Tooltip>
      </div>
      <BulkTagFields autoFocus />
    </div>
  )
}
