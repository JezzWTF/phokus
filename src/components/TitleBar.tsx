import { useState, useEffect, useRef } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useGalleryStore, AppTheme } from '../store'
import { ContextMenu, MenuItem, MenuLabel } from './menu'
import { PhokusMark } from './PhokusMark'
import { Tooltip } from './Tooltip'

const THEME_LABELS: Record<AppTheme, string> = {
  phokus: 'Phokus',
  'subtle-light': 'Subtle Light',
  'conventional-dark': 'Conventional Dark',
}
const THEME_OPTIONS = (Object.keys(THEME_LABELS) as AppTheme[]).map((value) => ({
  value,
  label: THEME_LABELS[value],
}))

// SVG icons for window controls
function MinimizeIcon() {
  return (
    <svg width="10" height="2" viewBox="0 0 10 2" fill="none">
      <rect y="0.5" width="10" height="1" rx="0.5" fill="currentColor" />
    </svg>
  )
}

function MaximizeIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <rect x="0.5" y="0.5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1" />
    </svg>
  )
}

function RestoreIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <rect x="2.5" y="0.5" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1" />
      <rect
        x="0.5"
        y="2.5"
        width="7"
        height="7"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1"
        fill="var(--color-gray-950)"
      />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  )
}

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false)
  const setSettingsOpen = useGalleryStore((state) => state.setSettingsOpen)
  const theme = useGalleryStore((state) => state.theme)
  const setTheme = useGalleryStore((state) => state.setTheme)
  const updateStatus = useGalleryStore((state) => state.updateStatus)
  const updateVersion = useGalleryStore((state) => state.updateVersion)
  const installUpdate = useGalleryStore((state) => state.installUpdate)
  const appWindow = getCurrentWindow()

  // Right-clicking the settings cog opens a quick theme switcher, anchored under
  // the cog so it never overflows the right edge of the window.
  const settingsBtnRef = useRef<HTMLButtonElement>(null)
  const [themeMenu, setThemeMenu] = useState<{ x: number; y: number } | null>(null)

  const handleSettingsContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    const rect = settingsBtnRef.current?.getBoundingClientRect()
    if (!rect) return
    setThemeMenu({ x: rect.right, y: rect.bottom + 4 })
  }

  useEffect(() => {
    // Get initial maximized state
    appWindow.isMaximized().then(setIsMaximized)

    // Listen for resize events to update maximized state
    const unlisten = appWindow.onResized(() => {
      appWindow.isMaximized().then(setIsMaximized)
    })

    return () => {
      unlisten.then((fn) => fn())
    }
  }, [])

  const handleMinimize = () => appWindow.minimize()
  const handleMaximize = () => appWindow.toggleMaximize()
  const handleClose = () => appWindow.close()

  // An update is waiting for the user to act. Covers the "clicked Later" case too,
  // since dismissing the toast doesn't change updateStatus.
  const updatePending = updateStatus === 'available'

  return (
    // data-tauri-drag-region is the recommended Tauri approach for drag regions.
    // WebkitAppRegion is kept as a CSS fallback for compatibility.
    <div
      data-tauri-drag-region
      className="titlebar relative z-50 flex h-9 shrink-0 items-center bg-gray-950 select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* App icon + name — left side. When an update is waiting, the iris lights
          up its focal point and the chip becomes a button that re-opens the prompt. */}
      <div className="flex items-center gap-2 pr-4 pl-3">
        {updatePending ? (
          <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            {/* Instant tooltip (delay 0) — this affordance should read immediately. */}
            <Tooltip label={`Click to update — v${updateVersion}`} delay={0} align="start">
              <button
                onClick={() => void installUpdate()}
                aria-label={`Update available — click to update to Phokus v${updateVersion}`}
                className="relative flex h-5 w-5 items-center justify-center overflow-hidden rounded-md bg-white/8 text-gray-300 transition-colors hover:bg-white/12"
              >
                <span className="pointer-events-none absolute top-1/2 left-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full bg-amber-400/60" />
                <PhokusMark className="relative h-4 w-4" dotClassName="fill-amber-400" />
              </button>
            </Tooltip>
          </div>
        ) : (
          <div className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-md bg-white/8 text-gray-300">
            <PhokusMark className="h-4 w-4" />
          </div>
        )}
        <span className="text-[11px] font-semibold tracking-wide text-gray-400">Phokus</span>
      </div>

      {/* Spacer — draggable region fills here */}
      <div data-tauri-drag-region className="flex-1" />

      {/* Window control buttons — right side, non-draggable */}
      <div
        className="flex h-full items-stretch"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <Tooltip label="Settings (right-click to switch theme)" anchorToCursor>
          <button
            ref={settingsBtnRef}
            aria-label="Settings"
            onClick={() => setSettingsOpen(true)}
            onContextMenu={handleSettingsContextMenu}
            className="group flex h-full w-10 items-center justify-center text-gray-600 transition-colors duration-100 hover:bg-white/6 hover:text-gray-300"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.607 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </button>
        </Tooltip>
        {/* Minimize */}
        <button
          onClick={handleMinimize}
          title="Minimize"
          className="group flex h-full w-10 items-center justify-center text-gray-600 transition-colors duration-100 hover:bg-white/6 hover:text-gray-300"
        >
          <MinimizeIcon />
        </button>

        {/* Maximize / Restore */}
        <button
          onClick={handleMaximize}
          title={isMaximized ? 'Restore' : 'Maximize'}
          className="group flex h-full w-10 items-center justify-center text-gray-600 transition-colors duration-100 hover:bg-white/6 hover:text-gray-300"
        >
          {isMaximized ? <RestoreIcon /> : <MaximizeIcon />}
        </button>

        {/* Close */}
        <button
          onClick={handleClose}
          title="Close"
          className="group flex h-full w-10 items-center justify-center text-gray-600 transition-colors duration-100 hover:bg-red-500/80 hover:text-white"
        >
          <CloseIcon />
        </button>
      </div>

      {/* Quick theme switcher — opened by right-clicking the settings cog. */}
      {themeMenu && (
        <ContextMenu
          x={themeMenu.x}
          y={themeMenu.y}
          size="sm"
          align="end"
          onClose={() => setThemeMenu(null)}
        >
          <MenuLabel>Theme</MenuLabel>
          {THEME_OPTIONS.map((opt) => (
            <MenuItem
              key={opt.value}
              label={opt.label}
              checked={theme === opt.value}
              onSelect={() => setTheme(opt.value)}
            />
          ))}
        </ContextMenu>
      )}
    </div>
  )
}
