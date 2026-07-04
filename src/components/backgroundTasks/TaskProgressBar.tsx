export function TaskProgressBar({
  failed,
  progress,
  widthClass = 'w-20',
}: {
  failed: boolean
  progress: number | null
  widthClass?: string
}) {
  return (
    <div className={`${widthClass} h-px shrink-0 overflow-hidden rounded-full bg-white/8`}>
      <div
        className={`h-full rounded-full transition-all duration-500 ${
          failed
            ? 'bg-amber-400/60'
            : progress === null
              ? 'w-full animate-pulse bg-blue-500/40'
              : 'bg-blue-500'
        }`}
        style={progress !== null ? { width: `${progress}%` } : undefined}
      />
    </div>
  )
}
