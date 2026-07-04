import type { WorkerKey } from '../../store'
import { ChevronDownIcon } from '../icons'
import { DismissTaskButton, FailureActions } from './BackgroundTaskActions'
import { TaskProgressBar } from './TaskProgressBar'
import { TaskStagePill } from './TaskStagePill'
import type { BackgroundTask } from './types'

export function BackgroundTaskSummary({
  expanded,
  extraCount,
  hasFailed,
  isWorkerPaused,
  onDismiss,
  onLocate,
  onRetry,
  onToggleExpanded,
  onToggleWorker,
  primary,
  progress,
  taskCount,
}: {
  expanded: boolean
  extraCount: number
  hasFailed: boolean
  isWorkerPaused: (folderId: number, worker: WorkerKey) => boolean
  onDismiss: (task: BackgroundTask) => void
  onLocate: (folderId: number) => void
  onRetry: (task: BackgroundTask) => void
  onToggleExpanded: () => void
  onToggleWorker: (folderId: number, worker: WorkerKey) => void
  primary: BackgroundTask
  progress: number | null
  taskCount: number
}) {
  return (
    <div
      className={`group flex h-11 cursor-pointer items-center gap-3 px-5 transition-colors select-none ${
        expanded ? 'bg-white/[0.03]' : 'hover:bg-white/[0.02]'
      }`}
      onClick={onToggleExpanded}
    >
      <div className="relative shrink-0">
        <div className={`h-1.5 w-1.5 rounded-full ${hasFailed ? 'bg-amber-400' : 'bg-blue-400'}`} />
        <div
          className={`absolute inset-0 h-1.5 w-1.5 animate-ping rounded-full opacity-60 ${hasFailed ? 'bg-amber-400' : 'bg-blue-400'}`}
        />
      </div>

      <span className="shrink-0 text-[13px] font-medium text-white/60">{primary.name}</span>

      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
        {primary.stages.map((stage) => (
          <TaskStagePill
            key={stage.label}
            folderId={primary.id}
            isWorkerPaused={isWorkerPaused}
            onToggleWorker={onToggleWorker}
            stage={stage}
          />
        ))}
      </div>

      <TaskProgressBar failed={hasFailed} progress={progress} widthClass="w-24" />

      {extraCount > 0 ? (
        <span className="shrink-0 rounded-full bg-white/8 px-2 py-0.5 text-[10px] text-gray-500">
          +{extraCount}
        </span>
      ) : null}

      <FailureActions onLocate={onLocate} onRetry={onRetry} task={primary} />

      {taskCount > 1 ? (
        <ChevronDownIcon
          className={`h-3.5 w-3.5 shrink-0 text-gray-600 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
        />
      ) : null}

      <DismissTaskButton onDismiss={onDismiss} task={primary} />
    </div>
  )
}
