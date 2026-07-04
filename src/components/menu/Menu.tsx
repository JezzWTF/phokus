import {
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { CheckIcon, ChevronRightIcon } from "../icons";

export type MenuSize = "sm" | "md";

/** Provided by ContextMenu so any nested MenuItem (submenus included) can close the whole menu. */
export const MenuCloseContext = createContext<() => void>(() => {});
const MenuSizeContext = createContext<MenuSize>("md");

function itemClass(size: MenuSize, danger: boolean, disabled: boolean, active = false): string {
  const base =
    size === "sm"
      ? "w-full rounded-md px-3 py-1.5 text-[12px]"
      : "w-full rounded-lg px-3 py-2 text-sm";
  const tone = disabled
    ? "text-gray-600 cursor-not-allowed"
    : danger
      ? "text-red-400 hover:bg-red-500/15 hover:text-red-300"
      : active
        ? "bg-white/[0.08] text-white"
        : "text-gray-200 hover:bg-white/[0.06] hover:text-white";
  // menu-item + data attributes are the stable hooks the subtle-light theme
  // targets in index.css — keep them if the utility classes change.
  return `menu-item ${base} ${tone} transition-colors`;
}

function itemTone(danger: boolean, disabled: boolean): "danger" | "disabled" | "default" {
  return danger ? "danger" : disabled ? "disabled" : "default";
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
  // Default min-width steps aside when the caller sets its own width class —
  // Tailwind resolves competing min-w utilities by stylesheet order, not
  // className order, so merging both would be unpredictable.
  const widthClass = /(^|\s)(min-w-|w-)/.test(className)
    ? ""
    : resolved === "sm"
      ? "min-w-40"
      : "min-w-52";
  return (
    <MenuSizeContext.Provider value={resolved}>
      <div
        className={`menu-panel ${widthClass} rounded-xl border border-white/10 bg-gray-950/98 p-1 shadow-2xl shadow-black/40 backdrop-blur light-theme:border-gray-700/50 ${className}`}
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
  active = false,
  checked,
  hint,
  keepOpen = false,
  role,
}: {
  label: ReactNode;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Highlights the row as the current choice (dropdown selections, active view). */
  active?: boolean;
  /** Renders a trailing check mark; use for exclusive-choice menus (themes, sort orders). */
  checked?: boolean;
  hint?: ReactNode;
  /** Skip the automatic menu close after selecting. */
  keepOpen?: boolean;
  role?: React.AriaRole;
}) {
  const size = useContext(MenuSizeContext);
  const close = useContext(MenuCloseContext);
  return (
    <button
      type="button"
      role={role}
      aria-selected={role === "option" ? checked ?? active : undefined}
      disabled={disabled}
      data-tone={itemTone(danger, disabled)}
      data-active={active || undefined}
      className={`${itemClass(size, danger, disabled, active)} flex items-center justify-between gap-3`}
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
        <CheckIcon className="h-3.5 w-3.5 shrink-0 text-blue-400" />
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
        data-tone={itemTone(false, disabled)}
        className={`${itemClass(size, false, disabled)} flex items-center justify-between gap-3`}
        // Open-only (no toggle): hover already opened it for mouse users, so a
        // toggle would close the panel on the very click meant to open it.
        onClick={openNow}
      >
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        <ChevronRightIcon className="h-3 w-3 shrink-0 text-gray-500" />
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
