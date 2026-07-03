import { ReactNode, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MenuCloseContext, MenuPanel, MenuSize } from "./Menu";
import { useDismissable } from "./useDismissable";

/**
 * Positioned floating menu. Renders through a portal so it is never caught
 * inside transformed ancestors (framer-motion drag/layout items), and clamps
 * itself to the viewport after measuring its real size.
 *
 * `align="start"` puts the panel's top-left at (x, y) — right-click menus.
 * `align="end"` puts the top-right at (x, y) — menus anchored under a
 * right-edge button.
 */
export function ContextMenu({
  x,
  y,
  onClose,
  size = "md",
  align = "start",
  className,
  children,
}: {
  x: number;
  y: number;
  onClose: () => void;
  size?: MenuSize;
  align?: "start" | "end";
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useDismissable(ref, onClose);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const margin = 8;
    const rect = el.getBoundingClientRect();
    const desiredLeft = align === "end" ? x - rect.width : x;
    setPos({
      left: Math.max(margin, Math.min(desiredLeft, window.innerWidth - rect.width - margin)),
      top: Math.max(margin, Math.min(y, window.innerHeight - rect.height - margin)),
    });
  }, [x, y, align]);

  return createPortal(
    <div
      ref={ref}
      className="fixed z-50"
      // Render hidden at the raw coordinates for the measuring pass; the
      // layout effect swaps in the clamped position before paint.
      style={pos ?? { left: x, top: y, visibility: "hidden" }}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <MenuCloseContext.Provider value={onClose}>
        <MenuPanel size={size} className={className}>
          {children}
        </MenuPanel>
      </MenuCloseContext.Provider>
    </div>,
    document.body,
  );
}
