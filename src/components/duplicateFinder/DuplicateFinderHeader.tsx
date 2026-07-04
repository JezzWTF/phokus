import { DuplicateGroup, DuplicateScanProgress } from "../../store";
import { FolderScopeDropdown } from "../FolderScopeDropdown";
import { Tooltip } from "../Tooltip";
import { WarningIcon } from "../icons";
import {
  duplicateProgressLabel,
  duplicateProgressPercent,
  formatBytes,
  formatRelativeTime,
} from "./format";

export function DuplicateFinderHeader({
  confirmingDelete,
  deleteResult,
  deleting,
  duplicateGroups,
  duplicateLastScanned,
  duplicateScanError,
  duplicateScanning,
  duplicateScanProgress,
  duplicateScanWarning,
  hasResults,
  hasScanned,
  onClearSelection,
  onConfirmDelete,
  onDelete,
  onScan,
  onSelectKeepFirstAll,
  selectedCount,
  setConfirmingDelete,
}: {
  confirmingDelete: boolean;
  deleteResult: string | null;
  deleting: boolean;
  duplicateGroups: DuplicateGroup[];
  duplicateLastScanned: number | null;
  duplicateScanError: string | null;
  duplicateScanning: boolean;
  duplicateScanProgress: DuplicateScanProgress | null;
  duplicateScanWarning: string | null;
  hasResults: boolean;
  hasScanned: boolean;
  onClearSelection: () => void;
  onConfirmDelete: () => void;
  onDelete: () => void;
  onScan: () => void;
  onSelectKeepFirstAll: () => void;
  selectedCount: number;
  setConfirmingDelete: (value: boolean | ((current: boolean) => boolean)) => void;
}) {
  const totalWasted = duplicateGroups.reduce(
    (sum, group) => sum + group.file_size * (group.images.length - 1),
    0,
  );
  const totalDuplicateImages = duplicateGroups.reduce((sum, group) => sum + group.images.length - 1, 0);
  const progressLabel = duplicateProgressLabel(duplicateScanProgress);
  const progressPercent = duplicateProgressPercent(duplicateScanProgress);

  return (
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
          {!duplicateScanning && duplicateLastScanned !== null ? (
            <p className="mt-0.5 text-[10px] text-white/20">
              Last scanned {formatRelativeTime(duplicateLastScanned)}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <FolderScopeDropdown />
          {hasResults && selectedCount === 0 && !deleting ? (
            <Tooltip label={`Mark ${totalDuplicateImages} duplicate${totalDuplicateImages === 1 ? "" : "s"} for deletion across all groups (keeps first in each)`} anchorToCursor>
              <button
                className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-gray-400 transition-colors hover:bg-white/[0.07] hover:text-white light-theme:border-gray-700/50 light-theme:bg-gray-900 light-theme:text-white light-theme:hover:bg-gray-800 light-theme:hover:text-white"
                onClick={onSelectKeepFirstAll}
              >
                Select all duplicates
              </button>
            </Tooltip>
          ) : null}
          {selectedCount > 0 ? (
            <>
              <span className="text-[11px] text-white/40">{selectedCount} marked for deletion</span>
              <button
                className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-gray-400 transition-colors hover:bg-white/[0.07] hover:text-white disabled:opacity-40 light-theme:border-gray-700/50 light-theme:bg-gray-900 light-theme:text-white light-theme:hover:bg-gray-800 light-theme:hover:text-white"
                onClick={onClearSelection}
                disabled={deleting}
              >
                Deselect all
              </button>
              <div className="relative">
                <button
                  className="rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-1.5 text-xs text-red-300 transition-colors hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => setConfirmingDelete((value) => !value)}
                  disabled={deleting}
                >
                  {deleting ? "Deleting…" : `Delete ${selectedCount} file${selectedCount === 1 ? "" : "s"}`}
                </button>
                {confirmingDelete && !deleting ? (
                  <>
                    <div className="fixed inset-0 z-40" onClick={onConfirmDelete} />
                    <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-red-500/30 bg-gray-950/98 p-3 text-left shadow-2xl backdrop-blur">
                      <div className="mb-1 flex items-center gap-1.5 text-red-300">
                        <WarningIcon className="h-3.5 w-3.5 shrink-0" />
                        <p className="text-xs font-semibold">Delete from disk</p>
                      </div>
                      <p className="mb-2.5 text-[11px] leading-relaxed text-gray-400">
                        Permanently delete {selectedCount} file{selectedCount === 1 ? "" : "s"} from your computer.
                        This removes the actual file{selectedCount === 1 ? "" : "s"} from disk and cannot be undone.
                      </p>
                      <div className="flex justify-end gap-1.5">
                        <button
                          className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
                          onClick={onConfirmDelete}
                        >
                          Cancel
                        </button>
                        <button
                          className="rounded-md bg-red-500/20 px-2.5 py-1 text-[11px] font-medium text-red-300 transition-colors hover:bg-red-500/30 hover:text-red-200"
                          onClick={onDelete}
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
            onClick={onScan}
            disabled={duplicateScanning}
          >
            {duplicateScanning ? "Scanning…" : hasScanned ? "Rescan" : "Scan for duplicates"}
          </button>
        </div>
      </div>

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
  );
}
