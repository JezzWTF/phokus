export function TimelineLoadingState() {
  return (
    <div className="absolute inset-0 flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
      <div className="min-w-72 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8">
        <div className="mx-auto h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
        <p className="mt-4 text-sm font-medium text-white/40">Loading timeline</p>
        <p className="mt-1 text-xs text-white/20">Fetching results</p>
      </div>
    </div>
  );
}

export function TimelineEmptyState({ imageLoadError }: { imageLoadError: string | null }) {
  return (
    <div className="absolute inset-0 flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8">
        <svg
          className="mx-auto mb-4 h-12 w-12 text-white/10"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={0.75}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        <p className="text-sm font-medium text-white/30">
          {imageLoadError ? "Could not load timeline" : "No media found"}
        </p>
        <p className="mt-1 text-xs text-white/15">
          {imageLoadError ?? "Add a folder to see your timeline"}
        </p>
      </div>
    </div>
  );
}
