// Shared placeholder primitives for the onboarding tour. Everything here is
// deliberately fake — rights-clean demo stills (generated, owned), looping
// demo progress — so new users see the real UI's shapes before their own
// library exists.
import sunset from "../../assets/onboarding/sunset.webp";
import beach from "../../assets/onboarding/beach.webp";
import landscape1 from "../../assets/onboarding/landscape1.webp";
import landscape2 from "../../assets/onboarding/landscape2.webp";
import forest from "../../assets/onboarding/forest.webp";
import citynight from "../../assets/onboarding/citynight.webp";
import flower from "../../assets/onboarding/flower.webp";
import alpinelake from "../../assets/onboarding/alpinelake.webp";
import dunes from "../../assets/onboarding/dunes.webp";
import cozy from "../../assets/onboarding/cozy.webp";
import cat from "../../assets/onboarding/cat.webp";
import balloon from "../../assets/onboarding/balloon.webp";
import architecture from "../../assets/onboarding/architecture.webp";

// Ordered for grid variety: adjacent indices are visually distinct.
const FAKE_IMAGES = [
  sunset,
  cozy,
  landscape1,
  citynight,
  flower,
  dunes,
  alpinelake,
  cat,
  forest,
  balloon,
  landscape2,
  beach,
  architecture,
];

export function fakeImage(index: number): string {
  return FAKE_IMAGES[index % FAKE_IMAGES.length];
}

// Curated result sets so each search demo returns thematically right images.
export const SEARCH_RESULTS = {
  filename: [beach, dunes, sunset], // "beach-day_042.jpg"
  semantic: [sunset, alpinelake, beach], // "golden sunset over water"
  tags: [landscape1, landscape2, forest], // "landscape"
} as const;

// Abstract gradient blobs/ticks for the Explore & Timeline mini-previews,
// where small non-photographic shapes read more clearly than tiny stills.
const TILE_GRADIENTS = [
  "from-sky-900/70 via-slate-800 to-slate-900",
  "from-amber-900/60 via-stone-800 to-stone-900",
  "from-emerald-900/60 via-slate-800 to-gray-900",
  "from-rose-900/50 via-slate-800 to-slate-900",
  "from-indigo-900/60 via-slate-800 to-gray-900",
  "from-cyan-900/60 via-slate-800 to-slate-900",
  "from-fuchsia-900/40 via-slate-800 to-gray-900",
  "from-orange-900/50 via-stone-800 to-stone-900",
];

export function tileGradient(index: number): string {
  return TILE_GRADIENTS[index % TILE_GRADIENTS.length];
}

export function FakeTile({
  index,
  loaded = true,
  favorite = false,
  rating = 0,
  duration,
  className = "",
}: {
  index: number;
  loaded?: boolean;
  favorite?: boolean;
  rating?: number;
  duration?: string;
  className?: string;
}) {
  return (
    <div className={`group relative aspect-square overflow-hidden rounded-xl bg-white/[0.04] ${className}`}>
      {loaded ? (
        <img src={fakeImage(index)} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 animate-pulse bg-white/[0.04]" />
      )}
      {loaded && favorite ? (
        <div className="absolute right-1.5 top-1.5 rounded-full bg-black/50 p-1 text-rose-400 backdrop-blur-sm">
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
            <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
          </svg>
        </div>
      ) : null}
      {loaded && rating > 0 ? (
        <div className="absolute bottom-1.5 left-1.5 flex items-center gap-0.5 rounded-md bg-black/60 px-1.5 py-1 text-amber-300">
          {Array.from({ length: rating }).map((_, i) => (
            <svg key={i} className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.563.563 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
            </svg>
          ))}
        </div>
      ) : null}
      {loaded && duration ? (
        <div className="absolute bottom-1.5 right-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white/80">
          {duration}
        </div>
      ) : null}
    </div>
  );
}

export function FakeStageTag({ label, state }: { label: string; state: "active" | "done" | "waiting" }) {
  const className =
    state === "active"
      ? "bg-white/5 text-gray-300"
      : state === "done"
        ? "bg-emerald-500/10 text-emerald-400"
        : "bg-white/4 text-gray-600";
  return <span className={`rounded-md px-2 py-0.5 text-[11px] ${className}`}>{label}</span>;
}

export function FakeProgressBar({ fraction, className = "" }: { fraction: number | null; className?: string }) {
  return (
    <div className={`h-px overflow-hidden rounded-full bg-white/8 ${className}`}>
      {fraction === null ? (
        <div className="h-full w-full animate-pulse bg-blue-500/40" />
      ) : (
        <div
          className="h-full bg-blue-500 transition-[width] duration-300"
          style={{ width: `${Math.round(Math.min(fraction, 1) * 100)}%` }}
        />
      )}
    </div>
  );
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}
