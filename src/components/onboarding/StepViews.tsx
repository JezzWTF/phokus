import { FakeTile, tileGradient } from "./fakes";

function ViewRow({ title, description, preview }: { title: string; description: string; preview: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-4">
      <div className="min-w-0">
        <p className="text-sm text-white">{title}</p>
        <p className="mt-1 max-w-md text-xs leading-relaxed text-gray-500">{description}</p>
      </div>
      <div className="shrink-0">{preview}</div>
    </div>
  );
}

function ExplorePreview() {
  // Cluster blobs of varying size, like the tag cloud / cluster map.
  const blobs = [
    { size: 34, x: 4, y: 10, i: 0 },
    { size: 24, x: 46, y: 0, i: 2 },
    { size: 18, x: 86, y: 22, i: 4 },
    { size: 26, x: 30, y: 36, i: 1 },
    { size: 16, x: 70, y: 44, i: 6 },
  ];
  return (
    <div className="relative h-[72px] w-32 overflow-hidden rounded-lg border border-white/[0.07] bg-white/[0.02]">
      {blobs.map((blob, idx) => (
        <div
          key={idx}
          className={`absolute rounded-full bg-gradient-to-br opacity-80 ${tileGradient(blob.i)}`}
          style={{ width: blob.size, height: blob.size, left: blob.x, top: blob.y }}
        />
      ))}
    </div>
  );
}

function TimelinePreview() {
  return (
    <div className="flex h-[72px] w-32 flex-col justify-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3">
      {[2024, 2023].map((year, row) => (
        <div key={year} className="flex items-center gap-1.5">
          <span className="w-7 text-[9px] tabular-nums text-gray-600">{year}</span>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={`h-4 w-4 rounded-sm bg-gradient-to-br ${tileGradient(row * 3 + i)}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

function DuplicatesPreview() {
  return (
    <div className="flex h-[72px] w-32 items-center justify-center gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.02]">
      <div className="w-10">
        <FakeTile index={3} className="rounded-md" />
      </div>
      <div className="relative w-10">
        <FakeTile index={3} className="rounded-md" />
        <span className="absolute -right-1 -top-1 rounded-full bg-amber-500/90 px-1 text-[8px] font-semibold text-black">2×</span>
      </div>
    </div>
  );
}

export function StepViews() {
  return (
    <div>
      <p className="text-sm leading-relaxed text-gray-300">
        Beyond the main grid, the sidebar switches between three more ways to look at your library:
      </p>
      <div className="mt-3 divide-y divide-white/[0.05]">
        <ViewRow
          title="Explore"
          description="A visual cluster map and tag cloud — browse by theme instead of folder, and jump into any cluster."
          preview={<ExplorePreview />}
        />
        <ViewRow
          title="Timeline"
          description="Everything grouped chronologically by capture date (EXIF), from years down to days."
          preview={<TimelinePreview />}
        />
        <ViewRow
          title="Duplicates"
          description="A three-phase exact-duplicate scan with bulk delete — reclaim space from copies safely."
          preview={<DuplicatesPreview />}
        />
      </div>
      <p className="mt-4 text-xs leading-relaxed text-gray-500">
        Each view can be scoped to a single folder from its header — no need to bounce through the sidebar.
      </p>
    </div>
  );
}
