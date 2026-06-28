import { MouseEvent, ReactNode, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

type TooltipSide = "top" | "bottom" | "left" | "right";
type TooltipAlign = "center" | "start" | "end";

// Horizontal alignment only applies to top/bottom; left/right center vertically.
function positionClasses(side: TooltipSide, align: TooltipAlign): string {
  if (side === "left") return "right-full top-1/2 mr-1.5 -translate-y-1/2";
  if (side === "right") return "left-full top-1/2 ml-1.5 -translate-y-1/2";
  const vertical = side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5";
  const horizontal = align === "start" ? "left-0" : align === "end" ? "right-0" : "left-1/2 -translate-x-1/2";
  return `${vertical} ${horizontal}`;
}

const BASE_CLASSES =
  "pointer-events-none z-50 whitespace-nowrap rounded-md border border-white/10 bg-gray-800 px-2 py-1 text-[11px] text-gray-200 shadow-lg";
const STATIC_CLASSES = `${BASE_CLASSES} transition-opacity duration-100`;

/**
 * Lightweight custom tooltip — fades in (faster than the native one) after a
 * tunable hover `delay`, and hides instantly on leave or click. By default it
 * anchors to a `side` of the wrapper; with `followCursor` it tracks the pointer
 * (fixed-positioned, so it escapes scroll-container clipping).
 */
export function Tooltip({
  label,
  delay = 400,
  side = "bottom",
  align = "center",
  block = false,
  followCursor = false,
  className = "",
  children,
}: {
  label: ReactNode;
  /** Milliseconds the pointer must hover before the tooltip appears (0 = instant). */
  delay?: number;
  side?: TooltipSide;
  /** Horizontal alignment for top/bottom tooltips. */
  align?: TooltipAlign;
  /** Full-width block wrapper (e.g. wrapping a grid cell) instead of inline. */
  block?: boolean;
  /** Track the cursor (fixed position) instead of anchoring to a side. */
  followCursor?: boolean;
  /** Extra classes for the wrapper (e.g. layout). */
  className?: string;
  children: ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const frame = useRef<number | undefined>(undefined);
  const tooltipRef = useRef<HTMLSpanElement>(null);

  // Resolve a viewport-safe position near the cursor: below-right by default,
  // but flipped above the cursor if it would overflow the bottom edge, and
  // clamped so it never runs off the right/left.
  const place = (clientX: number, clientY: number) => {
    const tip = tooltipRef.current;
    const tipWidth = tip?.offsetWidth ?? 0;
    const tipHeight = tip?.offsetHeight ?? 24;
    const gap = 16;
    let top = clientY + gap;
    if (top + tipHeight > window.innerHeight - 4) {
      top = clientY - gap - tipHeight;
    }
    let left = clientX + 14;
    if (left + tipWidth > window.innerWidth - 4) left = window.innerWidth - 4 - tipWidth;
    if (left < 4) left = 4;
    setCoords({ x: left, y: top });
  };

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = undefined;
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    frame.current = undefined;
  };
  const show = (event: MouseEvent<HTMLSpanElement>) => {
    clear();
    if (followCursor) place(event.clientX, event.clientY);
    if (delay <= 0) {
      setVisible(true);
      return;
    }
    timer.current = setTimeout(() => setVisible(true), delay);
  };
  const hide = () => {
    clear();
    setVisible(false);
  };
  const move = (event: MouseEvent<HTMLSpanElement>) => {
    if (!followCursor) return;
    const { clientX, clientY } = event;
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = undefined;
      place(clientX, clientY);
    });
  };

  useEffect(() => clear, []);

  return (
    <span
      className={`${block ? "relative block w-full" : "relative inline-flex"} ${className}`}
      onMouseEnter={show}
      onMouseMove={followCursor ? move : undefined}
      onMouseLeave={hide}
      onPointerDown={hide}
    >
      {children}
      {followCursor ? (
        <motion.span
          ref={tooltipRef}
          role="tooltip"
          // Fixed (so the scroll container's overflow doesn't clip it) and
          // positioned by `place()` near the cursor with viewport-edge flipping.
          className={`fixed ${BASE_CLASSES}`}
          initial={false}
          animate={{ left: coords.x, top: coords.y, opacity: visible ? 1 : 0 }}
          transition={{
            left: { type: "spring", stiffness: 700, damping: 45, mass: 0.35 },
            top: { type: "spring", stiffness: 520, damping: 34, mass: 0.45 },
            opacity: { duration: visible ? 0.1 : 0.05 },
          }}
        >
          {label}
        </motion.span>
      ) : (
        <span
          role="tooltip"
          className={`absolute ${STATIC_CLASSES} ${positionClasses(side, align)} ${visible ? "opacity-100" : "opacity-0"}`}
        >
          {label}
        </span>
      )}
    </span>
  );
}
