import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ExploreMode, ExploreTagEntry, RelatedTagEntry, TagCloudEntry, useGalleryStore } from "../store";
import { FolderScopeDropdown } from "./FolderScopeDropdown";
import { Tooltip } from "./Tooltip";
import { mediaSrc } from "../lib/mediaSrc";

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
  const src = mediaSrc(node.entry.thumbnail_path);
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

interface AtlasNode {
  entry: ExploreTagEntry;
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize: number;
  ratio: number;
  accent: string;
  driftX: number;
  driftY: number;
}

interface TagAnchor {
  x: number;
  y: number;
}

const TAG_ATLAS_MAX_VISIBLE = 132;
const TAG_ATLAS_DENSE_THRESHOLD = 120;

function buildTagAtlas(entries: ExploreTagEntry[], containerW: number, containerH: number, isLight: boolean): AtlasNode[] {
  if (!entries.length || containerW <= 0 || containerH <= 0) return [];

  const logs = entries.map((entry) => Math.log(Math.max(entry.count, 1)));
  const logMin = Math.min(...logs);
  const logRange = Math.max(...logs) - logMin || 1;
  const cx = containerW / 2;
  const cy = containerH * 0.48;
  const spreadX = containerW * 0.47;
  const spreadY = containerH * 0.46;
  const accents = isLight ? LIGHT_ACCENTS : ACCENTS;

  const nodes = entries.map((entry, index) => {
    const ratio = (Math.log(Math.max(entry.count, 1)) - logMin) / logRange;
    const densityScale = entries.length > TAG_ATLAS_DENSE_THRESHOLD ? 0.94 : 1;
    const fontSize = (9.75 + Math.pow(ratio, 0.92) * 19.5) * densityScale;
    const maxWidthRatio = index < 48 ? 0.32 : index < 100 ? 0.26 : 0.2;
    const textWidth = entry.tag.length * fontSize * 0.5 + (ratio > 0.55 ? 36 : 26);
    const w = Math.min(containerW * maxWidthRatio, textWidth);
    const h = fontSize * 1.18 + 14;
    const radialRatio = Math.sqrt((index + 0.5) / entries.length);
    const angle = index * GOLDEN_ANGLE;
    return {
      entry,
      index,
      x: cx + Math.cos(angle) * radialRatio * spreadX,
      y: cy + Math.sin(angle) * radialRatio * spreadY,
      w,
      h,
      fontSize,
      ratio,
      accent: accents[index % accents.length],
      driftX: (seeded(index + 101) - 0.5) * 7,
      driftY: (seeded(index + 113) - 0.5) * 6,
    };
  });

  const padX = entries.length > TAG_ATLAS_DENSE_THRESHOLD ? 4 : 10;
  const padY = entries.length > TAG_ATLAS_DENSE_THRESHOLD ? 3 : 7;
  const margin = 28;
  for (let iter = 0; iter < 140; iter++) {
    for (let a = 0; a < nodes.length; a++) {
      const na = nodes[a];
      for (let b = a + 1; b < nodes.length; b++) {
        const nb = nodes[b];
        const dx = nb.x - na.x;
        const dy = nb.y - na.y;
        const overlapX = (na.w + nb.w) / 2 + padX - Math.abs(dx);
        const overlapY = (na.h + nb.h) / 2 + padY - Math.abs(dy);
        if (overlapX <= 0 || overlapY <= 0) continue;
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
      node.x = Math.min(Math.max(node.x, node.w / 2 + margin), containerW - node.w / 2 - margin);
      node.y = Math.min(Math.max(node.y, node.h / 2 + margin), containerH - node.h / 2 - margin);
      if (node.x <= node.w / 2 + margin || node.x >= containerW - node.w / 2 - margin) {
        node.y += (seeded(node.index + iter + 211) - 0.5) * 2;
      }
      if (node.y <= node.h / 2 + margin || node.y >= containerH - node.h / 2 - margin) {
        node.x += (seeded(node.index + iter + 223) - 0.5) * 2;
      }
    }
  }

  for (let iter = 0; iter < 5; iter++) {
    const weighted = nodes.reduce(
      (acc, node) => {
        const weight = 1 + Math.pow(node.ratio, 1.35) * 9;
        return {
          x: acc.x + node.x * weight,
          y: acc.y + node.y * weight,
          weight: acc.weight + weight,
        };
      },
      { x: 0, y: 0, weight: 0 },
    );
    const offsetX = containerW * 0.48 - weighted.x / weighted.weight;
    const offsetY = containerH * 0.44 - weighted.y / weighted.weight;
    if (Math.abs(offsetX) < 0.5 && Math.abs(offsetY) < 0.5) break;
    for (const node of nodes) {
      node.x = Math.min(Math.max(node.x + offsetX, node.w / 2 + margin), containerW - node.w / 2 - margin);
      node.y = Math.min(Math.max(node.y + offsetY, node.h / 2 + margin), containerH - node.h / 2 - margin);
    }
  }

  return nodes;
}

function TagAtlas({
  entries,
  onSearch,
  loadRelatedTags,
}: {
  entries: ExploreTagEntry[];
  onSearch: (tag: string) => void;
  loadRelatedTags: (tag: string) => Promise<RelatedTagEntry[]>;
}) {
  const theme = useGalleryStore((state) => state.theme);
  const isLight = theme === "subtle-light";
  const reducedMotion = useReducedMotion();
  const canvasRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [relatedTags, setRelatedTags] = useState<RelatedTagEntry[]>([]);
  const [anchors, setAnchors] = useState<Record<string, TagAnchor>>({});
  const visibleEntries = useMemo(
    () => (entries.length > TAG_ATLAS_MAX_VISIBLE ? entries.slice(0, TAG_ATLAS_MAX_VISIBLE) : entries),
    [entries],
  );

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

  useEffect(() => {
    if (!activeTag) {
      setRelatedTags([]);
      return;
    }
    let cancelled = false;
    void loadRelatedTags(activeTag).then((entries) => {
      if (!cancelled) setRelatedTags(entries);
    });
    return () => {
      cancelled = true;
    };
  }, [activeTag, loadRelatedTags]);

  const nodes = useMemo(
    () => buildTagAtlas(visibleEntries, canvasSize.w, canvasSize.h, isLight),
    [visibleEntries, canvasSize.w, canvasSize.h, isLight],
  );
  const nodeByTag = useMemo(() => new Map(nodes.map((node) => [node.entry.tag, node])), [nodes]);
  const activeNode = activeTag ? nodeByTag.get(activeTag) : undefined;
  const minOpacity = isLight ? 0.62 : 0.42;
  const visibleConnections = useMemo(
    () =>
      activeNode
        ? relatedTags
            .map((related) => {
              const node = nodeByTag.get(related.tag);
              return node ? { node, related } : null;
            })
            .filter((item): item is { node: AtlasNode; related: RelatedTagEntry } => item !== null)
            .slice(0, visibleEntries.length > TAG_ATLAS_DENSE_THRESHOLD ? 6 : 10)
        : [],
    [activeNode, nodeByTag, relatedTags, visibleEntries.length],
  );
  const activeAnchor = activeTag ? anchors[activeTag] : undefined;
  const maxShared = Math.max(1, ...visibleConnections.map(({ related }) => related.shared_count));
  const connectedByTag = useMemo(
    () => new Map(visibleConnections.map(({ node, related }) => [node.entry.tag, related])),
    [visibleConnections],
  );

  const setButtonRef = useCallback((tag: string, element: HTMLButtonElement | null) => {
    if (element) {
      buttonRefs.current.set(tag, element);
    } else {
      buttonRefs.current.delete(tag);
    }
  }, []);

  const measureAnchors = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !activeTag) {
      setAnchors({});
      return;
    }

    const canvasRect = canvas.getBoundingClientRect();
    const tagsToMeasure = [activeTag, ...visibleConnections.map(({ node }) => node.entry.tag)];
    const nextAnchors: Record<string, TagAnchor> = {};
    for (const tag of tagsToMeasure) {
      const element = buttonRefs.current.get(tag);
      if (!element) continue;
      const rect = element.getBoundingClientRect();
      nextAnchors[tag] = {
        x: rect.left - canvasRect.left + rect.width / 2,
        y: rect.top - canvasRect.top + rect.height / 2,
      };
    }
    setAnchors(nextAnchors);
  }, [activeTag, visibleConnections]);

  useLayoutEffect(() => {
    if (!activeTag) {
      setAnchors({});
      return;
    }

    let firstFrame = 0;
    let secondFrame = 0;
    const settleTimer = window.setTimeout(measureAnchors, 180);
    firstFrame = window.requestAnimationFrame(() => {
      measureAnchors();
      secondFrame = window.requestAnimationFrame(measureAnchors);
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      window.clearTimeout(settleTimer);
    };
  }, [activeTag, canvasSize.w, canvasSize.h, measureAnchors]);

  return (
    <div ref={canvasRef} className="relative min-h-0 flex-1 overflow-hidden px-8 py-8">
      <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          <radialGradient id="tag-atlas-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.2)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
        </defs>
        {activeNode && activeAnchor ? (
          <circle cx={activeAnchor.x} cy={activeAnchor.y} r={Math.max(activeNode.w, activeNode.h) * 0.62} fill="url(#tag-atlas-glow)" opacity="0.24" />
        ) : null}
        {visibleConnections.map(({ node, related }) => {
          const from = activeAnchor;
          const to = anchors[node.entry.tag];
          if (!from || !to) return null;
          const strength = related.shared_count / maxShared;
          return (
            <g key={`${activeTag}:${node.entry.tag}`}>
              <motion.line
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={node.accent}
                strokeWidth={0.35 + strength * 0.55}
                strokeOpacity={0.05 + strength * 0.12}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                initial={reducedMotion ? undefined : { pathLength: 0, opacity: 0 }}
                animate={reducedMotion ? undefined : { pathLength: 1, opacity: 1 }}
                transition={{ duration: 0.32, ease: "easeOut" }}
              />
              {!reducedMotion ? (
                <motion.line
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={node.accent}
                  strokeWidth={0.65 + strength * 0.5}
                  strokeOpacity={0.16 + strength * 0.1}
                  strokeLinecap="round"
                  pathLength={1}
                  strokeDasharray="0.08 1"
                  vectorEffect="non-scaling-stroke"
                  initial={{ strokeDashoffset: 1.08, opacity: 0 }}
                  animate={{ strokeDashoffset: [1.08, 0], opacity: [0, 0.65, 0] }}
                  transition={{
                    duration: 4.1 + seeded(node.index + 307) * 1.2,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: seeded(node.index + 317) * 0.75,
                  }}
                />
              ) : null}
            </g>
          );
        })}
      </svg>
      {nodes.map((node) => {
        const isActive = activeTag === node.entry.tag;
        const connectedRelated = connectedByTag.get(node.entry.tag);
        const isRelated = connectedRelated !== undefined;
        const dimmed = activeTag !== null && !isActive && !isRelated;
        const opacity = dimmed ? 0.2 : minOpacity + node.ratio * (1 - minOpacity);
        return (
          <Tooltip
            key={node.entry.tag}
            label={`${node.entry.tag} — ${node.entry.count.toLocaleString()} ${node.entry.count === 1 ? "image" : "images"}`}
            followCursor
            delay={250}
          >
            <button
              ref={(element) => setButtonRef(node.entry.tag, element)}
              className={`explore-tag-word group absolute inline-flex items-center justify-center rounded-full px-2 py-1 text-center transition-[opacity,transform] duration-300 ease-out before:absolute before:inset-x-[-14px] before:inset-y-[-8px] before:rounded-full before:bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.16),rgba(255,255,255,0.06)_46%,rgba(255,255,255,0)_72%)] before:opacity-0 before:blur-md before:transition-opacity before:duration-300 before:content-[''] hover:before:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/25 ${
                isActive ? "before:opacity-100" : ""
              }`}
              style={{
                left: node.x - node.w / 2,
                top: node.y - node.h / 2,
                width: node.w,
                minHeight: node.h,
                fontSize: node.fontSize,
                color: node.ratio > 0.55 ? node.accent : isLight ? "#4b5563" : "rgba(255,255,255,0.82)",
                opacity,
                transform: `translate3d(0, 0, 0) scale(${isActive ? 1.045 : isRelated ? 1.015 : 1})`,
                zIndex: isActive ? 30 : isRelated ? 20 : Math.round(node.ratio * 10),
              }}
              onMouseEnter={() => setActiveTag(node.entry.tag)}
              onFocus={() => setActiveTag(node.entry.tag)}
              onMouseLeave={() => setActiveTag(null)}
              onBlur={() => setActiveTag(null)}
              onClick={() => onSearch(node.entry.tag)}
            >
              <span className="relative z-10 block w-full truncate text-center font-medium leading-none">{node.entry.tag}</span>
              <span
                className={`absolute left-1/2 top-full z-10 mt-1 shrink-0 -translate-x-1/2 rounded-full px-1.5 py-0.5 text-[9px] tabular-nums shadow-sm backdrop-blur-sm transition-opacity ${
                  isActive || isRelated ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                }`}
                style={{ backgroundColor: `${node.accent}1A`, color: node.accent }}
              >
                {connectedRelated ? connectedRelated.shared_count.toLocaleString() : node.entry.count.toLocaleString()}
              </span>
            </button>
          </Tooltip>
        );
      })}
    </div>
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

function ExploreLoadingPanel({ mode }: { mode: ExploreMode }) {
  const title = mode === "visual" ? "Building visual clusters" : "Reading tag frequencies";
  const subtitle =
    mode === "visual"
      ? "Grouping similar images into browsable clusters."
      : "Collecting tags from the current library scope.";

  return (
    <div className="flex flex-1 items-center justify-center px-8">
      <div className="flex max-w-sm flex-col items-center text-center">
        <div className="mb-4 flex items-center justify-center gap-3 text-white/65">
          <Spinner />
          <span className="text-sm font-medium">{title}</span>
        </div>
        <p className="text-sm leading-relaxed text-white/25">{subtitle}</p>
        <div className="mt-6 h-px w-40 overflow-hidden rounded-full bg-white/[0.06]">
          <motion.div
            className="h-full w-16 rounded-full bg-white/25"
            animate={{ x: [-72, 184] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>
      </div>
    </div>
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
  const loadRelatedTags = useGalleryStore((state) => state.loadRelatedTags);
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

  const loading = exploreMode === "visual" ? tagCloudLoading : exploreTagLoading;
  const hasEntries = exploreMode === "visual" ? tagCloudEntries.length > 0 : exploreTagEntries.length > 0;
  const entryCount = exploreMode === "visual" ? tagCloudEntries.length : exploreTagEntries.length;
  const visibleTagCount = Math.min(exploreTagEntries.length, TAG_ATLAS_MAX_VISIBLE);

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
                    : visibleTagCount < entryCount
                      ? `${visibleTagCount} of ${entryCount} tags shown — click any to search`
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

      {loading && !hasEntries ? (
        <ExploreLoadingPanel mode={exploreMode} />
      ) : !hasEntries ? (
        <div className="flex flex-1 items-center justify-center px-8">
          <p className="explore-empty max-w-xs text-center text-sm leading-relaxed text-white/25">
            {exploreMode === "visual"
              ? "No visual clusters yet. Images need embeddings before they can be grouped. Check indexing progress in the sidebar."
              : "No tags yet. Run the AI tagger from Settings, or add tags manually in the image preview."}
          </p>
        </div>
      ) : exploreMode === "visual" ? (
        <div className="relative flex min-h-0 flex-1 flex-col">
          <ClusterCloud entries={tagCloudEntries} onOpen={showVisualCluster} />
        </div>
      ) : manageTags ? (
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <TagManageList
            entries={exploreTagEntries}
            onSearch={searchForTag}
            onRename={renameTag}
            onDelete={handleDeleteTag}
          />
        </div>
      ) : (
        <TagAtlas entries={exploreTagEntries} onSearch={searchForTag} loadRelatedTags={loadRelatedTags} />
      )}
    </div>
  );
}
