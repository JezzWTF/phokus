export function TaskProgressBar({
  failed,
  progress,
  widthClass = "w-20",
}: {
  failed: boolean;
  progress: number | null;
  widthClass?: string;
}) {
  return (
    <div className={`${widthClass} h-px bg-white/8 rounded-full overflow-hidden shrink-0`}>
      <div
        className={`h-full rounded-full transition-all duration-500 ${
          failed
            ? "bg-amber-400/60"
            : progress === null
              ? "bg-blue-500/40 animate-pulse w-full"
              : "bg-blue-500"
        }`}
        style={progress !== null ? { width: `${progress}%` } : undefined}
      />
    </div>
  );
}
