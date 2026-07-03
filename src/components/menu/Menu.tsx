import {
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

export type MenuSize = "sm" | "md";

/** Provided by ContextMenu so any nested MenuItem (submenus included) can close the whole menu. */
export const MenuCloseContext = createContext<() => void>(() => {});
const MenuSizeContext = createContext<MenuSize>("md");

function itemClass(size: MenuSize, danger: boolean, disabled: boolean): string {
  const base =
    size === "sm"
      ? "w-full rounded-md px-3 py-1.5 text-[12px]"
      : "w-full rounded-lg px-3 py-2 text-sm";
  const tone = disabled
    ? "text-gray-600 cursor-not-allowed"
    : danger
      ? "text-red-400 hover:bg-red-500/15 hover:text-red-300"
      : "text-gray-200 hover:bg-white/[0.06] hover:text-white";
  return `${base} ${tone} transition-colors`;
}

/**
 * The panel chrome shared by every menu surface. Size defaults to the
 * enclosing menu's size so submenu panels match their parent automatically.
 */
export function MenuPanel({
  size,
  className = "",
  children,
}: {
  size?: MenuSize;
  className?: string;
  children: ReactNode;
}) {
  const inherited = useContext(MenuSizeContext);
  const resolved = size ?? inherited;
  return (
    <MenuSizeContext.Provider value={resolved}>
      <div
        className={`${resolved === "sm" ? "min-w-40" : "min-w-52"} rounded-xl border border-white/10 bg-gray-950/98 p-1 shadow-2xl shadow-black/40 backdrop-blur light-theme:border-gray-700/50 ${className}`}
      >
        {children}
      </div>
    </MenuSizeContext.Provider>
  );
}

export function MenuItem({
  label,
  onSelect,
  danger = false,
  disabled = false,
  checked,
  hint,
  keepOpen = false,
}: {
  label: ReactNode;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Renders a trailing check mark; use for exclusive-choice menus (themes, sort orders). */
  checked?: boolean;
  hint?: ReactNode;
  /** Skip the automatic menu close after selecting. */
  keepOpen?: boolean;
}) {
  const size = useContext(MenuSizeContext);
  const close = useContext(MenuCloseContext);
  return (
    <button
      type="button"
      disabled={disabled}
      className={`${itemClass(size, danger, disabled)} flex items-center justify-between gap-3`}
      onClick={() => {
        if (disabled) return;
        onSelect?.();
        if (!keepOpen) close();
      }}
    >
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      {hint != null ? (
        <span className={`shrink-0 ${size === "sm" ? "text-[10px]" : "text-xs"} text-gray-500`}>{hint}</span>
      ) : null}
      {checked ? (
        <svg className="h-3.5 w-3.5 shrink-0 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      ) : null}
    </button>
  );
}

export function MenuSeparator() {
  return <div className="my-1 h-px bg-white/[0.06]" />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-gray-600">{children}</div>
  );
}

/**
 * A nested menu panel that opens beside its row on hover (or click, for
 * touch). Flips to the left edge and shifts up when it would leave the
 * viewport. Items inside close the entire menu tree via MenuCloseContext.
 */
export function SubMenu({
  label,
  disabled = false,
  children,
  panelClassName = "",
}: {
  label: ReactNode;
  disabled?: boolean;
  children: ReactNode;
  panelClassName?: string;
}) {
  const size = useContext(MenuSizeContext);
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState({ flipX: false, shiftY: 0 });
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  const openNow = () => {
    if (disabled) return;
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setOpen(true);
  };
  // Grace delay so the pointer can cross the small gap to the panel.
  const closeSoon = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 140);
  };

  useLayoutEffect(() => {
    if (!open) {
      setPlacement({ flipX: false, shiftY: 0 });
      return;
    }
    const panel = panelRef.current;
    if (!panel) return;
    const margin = 8;
    const rect = panel.getBoundingClientRect();
    const overflowY = rect.bottom - (window.innerHeight - margin);
    setPlacement({
      flipX: rect.right > window.innerWidth - margin,
      shiftY: overflowY > 0 ? -overflowY : 0,
    });
  }, [open]);

  return (
    <div className="relative" onPointerEnter={openNow} onPointerLeave={closeSoon}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`${itemClass(size, false, disabled)} flex items-center justify-between gap-3`}
        // Open-only (no toggle): hover already opened it for mouse users, so a
        // toggle would close the panel on the very click meant to open it.
        onClick={openNow}
      >
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        <svg className="h-3 w-3 shrink-0 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
      {open ? (
        <div
          ref={panelRef}
          className={`absolute top-0 -mt-1 z-10 ${placement.flipX ? "right-full mr-0.5" : "left-full ml-0.5"}`}
          style={placement.shiftY !== 0 ? { transform: `translateY(${placement.shiftY}px)` } : undefined}
        >
          <MenuPanel className={panelClassName}>{children}</MenuPanel>
        </div>
      ) : null}
    </div>
  );
}
