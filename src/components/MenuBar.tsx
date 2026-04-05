import { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { MediaFilter, ZoomPreset, useGalleryStore } from "../store";

type MenuKey = "library" | "view" | "filter";

function MenuButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
        active ? "bg-white/10 text-white" : "text-gray-400 hover:bg-white/5 hover:text-white"
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function MenuPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute left-0 top-full z-30 mt-2 min-w-56 rounded-xl border border-white/10 bg-gray-950/95 p-2 shadow-2xl backdrop-blur">
      {children}
    </div>
  );
}

function MenuItem({
  label,
  hint,
  active = false,
  onClick,
}: {
  label: string;
  hint?: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
        active ? "bg-blue-500/15 text-white" : "text-gray-300 hover:bg-white/5 hover:text-white"
      }`}
      onClick={onClick}
    >
      <span>{label}</span>
      {hint ? <span className="text-xs text-gray-500">{hint}</span> : null}
    </button>
  );
}

const ZOOM_OPTIONS: { value: ZoomPreset; label: string }[] = [
  { value: "compact", label: "Compact Grid" },
  { value: "comfortable", label: "Comfortable Grid" },
  { value: "detail", label: "Detail Grid" },
];

const FILTER_OPTIONS: { value: MediaFilter; label: string }[] = [
  { value: "all", label: "All Media" },
  { value: "image", label: "Images" },
  { value: "video", label: "Videos" },
];

export function MenuBar() {
  const [openMenu, setOpenMenu] = useState<MenuKey | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const addFolder = useGalleryStore((state) => state.addFolder);
  const reindexFolder = useGalleryStore((state) => state.reindexFolder);
  const selectedFolderId = useGalleryStore((state) => state.selectedFolderId);
  const zoomPreset = useGalleryStore((state) => state.zoomPreset);
  const setZoomPreset = useGalleryStore((state) => state.setZoomPreset);
  const mediaFilter = useGalleryStore((state) => state.mediaFilter);
  const setMediaFilter = useGalleryStore((state) => state.setMediaFilter);
  const favoritesOnly = useGalleryStore((state) => state.favoritesOnly);
  const setFavoritesOnly = useGalleryStore((state) => state.setFavoritesOnly);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  const handleAddFolder = async () => {
    const selected = await open({ directory: true, multiple: false, title: "Select Media Folder" });
    if (selected && typeof selected === "string") {
      await addFolder(selected);
    }
    setOpenMenu(null);
  };

  const handleReindex = async () => {
    if (selectedFolderId !== null) {
      await reindexFolder(selectedFolderId);
    }
    setOpenMenu(null);
  };

  return (
    <div ref={rootRef} className="relative z-20 flex items-center gap-1 border-b border-white/5 bg-gray-950/90 px-4 py-2 backdrop-blur">
      <div className="relative">
        <MenuButton
          label="Library"
          active={openMenu === "library"}
          onClick={() => setOpenMenu((current) => (current === "library" ? null : "library"))}
        />
        {openMenu === "library" ? (
          <MenuPanel>
            <MenuItem label="Add Folder" hint="Ctrl+O soon" onClick={handleAddFolder} />
            <MenuItem
              label="Re-index Current Folder"
              hint={selectedFolderId === null ? "Select folder" : undefined}
              onClick={handleReindex}
              active={selectedFolderId !== null}
            />
          </MenuPanel>
        ) : null}
      </div>

      <div className="relative">
        <MenuButton
          label="View"
          active={openMenu === "view"}
          onClick={() => setOpenMenu((current) => (current === "view" ? null : "view"))}
        />
        {openMenu === "view" ? (
          <MenuPanel>
            {ZOOM_OPTIONS.map((option) => (
              <MenuItem
                key={option.value}
                label={option.label}
                active={zoomPreset === option.value}
                onClick={() => {
                  setZoomPreset(option.value);
                  setOpenMenu(null);
                }}
              />
            ))}
          </MenuPanel>
        ) : null}
      </div>

      <div className="relative">
        <MenuButton
          label="Filter"
          active={openMenu === "filter"}
          onClick={() => setOpenMenu((current) => (current === "filter" ? null : "filter"))}
        />
        {openMenu === "filter" ? (
          <MenuPanel>
            {FILTER_OPTIONS.map((option) => (
              <MenuItem
                key={option.value}
                label={option.label}
                active={mediaFilter === option.value}
                onClick={() => {
                  setMediaFilter(option.value);
                  setOpenMenu(null);
                }}
              />
            ))}
            <div className="my-2 h-px bg-white/5" />
            <MenuItem
              label={favoritesOnly ? "Hide Favorites Only" : "Show Favorites Only"}
              active={favoritesOnly}
              onClick={() => {
                setFavoritesOnly(!favoritesOnly);
                setOpenMenu(null);
              }}
            />
          </MenuPanel>
        ) : null}
      </div>
    </div>
  );
}
