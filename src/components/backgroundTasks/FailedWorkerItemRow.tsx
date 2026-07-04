import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { Tooltip } from "../Tooltip";
import { WarningIcon } from "../icons";
import type { FailedWorkerItem } from "./types";

export function FailedWorkerItemRow({ item }: { item: FailedWorkerItem }) {
  return (
    <div className="flex min-w-0 items-start gap-1.5">
      <WarningIcon className="mt-px h-2.5 w-2.5 shrink-0 text-amber-500 light-theme:text-amber-700" strokeWidth={2.5} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[10px] font-medium text-amber-400/80 light-theme:text-amber-700">{item.filename}</p>
        {item.error ? (
          <p className="truncate text-[9px] text-gray-600">{item.error}</p>
        ) : null}
      </div>
      <Tooltip label="Reveal in Explorer" anchorToCursor>
      <button
        className="shrink-0 text-gray-700 transition-colors hover:text-gray-300 light-theme:text-gray-600 light-theme:hover:text-gray-100"
        onClick={() => void revealItemInDir(item.path)}
      >
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
        </svg>
      </button>
      </Tooltip>
    </div>
  );
}
