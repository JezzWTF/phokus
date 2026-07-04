import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import type { VisualClusterEntry } from '../../store'
import { mediaSrc } from '../../lib/mediaSrc'
import { Tooltip } from '../Tooltip'
import { ACCENTS, GOLDEN_ANGLE, seeded } from './layout'

interface PlacedNode {
  entry: VisualClusterEntry
  index: number
  x: number
  y: number
  w: number
  h: number
  zIndex: number
  accent: string
  driftX: number
  driftY: number
  driftDuration: number
  rotateSeed: number
}

function buildCloud(
  entries: VisualClusterEntry[],
  containerW: number,
  containerH: number
): PlacedNode[] {
  if (!entries.length || containerW <= 0 || containerH <= 0) return []

  const maxCount = Math.max(...entries.map((e) => e.count))
  const cx = containerW / 2
  const cy = containerH / 2
  const n = entries.length
  const ASPECT = 0.72
  const PAD = 18

  // Card width scales with image count; the sub-linear exponent (< 1) widens the
  // gap so the busiest clusters read as clearly larger and more prominent.
  const rawWidth = (count: number) => {
    const ratio = Math.max(count / maxCount, 0.05)
    return 92 + Math.pow(ratio, 0.65) * 158 // ~92–250px before fit scaling
  }

  // Shrink every card uniformly when their padded footprint can't fit the
  // canvas, so overlap resolution can actually pull them apart instead of
  // settling into a pile. (0.6 leaves headroom for imperfect packing.)
  const totalArea = entries.reduce((sum, e) => {
    const w = rawWidth(e.count)
    return sum + (w + PAD) * (w * ASPECT + PAD)
  }, 0)
  const usableArea = containerW * containerH * 0.6
  const fit = totalArea > usableArea ? Math.sqrt(usableArea / totalArea) : 1

  const spreadX = containerW * 0.44
  const spreadY = containerH * 0.4

  // 1. Seed positions on a phyllotaxis spiral, sized by count.
  const nodes: PlacedNode[] = entries.map((entry, i) => {
    const w = rawWidth(entry.count) * fit
    const h = w * ASPECT
    const radialRatio = Math.sqrt((i + 0.5) / n)
    const angle = i * GOLDEN_ANGLE

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
    }
  })

  // 2. Resolve overlaps by pushing pairs apart, clamping inside the canvas every
  //    pass so edge cards settle in-bounds instead of being shoved out and
  //    re-overlapping there.
  const marginX = 14
  const marginY = 14
  for (let iter = 0; iter < 160; iter++) {
    for (let a = 0; a < nodes.length; a++) {
      const na = nodes[a]
      for (let b = a + 1; b < nodes.length; b++) {
        const nb = nodes[b]
        const dx = nb.x - na.x
        const dy = nb.y - na.y
        const overlapX = (na.w + nb.w) / 2 + PAD - Math.abs(dx)
        const overlapY = (na.h + nb.h) / 2 + PAD - Math.abs(dy)
        if (overlapX <= 0 || overlapY <= 0) continue
        // Push along the smaller overlap axis (ternary yields ±1 so coincident
        // cards still separate rather than stalling at a zero push).
        if (overlapX < overlapY) {
          const push = (overlapX / 2) * (dx >= 0 ? 1 : -1)
          nb.x += push
          na.x -= push
        } else {
          const push = (overlapY / 2) * (dy >= 0 ? 1 : -1)
          nb.y += push
          na.y -= push
        }
      }
    }
    for (const node of nodes) {
      node.x = Math.min(Math.max(node.x, node.w / 2 + marginX), containerW - node.w / 2 - marginX)
      node.y = Math.min(Math.max(node.y, node.h / 2 + marginY), containerH - node.h / 2 - marginY)
    }
  }

  return nodes
}

function CloudCard({
  node,
  onOpen,
  animated,
}: {
  node: PlacedNode
  onOpen: (imageIds: number[]) => void
  animated: boolean
}) {
  const src = mediaSrc(node.entry.thumbnail_path)
  const { w, h, accent } = node
  const driftTransition = {
    duration: node.driftDuration,
    ease: 'easeInOut' as const,
    delay: seeded(node.index + 41) * 1.6,
    repeat: 1,
    repeatType: 'reverse' as const,
  }

  return (
    <Tooltip
      label={`Open cluster — ${node.entry.count.toLocaleString()} ${node.entry.count === 1 ? 'image' : 'images'}`}
      followCursor
    >
      <motion.button
        className="explore-cluster-card group absolute overflow-hidden rounded-2xl border border-white/8 bg-white/[0.04] text-left shadow-[0_8px_28px_rgba(0,0,0,0.38)] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
        style={{
          width: w,
          height: h,
          left: node.x - w / 2,
          top: node.y - h / 2,
          zIndex: node.zIndex,
        }}
        initial={
          animated
            ? { opacity: 0, scale: 0.82, rotate: node.rotateSeed }
            : { opacity: 0, scale: 0.96 }
        }
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
                y: {
                  ...driftTransition,
                  duration: node.driftDuration + 1.2,
                  delay: seeded(node.index + 51) * 1.6,
                },
                rotate: {
                  ...driftTransition,
                  duration: node.driftDuration + 0.8,
                  delay: seeded(node.index + 61) * 1.2,
                },
              }
            : {
                opacity: { duration: 0.18, delay: Math.min(node.index * 0.016, 0.28) },
                scale: { duration: 0.18, delay: Math.min(node.index * 0.016, 0.28) },
              }
        }
        whileHover={{ scale: 1.06, rotate: 0, zIndex: 500, transition: { duration: 0.18 } }}
        onClick={() => onOpen(node.entry.image_ids)}
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
          <div
            className="explore-cluster-rule mb-2 h-px rounded-full"
            style={{ background: `linear-gradient(to right, ${accent}80, transparent)` }}
          />
          <p className="explore-cluster-label text-[9px] tracking-[0.18em] text-white/35 uppercase">
            Cluster
          </p>
          <p className="explore-cluster-count text-base leading-none font-semibold text-white">
            {node.entry.count.toLocaleString()}
          </p>
        </div>
        {/* Anchored to the card corner (not in the count's flex row) so a wide
          count can't push it past the edge on small cards. */}
        <span
          className="explore-cluster-open absolute right-3 bottom-3 rounded-full border px-2 py-0.5 text-[9px] tracking-[0.1em] uppercase opacity-0 transition-opacity duration-200 group-hover:opacity-100"
          style={{ borderColor: `${accent}50`, color: accent, backgroundColor: `${accent}12` }}
        >
          Open
        </span>
      </motion.button>
    </Tooltip>
  )
}

// Separate component so its useLayoutEffect fires when the canvas is actually
// mounted, not at ExploreView mount time when the container may still be hidden
// behind a loading state.
export function ClusterCloud({
  entries,
  onOpen,
}: {
  entries: VisualClusterEntry[]
  onOpen: (imageIds: number[]) => void
}) {
  const reducedMotion = useReducedMotion()
  const canvasRef = useRef<HTMLDivElement>(null)
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 })

  useLayoutEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const update = () => {
      const r = el.getBoundingClientRect()
      setCanvasSize({ w: r.width, h: r.height })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const nodes = useMemo(
    () => buildCloud(entries, canvasSize.w, canvasSize.h),
    [entries, canvasSize.w, canvasSize.h]
  )

  return (
    <div ref={canvasRef} className="relative isolate min-h-0 flex-1 overflow-hidden">
      <div className="explore-cluster-grid pointer-events-none absolute inset-0 [background-image:radial-gradient(circle,rgba(255,255,255,0.6)_1px,transparent_1px)] [background-size:28px_28px] opacity-[0.07]" />
      {nodes.map((node) => (
        <CloudCard
          key={`${node.entry.representative_image_id}:${node.index}`}
          node={node}
          onOpen={onOpen}
          animated={!reducedMotion && node.index < 12}
        />
      ))}
    </div>
  )
}
