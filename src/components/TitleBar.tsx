import { useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useGalleryStore } from "../store";

// SVG icons for window controls
function MinimizeIcon() {
  return (
    <svg width="10" height="2" viewBox="0 0 10 2" fill="none">
      <rect y="0.5" width="10" height="1" rx="0.5" fill="currentColor" />
    </svg>
  );
}

function MaximizeIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <rect x="0.5" y="0.5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <rect x="2.5" y="0.5" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1" />
      <rect x="0.5" y="2.5" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1" fill="#030712" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const setSettingsOpen = useGalleryStore((state) => state.setSettingsOpen);
  const appWindow = getCurrentWindow();

  useEffect(() => {
    // Get initial maximized state
    appWindow.isMaximized().then(setIsMaximized);

    // Listen for resize events to update maximized state
    const unlisten = appWindow.onResized(() => {
      appWindow.isMaximized().then(setIsMaximized);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const handleMinimize = () => appWindow.minimize();
  const handleMaximize = () => appWindow.toggleMaximize();
  const handleClose = () => appWindow.close();

  return (
    // data-tauri-drag-region is the recommended Tauri approach for drag regions.
    // WebkitAppRegion is kept as a CSS fallback for compatibility.
    <div
      data-tauri-drag-region
      className="titlebar relative z-50 flex h-9 shrink-0 items-center bg-gray-950 select-none"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      {/* App icon + name — left side */}
      <div className="flex items-center gap-2 pl-3 pr-4">
        <div className="flex h-5 w-5 items-center justify-center rounded-md bg-white/8 overflow-hidden">
          {/* Phokus logo placeholder — replace with <img src={logo} /> if you have an SVG */}
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <circle cx="6" cy="6" r="4" stroke="#a78bfa" strokeWidth="1.5" />
            <circle cx="6" cy="6" r="1.5" fill="#a78bfa" />
          </svg>
        </div>
        <span className="text-[11px] font-semibold text-gray-400 tracking-wide">Phokus</span>
      </div>

      {/* Spacer — draggable region fills here */}
      <div data-tauri-drag-region className="flex-1" />

      {/* Window control buttons — right side, non-draggable */}
      <div
        className="flex items-stretch h-full"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <button
          onClick={() => setSettingsOpen(true)}
          title="Settings"
          className="group flex h-full w-10 items-center justify-center text-gray-600 transition-colors duration-100 hover:bg-white/6 hover:text-gray-300"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.607 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>

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
          title={isMaximized ? "Restore" : "Maximize"}
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
    </div>
  );
}
