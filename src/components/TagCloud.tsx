import { useEffect } from "react";
import { motion } from "framer-motion";
import { useGalleryStore, TagCloudEntry } from "../store";

// Accent color pairs: [rest, hover, glow]
const ACCENTS: [string, string, string][] = [
  ["rgba(96,165,250,0.5)",  "#93c5fd", "rgba(59,130,246,0.3)"],
  ["rgba(192,132,252,0.5)", "#d8b4fe", "rgba(168,85,247,0.3)"],
  ["rgba(52,211,153,0.5)",  "#6ee7b7", "rgba(16,185,129,0.3)"],
  ["rgba(251,191,36,0.5)",  "#fcd34d", "rgba(245,158,11,0.3)"],
  ["rgba(249,168,212,0.5)", "#fbcfe8", "rgba(236,72,153,0.3)"],
  ["rgba(103,232,249,0.5)", "#a5f3fc", "rgba(6,182,212,0.3)"],
  ["rgba(253,186,116,0.5)", "#fed7aa", "rgba(249,115,22,0.3)"],
  ["rgba(167,243,208,0.5)", "#bbf7d0", "rgba(34,197,94,0.3)"],
];

function pseudoRandom(seed: number): number {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

function getWeight(count: number, maxCount: number): 1 | 2 | 3 | 4 | 5 {
  if (maxCount === 0) return 1;
  const ratio = count / maxCount;
  if (ratio > 0.75) return 5;
  if (ratio > 0.45) return 4;
  if (ratio > 0.22) return 3;
  if (ratio > 0.08) return 2;
  return 1;
}

const FONT_SIZE: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 11, 2: 14, 3: 19, 4: 30, 5: 46 };
const FONT_WEIGHT: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 400, 2: 400, 3: 500, 4: 700, 5: 800 };
const LETTER_SPACING: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0.8, 2: 0.4, 3: 0, 4: -0.5, 5: -1.5 };
const PADDING: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "3px 8px", 2: "4px 10px", 3: "5px 13px", 4: "8px 18px", 5: "10px 22px",
};
const MAX_ROTATION: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 14, 2: 11, 3: 7, 4: 3, 5: 0 };

function TagButton({
  entry,
  index,
  maxCount,
  onSearch,
}: {
  entry: TagCloudEntry;
  index: number;
  maxCount: number;
  onSearch: (label: string) => void;
}) {
  const weight = getWeight(entry.count, maxCount);
  const accentIndex = (index * 3 + weight) % ACCENTS.length;
  const [restColor, hoverColor, glowColor] = ACCENTS[accentIndex];
  const rotation = (pseudoRandom(index * 7) - 0.5) * 2 * MAX_ROTATION[weight];

  const mt = Math.floor(pseudoRandom(index * 3) * 14) + 3;
  const mr = Math.floor(pseudoRandom(index * 5) * 20) + 6;
  const mb = Math.floor(pseudoRandom(index * 11) * 14) + 3;
  const ml = Math.floor(pseudoRandom(index * 13) * 20) + 6;

  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.4, rotate: rotation * 2 }}
      animate={{ opacity: 1, scale: 1, rotate: rotation }}
      transition={{
        delay: index * 0.014,
        type: "spring",
        stiffness: 180,
        damping: 16,
      }}
      whileHover={{
        scale: 1.2,
        rotate: 0,
        transition: { type: "spring", stiffness: 400, damping: 22 },
      }}
      whileTap={{ scale: 0.9 }}
      style={{
        fontSize: FONT_SIZE[weight],
        fontWeight: FONT_WEIGHT[weight],
        letterSpacing: LETTER_SPACING[weight],
        padding: PADDING[weight],
        margin: `${mt}px ${mr}px ${mb}px ${ml}px`,
        color: restColor,
        borderRadius: 10,
        border: "1px solid transparent",
        background: "transparent",
        cursor: "pointer",
        userSelect: "none",
        transition: "color 0.15s, text-shadow 0.15s, background 0.15s, border-color 0.15s",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        el.style.color = hoverColor;
        el.style.textShadow = `0 0 20px ${glowColor}, 0 0 40px ${glowColor}`;
        el.style.background = glowColor.replace("0.3", "0.1");
        el.style.borderColor = glowColor.replace("0.3", "0.25");
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        el.style.color = restColor;
        el.style.textShadow = "none";
        el.style.background = "transparent";
        el.style.borderColor = "transparent";
      }}
      onClick={() => onSearch(entry.label)}
      title={`${entry.count} matching ${entry.count === 1 ? "photo" : "photos"}`}
    >
      {entry.label}
    </motion.button>
  );
}

export function TagCloud() {
  const tagCloudEntries = useGalleryStore((state) => state.tagCloudEntries);
  const tagCloudLoading = useGalleryStore((state) => state.tagCloudLoading);
  const loadTagCloud = useGalleryStore((state) => state.loadTagCloud);
  const searchByTag = useGalleryStore((state) => state.searchByTag);
  const selectedFolderId = useGalleryStore((state) => state.selectedFolderId);

  useEffect(() => {
    void loadTagCloud();
  }, [selectedFolderId]);

  const maxCount = tagCloudEntries.length > 0
    ? Math.max(...tagCloudEntries.map((e) => e.count))
    : 1;

  return (
    <div className="flex-1 flex flex-col items-center min-h-0 overflow-y-auto">
      {/* Header */}
      <motion.div
        className="text-center pt-14 pb-8 shrink-0"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <h2 className="text-[22px] font-semibold text-white/70 tracking-tight mb-2">
          Explore your library
        </h2>
        <p className="text-[13px] text-white/25">
          Topics found in your photos — sized by how many match
        </p>
      </motion.div>

      {/* Loading */}
      {tagCloudLoading && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <motion.svg
            className="w-8 h-8 text-white/20"
            viewBox="0 0 24 24"
            fill="none"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          >
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeOpacity="0.2" />
            <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </motion.svg>
          <p className="text-[12px] text-white/20">Analysing your library with CLIP…</p>
        </div>
      )}

      {/* Empty state */}
      {!tagCloudLoading && tagCloudEntries.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[13px] text-white/25 text-center max-w-xs leading-relaxed">
            No embeddings yet. Add a folder and wait for the embedding worker to finish,
            then come back here.
          </p>
        </div>
      )}

      {/* Cloud */}
      {!tagCloudLoading && tagCloudEntries.length > 0 && (
        <div className="flex flex-wrap justify-center px-12 pb-16 max-w-5xl w-full">
          {tagCloudEntries.map((entry, index) => (
            <TagButton
              key={entry.label}
              entry={entry}
              index={index}
              maxCount={maxCount}
              onSearch={searchByTag}
            />
          ))}
        </div>
      )}

      {!tagCloudLoading && tagCloudEntries.length > 0 && (
        <p className="shrink-0 pb-8 text-[11px] text-white/12 text-center">
          Ranked by visual similarity · CLIP ViT-B/32
        </p>
      )}
    </div>
  );
}
