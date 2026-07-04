import { Tooltip } from '../Tooltip'
import { StarIcon } from '../icons'

interface BulkRatingPopoverProps {
  onClose: () => void
  onSetRating: (rating: number) => Promise<void>
}

export function BulkRatingPopover({ onClose, onSetRating }: BulkRatingPopoverProps) {
  const setRating = async (rating: number) => {
    await onSetRating(rating)
    onClose()
  }

  return (
    <div
      data-bulk-popover
      className="absolute bottom-full left-1/2 mb-2 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-white/10 bg-gray-950/98 p-2 shadow-2xl backdrop-blur"
    >
      {Array.from({ length: 5 }, (_, index) => {
        const rating = index + 1
        return (
          <Tooltip key={rating} label={`Set ${rating} star${rating === 1 ? '' : 's'}`}>
            <button
              className="rounded-md p-1 text-white/25 transition-colors hover:bg-white/5 hover:text-amber-300"
              onClick={() => void setRating(rating)}
            >
              <StarIcon className="h-4 w-4" />
            </button>
          </Tooltip>
        )
      })}
      <button
        className="ml-1 rounded-md border border-white/10 px-2 py-1 text-[11px] text-gray-400 transition-colors hover:bg-white/5 hover:text-white"
        onClick={() => void setRating(0)}
      >
        Clear
      </button>
    </div>
  )
}
