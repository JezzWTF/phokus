import { useEffect, useRef, useState } from "react";
import { tileSizeForZoom, useGalleryStore, SortOrder, MediaFilter, SearchMode } from "../store";

const BASE_SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: "date_desc", label: "Newest first" },
  { value: "date_asc", label: "Oldest first" },
  { value: "name_asc", label: "Name A–Z" },
  { value: "name_desc", label: "Name Z–A" },
  { value: "size_desc", label: "Largest first" },
  { value: "size_asc", label: "Smallest first" },
];

const VIDEO_SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: "duration_desc", label: "Longest first" },
  { value: "duration_asc", label: "Shortest first" },
];

function getSortOptions(mediaFilter: MediaFilter) {
  if (mediaFilter === "video") {
    return [...BASE_SORT_OPTIONS, ...VIDEO_SORT_OPTIONS];
  }
  return BASE_SORT_OPTIONS;
}

function SortDropdown({
  value,
  onChange,
  options,
}: {
  value: SortOrder;
  onChange: (v: SortOrder) => void;
  options: { value: SortOrder; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value) ?? BASE_SORT_OPTIONS[0];

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
          open
            ? "border-white/15 bg-white/8 text-white"
            : "border-white/8 bg-transparent text-gray-400 hover:border-white/15 hover:text-gray-200"
        }`}
      >
        <span>{current?.label ?? "Sort"}</span>
        <svg
          className={`h-3 w-3 text-gray-500 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-30 mt-1.5 min-w-44 rounded-xl border border-white/10 bg-gray-950/98 p-1 shadow-2xl backdrop-blur">
          {options.map((option) => (
            <button
              key={option.value}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                option.value === value
                  ? "bg-white/6 text-white"
                  : "text-gray-400 hover:bg-white/5 hover:text-white"
              }`}
              onClick={() => { onChange(option.value); setOpen(false); }}
            >
              {option.label}
              {option.value === value ? (
                <svg className="h-3.5 w-3.5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FilterPill({
  label,
  active,
  onClick,
  variant = "default",
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  variant?: "default" | "amber";
}) {
  const activeClass =
    variant === "amber"
      ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
      : "bg-white/10 text-white";
  return (
    <button
      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150 ${
        active
          ? activeClass
          : "text-gray-500 hover:text-gray-200 hover:bg-white/5"
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
  const clearSearch = useGalleryStore((state) => state.clearSearch);
  const searchMode = useGalleryStore((state) => state.searchMode);
  const setSearchMode = useGalleryStore((state) => state.setSearchMode);
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
  const failedEmbeddingsOnly = useGalleryStore((state) => state.failedEmbeddingsOnly);
  const setFailedEmbeddingsOnly = useGalleryStore((state) => state.setFailedEmbeddingsOnly);
  const mediaJobProgress = useGalleryStore((state) => state.mediaJobProgress);
  const zoomPreset = useGalleryStore((state) => state.zoomPreset);
  const setZoomPreset = useGalleryStore((state) => state.setZoomPreset);

  const hasAnyFailedEmbeddings = Object.values(mediaJobProgress).some((p) => p.embedding_failed > 0);

  const [searchValue, setSearchValue] = useState(search);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  // Tracks whether the user has typed in the search box at least once.
  // Prevents the debounce effect from dispatching setSearch on initial mount
  // when searchValue === search (which would wipe a loadSimilarImages result).
  const userHasTyped = useRef(false);

  const selectedFolder = folders.find((folder) => folder.id === selectedFolderId);
  const title = collectionTitle ?? (selectedFolder ? selectedFolder.name : "All Media");
  const tileSize = tileSizeForZoom(zoomPreset);
  const sortOptions = getSortOptions(mediaFilter);
  const hasActiveSearch = search.trim().length > 0;

  const searchModes: { value: SearchMode; label: string }[] = [
    { value: "filename", label: "Filename" },
    { value: "semantic", label: "Semantic" },
  ];

  // If current sort is video-only but we switched away from video filter, reset to date_desc
  useEffect(() => {
    if (mediaFilter !== "video" && (sort === "duration_asc" || sort === "duration_desc")) {
      setSort("date_desc");
    }
  }, [mediaFilter, sort, setSort]);

  useEffect(() => {
    if (!userHasTyped.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setSearch(searchValue); }, 200);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchValue, setSearch]);

  useEffect(() => {
    setSearchValue(search);
  }, [search]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isModeToggle = (event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "s";
      if (isModeToggle) {
        event.preventDefault();
        setSearchMode(searchMode === "semantic" ? "filename" : "semantic");
        searchInputRef.current?.focus();
        return;
      }

      const activeElement = document.activeElement;
      const searchFocused = activeElement === searchInputRef.current;
      if (event.key === "Escape" && (searchFocused || hasActiveSearch)) {
        event.preventDefault();
        setSearchValue("");
        clearSearch();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [clearSearch, hasActiveSearch, searchMode, setSearchMode]);

  return (
    <div className="relative z-20 shrink-0 border-b border-white/[0.06] bg-gray-950/80 backdrop-blur-xl">
      {/* Primary row */}
      <div className="flex items-center gap-3 px-5 h-12">
        {/* Title + count */}
        <div className="flex items-baseline gap-2.5 min-w-0 shrink-0">
          <h2 className="text-[15px] font-semibold text-white truncate max-w-48">{title}</h2>
          <span className="text-xs text-gray-600 shrink-0">
            {loadedCount < totalImages
              ? `${loadedCount.toLocaleString()} / ${totalImages.toLocaleString()}`
              : totalImages.toLocaleString()}
          </span>
          {(hasActiveSearch || searchMode === "semantic") && (
            <span className="rounded-md border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-blue-300 shrink-0">
              {searchMode === "semantic" ? "Semantic Search" : "Filename Search"}
            </span>
          )}
        </div>

        <div className="flex-1" />

        {/* Search */}
        <div className="flex items-center rounded-lg border border-white/8 bg-white/5 overflow-hidden">
          <div className="flex items-center pl-2 pr-1 gap-1 border-r border-white/8">
            {searchModes.map((mode) => (
              <button
                key={mode.value}
                className={`rounded-md px-2 py-1 text-[11px] transition-colors ${
                  searchMode === mode.value
                    ? "bg-white/10 text-white"
                    : "text-gray-500 hover:text-gray-200"
                }`}
                title={mode.value === "semantic" ? "Toggle with Ctrl/Cmd+Shift+S" : "Toggle with Ctrl/Cmd+Shift+S"}
                onClick={() => setSearchMode(mode.value)}
              >
                {mode.label}
              </button>
            ))}
          </div>
          <div className="relative">
            <svg className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-600"
              fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
            </svg>
            <input
              ref={searchInputRef}
              type="text"
              value={searchValue}
              onChange={(event) => {
                userHasTyped.current = true;
                setSearchValue(event.target.value);
              }}
              placeholder={searchMode === "semantic" ? "Search by meaning..." : "Search filenames..."}
              className="w-64 bg-transparent py-1.5 pl-8 pr-9 text-sm text-white placeholder:text-gray-600 focus:outline-none transition-colors"
            />
            {searchValue.trim().length > 0 && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-500 hover:bg-white/5 hover:text-gray-200 transition-colors"
                title="Clear search"
                onClick={() => {
                  setSearchValue("");
                  clearSearch();
                }}
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Sort */}
        <SortDropdown value={sort} onChange={setSort} options={sortOptions} />

        {/* Divider */}
        <div className="h-4 w-px bg-white/10 shrink-0" />

        {/* Zoom */}
        <div className="flex items-center rounded-lg border border-white/8 overflow-hidden">
          {(["compact", "comfortable", "detail"] as const).map((preset, i) => (
            <button
              key={preset}
              className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                i > 0 ? "border-l border-white/8" : ""
              } ${
                zoomPreset === preset
                  ? "bg-white/10 text-white"
                  : "text-gray-500 hover:text-gray-200 hover:bg-white/5"
              }`}
              title={`${tileSize}px tiles`}
              onClick={() => setZoomPreset(preset)}
            >
              {preset === "compact" ? "S" : preset === "comfortable" ? "M" : "L"}
            </button>
          ))}
        </div>
      </div>

      {/* Filter row */}
      <div className="flex items-center gap-1 px-4 pb-1.5">
        <FilterPill label="All" active={mediaFilter === "all" && !favoritesOnly && !failedEmbeddingsOnly} onClick={() => { setMediaFilter("all"); setFavoritesOnly(false); setFailedEmbeddingsOnly(false); }} />
        <FilterPill label="Images" active={mediaFilter === "image" && !favoritesOnly && !failedEmbeddingsOnly} onClick={() => { setMediaFilter("image"); setFavoritesOnly(false); setFailedEmbeddingsOnly(false); }} />
        <FilterPill label="Videos" active={mediaFilter === "video" && !favoritesOnly && !failedEmbeddingsOnly} onClick={() => { setMediaFilter("video"); setFavoritesOnly(false); setFailedEmbeddingsOnly(false); }} />
        <FilterPill label="Favorites" active={favoritesOnly} onClick={() => { setFavoritesOnly(!favoritesOnly); setFailedEmbeddingsOnly(false); }} />
        {hasAnyFailedEmbeddings ? (
          <FilterPill
            label="Failed Embeddings"
            active={failedEmbeddingsOnly}
            variant="amber"
            onClick={() => setFailedEmbeddingsOnly(!failedEmbeddingsOnly)}
          />
        ) : null}
      </div>
    </div>
  );
}
