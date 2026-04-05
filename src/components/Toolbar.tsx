import { useEffect, useRef, useState } from "react";
import { tileSizeForZoom, useGalleryStore, SortOrder } from "../store";

const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: "date_desc", label: "Newest first" },
  { value: "date_asc", label: "Oldest first" },
  { value: "name_asc", label: "Name A-Z" },
  { value: "name_desc", label: "Name Z-A" },
  { value: "size_desc", label: "Largest first" },
  { value: "size_asc", label: "Smallest first" },
];

function FilterChip({
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
      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
        active
          ? "border-blue-400/50 bg-blue-500/15 text-white"
          : "border-white/10 bg-white/5 text-gray-400 hover:border-white/20 hover:text-white"
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export function Toolbar() {
  const search = useGalleryStore((state) => state.search);
  const setSearch = useGalleryStore((state) => state.setSearch);
  const sort = useGalleryStore((state) => state.sort);
  const setSort = useGalleryStore((state) => state.setSort);
  const totalImages = useGalleryStore((state) => state.totalImages);
  const loadedCount = useGalleryStore((state) => state.loadedCount);
  const selectedFolderId = useGalleryStore((state) => state.selectedFolderId);
  const collectionTitle = useGalleryStore((state) => state.collectionTitle);
  const folders = useGalleryStore((state) => state.folders);
  const mediaFilter = useGalleryStore((state) => state.mediaFilter);
  const setMediaFilter = useGalleryStore((state) => state.setMediaFilter);
  const favoritesOnly = useGalleryStore((state) => state.favoritesOnly);
  const setFavoritesOnly = useGalleryStore((state) => state.setFavoritesOnly);
  const zoomPreset = useGalleryStore((state) => state.zoomPreset);
  const setZoomPreset = useGalleryStore((state) => state.setZoomPreset);

  const [searchValue, setSearchValue] = useState(search);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedFolder = folders.find((folder) => folder.id === selectedFolderId);
  const title = collectionTitle ?? (selectedFolder ? selectedFolder.name : "All Media");
  const tileSize = tileSizeForZoom(zoomPreset);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(searchValue);
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchValue, setSearch]);

  return (
    <div className="border-b border-white/5 bg-gray-950/60 px-5 py-4 backdrop-blur-xl shrink-0">
      <div className="flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <h2 className="truncate text-base font-semibold text-white">{title}</h2>
            <div className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-gray-400">
              {favoritesOnly ? "Favorites" : mediaFilter === "all" ? "Mixed Library" : mediaFilter}
            </div>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            {loadedCount < totalImages
              ? `Showing ${loadedCount.toLocaleString()} of ${totalImages.toLocaleString()} items`
              : `${totalImages.toLocaleString()} items ready`}
          </p>
        </div>

        <div className="relative">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"
            />
          </svg>
          <input
            type="text"
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder="Search filenames, scenes, references..."
            className="w-72 rounded-xl border border-white/10 bg-white/5 py-2 pl-9 pr-4 text-sm text-white placeholder:text-gray-500 focus:border-blue-500 focus:outline-none"
          />
        </div>

        <select
          value={sort}
          onChange={(event) => setSort(event.target.value as SortOrder)}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value} className="bg-gray-900">
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <FilterChip label="All" active={mediaFilter === "all"} onClick={() => setMediaFilter("all")} />
        <FilterChip label="Images" active={mediaFilter === "image"} onClick={() => setMediaFilter("image")} />
        <FilterChip label="Videos" active={mediaFilter === "video"} onClick={() => setMediaFilter("video")} />
        <FilterChip label="Favorites" active={favoritesOnly} onClick={() => setFavoritesOnly(!favoritesOnly)} />

        <div className="ml-auto flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs text-gray-400">
          <span className="px-2">Tile {tileSize}px</span>
          <button
            className={`rounded-full px-2 py-1 ${zoomPreset === "compact" ? "bg-white/10 text-white" : "hover:text-white"}`}
            onClick={() => setZoomPreset("compact")}
          >
            S
          </button>
          <button
            className={`rounded-full px-2 py-1 ${zoomPreset === "comfortable" ? "bg-white/10 text-white" : "hover:text-white"}`}
            onClick={() => setZoomPreset("comfortable")}
          >
            M
          </button>
          <button
            className={`rounded-full px-2 py-1 ${zoomPreset === "detail" ? "bg-white/10 text-white" : "hover:text-white"}`}
            onClick={() => setZoomPreset("detail")}
          >
            L
          </button>
        </div>
      </div>
    </div>
  );
}
