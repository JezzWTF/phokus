import { useEffect, useState } from 'react'
import { FakeTile, ReplayButton } from './fakes'

const REVEAL_MS = 280

// Two rows (cols-4) keeps the explainer text visible without scrolling.
const TILE_PROPS: { favorite?: boolean; rating?: number; duration?: string }[] = [
  {},
  { favorite: true },
  {},
  { duration: '1:24' },
  { rating: 5 },
  { favorite: true, rating: 3 },
  { duration: '0:09' },
  {},
]

const TILE_COUNT = TILE_PROPS.length

/// Placeholder tiles "loading in" once (skeleton → image), then stopping fully
/// revealed with a replay control.
export function StepGalleryPreview() {
  const [revealed, setRevealed] = useState(0)

  useEffect(() => {
    if (revealed >= TILE_COUNT) return
    const timer = setTimeout(() => setRevealed((n) => n + 1), REVEAL_MS)
    return () => clearTimeout(timer)
  }, [revealed])

  const finished = revealed >= TILE_COUNT

  return (
    <div>
      <p className="text-sm leading-relaxed text-gray-300">
        The gallery is a virtualized grid — it stays fast with hundreds of thousands of items. Tiles
        carry your favorites, star ratings, and video durations; hover for filename and quick
        actions.
      </p>

      <div className="media-dark-surface mt-5 grid grid-cols-4 gap-1.5">
        {TILE_PROPS.map((props, i) => (
          <FakeTile key={i} index={i} loaded={i < revealed} {...props} />
        ))}
      </div>

      <div className="mt-6 flex items-start justify-between gap-4">
        <div className="light-theme:divide-gray-300/70 divide-y divide-white/[0.05] text-xs leading-relaxed text-gray-500">
          <p className="pb-2.5">
            <span className="text-gray-300">Click any tile</span> to open the lightbox — keyboard
            navigation, zoom, inline tag editing, ratings, and a full video player.
          </p>
          <p className="pt-2.5">
            <span className="text-gray-300">The toolbar</span> filters by type, favorites, or
            rating, sorts by date/name/size, and switches grid density.
          </p>
        </div>
        {finished ? <ReplayButton onClick={() => setRevealed(0)} /> : null}
      </div>
    </div>
  )
}
