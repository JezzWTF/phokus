/**
 * Compact Confirm/Cancel pair for destructive row actions (remove folder,
 * delete album). Swap it in where the hover actions normally sit.
 */
export function InlineConfirm({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex items-center gap-1 shrink-0" onClick={(event) => event.stopPropagation()}>
      <button
        className="px-1.5 py-0.5 text-[10px] rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 hover:text-red-300 transition-colors"
        onClick={onConfirm}
      >
        Confirm
      </button>
      <button
        className="px-1.5 py-0.5 text-[10px] rounded bg-white/5 text-gray-500 hover:bg-white/10 hover:text-gray-300 transition-colors"
        onClick={onCancel}
      >
        Cancel
      </button>
    </div>
  );
}
