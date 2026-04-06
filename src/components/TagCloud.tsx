import { useEffect } from "react";
import { motion } from "framer-motion";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useGalleryStore, TagCloudEntry } from "../store";

// Accent glow colours for the hover ring — cycled by index
const GLOWS: string[] = [
  "rgba(59,130,246,0.5)",
  "rgba(168,85,247,0.5)",
  "rgba(16,185,129,0.5)",
  "rgba(245,158,11,0.5)",
  "rgba(236,72,153,0.5)",
  "rgba(6,182,212,0.5)",
  "rgba(249,115,22,0.5)",
  "rgba(34,197,94,0.5)",
];

function pseudoRandom(seed: number): number {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

// Map cluster size to a tile size bucket (px)
function getTileSize(count: number, maxCount: number): number {
  if (maxCount === 0) return 72;
  const ratio = count / maxCount;
  if (ratio > 0.75) return 160;
  if (ratio > 0.45) return 128;
  if (ratio > 0.22) return 104;
  if (ratio > 0.08) return 88;
  return 72;
}

function TagButton({
  entry,
  index,
  maxCount,
  onSearch,
}: {
  entry: TagCloudEntry;
  index: number;
  maxCount: number;
  onSearch: (imageId: number) => void;
}) {
  const size = getTileSize(entry.count, maxCount);
  const glow = GLOWS[index % GLOWS.length];

  // Small random rotation for organic feel — larger tiles stay flatter
  const maxRot = size >= 128 ? 0 : size >= 104 ? 3 : size >= 88 ? 6 : 10;
  const rotation = (pseudoRandom(index * 7) - 0.5) * 2 * maxRot;

  const mt = Math.floor(pseudoRandom(index * 3) * 10) + 4;
  const mr = Math.floor(pseudoRandom(index * 5) * 12) + 4;
  const mb = Math.floor(pseudoRandom(index * 11) * 10) + 4;
  const ml = Math.floor(pseudoRandom(index * 13) * 12) + 4;

  const src = entry.thumbnail_path ? convertFileSrc(entry.thumbnail_path) : null;

  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.5, rotate: rotation * 2 }}
      animate={{ opacity: 1, scale: 1, rotate: rotation }}
      transition={{
        delay: index * 0.025,
        type: "spring",
        stiffness: 200,
        damping: 18,
      }}
      whileHover={{
        scale: 1.12,
        rotate: 0,
        transition: { type: "spring", stiffness: 400, damping: 22 },
      }}
      whileTap={{ scale: 0.92 }}
      onClick={() => onSearch(entry.representative_image_id)}
      title={`${entry.count} similar ${entry.count === 1 ? "photo" : "photos"}`}
      style={{
        width: size,
        height: size,
        margin: `${mt}px ${mr}px ${mb}px ${ml}px`,
        borderRadius: 12,
        border: "2px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.04)",
        cursor: "pointer",
        padding: 0,
        overflow: "hidden",
        position: "relative",
        flexShrink: 0,
        boxShadow: "none",
        transition: "border-color 0.15s, box-shadow 0.15s",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        el.style.borderColor = glow;
        el.style.boxShadow = `0 0 16px ${glow}, 0 0 32px ${glow.replace("0.5", "0.25")}`;
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        el.style.borderColor = "rgba(255,255,255,0.08)";
        el.style.boxShadow = "none";
      }}
    >
      {src ? (
        <img
          src={src}
          alt=""
          draggable={false}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      ) : (
        // Fallback placeholder when no thumbnail exists yet
        <div
          style={{
            width: "100%",
            height: "100%",
            background: "rgba(255,255,255,0.06)",
          }}
        />
      )}

      {/* Count badge — bottom-right corner */}
      <div
        style={{
          position: "absolute",
          bottom: 5,
          right: 5,
          background: "rgba(0,0,0,0.6)",
          color: "rgba(255,255,255,0.85)",
          fontSize: 10,
          fontWeight: 600,
          lineHeight: 1,
          padding: "3px 6px",
          borderRadius: 6,
          backdropFilter: "blur(4px)",
          pointerEvents: "none",
        }}
      >
        {entry.count}
      </div>
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

  const maxCount =
    tagCloudEntries.length > 0
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
          Visual clusters from your photos — sized by how many match
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
            <circle
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="2"
              strokeOpacity="0.2"
            />
            <path
              d="M4 12a8 8 0 018-8"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </motion.svg>
          <p className="text-[12px] text-white/20">Clustering your library…</p>
        </div>
      )}

      {/* Empty state */}
      {!tagCloudLoading && tagCloudEntries.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[13px] text-white/25 text-center max-w-xs leading-relaxed">
            No embeddings yet. Add a folder and wait for the embedding worker to
            finish, then come back here.
          </p>
        </div>
      )}

      {/* Cluster grid */}
      {!tagCloudLoading && tagCloudEntries.length > 0 && (
        <div className="flex flex-wrap justify-center px-12 pb-16 max-w-5xl w-full">
          {tagCloudEntries.map((entry, index) => (
            <TagButton
              key={entry.representative_image_id}
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
          Grouped by visual similarity · CLIP ViT-B/32
        </p>
      )}
    </div>
  );
}
