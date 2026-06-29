import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useGalleryStore } from "../store";
import { Tooltip } from "./Tooltip";

type Rgb = [number, number, number];

// Representative colors for the quick-pick swatches. Each is just an RGB the
// distance filter matches against — not a hard bucket.
const SWATCHES: { name: string; rgb: Rgb }[] = [
  { name: "Red", rgb: [226, 59, 59] },
  { name: "Orange", rgb: [232, 134, 46] },
  { name: "Yellow", rgb: [242, 207, 46] },
  { name: "Green", rgb: [76, 175, 80] },
  { name: "Teal", rgb: [31, 182, 166] },
  { name: "Blue", rgb: [59, 125, 216] },
  { name: "Purple", rgb: [139, 92, 246] },
  { name: "Pink", rgb: [236, 72, 153] },
  { name: "Brown", rgb: [139, 90, 43] },
  { name: "Black", rgb: [26, 26, 26] },
  { name: "White", rgb: [245, 245, 245] },
  { name: "Gray", rgb: [154, 160, 166] },
];

function rgbEquals(a: Rgb | null, b: Rgb): boolean {
  return a !== null && a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

function fromHex(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function ColorFilter() {
  const colorFilter = useGalleryStore((state) => state.colorFilter);
  const setColorFilter = useGalleryStore((state) => state.setColorFilter);
  const colorBackfill = useGalleryStore((state) => state.colorBackfill);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const isActive = colorFilter !== null;
  const isCustom = isActive && !SWATCHES.some((swatch) => rgbEquals(colorFilter, swatch.rgb));

  // Collapse the panel when clicking elsewhere.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div ref={ref} className="relative ml-1 flex shrink-0 items-center border-l border-white/6 pl-2">
      {/* Trigger — a single palette icon; shows the active color as a dot when a
          filter is applied so the collapsed state still communicates it. */}
      <Tooltip label={isActive ? "Color filter active" : "Filter by color"} delay={400}>
        <button
          className={`relative flex items-center gap-1.5 rounded-lg px-2 py-1.5 transition-colors ${
            open || isActive ? "bg-white/10 text-white" : "text-gray-500 hover:bg-white/5 hover:text-gray-200"
          }`}
          onClick={() => setOpen((value) => !value)}
          aria-label="Filter by color"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6}
              d="M12 3a9 9 0 100 18c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.39-.61-.39-1 0-.83.67-1.5 1.5-1.5H16a5 5 0 005-5c0-4.42-4.03-8-9-8z" />
            <circle cx="7.5" cy="11.5" r="1" fill="currentColor" stroke="none" />
            <circle cx="11.5" cy="7.5" r="1" fill="currentColor" stroke="none" />
            <circle cx="15.5" cy="9.5" r="1" fill="currentColor" stroke="none" />
          </svg>
          {isActive ? (
            <span
              className="h-3 w-3 rounded-full border border-white/30"
              style={{ backgroundColor: toHex(colorFilter as Rgb) }}
            />
          ) : null}
        </button>
      </Tooltip>

      <AnimatePresence initial={false}>
        {open ? (
          // Right-aligned popover so it never widens the toolbar row or gets
          // pushed off-screen on narrow windows. Swatches wrap into a compact
          // grid instead of a single long horizontal strip.
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            className="absolute right-0 top-full z-30 mt-2 w-max rounded-xl border border-white/10 bg-gray-950/98 p-2.5 shadow-2xl backdrop-blur light-theme:border-gray-700/50"
          >
            <div className="grid grid-cols-7 gap-1.5">
              {SWATCHES.map((swatch) => {
                const active = rgbEquals(colorFilter, swatch.rgb);
                return (
                  <Tooltip label= {swatch.name} followCursor>
                  <button
                    key={swatch.name}
                    aria-label={`Filter by ${swatch.name}`}
                    className={`h-5 w-5 shrink-0 rounded-full border transition-transform ${
                      active ? "scale-110 border-white/40 ring-2 ring-white/70" : "border-white/15 hover:scale-110"
                    }`}
                    style={{ backgroundColor: toHex(swatch.rgb) }}
                    onClick={() => setColorFilter(active ? null : swatch.rgb)}
                  />
                </Tooltip>
                );
              })}
              <Tooltip label= "Custom Colour" followCursor>
              {/* Custom color picker — rainbow until a custom color is chosen. */}
              <label
                className={`relative h-5 w-5 shrink-0 cursor-pointer overflow-hidden rounded-full border ${
                  isCustom ? "border-white/40 ring-2 ring-white/70" : "border-white/15 hover:scale-110"
                }`}
                style={
                  isCustom
                    ? { backgroundColor: toHex(colorFilter as Rgb) }
                    : { background: "conic-gradient(red, orange, yellow, lime, cyan, blue, magenta, red)" }
                }
              >
                <input
                  type="color"
                  className="absolute inset-0 cursor-pointer opacity-0"
                  value={colorFilter ? toHex(colorFilter) : "#3b7dd8"}
                  onChange={(event) => setColorFilter(fromHex(event.target.value))}
                />
              </label></Tooltip>
            </div>

            {isActive || (colorBackfill && colorBackfill.total > 0) ? (
              <div className="mt-2 flex items-center justify-between gap-3 border-t border-white/6 pt-2 light-theme:border-gray-700/40">
                {colorBackfill && colorBackfill.total > 0 ? (
                  <span
                    className="text-[10px] text-gray-600"
                    title="Sampling colors from existing thumbnails — color search fills in as this runs"
                  >
                    sampling {colorBackfill.processed.toLocaleString()}/{colorBackfill.total.toLocaleString()}
                  </span>
                ) : <span />}
                {isActive ? (
                  <button
                    className="shrink-0 rounded px-1 text-[11px] text-gray-500 transition-colors hover:text-gray-200"
                    onClick={() => setColorFilter(null)}
                    title="Clear color filter"
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
