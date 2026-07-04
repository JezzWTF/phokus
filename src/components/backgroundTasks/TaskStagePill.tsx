import type { WorkerKey } from "../../store";
import { Tooltip } from "../Tooltip";
import { PlayIcon } from "../icons";
import type { TaskStage } from "./types";
import { WORKER_FOR_STAGE } from "./types";

export function TaskStagePill({
  folderId,
  isWorkerPaused,
  mutedWhenPaused = false,
  onToggleWorker,
  stage,
}: {
  folderId: number;
  isWorkerPaused: (folderId: number, worker: WorkerKey) => boolean;
  mutedWhenPaused?: boolean;
  onToggleWorker: (folderId: number, worker: WorkerKey) => void;
  stage: TaskStage;
}) {
  const workerKey = WORKER_FOR_STAGE[stage.label];
  const isPaused = workerKey ? isWorkerPaused(folderId, workerKey) : false;

  return (
    <span
      className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] shrink-0 ${
        stage.failed
          ? "bg-amber-500/10 text-amber-400 light-theme:border light-theme:border-amber-500/40 light-theme:bg-amber-100 light-theme:text-amber-700"
          : isPaused
            ? "bg-white/4 text-gray-600"
            : mutedWhenPaused
              ? "bg-white/5 text-gray-500"
              : "bg-white/5 text-gray-400"
      }`}
    >
      {isPaused && mutedWhenPaused ? (
        <svg className="h-2 w-2 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
          <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
        </svg>
      ) : null}
      <span>{stage.label}</span>
      <span className={`tabular-nums ${stage.failed ? "text-amber-500 light-theme:text-amber-700" : isPaused && !mutedWhenPaused ? "text-gray-700" : "text-gray-600"}`}>
        {stage.detail}
      </span>
      {workerKey ? (
        <Tooltip label={isPaused ? `Resume ${stage.label}` : `Pause ${stage.label}`} anchorToCursor>
        <button
          className={mutedWhenPaused ? "ml-0.5 text-gray-600 hover:text-white transition-colors" : "ml-0.5 opacity-0 group-hover:opacity-100 hover:text-white transition-opacity"}
          onClick={(event) => {
            event.stopPropagation();
            onToggleWorker(folderId, workerKey);
          }}
        >
          {isPaused ? (
            <PlayIcon className="h-2.5 w-2.5" />
          ) : (
            <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          )}
        </button>
        </Tooltip>
      ) : null}
    </span>
  );
}
