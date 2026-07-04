export function DuplicateScanLoadingState({ progressLabel }: { progressLabel: string | null }) {
  return (
    <div className="flex flex-1 items-center justify-center gap-3 text-white/25">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/15 border-t-white/50" />
      <span className="text-sm">{progressLabel ? `${progressLabel}…` : 'Preparing scan…'}</span>
    </div>
  )
}

export function DuplicateScanIntroState() {
  return (
    <div className="flex flex-1 items-center justify-center px-8">
      <div className="max-w-sm text-center">
        <svg
          className="mx-auto mb-4 h-10 w-10 text-white/10"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1}
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
        <p className="text-sm text-white/30">
          Finds files with identical content regardless of filename or location. Click{' '}
          <strong className="text-white/50">Scan for duplicates</strong> to begin.
        </p>
        <p className="mt-2 text-xs text-white/20">
          Large libraries may take a minute — files are hashed from disk.
        </p>
      </div>
    </div>
  )
}

export function DuplicateScanEmptyState() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <p className="text-sm text-white/25">No duplicate files found.</p>
    </div>
  )
}
