import { Tooltip } from "../Tooltip";
import { CloseIcon } from "../icons";
import { folderName } from "./pathUtils";

export function StagedFoldersPanel({
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
              <Tooltip key={path} label={path} anchorToCursor block>
                <div className="group flex min-h-12 items-center gap-2 rounded-md border border-white/[0.07] bg-white/[0.045] px-3 py-2 text-gray-200 transition-colors hover:border-white/15 hover:bg-white/[0.07] light-theme:border-gray-700/40 light-theme:bg-gray-900 light-theme:text-white light-theme:hover:bg-gray-800">
                  <svg className="h-4 w-4 shrink-0 text-amber-300/90" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M3 6.5A2.5 2.5 0 015.5 4h4.1l2 2H18.5A2.5 2.5 0 0121 8.5v9A2.5 2.5 0 0118.5 20h-13A2.5 2.5 0 013 17.5v-11z" />
                  </svg>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{folderName(path)}</p>
                    <p className="mt-0.5 truncate text-[11px] text-gray-600 light-theme:text-gray-500">{path}</p>
                  </div>
                  <Tooltip label="Remove from folders to add" anchorToCursor>
                    <button
                      type="button"
                      className="rounded-md p-1 text-gray-500 opacity-80 transition-colors hover:bg-white/[0.08] hover:text-white group-hover:opacity-100 light-theme:hover:bg-gray-700"
                      onClick={() => onRemove(path)}
                      aria-label={`Remove ${path} from folders to add`}
                    >
                      <CloseIcon className="h-3.5 w-3.5" />
                    </button>
                  </Tooltip>
                </div>
              </Tooltip>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
