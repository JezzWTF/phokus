import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { ExploreTagEntry, RelatedTagEntry } from "../../store";
import { useGalleryStore } from "../../store";
import { Tooltip } from "../Tooltip";
import { ACCENTS, GOLDEN_ANGLE, LIGHT_ACCENTS, seeded } from "./layout";

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

export const TAG_ATLAS_MAX_VISIBLE = 132;
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

export function TagAtlas({
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
            <stop offset="0%" stopColor={isLight ? "rgba(60,50,30,0.18)" : "rgba(255,255,255,0.2)"} />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
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


