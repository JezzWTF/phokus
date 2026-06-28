import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { convertFileSrc } from "@tauri-apps/api/core";
import { ExploreTagEntry, TagCloudEntry, useGalleryStore } from "../store";
import { FolderScopeDropdown } from "./FolderScopeDropdown";
import { Tooltip } from "./Tooltip";

const ACCENTS = [
  "#60a5fa",
  "#c084fc",
  "#4ade80",
  "#fbbf24",
  "#f472b4",
  "#2dd4bf",
  "#fb923c",
  "#a78bfa",
  "#34d399",
  "#f87171",
];

// Darker variants of each accent for the light theme — the bright originals are
// tuned for dark cards and wash out on the cream background.
const LIGHT_ACCENTS = [
  "#2563eb",
  "#9333ea",
  "#16a34a",
  "#d97706",
  "#db2777",
  "#0d9488",
  "#ea580c",
  "#7c3aed",
  "#059669",
  "#dc2626",
];

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function seeded(n: number): number {
  const x = Math.sin(n * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

interface PlacedNode {
  entry: TagCloudEntry;
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
  zIndex: number;
  accent: string;
  driftX: number;
  driftY: number;
  driftDuration: number;
  rotateSeed: number;
}

function buildCloud(entries: TagCloudEntry[], containerW: number, containerH: number): PlacedNode[] {
  if (!entries.length || containerW <= 0 || containerH <= 0) return [];

  const maxCount = Math.max(...entries.map((e) => e.count));
  const cx = containerW / 2;
  const cy = containerH / 2;
  const n = entries.length;
  const ASPECT = 0.72;
  const PAD = 18;

  // Card width scales with image count; the sub-linear exponent (< 1) widens the
  // gap so the busiest clusters read as clearly larger and more prominent.
  const rawWidth = (count: number) => {
    const ratio = Math.max(count / maxCount, 0.05);
    return 92 + Math.pow(ratio, 0.65) * 158; // ~92–250px before fit scaling
  };

  // Shrink every card uniformly when their padded footprint can't fit the
  // canvas, so overlap resolution can actually pull them apart instead of
  // settling into a pile. (0.6 leaves headroom for imperfect packing.)
  const totalArea = entries.reduce((sum, e) => {
    const w = rawWidth(e.count);
    return sum + (w + PAD) * (w * ASPECT + PAD);
  }, 0);
  const usableArea = containerW * containerH * 0.6;
  const fit = totalArea > usableArea ? Math.sqrt(usableArea / totalArea) : 1;

  const spreadX = containerW * 0.44;
  const spreadY = containerH * 0.4;

  // 1. Seed positions on a phyllotaxis spiral, sized by count.
  const nodes: PlacedNode[] = entries.map((entry, i) => {
    const w = rawWidth(entry.count) * fit;
    const h = w * ASPECT;
    const radialRatio = Math.sqrt((i + 0.5) / n);
    const angle = i * GOLDEN_ANGLE;

    return {
      entry,
      index: i,
      x: cx + Math.cos(angle) * radialRatio * spreadX,
      y: cy + Math.sin(angle) * radialRatio * spreadY,
      w,
      h,
      // Bigger (busier) clusters stack above smaller ones, so they stay
      // clickable even if a sliver of overlap survives.
      zIndex: Math.round(w),
      accent: ACCENTS[i % ACCENTS.length],
      driftX: (seeded(i + 11) - 0.5) * 18,
      driftY: (seeded(i + 17) - 0.5) * 14,
      driftDuration: 8 + seeded(i + 23) * 7,
      rotateSeed: (seeded(i + 31) - 0.5) * 4,
    };
  });

  // 2. Resolve overlaps by pushing pairs apart, clamping inside the canvas every
  //    pass so edge cards settle in-bounds instead of being shoved out and
  //    re-overlapping there.
  const marginX = 14;
  const marginY = 14;
  for (let iter = 0; iter < 160; iter++) {
    for (let a = 0; a < nodes.length; a++) {
      const na = nodes[a];
      for (let b = a + 1; b < nodes.length; b++) {
        const nb = nodes[b];
        const dx = nb.x - na.x;
        const dy = nb.y - na.y;
        const overlapX = (na.w + nb.w) / 2 + PAD - Math.abs(dx);
        const overlapY = (na.h + nb.h) / 2 + PAD - Math.abs(dy);
        if (overlapX <= 0 || overlapY <= 0) continue;
        // Push along the smaller overlap axis (ternary yields ±1 so coincident
        // cards still separate rather than stalling at a zero push).
        if (overlapX < overlapY) {
          const push = (overlapX / 2) * (dx >= 0 ? 1 : -1);
          nb.x += push;
          na.x -= push;
        } else {
          const push = (overlapY / 2) * (dy >= 0 ? 1 : -1);
          nb.y += push;
          na.y -= push;
        }
      }
    }
    for (const node of nodes) {
      node.x = Math.min(Math.max(node.x, node.w / 2 + marginX), containerW - node.w / 2 - marginX);
      node.y = Math.min(Math.max(node.y, node.h / 2 + marginY), containerH - node.h / 2 - marginY);
    }
  }

  return nodes;
}

function CloudCard({ node, onOpen, animated }: { node: PlacedNode; onOpen: (imageIds: number[]) => void; animated: boolean }) {
  const src = node.entry.thumbnail_path ? convertFileSrc(node.entry.thumbnail_path) : null;
  const { w, h, accent } = node;
  const driftTransition = {
    duration: node.driftDuration,
    ease: "easeInOut" as const,
    delay: seeded(node.index + 41) * 1.6,
    repeat: 1,
    repeatType: "reverse" as const,
  };

  return (
    <motion.button
      className="explore-cluster-card group absolute overflow-hidden rounded-2xl border border-white/8 bg-white/[0.04] text-left shadow-[0_8px_28px_rgba(0,0,0,0.38)] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
      style={{ width: w, height: h, left: node.x - w / 2, top: node.y - h / 2, zIndex: node.zIndex }}
      initial={animated ? { opacity: 0, scale: 0.82, rotate: node.rotateSeed } : { opacity: 0, scale: 0.96 }}
      animate={
        animated
          ? {
              opacity: 1,
              scale: 1,
              x: [0, node.driftX * 0.65, 0],
              y: [0, node.driftY * 0.65, 0],
              rotate: [node.rotateSeed, node.rotateSeed + 0.8, node.rotateSeed],
            }
          : { opacity: 1, scale: 1, rotate: node.rotateSeed }
      }
      transition={
        animated
          ? {
              opacity: { duration: 0.24, delay: Math.min(node.index * 0.024, 0.45) },
              scale: { duration: 0.24, delay: Math.min(node.index * 0.024, 0.45) },
              x: driftTransition,
              y: { ...driftTransition, duration: node.driftDuration + 1.2, delay: seeded(node.index + 51) * 1.6 },
              rotate: { ...driftTransition, duration: node.driftDuration + 0.8, delay: seeded(node.index + 61) * 1.2 },
            }
          : { opacity: { duration: 0.18, delay: Math.min(node.index * 0.016, 0.28) }, scale: { duration: 0.18, delay: Math.min(node.index * 0.016, 0.28) } }
      }
      whileHover={{ scale: 1.06, rotate: 0, zIndex: 500, transition: { duration: 0.18 } }}
      onClick={() => onOpen(node.entry.image_ids)}
      title={`Open cluster — ${node.entry.count.toLocaleString()} ${node.entry.count === 1 ? "image" : "images"}`}
    >
      {src ? (
        <img
          src={src}
          alt=""
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          draggable={false}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.07] to-transparent" />
      )}
      <div className="explore-cluster-overlay absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
      {/* Accent glow on hover */}
      <div
        className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: `radial-gradient(ellipse at bottom, ${accent}25, transparent 70%)` }}
      />
      <div className="absolute inset-x-0 bottom-0 p-3">
        <div className="explore-cluster-rule mb-2 h-px rounded-full" style={{ background: `linear-gradient(to right, ${accent}80, transparent)` }} />
        <p className="explore-cluster-label text-[9px] uppercase tracking-[0.18em] text-white/35">Cluster</p>
        <p className="explore-cluster-count text-base font-semibold leading-none text-white">{node.entry.count.toLocaleString()}</p>
      </div>
      {/* Anchored to the card corner (not in the count's flex row) so a wide
          count can't push it past the edge on small cards. */}
      <span
        className="explore-cluster-open absolute bottom-3 right-3 rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-[0.1em] opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        style={{ borderColor: `${accent}50`, color: accent, backgroundColor: `${accent}12` }}
      >
        Open
      </span>
    </motion.button>
  );
}

// Actual tag cloud — word size driven by log-scaled frequency
function TagWord({
  entry,
  index,
  logMin,
  logRange,
  onSearch,
}: {
  entry: ExploreTagEntry;
  index: number;
  logMin: number;
  logRange: number;
  onSearch: (tag: string) => void;
}) {
  const theme = useGalleryStore((state) => state.theme);
  const isLight = theme === "subtle-light";
  const ratio = logRange > 0 ? (Math.log(Math.max(entry.count, 1)) - logMin) / logRange : 0.5;
  const fontSize = 11 + ratio * 28; // 11px – 39px
  const accent = (isLight ? LIGHT_ACCENTS : ACCENTS)[index % ACCENTS.length];
  const tilt = (seeded(index + 5) - 0.5) * 7;
  // Faint low-frequency words read fine as subtle white-on-dark, but the same low
  // opacity is unreadable on the light theme's cream, so raise the floor there.
  const minOpacity = isLight ? 0.6 : 0.4;

  return (
    <Tooltip
      label={`${entry.tag} — ${entry.count.toLocaleString()} ${entry.count === 1 ? "image" : "images"}`}
      followCursor
      delay={250}
    >
      <motion.button
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: minOpacity + ratio * (1 - minOpacity), scale: 1 }}
        transition={{ delay: Math.min(index * 0.008, 0.55), duration: 0.22 }}
        whileHover={{ scale: 1.2, opacity: 1, rotate: 0, transition: { duration: 0.14 } }}
        className="explore-tag-word group inline-flex items-center gap-1 rounded-full px-2 py-1 transition-colors hover:bg-white/[0.07]"
        style={{ fontSize, rotate: tilt }}
        onClick={() => onSearch(entry.tag)}
      >
        <span
          className="font-medium leading-none"
          style={{ color: ratio > 0.55 ? accent : isLight ? "#4b5563" : "rgba(255,255,255,0.82)" }}
        >
          {entry.tag}
        </span>
        <span
          className="rounded-full px-1.5 py-0.5 text-[9px] tabular-nums opacity-0 transition-opacity group-hover:opacity-100"
          style={{ backgroundColor: `${accent}22`, color: accent }}
        >
          {entry.count.toLocaleString()}
        </span>
      </motion.button>
    </Tooltip>
  );
}

function Spinner() {
  return (
    <motion.div
      className="explore-spinner h-5 w-5 rounded-full border-2 border-white/15 border-t-white/50"
      animate={{ rotate: 360 }}
      transition={{ duration: 0.85, repeat: Infinity, ease: "linear" }}
    />
  );
}

// Separate component so its useLayoutEffect fires when the canvas is actually
// mounted — not at TagCloud mount time when the container may still be hidden
// behind a loading state.
function ClusterCloud({
  entries,
  onOpen,
}: {
  entries: TagCloudEntry[];
  onOpen: (imageIds: number[]) => void;
}) {
  const reducedMotion = useReducedMotion();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setCanvasSize({ w: r.width, h: r.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const nodes = useMemo(
    () => buildCloud(entries, canvasSize.w, canvasSize.h),
    [entries, canvasSize.w, canvasSize.h],
  );

  return (
    <div ref={canvasRef} className="relative isolate min-h-0 flex-1 overflow-hidden">
      <div className="explore-cluster-grid pointer-events-none absolute inset-0 opacity-[0.07] [background-image:radial-gradient(circle,rgba(255,255,255,0.6)_1px,transparent_1px)] [background-size:28px_28px]" />
      {nodes.map((node) => (
        <CloudCard
          key={`${node.entry.representative_image_id}:${node.index}`}
          node={node}
          onOpen={onOpen}
          animated={!reducedMotion && node.index < 12}
        />
      ))}
    </div>
  );
}

// A flat, manageable row for a single tag — rename (which doubles as merge when
// the new name already exists) and delete across the whole library.
function TagManageRow({
  entry,
  onSearch,
  onRename,
  onDelete,
}: {
  entry: ExploreTagEntry;
  onSearch: (tag: string) => void;
  onRename: (from: string, to: string) => Promise<void>;
  onDelete: (tag: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(entry.tag);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setValue(entry.tag);
      setTimeout(() => inputRef.current?.select(), 0);
    }
  }, [editing, entry.tag]);

  const commitRename = async () => {
    const next = value.trim();
    if (!next || next === entry.tag) {
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      await onRename(entry.tag, next);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="group flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-white/[0.04]">
      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            ref={inputRef}
            className="w-full rounded border border-white/10 bg-white/10 px-2 py-1 text-sm text-white outline-none ring-1 ring-blue-500/40"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); void commitRename(); }
              if (e.key === "Escape") setEditing(false);
            }}
            disabled={busy}
          />
        ) : (
          <button
            className="truncate text-left text-sm text-white/85 transition-colors hover:text-white"
            onClick={() => onSearch(entry.tag)}
            title="Search this tag"
          >
            {entry.tag}
          </button>
        )}
      </div>
      <span className="shrink-0 text-xs tabular-nums text-white/30">{entry.count.toLocaleString()}</span>

      {editing ? (
        <div className="flex shrink-0 items-center gap-1">
          <button
            className="rounded-md bg-blue-500/20 px-2 py-1 text-[11px] text-blue-200 transition-colors hover:bg-blue-500/30 disabled:opacity-50"
            onClick={() => void commitRename()}
            disabled={busy || !value.trim()}
            title="Rename (merges into the target if it already exists)"
          >
            Save
          </button>
          <button
            className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-white/50 transition-colors hover:bg-white/5 hover:text-white/80"
            onClick={() => setEditing(false)}
            disabled={busy}
          >
            Cancel
          </button>
        </div>
      ) : confirming ? (
        <div className="flex shrink-0 items-center gap-1">
          <button
            className="rounded-md bg-red-500/20 px-2 py-1 text-[11px] text-red-300 transition-colors hover:bg-red-500/30 disabled:opacity-50"
            onClick={async () => { setBusy(true); try { await onDelete(entry.tag); setConfirming(false); } finally { setBusy(false); } }}
            disabled={busy}
          >
            Delete
          </button>
          <button
            className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-white/50 transition-colors hover:bg-white/5 hover:text-white/80"
            onClick={() => setConfirming(false)}
            disabled={busy}
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <button
            className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-white/60 transition-colors hover:bg-white/8 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80"
            onClick={() => setEditing(true)}
            title="Rename or merge into another tag"
          >
            Rename
          </button>
          <button
            className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-white/60 transition-colors hover:bg-red-500/10 hover:text-red-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/80"
            onClick={() => setConfirming(true)}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

function TagManageList({
  entries,
  onSearch,
  onRename,
  onDelete,
}: {
  entries: ExploreTagEntry[];
  onSearch: (tag: string) => void;
  onRename: (from: string, to: string) => Promise<void>;
  onDelete: (tag: string) => Promise<void>;
}) {
  return (
    <div className="mx-auto w-full max-w-2xl overflow-y-auto px-6 py-6">
      <p className="mb-3 px-3 text-[11px] leading-relaxed text-white/30">
        Rename a tag to clean it up, or rename it to an existing tag's name to merge them. Delete
        removes a tag from every image. These changes apply across your whole library.
      </p>
      <div className="divide-y divide-white/[0.05]">
        {entries.map((entry) => (
          <TagManageRow
            key={entry.tag}
            entry={entry}
            onSearch={onSearch}
            onRename={onRename}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}

export function TagCloud() {
  const exploreMode = useGalleryStore((state) => state.exploreMode);
  const setExploreMode = useGalleryStore((state) => state.setExploreMode);
  const tagCloudEntries = useGalleryStore((state) => state.tagCloudEntries);
  const tagCloudLoading = useGalleryStore((state) => state.tagCloudLoading);
  const loadTagCloud = useGalleryStore((state) => state.loadTagCloud);
  const exploreTagEntries = useGalleryStore((state) => state.exploreTagEntries);
  const exploreTagLoading = useGalleryStore((state) => state.exploreTagLoading);
  const loadExploreTags = useGalleryStore((state) => state.loadExploreTags);
  const showVisualCluster = useGalleryStore((state) => state.showVisualCluster);
  const searchForTag = useGalleryStore((state) => state.searchForTag);
  const renameTag = useGalleryStore((state) => state.renameTag);
  const deleteTag = useGalleryStore((state) => state.deleteTag);
  const selectedFolderId = useGalleryStore((state) => state.selectedFolderId);
  const [manageTags, setManageTags] = useState(false);
  const handleDeleteTag = async (tag: string) => { await deleteTag(tag); };

  useEffect(() => {
    if (exploreMode === "visual") void loadTagCloud();
    else void loadExploreTags();
  }, [exploreMode, selectedFolderId, loadTagCloud, loadExploreTags]);

  const { logMin, logRange } = useMemo(() => {
    if (!exploreTagEntries.length) return { logMin: 0, logRange: 1 };
    const logs = exploreTagEntries.map((e) => Math.log(Math.max(e.count, 1)));
    const lo = Math.min(...logs);
    const hi = Math.max(...logs);
    return { logMin: lo, logRange: hi - lo || 1 };
  }, [exploreTagEntries]);

  const loading = exploreMode === "visual" ? tagCloudLoading : exploreTagLoading;
  const hasEntries = exploreMode === "visual" ? tagCloudEntries.length > 0 : exploreTagEntries.length > 0;
  const entryCount = exploreMode === "visual" ? tagCloudEntries.length : exploreTagEntries.length;

  return (
    <div className="explore-view flex min-h-0 flex-1 flex-col overflow-hidden bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.08),transparent_50%),radial-gradient(ellipse_at_80%_75%,rgba(168,85,247,0.07),transparent_40%),#07080f]">
      {/* Header — `relative z-10` keeps the folder-scope dropdown above the
          cluster canvas, whose cards use a high z-index of their own. */}
      <div className="explore-header relative z-10 shrink-0 border-b border-white/[0.05] px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="explore-title text-[15px] font-semibold text-white">Explore</h2>
            <p className="explore-subtitle mt-0.5 truncate text-[11px] text-white/30">
              {loading
                ? exploreMode === "visual" ? "Computing visual clusters…" : "Loading tags…"
                : hasEntries
                  ? exploreMode === "visual"
                    ? `${entryCount} cluster${entryCount !== 1 ? "s" : ""} — click any to open`
                    : `${entryCount} tag${entryCount !== 1 ? "s" : ""} — click any to search`
                  : exploreMode === "visual"
                    ? "No clusters — images need embeddings first"
                    : "No tags — run the AI tagger or add tags manually"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {exploreMode === "tags" && hasEntries ? (
              <button
                className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                  manageTags
                    ? "border-white/15 bg-white/10 text-white"
                    : "border-white/8 bg-white/[0.03] text-gray-500 hover:text-gray-300"
                }`}
                onClick={() => setManageTags((v) => !v)}
              >
                {manageTags ? "Done" : "Manage"}
              </button>
            ) : null}
            <FolderScopeDropdown />
            <div className="explore-mode-toggle flex rounded-lg border border-white/8 bg-white/[0.03] p-0.5">
              <button
                className={`explore-mode-button rounded-md px-3 py-1.5 text-xs transition-colors ${
                  exploreMode === "visual" ? "bg-white/10 text-white" : "text-gray-500 hover:text-gray-300"
                }`}
                onClick={() => setExploreMode("visual")}
              >
                Clusters
              </button>
              <button
                className={`explore-mode-button rounded-md px-3 py-1.5 text-xs transition-colors ${
                  exploreMode === "tags" ? "bg-white/10 text-white" : "text-gray-500 hover:text-gray-300"
                }`}
                onClick={() => setExploreMode("tags")}
              >
                Tag Cloud
              </button>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="explore-empty flex flex-1 items-center justify-center gap-3 text-white/25">
          <Spinner />
          <span className="text-sm">{exploreMode === "visual" ? "Computing clusters…" : "Loading tags…"}</span>
        </div>
      ) : !hasEntries ? (
        <div className="flex flex-1 items-center justify-center px-8">
          <p className="explore-empty max-w-xs text-center text-sm leading-relaxed text-white/25">
            {exploreMode === "visual"
              ? "No visual clusters yet. Images need embeddings before they can be grouped. Check indexing progress in the sidebar."
              : "No tags yet. Run the AI tagger from Settings, or add tags manually in the image preview."}
          </p>
        </div>
      ) : exploreMode === "visual" ? (
        <ClusterCloud entries={tagCloudEntries} onOpen={showVisualCluster} />
      ) : manageTags ? (
        <TagManageList
          entries={exploreTagEntries}
          onSearch={searchForTag}
          onRename={renameTag}
          onDelete={handleDeleteTag}
        />
      ) : (
        /* Tag cloud — words sized by log-scaled frequency, wrapped freely */
        <div className="overflow-y-auto px-8 py-8">
          <div className="flex flex-wrap items-center justify-center gap-x-0.5 gap-y-1 leading-none">
            {exploreTagEntries.map((entry, index) => (
              <TagWord
                key={entry.tag}
                entry={entry}
                index={index}
                logMin={logMin}
                logRange={logRange}
                onSearch={searchForTag}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
