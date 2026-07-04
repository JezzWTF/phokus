import { useVirtualizer } from "@tanstack/react-virtual";
import { Tooltip } from "./Tooltip";
import { CloseIcon } from "./icons";
import { FolderRow } from "./folderPicker/FolderRow";
import { StagedFoldersPanel } from "./folderPicker/StagedFoldersPanel";
import { StatusLine } from "./folderPicker/StatusLine";
import { normalizePath } from "./folderPicker/pathUtils";
import { useFolderPicker } from "./folderPicker/useFolderPicker";

export function FolderPickerModal() {
  const folderPicker = useFolderPicker();

  const virtualizer = useVirtualizer({
    count: folderPicker.entries.length,
    getScrollElement: () => folderPicker.scrollRef.current,
    estimateSize: () => 48,
    overscan: 8,
  });

  if (!folderPicker.folderPickerOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 px-6 backdrop-blur-sm"
      onClick={() => folderPicker.setFolderPickerOpen(false)}
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
            <Tooltip label="Close folder picker" anchorToCursor>
              <button
                type="button"
                className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-white/[0.06] hover:text-white light-theme:hover:bg-gray-900 light-theme:hover:text-white"
                onClick={() => folderPicker.setFolderPickerOpen(false)}
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </Tooltip>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <main className="flex min-h-0 flex-1 flex-col px-5 py-4">
            <div className="mb-4 flex items-center gap-2">
              <button
                type="button"
                className="rounded-md border border-white/10 bg-white/[0.035] px-2.5 py-1.5 text-xs text-gray-300 transition-colors hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-40 light-theme:border-gray-700/50 light-theme:bg-gray-900 light-theme:text-white light-theme:hover:bg-gray-800"
                onClick={() => folderPicker.setCurrentPath(folderPicker.listing?.parent ?? null)}
                disabled={!folderPicker.listing?.current}
              >
                Up
              </button>
              {folderPicker.addressEditing ? (
                <form
                  className="flex min-w-0 flex-1 items-center gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    folderPicker.navigateToAddress();
                  }}
                >
                  <label className="sr-only" htmlFor="folder-picker-address">Folder path</label>
                  <input
                    ref={folderPicker.addressInputRef}
                    id="folder-picker-address"
                    className="min-w-0 flex-1 rounded-md border border-white/10 bg-white/[0.035] px-3 py-1.5 font-mono text-xs text-gray-200 placeholder-gray-600 outline-none transition-colors focus:border-white/25 focus:bg-white/[0.055] light-theme:border-gray-700/50 light-theme:bg-gray-900 light-theme:text-white light-theme:placeholder-gray-500 light-theme:focus:bg-gray-800"
                    value={folderPicker.addressDraft}
                    onChange={(event) => folderPicker.updateAddressDraft(event.target.value)}
                    placeholder="Paste or type a folder path"
                    spellCheck={false}
                  />
                  <button
                    type="submit"
                    className="rounded-md border border-white/10 bg-white/[0.035] px-2.5 py-1.5 text-xs text-gray-300 transition-colors hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-40 light-theme:border-gray-700/50 light-theme:bg-gray-900 light-theme:text-white light-theme:hover:bg-gray-800"
                    disabled={folderPicker.loading}
                  >
                    Go
                  </button>
                </form>
              ) : (
                <div
                  className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden rounded-md border border-white/10 bg-white/[0.025] px-2 py-1.5 light-theme:border-gray-300/70 light-theme:bg-gray-900"
                >
                  <nav className="flex min-w-0 items-center gap-1 overflow-hidden">
                    {folderPicker.breadcrumbs.map((crumb, index) => (
                      <span key={`${crumb.path ?? "root"}-${index}`} className="flex min-w-0 items-center gap-1">
                        {index > 0 ? <span className="text-gray-700 light-theme:text-gray-400">/</span> : null}
                        <Tooltip label={crumb.path ?? "Roots"} anchorToCursor>
                          <button
                            type="button"
                            className="max-w-40 truncate rounded px-1.5 py-0.5 text-xs text-gray-400 transition-colors hover:bg-white/[0.06] hover:text-white light-theme:text-gray-500 light-theme:hover:bg-gray-800 light-theme:hover:text-white"
                            onClick={(event) => {
                              event.stopPropagation();
                              folderPicker.setCurrentPath(crumb.path);
                            }}
                          >
                            {crumb.label}
                          </button>
                        </Tooltip>
                      </span>
                    ))}
                  </nav>
                  <button
                    type="button"
                    className="min-w-10 flex-1 self-stretch cursor-text rounded px-1"
                    onClick={folderPicker.beginAddressEdit}
                    aria-label="Edit folder path"
                  />
                </div>
              )}
              <button
                type="button"
                className="rounded-md border border-emerald-400/35 bg-emerald-500/15 px-2.5 py-1.5 text-xs text-emerald-200 transition-colors hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-45"
                onClick={() => folderPicker.stagePath(folderPicker.addressPath)}
                disabled={
                  !folderPicker.addressPath ||
                  folderPicker.addressAlreadyAdded ||
                  folderPicker.addressAlreadyStaged
                }
              >
                Select
              </button>
            </div>

            {folderPicker.error ? (
              <div className="mb-3 rounded-md border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 light-theme:border-amber-600/40 light-theme:bg-amber-100 light-theme:text-amber-800">
                {folderPicker.error}
              </div>
            ) : null}

            <div ref={folderPicker.scrollRef} className="min-h-0 flex-1 overflow-auto rounded-md border border-white/[0.07] bg-white/[0.018] p-2 light-theme:border-gray-300/70 light-theme:bg-gray-900/50">
              {folderPicker.loading ? (
                <div className="flex h-full items-center justify-center text-sm text-gray-500">Loading folders...</div>
              ) : folderPicker.entries.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-gray-500">No folders found here.</div>
              ) : (
                <div
                  className="relative w-full"
                  style={{ height: `${virtualizer.getTotalSize()}px` }}
                >
                  {virtualizer.getVirtualItems().map((virtualItem) => {
                    const entry = folderPicker.entries[virtualItem.index];
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
                          selected={folderPicker.stagedSet.has(normalized)}
                          alreadyAdded={folderPicker.libraryPaths.has(normalized)}
                          onToggle={() => folderPicker.togglePath(entry.path)}
                          onNavigate={() => folderPicker.setCurrentPath(entry.path)}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </main>

          <StagedFoldersPanel
            stagedPaths={folderPicker.stagedPaths}
            onRemove={folderPicker.removeStagedPath}
            onClear={folderPicker.clearStagedPaths}
          />
        </div>

        <footer className="border-t border-white/[0.07] px-5 py-4 light-theme:border-gray-200">
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0 flex-1">
              <StatusLine results={folderPicker.results} />
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                className="rounded-md border border-white/10 bg-white/[0.035] px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-white/[0.07] hover:text-white light-theme:border-gray-700/50 light-theme:bg-gray-900 light-theme:text-white light-theme:hover:bg-gray-800"
                onClick={() => folderPicker.setFolderPickerOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-md border border-white/15 bg-white/[0.08] px-3 py-1.5 text-xs text-white transition-colors hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-45 light-theme:border-gray-700/50 light-theme:bg-gray-900 light-theme:text-white light-theme:hover:bg-gray-800"
                onClick={() => void folderPicker.confirmAdd()}
                disabled={folderPicker.stagedPaths.length === 0 || folderPicker.adding}
              >
                {folderPicker.adding ? "Adding..." : `Add ${folderPicker.stagedPaths.length}`}
              </button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
