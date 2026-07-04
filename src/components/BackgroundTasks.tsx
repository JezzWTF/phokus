import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useGalleryStore, type WorkerKey } from "../store";
import { BackgroundTaskSummary } from "./backgroundTasks/BackgroundTaskSummary";
import { ExpandedTaskPanel } from "./backgroundTasks/ExpandedTaskPanel";
import { buildDuplicateScanTask, buildFolderTasks, taskHasTerminalFailure, taskProgress } from "./backgroundTasks/taskModel";
import type { BackgroundTask, FailedWorkerItem } from "./backgroundTasks/types";

export function BackgroundTasks() {
  const folders = useGalleryStore((state) => state.folders);
  const indexingProgress = useGalleryStore((state) => state.indexingProgress);
  const mediaJobProgress = useGalleryStore((state) => state.mediaJobProgress);
  const retryFailedEmbeddings = useGalleryStore((state) => state.retryFailedEmbeddings);
  const queueTaggingJobs = useGalleryStore((state) => state.queueTaggingJobs);
  const showFailedTagging = useGalleryStore((state) => state.showFailedTagging);
  const duplicateScanning = useGalleryStore((state) => state.duplicateScanning);
  const duplicateScanProgress = useGalleryStore((state) => state.duplicateScanProgress);
  const workerPaused = useGalleryStore((state) => state.workerPaused);
  const loadWorkerStates = useGalleryStore((state) => state.loadWorkerStates);
  const setWorkerPaused = useGalleryStore((state) => state.setWorkerPaused);
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState<Record<number, string>>({});
  const [failedEmbeddingItems, setFailedEmbeddingItems] = useState<Record<number, FailedWorkerItem[]>>({});
  const [failedTaggingItems, setFailedTaggingItems] = useState<Record<number, FailedWorkerItem[]>>({});

  useEffect(() => {
    void loadWorkerStates();
  }, [folders, loadWorkerStates]);

  const failedEmbeddingCounts = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(mediaJobProgress).map(([id, progress]) => [id, progress?.embedding_failed ?? 0]),
      ),
    [mediaJobProgress],
  );
  const failedTaggingCounts = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(mediaJobProgress).map(([id, progress]) => [id, progress?.tagging_failed ?? 0]),
      ),
    [mediaJobProgress],
  );

  useEffect(() => {
    if (!expanded) return;
    for (const [folderId, count] of Object.entries(failedEmbeddingCounts)) {
      if (count > 0) {
        invoke<FailedWorkerItem[]>("get_failed_embedding_images", {
          folderId: Number(folderId),
        })
          .then((items) => setFailedEmbeddingItems((prev) => ({ ...prev, [folderId]: items })))
          .catch(() => undefined);
      }
    }
    for (const [folderId, count] of Object.entries(failedTaggingCounts)) {
      if (count > 0) {
        invoke<FailedWorkerItem[]>("get_failed_tagging_images", {
          folderId: Number(folderId),
        })
          .then((items) => setFailedTaggingItems((prev) => ({ ...prev, [folderId]: items })))
          .catch(() => undefined);
      }
    }
  }, [expanded, failedEmbeddingCounts, failedTaggingCounts]);

  const folderTasks = useMemo(
    () =>
      buildFolderTasks({
        dismissed,
        folders,
        indexingProgress,
        mediaJobProgress,
        workerPaused,
      }),
    [dismissed, folders, indexingProgress, mediaJobProgress, workerPaused],
  );

  const duplicateScanTask = useMemo(
    () => buildDuplicateScanTask(duplicateScanning, duplicateScanProgress),
    [duplicateScanning, duplicateScanProgress],
  );
  const allTasks = duplicateScanTask ? [duplicateScanTask, ...folderTasks] : folderTasks;

  if (allTasks.length === 0) return null;

  const isWorkerPaused = (folderId: number, worker: WorkerKey) => workerPaused[folderId]?.[worker] ?? false;

  const toggleWorker = (folderId: number, worker: WorkerKey) => {
    setWorkerPaused(folderId, worker, !isWorkerPaused(folderId, worker));
  };

  const dismissTask = (task: BackgroundTask) => {
    if (task.id < 0) return;
    setDismissed((prev) => ({ ...prev, [task.id]: task.snapshot }));
    setExpanded(false);
  };

  const retryTask = (task: BackgroundTask) => {
    if (task.hasFailedEmbeddings) void retryFailedEmbeddings(task.id);
    if (task.hasFailedTagging) void queueTaggingJobs(task.id);
  };

  const primary = allTasks[0];
  const hasFailed = folderTasks.some(taskHasTerminalFailure);
  const barProgress = taskProgress(primary);

  return (
    <div className="shrink-0 border-b border-white/[0.06]">
      <BackgroundTaskSummary
        expanded={expanded}
        extraCount={allTasks.length - 1}
        hasFailed={hasFailed}
        isWorkerPaused={isWorkerPaused}
        onDismiss={dismissTask}
        onLocate={showFailedTagging}
        onRetry={retryTask}
        onToggleExpanded={() => setExpanded((value) => !value)}
        onToggleWorker={toggleWorker}
        primary={primary}
        progress={barProgress}
        taskCount={allTasks.length}
      />

      {expanded ? (
        <ExpandedTaskPanel
          failedEmbeddingItems={failedEmbeddingItems}
          failedTaggingItems={failedTaggingItems}
          isWorkerPaused={isWorkerPaused}
          onDismiss={dismissTask}
          onLocate={showFailedTagging}
          onRetry={retryTask}
          onToggleWorker={toggleWorker}
          tasks={allTasks}
        />
      ) : null}
    </div>
  );
}
