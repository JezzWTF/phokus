import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { tileSizeForZoom, useGalleryStore, SortOrder, MediaFilter, SearchCommand, parseSearchValue, searchModeLabel, ExploreTagEntry } from "../store";

const BASE_SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: "date_desc", label: "Newest first" },
  { value: "date_asc", label: "Oldest first" },
  { value: "name_asc", label: "Name A–Z" },
  { value: "name_desc", label: "Name Z–A" },
  { value: "rating_desc", label: "Highest rated" },
  { value: "rating_asc", label: "Lowest rated" },
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

function commandPrefix(command: SearchCommand | null): string | null {
  switch (command) {
    case "semantic":
      return "/s";
    case "tag":
      return "/t";
    default:
      return null;
  }
}

function composeSearchValue(command: SearchCommand | null, query: string): string {
  const prefix = commandPrefix(command);
  if (!prefix) return query;
  return query.length > 0 ? `${prefix} ${query}` : prefix;
}

export function Toolbar() {
  const search = useGalleryStore((state) => state.search);
  const setSearch = useGalleryStore((state) => state.setSearch);
  const clearSearch = useGalleryStore((state) => state.clearSearch);
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
  const minimumRating = useGalleryStore((state) => state.minimumRating);
  const setMinimumRating = useGalleryStore((state) => state.setMinimumRating);
  const failedEmbeddingsOnly = useGalleryStore((state) => state.failedEmbeddingsOnly);
  const setFailedEmbeddingsOnly = useGalleryStore((state) => state.setFailedEmbeddingsOnly);
  const similarScope = useGalleryStore((state) => state.similarScope);
  const setSimilarScope = useGalleryStore((state) => state.setSimilarScope);
  const mediaJobProgress = useGalleryStore((state) => state.mediaJobProgress);
  const zoomPreset = useGalleryStore((state) => state.zoomPreset);
  const setZoomPreset = useGalleryStore((state) => state.setZoomPreset);

  const hasAnyFailedEmbeddings = Object.values(mediaJobProgress).some((p) => p.embedding_failed > 0);

  const [searchCommand, setSearchCommand] = useState<SearchCommand | null>(null);
  const [searchQuery, setSearchQuery] = useState(search);
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  const [tagSuggestions, setTagSuggestions] = useState<ExploreTagEntry[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchShellRef = useRef<HTMLDivElement>(null);
  const userHasTyped = useRef(false);

  const selectedFolder = folders.find((folder) => folder.id === selectedFolderId);
  const title = collectionTitle ?? (selectedFolder ? selectedFolder.name : "All Media");
  const tileSize = tileSizeForZoom(zoomPreset);
  const sortOptions = getSortOptions(mediaFilter);
  const hasActiveSearch = search.trim().length > 0;
  const parsedSearch = parseSearchValue(composeSearchValue(searchCommand, searchQuery));
  const isSimilarResults = collectionTitle === "Similar Images";

  // If current sort is video-only but we switched away from video filter, reset to date_desc
  useEffect(() => {
    if (mediaFilter !== "video" && (sort === "duration_asc" || sort === "duration_desc")) {
      setSort("date_desc");
    }
  }, [mediaFilter, sort, setSort]);

  useEffect(() => {
    if (!userHasTyped.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setSearch(composeSearchValue(searchCommand, searchQuery)); }, 200);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchCommand, searchQuery, setSearch]);

  useEffect(() => {
    const parsed = parseSearchValue(search);
    setSearchCommand(parsed.prefix && parsed.mode !== "filename" ? parsed.mode : null);
    setSearchQuery(parsed.prefix ? parsed.query : search);
  }, [search]);

  // Fetch tag suggestions when in tag mode
  useEffect(() => {
    if (searchCommand !== "tag") {
      setTagSuggestions([]);
      return;
    }
    if (suggestDebounceRef.current) clearTimeout(suggestDebounceRef.current);
    suggestDebounceRef.current = setTimeout(async () => {
      try {
        const results = await invoke<ExploreTagEntry[]>("search_tags_autocomplete", {
          params: { query: searchQuery.trim(), folder_id: selectedFolderId ?? null, limit: 10 },
        });
        setTagSuggestions(results);
      } catch {
        setTagSuggestions([]);
      }
    }, 120);
    return () => { if (suggestDebounceRef.current) clearTimeout(suggestDebounceRef.current); };
  }, [searchCommand, searchQuery, selectedFolderId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const searchFocused = activeElement === searchInputRef.current;
      if (event.key === "Escape" && (searchFocused || hasActiveSearch)) {
        event.preventDefault();
        setSearchCommand(null);
        setSearchQuery("");
        clearSearch();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [clearSearch, hasActiveSearch]);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (searchShellRef.current?.contains(event.target as Node)) return;
      setSearchPanelOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, []);

  const showTagSuggestions = searchCommand === "tag" && searchPanelOpen;
  const showCommandHints = !searchCommand && searchPanelOpen;

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
          {hasActiveSearch && (
            <span className="rounded-md border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-blue-300 shrink-0">
              {searchModeLabel(parsedSearch.mode)}
            </span>
          )}
        </div>

        <div className="flex-1" />

        {/* Search */}
        <div ref={searchShellRef} className="relative">
          <div className="flex items-center rounded-lg border border-white/8 bg-white/5 overflow-hidden">
            <div className="relative">
              <svg className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-600"
                fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(event) => {
                  userHasTyped.current = true;
                  const nextValue = event.target.value;
                  if (!searchCommand) {
                    const parsed = parseSearchValue(nextValue);
                    if (parsed.prefix) {
                      setSearchCommand(parsed.mode === "filename" ? null : parsed.mode);
                      setSearchQuery(parsed.query);
                      return;
                    }
                  }
                  setSearchQuery(nextValue);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Backspace" && searchQuery.length === 0 && searchCommand !== null) {
                    event.preventDefault();
                    setSearchCommand(null);
                  }
                }}
                onFocus={() => setSearchPanelOpen(true)}
                placeholder="Search files, or use /s /t"
                className={`w-64 bg-transparent py-1.5 pr-9 text-sm text-white placeholder:text-gray-600 focus:outline-none transition-colors ${searchCommand !== null ? "pl-16" : "pl-8"}`}
              />
              {searchCommand !== null ? (
                <div className="absolute left-8 top-1/2 -translate-y-1/2">
                  <button
                    type="button"
                    className="rounded-md border border-white/10 bg-white/[0.05] px-1.5 py-0.5 font-mono text-[11px] text-gray-300 transition-colors hover:bg-white/[0.08] hover:text-white"
                    onClick={() => { setSearchCommand(null); setTagSuggestions([]); }}
                    title="Remove search command"
                  >
                    {commandPrefix(searchCommand)}
                  </button>
                </div>
              ) : null}
              {searchQuery.trim().length > 0 || searchCommand !== null ? (
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-500 hover:bg-white/5 hover:text-gray-200 transition-colors"
                  title="Clear search"
                  onClick={() => {
                    setSearchCommand(null);
                    setSearchQuery("");
                    setTagSuggestions([]);
                    clearSearch();
                  }}
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              ) : null}
            </div>
          </div>

          {/* Tag autocomplete suggestions */}
          {showTagSuggestions && tagSuggestions.length > 0 ? (
            <div className="absolute left-0 top-full z-30 mt-1.5 w-72 rounded-xl border border-white/10 bg-gray-950/98 py-1 shadow-2xl backdrop-blur">
              {tagSuggestions.map((entry) => (
                <button
                  key={entry.tag}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-white/[0.05]"
                  onMouseDown={(e) => {
                    // mousedown fires before input blur, so we prevent losing focus
                    e.preventDefault();
                    userHasTyped.current = true;
                    setSearchQuery(entry.tag);
                    setSearch(`/t ${entry.tag}`);
                    setSearchPanelOpen(false);
                    searchInputRef.current?.blur();
                  }}
                >
                  <span className="text-sm text-white/88">{entry.tag}</span>
                  <span className="shrink-0 text-[11px] tabular-nums text-white/30">{entry.count.toLocaleString()}</span>
                </button>
              ))}
            </div>
          ) : null}

          {/* Tag mode with no suggestions yet — show a brief hint */}
          {showTagSuggestions && tagSuggestions.length === 0 && searchQuery.trim().length > 0 ? (
            <div className="absolute left-0 top-full z-30 mt-1.5 w-72 rounded-xl border border-white/10 bg-gray-950/98 px-3 py-2.5 shadow-2xl backdrop-blur">
              <p className="text-xs text-white/25">No matching tags</p>
            </div>
          ) : null}

          {/* Semantic mode hint */}
          {searchCommand === "semantic" && searchPanelOpen ? (
            <div className="absolute left-0 top-full z-30 mt-1.5 w-72 rounded-xl border border-white/10 bg-gray-950/98 px-3 py-2.5 shadow-2xl backdrop-blur">
              <p className="text-xs text-white/40">Search by meaning and visual concepts</p>
            </div>
          ) : null}

          {/* Command hints — only shown when no command is active */}
          {showCommandHints ? (
            <div className="absolute left-0 top-full z-30 mt-1.5 w-64 rounded-xl border border-white/10 bg-gray-950/98 py-1 shadow-2xl backdrop-blur">
              {(
                [
                  { command: "tag" as SearchCommand, prefix: "/t", label: "Tags", description: "Search AI and user tags" },
                  { command: "semantic" as SearchCommand, prefix: "/s", label: "Semantic", description: "Search by meaning" },
                ] as const
              ).map((option) => (
                <button
                  key={option.prefix}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-white/[0.05]"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    userHasTyped.current = true;
                    setSearchCommand(option.command);
                    searchInputRef.current?.focus();
                  }}
                >
                  <span className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[11px] text-gray-400">
                    {option.prefix}
                  </span>
                  <div>
                    <p className="text-sm text-gray-200">{option.label}</p>
                    <p className="text-xs text-gray-500">{option.description}</p>
                  </div>
                </button>
              ))}
            </div>
          ) : null}
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
        <FilterPill label="All" active={mediaFilter === "all" && !favoritesOnly && !failedEmbeddingsOnly && minimumRating === 0} onClick={() => { setMediaFilter("all"); setFavoritesOnly(false); setMinimumRating(0); setFailedEmbeddingsOnly(false); }} />
        <FilterPill label="Images" active={mediaFilter === "image" && !favoritesOnly && !failedEmbeddingsOnly} onClick={() => { setMediaFilter("image"); setFavoritesOnly(false); setFailedEmbeddingsOnly(false); }} />
        <FilterPill label="Videos" active={mediaFilter === "video" && !favoritesOnly && !failedEmbeddingsOnly} onClick={() => { setMediaFilter("video"); setFavoritesOnly(false); setFailedEmbeddingsOnly(false); }} />
        <FilterPill label="Favorites" active={favoritesOnly} onClick={() => { setFavoritesOnly(!favoritesOnly); setFailedEmbeddingsOnly(false); }} />
        <FilterPill label="Rated" active={minimumRating === 1} onClick={() => { setMinimumRating(minimumRating === 1 ? 0 : 1); setFailedEmbeddingsOnly(false); }} />
        <FilterPill label="4★+" active={minimumRating === 4} onClick={() => { setMinimumRating(minimumRating === 4 ? 0 : 4); setFailedEmbeddingsOnly(false); }} />
        <FilterPill label="Similar: Folder" active={similarScope === "current_folder"} onClick={() => setSimilarScope("current_folder")} />
        <FilterPill label="Similar: All" active={similarScope === "all_media"} onClick={() => setSimilarScope("all_media")} />
        {hasAnyFailedEmbeddings ? (
          <FilterPill
            label="Failed Embeddings"
            active={failedEmbeddingsOnly}
            variant="amber"
            onClick={() => setFailedEmbeddingsOnly(!failedEmbeddingsOnly)}
          />
        ) : null}
        {isSimilarResults ? <span className="ml-2 text-[11px] text-gray-500">Current similar scope: {similarScope === "current_folder" ? "current folder" : "all media"}</span> : null}
      </div>
    </div>
  );
}
