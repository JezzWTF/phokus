import { useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { DuplicateGroup, useGalleryStore } from "../store";
import { FolderScopeDropdown } from "./FolderScopeDropdown";
import { mediaSrc } from "../lib/mediaSrc";
import { Tooltip } from "./Tooltip";

function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function DuplicateGroupCard({ group }: { group: DuplicateGroup }) {
  const selectedIds = useGalleryStore((state) => state.duplicateSelectedIds);
  const toggleDuplicateSelected = useGalleryStore((state) => state.toggleDuplicateSelected);
  const selectAllDuplicates = useGalleryStore((state) => state.selectAllDuplicates);
  const groupSelectedCount = group.images.filter((img) => selectedIds.has(img.id)).length;
  const noneSelected = groupSelectedCount === 0;

  // "Keep all but the first" — a common quick action
  const handleKeepFirst = () => {
    const toDelete = group.images.slice(1).map((img) => img.id);
    // Clear any selection for this group first, then add the ones to delete
    for (const img of group.images) {
      if (selectedIds.has(img.id)) toggleDuplicateSelected(img.id);
    }
    selectAllDuplicates(toDelete);
  };

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
      {/* Group header */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-gray-400">
            {group.images.length} copies
          </span>
          <span className="text-[11px] text-white/30">{formatBytes(group.file_size)} each</span>
          <span className="text-[11px] text-white/20">
            {formatBytes(group.file_size * (group.images.length - 1))} wasted
          </span>
        </div>
        <div className="flex items-center gap-2">
          {noneSelected ? (
            <button
              className="text-[11px] text-white/35 transition-colors hover:text-white/70"
              onClick={handleKeepFirst}
            >
              Keep first
            </button>
          ) : (
            <button
              className="text-[11px] text-white/35 transition-colors hover:text-white/70"
              onClick={() => {
                for (const img of group.images) {
                  if (selectedIds.has(img.id)) toggleDuplicateSelected(img.id);
                }
              }}
            >
              Deselect all
            </button>
          )}
        </div>
      </div>

      {/* Image grid */}
      <div className="flex flex-wrap gap-3">
        {group.images.map((image) => {
          const isSelected = selectedIds.has(image.id);
          const src = mediaSrc(image.thumbnail_path);
          return (
            <Tooltip label={image.path} anchorToCursor>
            <button
              key={image.id}
              className={`media-dark-surface group relative overflow-hidden rounded-xl border transition-all ${
                isSelected
                  ? "border-red-400/50 ring-1 ring-red-400/30"
                  : "border-white/8 hover:border-white/20"
              }`}
              style={{ width: 140, height: 105 }}
              onClick={() => toggleDuplicateSelected(image.id)}
            >
              {src ? (
                <img src={src} alt="" className="h-full w-full object-cover" draggable={false} />
              ) : (
                <div className="h-full w-full bg-white/[0.03]" />
              )}
              {/* Delete overlay */}
              {isSelected ? (
                <div className="absolute inset-0 flex items-center justify-center bg-red-950/60">
                  <svg className="h-6 w-6 text-red-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </div>
              ) : null}
              {/* Path tooltip on hover */}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-2 pb-1.5 pt-4 opacity-0 transition-opacity group-hover:opacity-100">
                <p className="truncate text-[9px] text-white/60">{image.path.split(/[\\/]/).slice(-2).join("/")}</p>
              </div>
            </button>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}

function formatRelativeTime(unixSecs: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixSecs;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function DuplicateFinder() {
  const duplicateGroups = useGalleryStore((state) => state.duplicateGroups);
  const duplicateScanning = useGalleryStore((state) => state.duplicateScanning);
  const duplicateScanProgress = useGalleryStore((state) => state.duplicateScanProgress);
  const duplicateScanError = useGalleryStore((state) => state.duplicateScanError);
  const duplicateScanWarning = useGalleryStore((state) => state.duplicateScanWarning);
  const duplicateSelectedIds = useGalleryStore((state) => state.duplicateSelectedIds);
  const duplicateLastScanned = useGalleryStore((state) => state.duplicateLastScanned);
  const selectedFolderId = useGalleryStore((state) => state.selectedFolderId);
  const scanDuplicates = useGalleryStore((state) => state.scanDuplicates);
  const clearDuplicateSelection = useGalleryStore((state) => state.clearDuplicateSelection);
  const selectKeepFirstAllGroups = useGalleryStore((state) => state.selectKeepFirstAllGroups);
  const deleteSelectedDuplicates = useGalleryStore((state) => state.deleteSelectedDuplicates);

  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteResult, setDeleteResult] = useState<string | null>(null);

  // Virtualize the group list so a large result set (e.g. thousands of pairs)
  // only mounts the on-screen cards. Group cards vary in height (number of
  // copies wraps across rows), so heights are measured dynamically.
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: duplicateGroups.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 220,
    overscan: 4,
  });

  const selectedCount = duplicateSelectedIds.size;
  const hasResults = duplicateGroups.length > 0;
  const hasScanned = hasResults || duplicateLastScanned !== null || (!duplicateScanning && duplicateScanProgress !== null);
  const totalWasted = duplicateGroups.reduce(
    (sum, g) => sum + g.file_size * (g.images.length - 1),
    0,
  );
  const totalDuplicateImages = duplicateGroups.reduce((sum, g) => sum + g.images.length - 1, 0);

  const handleDelete = async () => {
    setDeleting(true);
    setConfirmingDelete(false);
    setDeleteResult(null);
    try {
      const deleted = await deleteSelectedDuplicates();
      setDeleteResult(`Deleted ${deleted} file${deleted === 1 ? "" : "s"}.`);
    } catch (e) {
      setDeleteResult(String(e));
    } finally {
      setDeleting(false);
    }
  };

  const progressPercent =
    duplicateScanProgress && duplicateScanProgress.total > 0
      ? Math.round((duplicateScanProgress.processed / duplicateScanProgress.total) * 100)
      : 0;
  const progressLabel = duplicateScanProgress
    ? duplicateScanProgress.phase === "checking"
      ? "Checking file sizes"
      : duplicateScanProgress.phase === "hashing"
        ? "Hashing duplicate candidates"
        : "Confirming exact matches"
    : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-gray-950">
      {/* Header */}
      <div className="shrink-0 border-b border-white/[0.05] px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-[15px] font-semibold text-white">Duplicate Finder</h2>
            <p className="mt-0.5 text-[11px] text-white/30">
              {duplicateScanning
                ? duplicateScanProgress
                  ? `${progressLabel}… ${duplicateScanProgress.processed.toLocaleString()} / ${duplicateScanProgress.total.toLocaleString()}${duplicateScanProgress.skipped > 0 ? ` · ${duplicateScanProgress.skipped.toLocaleString()} skipped` : ""}`
                  : "Starting scan…"
                : hasResults
                  ? `${duplicateGroups.length} group${duplicateGroups.length === 1 ? "" : "s"} · ${formatBytes(totalWasted)} reclaimable`
                  : duplicateLastScanned !== null
                    ? "No duplicates found"
                    : "Scan your library for identical files"}
            </p>
            {!duplicateScanning && duplicateLastScanned !== null && (
              <p className="mt-0.5 text-[10px] text-white/20">
                Last scanned {formatRelativeTime(duplicateLastScanned)}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <FolderScopeDropdown />
            {/* Batch select — only shown when there are groups and nothing is selected yet */}
            {hasResults && selectedCount === 0 && !deleting && (
              <Tooltip label={`Mark ${totalDuplicateImages} duplicate${totalDuplicateImages === 1 ? "" : "s"} for deletion across all groups (keeps first in each)`} anchorToCursor>
              <button
                className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-gray-400 transition-colors hover:bg-white/[0.07] hover:text-white light-theme:border-gray-700/50 light-theme:bg-gray-900 light-theme:text-white light-theme:hover:bg-gray-800 light-theme:hover:text-white"
                onClick={selectKeepFirstAllGroups}
              >
                Select all duplicates
              </button>
              </Tooltip>
            )}
            {selectedCount > 0 ? (
              <>
                <span className="text-[11px] text-white/40">{selectedCount} marked for deletion</span>
                <button
                  className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-gray-400 transition-colors hover:bg-white/[0.07] hover:text-white disabled:opacity-40 light-theme:border-gray-700/50 light-theme:bg-gray-900 light-theme:text-white light-theme:hover:bg-gray-800 light-theme:hover:text-white"
                  onClick={clearDuplicateSelection}
                  disabled={deleting}
                >
                  Deselect all
                </button>
                <div className="relative">
                  <button
                    className="rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-1.5 text-xs text-red-300 transition-colors hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={() => setConfirmingDelete((v) => !v)}
                    disabled={deleting}
                  >
                    {deleting ? "Deleting…" : `Delete ${selectedCount} file${selectedCount === 1 ? "" : "s"}`}
                  </button>
                  {confirmingDelete && !deleting ? (
                    <>
                      {/* Click-away backdrop */}
                      <div className="fixed inset-0 z-40" onClick={() => setConfirmingDelete(false)} />
                      <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-red-500/30 bg-gray-950/98 p-3 text-left shadow-2xl backdrop-blur">
                        <div className="mb-1 flex items-center gap-1.5 text-red-300">
                          <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                          </svg>
                          <p className="text-xs font-semibold">Delete from disk</p>
                        </div>
                        <p className="mb-2.5 text-[11px] leading-relaxed text-gray-400">
                          Permanently delete {selectedCount} file{selectedCount === 1 ? "" : "s"} from your computer.
                          This removes the actual file{selectedCount === 1 ? "" : "s"} from disk and cannot be undone.
                        </p>
                        <div className="flex justify-end gap-1.5">
                          <button
                            className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
                            onClick={() => setConfirmingDelete(false)}
                          >
                            Cancel
                          </button>
                          <button
                            className="rounded-md bg-red-500/20 px-2.5 py-1 text-[11px] font-medium text-red-300 transition-colors hover:bg-red-500/30 hover:text-red-200"
                            onClick={handleDelete}
                          >
                            Delete {selectedCount} from disk
                          </button>
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>
              </>
            ) : null}
            <button
              className="rounded-lg border border-white/10 bg-white/[0.055] px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 light-theme:border-gray-700/50 light-theme:bg-gray-900 light-theme:text-white light-theme:hover:bg-gray-800 light-theme:hover:text-white"
              onClick={() => { setDeleteResult(null); void scanDuplicates(selectedFolderId); }}
              disabled={duplicateScanning}
            >
              {duplicateScanning ? "Scanning…" : hasScanned ? "Rescan" : "Scan for duplicates"}
            </button>
          </div>
        </div>

        {/* Progress bar */}
        {duplicateScanning && duplicateScanProgress ? (
          <div className="mt-3 h-px overflow-hidden rounded-full bg-white/[0.07]">
            <div
              className="h-full rounded-full bg-blue-500/60 transition-[width] duration-200"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        ) : null}

        {duplicateScanError ? (
          <p className="mt-2 text-[11px] text-red-400/80">{duplicateScanError}</p>
        ) : null}
        {duplicateScanWarning ? (
          <p className="mt-2 text-[11px] text-amber-300/70">{duplicateScanWarning}</p>
        ) : null}
        {deleteResult ? (
          <p className="mt-2 text-[11px] text-white/40">{deleteResult}</p>
        ) : null}
      </div>

      {/* Body */}
      {duplicateScanning && !hasResults ? (
        <div className="flex flex-1 items-center justify-center gap-3 text-white/25">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/15 border-t-white/50" />
          <span className="text-sm">{progressLabel ? `${progressLabel}…` : "Preparing scan…"}</span>
        </div>
      ) : !hasScanned ? (
        <div className="flex flex-1 items-center justify-center px-8">
          <div className="max-w-sm text-center">
            <svg className="mx-auto mb-4 h-10 w-10 text-white/10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <p className="text-sm text-white/30">
              Finds files with identical content regardless of filename or location.
              Click <strong className="text-white/50">Scan for duplicates</strong> to begin.
            </p>
            <p className="mt-2 text-xs text-white/20">
              Large libraries may take a minute — files are hashed from disk.
            </p>
          </div>
        </div>
      ) : duplicateGroups.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-white/25">No duplicate files found.</p>
        </div>
      ) : (
        <div ref={scrollRef} className="overflow-y-auto px-6 py-5">
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const group = duplicateGroups[virtualItem.index];
              if (!group) return null;
              return (
                <div
                  key={group.file_hash}
                  data-index={virtualItem.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualItem.start}px)`,
                    paddingBottom: 16,
                  }}
                >
                  <DuplicateGroupCard group={group} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

