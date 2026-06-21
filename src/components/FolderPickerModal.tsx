import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { DirEntry, DirListing, FolderAddResult, useGalleryStore } from "../store";

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

function folderName(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "");
  const parts = trimmed.split(/[\\/]+/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : path;
}

function buildBreadcrumbs(path: string | null): { label: string; path: string | null }[] {
  if (!path) return [{ label: "This PC / Home", path: null }];

  const separator = path.includes("\\") ? "\\" : "/";
  const normalized = path.replace(/[\\/]+$/, "");
  const windowsDrive = normalized.match(/^[A-Za-z]:/);

  if (windowsDrive) {
    const drive = windowsDrive[0] + "\\";
    const rest = normalized.slice(2).split(/[\\/]+/).filter(Boolean);
    let current = drive;
    return [
      { label: "This PC", path: null },
      { label: drive, path: drive },
      ...rest.map((part) => {
        current = current.endsWith("\\") ? `${current}${part}` : `${current}\\${part}`;
        return { label: part, path: current };
      }),
    ];
  }

  const parts = normalized.split(/[\\/]+/).filter(Boolean);
  let current = separator === "/" ? "" : "";
  return [
    { label: "Home", path: null },
    ...parts.map((part) => {
      current = `${current}/${part}`;
      return { label: part, path: current };
    }),
  ];
}

function StatusLine({ results }: { results: FolderAddResult[] | null }) {
  if (!results) return null;
  const added = results.filter((result) => result.status === "added").length;
  const skipped = results.filter((result) => result.status === "skipped").length;
  const failed = results.filter((result) => result.status === "error").length;
  return (
    <p className="text-xs text-gray-500 light-theme:text-gray-600">
      Added {added}, skipped {skipped}, failed {failed}.
    </p>
  );
}

function FolderRow({
  entry,
  selected,
  alreadyAdded,
  onToggle,
  onNavigate,
}: {
  entry: DirEntry;
  selected: boolean;
  alreadyAdded: boolean;
  onToggle: () => void;
  onNavigate: () => void;
}) {
  return (
    <div
      className={`group flex h-11 items-center gap-3 rounded-md border px-3 transition-colors ${
        alreadyAdded
          ? "border-transparent bg-white/[0.025] text-gray-600 light-theme:bg-gray-900 light-theme:text-gray-500"
          : selected
            ? "border-white/15 bg-white/[0.085] text-white shadow-[inset_0_0_0_1px_rgb(255_255_255_/_0.035)] light-theme:border-gray-700/45 light-theme:bg-gray-800/55 light-theme:text-white"
            : "border-transparent text-gray-300 hover:bg-white/[0.055] hover:text-white light-theme:text-gray-500 light-theme:hover:bg-gray-900 light-theme:hover:text-white"
      }`}
    >
      <button
        type="button"
        className={`grid h-5 w-5 shrink-0 place-items-center rounded border transition-colors ${
          selected
            ? "border-white/30 bg-gray-200 text-gray-950 light-theme:border-gray-700/55 light-theme:bg-gray-700 light-theme:text-white"
            : "border-white/15 bg-white/[0.035] text-transparent hover:border-white/30 light-theme:border-gray-700/50 light-theme:bg-gray-950"
        } ${alreadyAdded ? "cursor-not-allowed opacity-40" : ""}`}
        onClick={onToggle}
        disabled={alreadyAdded}
        aria-label={selected ? `Remove ${entry.name} from folders to add` : `Choose ${entry.name}`}
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      </button>

      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
        onClick={onNavigate}
        title={entry.path}
      >
        <svg className="h-4 w-4 shrink-0 text-amber-300/90" fill="currentColor" viewBox="0 0 24 24">
          <path d="M3 6.5A2.5 2.5 0 015.5 4h4.1l2 2H18.5A2.5 2.5 0 0121 8.5v9A2.5 2.5 0 0118.5 20h-13A2.5 2.5 0 013 17.5v-11z" />
        </svg>
        <span className="truncate text-sm">{entry.name}</span>
      </button>

      {alreadyAdded ? (
        <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-gray-500 light-theme:border-gray-700/40 light-theme:bg-gray-950">
          Added
        </span>
      ) : null}

      <button
        type="button"
        className="rounded-md p-1 text-gray-500 transition-colors hover:bg-white/[0.06] hover:text-white light-theme:hover:bg-gray-900 light-theme:hover:text-white"
        onClick={onNavigate}
        title={entry.has_children ? "Open folder" : "Open folder"}
      >
        <svg className={`h-4 w-4 ${entry.has_children ? "" : "opacity-45"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}

function StagedFoldersPanel({
  stagedPaths,
  onRemove,
  onClear,
}: {
  stagedPaths: string[];
  onRemove: (path: string) => void;
  onClear: () => void;
}) {
  return (
    <aside className="flex min-h-0 w-full flex-col border-t border-white/[0.07] bg-white/[0.018] light-theme:border-gray-300/70 light-theme:bg-gray-900/35 lg:w-80 lg:border-l lg:border-t-0">
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-4 light-theme:border-gray-300/70">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">
          Folders to add ({stagedPaths.length})
        </p>
        {stagedPaths.length > 0 ? (
          <button
            type="button"
            className="rounded px-1.5 py-0.5 text-xs text-gray-400 transition-colors hover:bg-white/[0.06] hover:text-white light-theme:text-gray-500 light-theme:hover:bg-gray-800 light-theme:hover:text-white"
            onClick={onClear}
          >
            Clear all
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {stagedPaths.length === 0 ? (
          <div className="flex h-full min-h-40 flex-col items-center justify-center rounded-md border border-dashed border-white/[0.08] px-5 text-center light-theme:border-gray-700/35">
            <p className="text-sm text-gray-500">No folders selected.</p>
            <p className="mt-1 max-w-52 text-xs leading-relaxed text-gray-600 light-theme:text-gray-500">
              Choose folders on the left and they will collect here.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {stagedPaths.map((path) => (
              <div
                key={path}
                className="group flex min-h-12 items-center gap-2 rounded-md border border-white/[0.07] bg-white/[0.045] px-3 py-2 text-gray-200 transition-colors hover:border-white/15 hover:bg-white/[0.07] light-theme:border-gray-700/40 light-theme:bg-gray-900 light-theme:text-white light-theme:hover:bg-gray-800"
                title={path}
              >
                <svg className="h-4 w-4 shrink-0 text-amber-300/90" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M3 6.5A2.5 2.5 0 015.5 4h4.1l2 2H18.5A2.5 2.5 0 0121 8.5v9A2.5 2.5 0 0118.5 20h-13A2.5 2.5 0 013 17.5v-11z" />
                </svg>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{folderName(path)}</p>
                  <p className="mt-0.5 truncate text-[11px] text-gray-600 light-theme:text-gray-500">{path}</p>
                </div>
                <button
                  type="button"
                  className="rounded-md p-1 text-gray-500 opacity-80 transition-colors hover:bg-white/[0.08] hover:text-white group-hover:opacity-100 light-theme:hover:bg-gray-700"
                  onClick={() => onRemove(path)}
                  aria-label={`Remove ${path} from folders to add`}
                  title="Remove from folders to add"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

export function FolderPickerModal() {
  const folderPickerOpen = useGalleryStore((state) => state.folderPickerOpen);
  const setFolderPickerOpen = useGalleryStore((state) => state.setFolderPickerOpen);
  const folders = useGalleryStore((state) => state.folders);
  const listDirectories = useGalleryStore((state) => state.listDirectories);
  const addFolders = useGalleryStore((state) => state.addFolders);

  const [listing, setListing] = useState<DirListing | null>(null);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [stagedPaths, setStagedPaths] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<FolderAddResult[] | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const libraryPaths = useMemo(() => new Set(folders.map((folder) => normalizePath(folder.path))), [folders]);
  const stagedSet = useMemo(() => new Set(stagedPaths.map(normalizePath)), [stagedPaths]);
  const breadcrumbs = useMemo(() => buildBreadcrumbs(listing?.current ?? null), [listing?.current]);

  const virtualizer = useVirtualizer({
    count: listing?.entries.length ?? 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 48,
    overscan: 8,
  });

  useEffect(() => {
    if (!folderPickerOpen) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void listDirectories(currentPath)
      .then((nextListing) => {
        if (cancelled) return;
        setListing(nextListing);
        scrollRef.current?.scrollTo({ top: 0, left: 0 });
      })
      .catch((loadError) => {
        if (cancelled) return;
        setListing({ current: currentPath, parent: null, entries: [] });
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentPath, folderPickerOpen, listDirectories]);

  useEffect(() => {
    if (!folderPickerOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFolderPickerOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [folderPickerOpen, setFolderPickerOpen]);

  useEffect(() => {
    if (folderPickerOpen) return;
    setCurrentPath(null);
    setListing(null);
    setStagedPaths([]);
    setError(null);
    setResults(null);
    setAdding(false);
  }, [folderPickerOpen]);

  if (!folderPickerOpen) return null;

  const entries = listing?.entries ?? [];

  const togglePath = (path: string) => {
    const normalized = normalizePath(path);
    if (libraryPaths.has(normalized)) return;
    setResults(null);
    setStagedPaths((current) => {
      const exists = current.some((staged) => normalizePath(staged) === normalized);
      return exists ? current.filter((staged) => normalizePath(staged) !== normalized) : [...current, path];
    });
  };

  const removeStagedPath = (path: string) => {
    const normalized = normalizePath(path);
    setResults(null);
    setStagedPaths((current) => current.filter((staged) => normalizePath(staged) !== normalized));
  };

  const clearStagedPaths = () => {
    setResults(null);
    setStagedPaths([]);
  };

  const confirmAdd = async () => {
    if (stagedPaths.length === 0 || adding) return;
    setAdding(true);
    setError(null);
    try {
      const addResults = await addFolders(stagedPaths);
      const failed = addResults.filter((result) => result.status === "error");
      setResults(addResults);
      if (failed.length > 0) {
        setError(failed.map((failure) => failure.data).join("; "));
        return;
      }
      setFolderPickerOpen(false);
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : String(addError));
    } finally {
      setAdding(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 px-6 backdrop-blur-sm"
      onClick={() => setFolderPickerOpen(false)}
    >
      <div
        className="relative flex h-[min(82vh,760px)] w-[min(90vw,1180px)] flex-col overflow-hidden rounded-lg border border-white/10 bg-gray-950 shadow-2xl shadow-black/60 light-theme:border-gray-300/70"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="border-b border-white/[0.07] px-5 py-4 light-theme:border-gray-200">
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <p className="text-base font-semibold text-white">Add media folders</p>
              <p className="mt-1 text-xs text-gray-500 light-theme:text-gray-600">Choose folders from any location, then add them together.</p>
            </div>
            <button
              type="button"
              className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-white/[0.06] hover:text-white light-theme:hover:bg-gray-900 light-theme:hover:text-white"
              onClick={() => setFolderPickerOpen(false)}
              title="Close folder picker"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <main className="flex min-h-0 flex-1 flex-col px-5 py-4">
            <div className="mb-4 flex items-center gap-2">
              <button
                type="button"
                className="rounded-md border border-white/10 bg-white/[0.035] px-2.5 py-1.5 text-xs text-gray-300 transition-colors hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-40 light-theme:border-gray-700/50 light-theme:bg-gray-900 light-theme:text-white light-theme:hover:bg-gray-800"
                onClick={() => setCurrentPath(listing?.parent ?? null)}
                disabled={!listing?.current}
              >
                Up
              </button>
              <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden rounded-md border border-white/10 bg-white/[0.025] px-2 py-1.5 light-theme:border-gray-300/70 light-theme:bg-gray-900">
                {breadcrumbs.map((crumb, index) => (
                  <span key={`${crumb.path ?? "root"}-${index}`} className="flex min-w-0 items-center gap-1">
                    {index > 0 ? <span className="text-gray-700 light-theme:text-gray-400">/</span> : null}
                    <button
                      type="button"
                      className="max-w-40 truncate rounded px-1.5 py-0.5 text-xs text-gray-400 transition-colors hover:bg-white/[0.06] hover:text-white light-theme:text-gray-500 light-theme:hover:bg-gray-800 light-theme:hover:text-white"
                      onClick={() => setCurrentPath(crumb.path)}
                      title={crumb.path ?? "Roots"}
                    >
                      {crumb.label}
                    </button>
                  </span>
                ))}
              </nav>
            </div>

            {error ? (
              <div className="mb-3 rounded-md border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 light-theme:border-amber-600/40 light-theme:bg-amber-100 light-theme:text-amber-800">
                {error}
              </div>
            ) : null}

            <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto rounded-md border border-white/[0.07] bg-white/[0.018] p-2 light-theme:border-gray-300/70 light-theme:bg-gray-900/50">
              {loading ? (
                <div className="flex h-full items-center justify-center text-sm text-gray-500">Loading folders...</div>
              ) : entries.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-gray-500">No folders found here.</div>
              ) : (
                <div
                  className="relative w-full"
                  style={{ height: `${virtualizer.getTotalSize()}px` }}
                >
                  {virtualizer.getVirtualItems().map((virtualItem) => {
                    const entry = entries[virtualItem.index];
                    const normalized = normalizePath(entry.path);
                    return (
                      <div
                        key={virtualItem.key}
                        className="absolute left-0 top-0 w-full px-0.5"
                        style={{
                          height: `${virtualItem.size}px`,
                          transform: `translateY(${virtualItem.start}px)`,
                        }}
                      >
                        <FolderRow
                          entry={entry}
                          selected={stagedSet.has(normalized)}
                          alreadyAdded={libraryPaths.has(normalized)}
                          onToggle={() => togglePath(entry.path)}
                          onNavigate={() => setCurrentPath(entry.path)}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </main>

          <StagedFoldersPanel
            stagedPaths={stagedPaths}
            onRemove={removeStagedPath}
            onClear={clearStagedPaths}
          />
        </div>

        <footer className="border-t border-white/[0.07] px-5 py-4 light-theme:border-gray-200">
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0 flex-1">
              <StatusLine results={results} />
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                className="rounded-md border border-white/10 bg-white/[0.035] px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-white/[0.07] hover:text-white light-theme:border-gray-700/50 light-theme:bg-gray-900 light-theme:text-white light-theme:hover:bg-gray-800"
                onClick={() => setFolderPickerOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-md border border-white/15 bg-white/[0.08] px-3 py-1.5 text-xs text-white transition-colors hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-45 light-theme:border-gray-700/50 light-theme:bg-gray-900 light-theme:text-white light-theme:hover:bg-gray-800"
                onClick={() => void confirmAdd()}
                disabled={stagedPaths.length === 0 || adding}
              >
                {adding ? "Adding..." : `Add ${stagedPaths.length}`}
              </button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
