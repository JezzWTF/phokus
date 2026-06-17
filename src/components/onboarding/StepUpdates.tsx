import { PhokusMark } from "../PhokusMark";

// Closing step. Introduces the app mark (the aperture in the title bar) and,
// since that same mark doubles as the update indicator, explains how updates
// work in one place. The mini app-window mockup shows the lit mark exactly
// where it appears, so there's nothing abstract to decode.
export function StepUpdates() {
  return (
    <div>
      <p className="text-sm leading-relaxed text-gray-300">
        Phokus keeps itself up to date — it quietly checks for new versions on startup, so you don't
        have to go looking for one.
      </p>

      <h4 className="mt-6 text-[12px] font-semibold uppercase tracking-[0.08em] text-gray-400">
        When an update is ready
      </h4>
      <div className="mt-1 py-4">
        <p className="text-sm text-white">The mark in the title bar lights up</p>
        <p className="mt-1 text-xs leading-relaxed text-gray-500">
          That aperture in the top-left corner is Phokus. When a new version is waiting, its focal point
          glows amber — click it to update and relaunch. Nothing installs on its own; you're always in
          control.
        </p>

        {/* Mini app-window mockup: the lit mark shown in a real title bar. */}
        <div className="mt-3 overflow-hidden rounded-lg border border-white/10 bg-gray-950 shadow-lg light-theme:border-gray-300/70">
          <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2 light-theme:border-gray-300/70">
            <div className="relative flex h-6 w-6 items-center justify-center rounded-md bg-gray-900 text-gray-300 light-theme:bg-gray-800">
              <span className="pointer-events-none absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-400/30 blur-[3px]" />
              <span className="pointer-events-none absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-400/55 animate-ping" />
              <PhokusMark className="relative h-[18px] w-[18px]" dotClassName="fill-amber-400" />
            </div>
            <span className="text-xs font-semibold tracking-wide text-gray-300">Phokus</span>
            <div className="flex-1" />
            <div className="flex items-center gap-3.5 text-gray-600">
              <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                <rect y="4.5" width="10" height="1" rx="0.5" fill="currentColor" />
              </svg>
              <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                <rect x="0.5" y="0.5" width="9" height="9" rx="1.5" stroke="currentColor" />
              </svg>
              <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
              </svg>
            </div>
          </div>

          {/* Ghosted window body, just enough to read as the app. */}
          <div className="flex h-[72px] bg-gray-900/30">
            <div className="w-14 shrink-0 border-r border-white/[0.05] p-2.5 light-theme:border-gray-300/70">
              <div className="h-1.5 w-full rounded bg-gray-800" />
              <div className="mt-2 h-1.5 w-3/4 rounded bg-gray-900" />
              <div className="mt-2 h-1.5 w-3/4 rounded bg-gray-900" />
            </div>
            <div className="flex-1 p-2.5">
              <div className="h-2 w-20 rounded bg-gray-800" />
              <div className="mt-2.5 grid grid-cols-5 gap-1.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-7 rounded bg-gray-900" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <h4 className="mt-6 text-[12px] font-semibold uppercase tracking-[0.08em] text-gray-400">
        Prefer to manage it yourself?
      </h4>
      <div className="mt-1 py-4">
        <p className="text-sm text-white">Check any time from Settings</p>
        <p className="mt-1 text-xs leading-relaxed text-gray-500">
          Settings → General shows your current version with a manual{" "}
          <span className="text-gray-300">Check for updates</span> button, so you can update on your own
          schedule.
        </p>
      </div>

      <p className="mt-5 text-xs leading-relaxed text-gray-500">
        That's the tour. Add folders from the sidebar, and revisit any of this from Settings — including
        re-running this tour.
      </p>
    </div>
  );
}
