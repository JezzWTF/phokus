import { useEffect, useState } from 'react'
import { ReplayButton, SEARCH_RESULTS } from './fakes'

const DEMOS = [
  {
    query: 'beach-day_042.jpg',
    mode: 'Filename',
    description: 'Plain text matches file names — the default, instant search. One name, one file.',
    results: SEARCH_RESULTS.filename,
  },
  {
    query: '/s golden sunset over water',
    mode: 'Semantic',
    description:
      "Describe what's in the picture. Visual embeddings find matches even when filenames say nothing.",
    results: SEARCH_RESULTS.semantic,
  },
  {
    query: '/t landscape',
    mode: 'Tags',
    description: 'Search by AI or manual tags. Autocomplete suggests tags as you type.',
    results: SEARCH_RESULTS.tags,
  },
] as const

const TYPE_MS = 55
const HOLD_MS = 2600

/// Types each demo query, shows matching results, advances through all three
/// modes once, then stops on the last with a replay control.
export function StepSearchDemo() {
  const [demoIndex, setDemoIndex] = useState(0)
  const [typed, setTyped] = useState(0)
  const [finished, setFinished] = useState(false)

  const demo = DEMOS[demoIndex]
  const isLastDemo = demoIndex === DEMOS.length - 1

  useEffect(() => {
    if (finished) return
    if (typed < demo.query.length) {
      const timer = setTimeout(() => setTyped((n) => n + 1), TYPE_MS)
      return () => clearTimeout(timer)
    }
    // Fully typed: hold, then advance — or finish on the last demo.
    const timer = setTimeout(() => {
      if (isLastDemo) {
        setFinished(true)
      } else {
        setDemoIndex((i) => i + 1)
        setTyped(0)
      }
    }, HOLD_MS)
    return () => clearTimeout(timer)
  }, [typed, demo.query.length, isLastDemo, finished])

  const replay = () => {
    setDemoIndex(0)
    setTyped(0)
    setFinished(false)
  }

  const fullyTyped = typed >= demo.query.length

  return (
    <div>
      <p className="text-sm leading-relaxed text-gray-300">
        One search bar, three modes — picked by prefix. No prefix searches filenames,{' '}
        <code className="light-theme:bg-gray-800 light-theme:text-gray-100 rounded bg-gray-900 px-1 py-0.5 text-[11px] text-gray-200">
          /s
        </code>{' '}
        searches by meaning,{' '}
        <code className="light-theme:bg-gray-800 light-theme:text-gray-100 rounded bg-gray-900 px-1 py-0.5 text-[11px] text-gray-200">
          /t
        </code>{' '}
        searches tags.
      </p>

      {/* Mock search bar */}
      <div className="light-theme:border-gray-300/70 light-theme:bg-gray-900 mt-5 flex items-center gap-2.5 rounded-lg border border-white/10 bg-gray-900/50 px-3.5 py-2.5">
        <svg
          className="h-4 w-4 shrink-0 text-gray-500"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
          />
        </svg>
        <span className="text-sm text-white">
          {demo.query.slice(0, typed)}
          {!finished ? <span className="animate-pulse text-gray-500">|</span> : null}
        </span>
        <span className="light-theme:border-sky-600/40 light-theme:bg-sky-100 light-theme:text-sky-700 ml-auto shrink-0 rounded-md border border-sky-400/25 bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-300">
          {demo.mode}
        </span>
      </div>

      {/* Results — hidden (not greyed) until the query finishes typing, so it
          doesn't look like the app is reading the user's mind. Space is held
          by the invisible tiles so the layout doesn't jump when they appear.
          Keyed by demoIndex so switching demos remounts the row fresh at
          opacity-0 instead of fading the new images out from the previous
          demo's visible state. */}
      <div
        key={demoIndex}
        className={`media-dark-surface mt-3 flex flex-wrap justify-center gap-1.5 transition-opacity duration-300 ${fullyTyped ? 'opacity-100' : 'opacity-0'}`}
      >
        {demo.results.map((src, i) => (
          <div key={i} className="aspect-square w-36 overflow-hidden rounded-xl bg-white/[0.04]">
            <img src={src} alt="" className="h-full w-full object-cover" />
          </div>
        ))}
      </div>

      <div className="mt-4 flex min-h-10 items-start justify-between gap-4">
        <p className="text-xs leading-relaxed text-gray-500">{demo.description}</p>
        {finished ? <ReplayButton onClick={replay} /> : null}
      </div>
    </div>
  )
}
