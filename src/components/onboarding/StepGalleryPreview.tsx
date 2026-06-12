import { useEffect, useState } from "react";
import { FakeTile } from "./fakes";

const TILE_COUNT = 12;
const REVEAL_MS = 350;

const TILE_PROPS: { favorite?: boolean; rating?: number; duration?: string }[] = [
  {},
  { favorite: true },
  {},
  { duration: "1:24" },
  { rating: 5 },
  {},
  { favorite: true, rating: 3 },
  {},
  { duration: "0:09" },
  {},
  { rating: 4 },
  {},
];

/// Placeholder tiles "loading in" one by one, looping, to show how the grid
/// fills while thumbnails are generated.
export function StepGalleryPreview() {
  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setRevealed((current) => (current >= TILE_COUNT + 4 ? 0 : current + 1));
    }, REVEAL_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <div>
      <p className="text-sm leading-relaxed text-gray-300">
        The gallery is a virtualized grid — it stays fast with hundreds of thousands of items. Tiles
        carry your favorites, star ratings, and video durations; hover for filename and quick actions.
      </p>

      <div className="mt-5 grid grid-cols-4 gap-1.5">
        {TILE_PROPS.map((props, i) => (
          <FakeTile key={i} index={i} loaded={i < revealed} {...props} />
        ))}
      </div>

      <div className="mt-6 divide-y divide-white/[0.05] text-xs leading-relaxed text-gray-500">
        <p className="py-2.5">
          <span className="text-gray-300">Click any tile</span> to open the lightbox — keyboard navigation,
          zoom, inline tag editing, ratings, and a full video player.
        </p>
        <p className="py-2.5">
          <span className="text-gray-300">The toolbar</span> filters by type, favorites, or rating, sorts by
          date/name/size, and switches grid density.
        </p>
      </div>
    </div>
  );
}
