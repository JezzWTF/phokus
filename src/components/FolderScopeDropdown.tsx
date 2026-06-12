import { useEffect, useRef, useState } from "react";
import { useGalleryStore } from "../store";

/**
 * In-view folder scope picker for feature views (Timeline / Explore /
 * Duplicates). Changes the scope via setViewFolderScope, which keeps the
 * current view active — unlike sidebar folder clicks, which jump to Gallery.
 */
export function FolderScopeDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const folders = useGalleryStore((state) => state.folders);
  const selectedFolderId = useGalleryStore((state) => state.selectedFolderId);
  const setViewFolderScope = useGalleryStore((state) => state.setViewFolderScope);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, []);

  const currentLabel =
    selectedFolderId === null
      ? "All Media"
      : folders.find((folder) => folder.id === selectedFolderId)?.name ?? "All Media";

  const select = (folderId: number | null) => {
    setViewFolderScope(folderId);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex max-w-56 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
          open
            ? "border-white/15 bg-white/8 text-white"
            : "border-white/8 bg-transparent text-gray-400 hover:border-white/15 hover:text-gray-200"
        }`}
        title="Change folder scope"
      >
        <svg className="h-3.5 w-3.5 shrink-0 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
        <span className="truncate">{currentLabel}</span>
        <svg
          className={`h-3 w-3 shrink-0 text-gray-500 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-30 mt-1.5 max-h-80 min-w-52 overflow-y-auto rounded-xl border border-white/10 bg-gray-950/98 p-1 shadow-2xl backdrop-blur">
          <button
            className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
              selectedFolderId === null ? "bg-white/6 text-white" : "text-gray-400 hover:bg-white/5 hover:text-white"
            }`}
            onClick={() => select(null)}
          >
            All Media
            {selectedFolderId === null ? (
              <svg className="h-3.5 w-3.5 shrink-0 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            ) : null}
          </button>
          {folders.map((folder) => {
            const active = selectedFolderId === folder.id;
            return (
              <button
                key={folder.id}
                className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  active ? "bg-white/6 text-white" : "text-gray-400 hover:bg-white/5 hover:text-white"
                }`}
                onClick={() => select(folder.id)}
              >
                <span className="min-w-0 truncate">{folder.name}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-[11px] tabular-nums text-gray-600">{folder.image_count.toLocaleString()}</span>
                  {active ? (
                    <svg className="h-3.5 w-3.5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
