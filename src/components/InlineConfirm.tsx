/**
 * Compact Confirm/Cancel pair for destructive row actions (remove folder,
 * delete album). Swap it in where the hover actions normally sit.
 */
export function InlineConfirm({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="flex shrink-0 items-center gap-1" onClick={(event) => event.stopPropagation()}>
      <button
        className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] text-red-400 transition-colors hover:bg-red-500/30 hover:text-red-300"
        onClick={onConfirm}
      >
        Confirm
      </button>
      <button
        className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-gray-500 transition-colors hover:bg-white/10 hover:text-gray-300"
        onClick={onCancel}
      >
        Cancel
      </button>
    </div>
  )
}
