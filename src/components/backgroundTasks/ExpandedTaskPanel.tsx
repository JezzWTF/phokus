import type { WorkerKey } from "../../store";
import { DismissTaskButton, FailureActions } from "./BackgroundTaskActions";
import { FailedWorkerItemRow } from "./FailedWorkerItemRow";
import { taskHasTerminalFailure, taskProgress } from "./taskModel";
import { TaskProgressBar } from "./TaskProgressBar";
import { TaskStagePill } from "./TaskStagePill";
import type { BackgroundTask, FailedWorkerItem } from "./types";

export function ExpandedTaskPanel({
  failedEmbeddingItems,
  failedTaggingItems,
  isWorkerPaused,
  onDismiss,
  onLocate,
  onRetry,
  onToggleWorker,
  tasks,
}: {
  failedEmbeddingItems: Record<number, FailedWorkerItem[]>;
  failedTaggingItems: Record<number, FailedWorkerItem[]>;
  isWorkerPaused: (folderId: number, worker: WorkerKey) => boolean;
  onDismiss: (task: BackgroundTask) => void;
  onLocate: (folderId: number) => void;
  onRetry: (task: BackgroundTask) => void;
  onToggleWorker: (folderId: number, worker: WorkerKey) => void;
  tasks: BackgroundTask[];
}) {
  return (
    <div className="border-t border-white/[0.06] bg-white/[0.02] px-5 py-3 space-y-3">
      {tasks.map((task) => {
        const progress = taskProgress(task);
        const failed = taskHasTerminalFailure(task);

        return (
          <div key={task.id}>
            <div className="flex items-center gap-3">
              <span className="text-[12px] text-white/50 w-28 truncate shrink-0">{task.name}</span>

              <div className="flex items-center gap-1.5 flex-1 min-w-0 overflow-hidden">
                {task.stages.map((stage) => (
                  <TaskStagePill
                    key={stage.label}
                    folderId={task.id}
                    isWorkerPaused={isWorkerPaused}
                    mutedWhenPaused
                    onToggleWorker={onToggleWorker}
                    stage={stage}
                  />
                ))}
              </div>

              <TaskProgressBar failed={failed} progress={progress} />

              {failed ? <FailureActions onLocate={onLocate} onRetry={onRetry} task={task} /> : null}

              <DismissTaskButton onDismiss={onDismiss} size="small" task={task} />
            </div>

            {task.currentFile ? (
              <p className="text-[10px] text-gray-600 truncate mt-1 pl-[calc(7rem+0.75rem)]">
                {task.currentFile}
              </p>
            ) : null}

            {failed && failedEmbeddingItems[task.id] && failedEmbeddingItems[task.id].length > 0 ? (
              <div className="mt-2 pl-[calc(7rem+0.75rem)] space-y-0.5">
                {failedEmbeddingItems[task.id].map((item) => (
                  <FailedWorkerItemRow key={item.image_id} item={item} />
                ))}
              </div>
            ) : null}
            {failed && failedTaggingItems[task.id] && failedTaggingItems[task.id].length > 0 ? (
              <div className="mt-2 pl-[calc(7rem+0.75rem)] space-y-0.5">
                {failedTaggingItems[task.id].map((item) => (
                  <FailedWorkerItemRow key={item.image_id} item={item} />
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
