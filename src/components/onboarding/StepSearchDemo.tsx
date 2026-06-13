import { useEffect, useState } from "react";
import { SEARCH_RESULTS } from "./fakes";

const DEMOS = [
  {
    query: "beach-day_042.jpg",
    mode: "Filename",
    description: "Plain text matches file names — the default, instant search.",
    results: SEARCH_RESULTS.filename,
  },
  {
    query: "/s golden sunset over water",
    mode: "Semantic",
    description: "Describe what's in the picture. Visual embeddings find matches even when filenames say nothing.",
    results: SEARCH_RESULTS.semantic,
  },
  {
    query: "/t landscape",
    mode: "Tags",
    description: "Search by AI or manual tags. Autocomplete suggests tags as you type.",
    results: SEARCH_RESULTS.tags,
  },
] as const;

const TYPE_MS = 55;
const HOLD_MS = 2600;

/// A mock search bar that "types" each demo query, shows fake results, and
/// cycles to the next mode.
export function StepSearchDemo() {
  const [demoIndex, setDemoIndex] = useState(0);
  const [typed, setTyped] = useState(0);

  const demo = DEMOS[demoIndex];

  useEffect(() => {
    if (typed < demo.query.length) {
      const timer = setTimeout(() => setTyped((n) => n + 1), TYPE_MS);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => {
      setDemoIndex((i) => (i + 1) % DEMOS.length);
      setTyped(0);
    }, HOLD_MS);
    return () => clearTimeout(timer);
  }, [typed, demo.query.length]);

  const fullyTyped = typed >= demo.query.length;

  return (
    <div>
      <p className="text-sm leading-relaxed text-gray-300">
        One search bar, three modes — picked by prefix. No prefix searches filenames, <code className="rounded bg-white/[0.07] px-1 py-0.5 text-[11px] text-gray-200">/s</code> searches
        by meaning, <code className="rounded bg-white/[0.07] px-1 py-0.5 text-[11px] text-gray-200">/t</code> searches tags.
      </p>

      {/* Mock search bar */}
      <div className="mt-5 flex items-center gap-2.5 rounded-lg border border-white/10 bg-white/[0.04] px-3.5 py-2.5">
        <svg className="h-4 w-4 shrink-0 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <span className="text-sm text-white">
          {demo.query.slice(0, typed)}
          <span className="animate-pulse text-gray-500">|</span>
        </span>
        <span className="ml-auto shrink-0 rounded-md border border-sky-400/25 bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-300">
          {demo.mode}
        </span>
      </div>

      {/* Fake results */}
      <div className={`mt-3 grid grid-cols-3 gap-1.5 transition-opacity duration-300 ${fullyTyped ? "opacity-100" : "opacity-30"}`}>
        {demo.results.map((src, i) => (
          <div key={`${demoIndex}-${i}`} className="aspect-square overflow-hidden rounded-xl bg-white/[0.04]">
            <img src={src} alt="" className="h-full w-full object-cover" />
          </div>
        ))}
      </div>

      <p className="mt-4 min-h-10 text-xs leading-relaxed text-gray-500">{demo.description}</p>
    </div>
  );
}
