import { Tooltip } from "../Tooltip";
import { CloseIcon } from "../icons";
import type { BackgroundTask } from "./types";

export function FailureActions({
  onLocate,
  onRetry,
  task,
}: {
  onLocate: (folderId: number) => void;
  onRetry: (task: BackgroundTask) => void;
  task: BackgroundTask;
}) {
  if (task.pendingMediaWork !== 0 || (!task.hasFailedEmbeddings && !task.hasFailedTagging)) return null;

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {task.hasFailedTagging ? (
        <button
          className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-300 transition-colors hover:bg-amber-500/20 light-theme:border-amber-500/50 light-theme:bg-amber-100 light-theme:text-amber-700 light-theme:hover:bg-amber-200"
          onClick={(event) => {
            event.stopPropagation();
            onLocate(task.id);
          }}
        >
          Locate
        </button>
      ) : null}
      <button
        className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-300 transition-colors hover:bg-amber-500/20 light-theme:border-amber-500/50 light-theme:bg-amber-100 light-theme:text-amber-700 light-theme:hover:bg-amber-200"
        onClick={(event) => {
          event.stopPropagation();
          onRetry(task);
        }}
      >
        Retry
      </button>
    </div>
  );
}

export function DismissTaskButton({
  onDismiss,
  size = "normal",
  task,
}: {
  onDismiss: (task: BackgroundTask) => void;
  size?: "normal" | "small";
  task: BackgroundTask;
}) {
  if (task.id < 0) return null;

  return (
    <Tooltip label="Dismiss" anchorToCursor>
    <button
      className="p-1 rounded-md text-gray-600 hover:text-gray-300 hover:bg-white/8 transition-colors shrink-0"
      onClick={(event) => {
        event.stopPropagation();
        onDismiss(task);
      }}
    >
      <CloseIcon className={size === "small" ? "h-3 w-3" : "h-3.5 w-3.5"} />
    </button>
    </Tooltip>
  );
}
