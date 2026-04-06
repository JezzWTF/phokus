import { useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

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
    <div
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
      <div className="flex-1" />

      {/* Window control buttons — right side, non-draggable */}
      <div
        className="flex items-stretch h-full"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
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
