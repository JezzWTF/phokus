import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useGalleryStore, WorkerKey } from "../store";

const WORKER_FOR_STAGE: Record<string, WorkerKey> = {
  Thumbnails: "thumbnail",
  Metadata: "metadata",
  Embeddings: "embedding",
  Tags: "tagging",
};

interface TaskStage {
  label: string;
  detail: string;
  progress: number | null; // 0–100, or null for indeterminate
  failed: boolean;
}

interface Task {
  id: number;
  name: string;
  stages: TaskStage[];
  hasFailedEmbeddings: boolean;
  hasFailedTagging: boolean;
  hasFailedCaptions: boolean;
  pendingMediaWork: number;
  embeddingProcessed: number;
  embeddingTotal: number;
  currentFile: string | null;
  snapshot: string;
}

interface FailedEmbeddingItem {
  image_id: number;
  filename: string;
  path: string;
  error: string | null;
}

export function BackgroundTasks() {
  const folders = useGalleryStore((state) => state.folders);
  const indexingProgress = useGalleryStore((state) => state.indexingProgress);
  const mediaJobProgress = useGalleryStore((state) => state.mediaJobProgress);
  const retryFailedEmbeddings = useGalleryStore((state) => state.retryFailedEmbeddings);
  const queueTaggingJobs = useGalleryStore((state) => state.queueTaggingJobs);
  const duplicateScanning = useGalleryStore((state) => state.duplicateScanning);
  const duplicateScanProgress = useGalleryStore((state) => state.duplicateScanProgress);
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState<Record<number, string>>({});
  const [failedItems, setFailedItems] = useState<Record<number, FailedEmbeddingItem[]>>({});

  const workerPaused = useGalleryStore((state) => state.workerPaused);
  const loadWorkerStates = useGalleryStore((state) => state.loadWorkerStates);
  const setWorkerPaused = useGalleryStore((state) => state.setWorkerPaused);

  useEffect(() => {
    void loadWorkerStates();
  }, [folders, loadWorkerStates]);

  // Fetch failed embedding filenames whenever the expanded panel opens or failure counts change.
  const failedCounts = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(mediaJobProgress).map(([id, p]) => [id, p?.embedding_failed ?? 0]),
      ),
    [mediaJobProgress],
  );

  useEffect(() => {
    if (!expanded) return;
    for (const [folderId, count] of Object.entries(failedCounts)) {
      if (count > 0) {
        invoke<FailedEmbeddingItem[]>("get_failed_embedding_images", {
          folderId: Number(folderId),
        })
          .then((items) => setFailedItems((prev) => ({ ...prev, [folderId]: items })))
          .catch(() => undefined);
      }
    }
  }, [expanded, failedCounts]);

  const isWorkerPaused = (folderId: number, worker: WorkerKey) => {
    return workerPaused[folderId]?.[worker] ?? false;
  };

  const toggleWorker = (folderId: number, worker: WorkerKey) => {
    setWorkerPaused(folderId, worker, !isWorkerPaused(folderId, worker));
  };

  const dismissTask = (id: number, snapshot: string) => {
    if (id < 0) return; // system tasks (duplicate scan) cannot be dismissed
    setDismissed((prev) => ({ ...prev, [id]: snapshot }));
    setExpanded(false);
  };

  const tasks = useMemo<Task[]>(() => {
    return folders
      .map((folder): Task | null => {
        const index = indexingProgress[folder.id];
        const jobs = mediaJobProgress[folder.id];

        const thumbnailPending = jobs?.thumbnail_pending ?? 0;
        const metadataPending = jobs?.metadata_pending ?? 0;
        const embeddingPending = jobs?.embedding_pending ?? 0;
        const embeddingReady = jobs?.embedding_ready ?? 0;
        const embeddingFailed = jobs?.embedding_failed ?? 0;
        const taggingPending = jobs?.tagging_pending ?? 0;
        const taggingReady = jobs?.tagging_ready ?? 0;
        const taggingFailed = jobs?.tagging_failed ?? 0;
        const captionPending = jobs?.caption_pending ?? 0;
        const captionReady = jobs?.caption_ready ?? 0;
        const captionFailed = jobs?.caption_failed ?? 0;

        const pendingMediaWork = thumbnailPending + metadataPending + embeddingPending + taggingPending + captionPending;
        const embeddingProcessed = embeddingReady + embeddingFailed;
        const embeddingTotal = embeddingProcessed + embeddingPending;
        const taggingProcessed = taggingReady + taggingFailed;
        const taggingTotal = taggingProcessed + taggingPending;
        const captionProcessed = captionReady + captionFailed;
        const captionTotal = captionProcessed + captionPending;
        const hasFailedEmbeddings = embeddingFailed > 0;
        const hasFailedTagging = taggingFailed > 0;
        const hasFailedCaptions = captionFailed > 0;

        if (!index && pendingMediaWork === 0 && !hasFailedEmbeddings && !hasFailedTagging && !hasFailedCaptions) return null;

        const stages: TaskStage[] = [];

        if (index && !index.done) {
          const pct = index.total > 0 ? (index.indexed / index.total) * 100 : 0;
          stages.push({
            label: "Scanning",
            detail: `${index.indexed.toLocaleString()} / ${index.total.toLocaleString()}`,
            progress: pct,
            failed: false,
          });
        }

        if (thumbnailPending > 0) {
          stages.push({
            label: "Thumbnails",
            detail: thumbnailPending.toLocaleString(),
            progress: null,
            failed: false,
          });
        }

        if (metadataPending > 0) {
          stages.push({
            label: "Metadata",
            detail: metadataPending.toLocaleString(),
            progress: null,
            failed: false,
          });
        }

        if (embeddingPending > 0) {
          const pct = embeddingTotal > 0 ? (embeddingProcessed / embeddingTotal) * 100 : 0;
          stages.push({
            label: "Embeddings",
            detail: `${embeddingProcessed.toLocaleString()} / ${embeddingTotal.toLocaleString()}`,
            progress: pct,
            failed: false,
          });
        }

        if (taggingPending > 0) {
          const pct = taggingTotal > 0 ? (taggingProcessed / taggingTotal) * 100 : 0;
          stages.push({
            label: "Tags",
            detail: `${taggingProcessed.toLocaleString()} / ${taggingTotal.toLocaleString()}`,
            progress: pct,
            failed: false,
          });
        }

        if (captionPending > 0) {
          const pct = captionTotal > 0 ? (captionProcessed / captionTotal) * 100 : 0;
          stages.push({
            label: "Captions",
            detail: `${captionProcessed.toLocaleString()} / ${captionTotal.toLocaleString()}`,
            progress: pct,
            failed: false,
          });
        }

        if (hasFailedEmbeddings && pendingMediaWork === 0) {
          stages.push({
            label: "Failed",
            detail: `${embeddingFailed.toLocaleString()} embeddings`,
            progress: null,
            failed: true,
          });
        }

        if (hasFailedTagging && pendingMediaWork === 0) {
          stages.push({
            label: "Failed",
            detail: `${taggingFailed.toLocaleString()} tags`,
            progress: null,
            failed: true,
          });
        }

        if (hasFailedCaptions && pendingMediaWork === 0) {
          stages.push({
            label: "Failed",
            detail: `${captionFailed.toLocaleString()} captions`,
            progress: null,
            failed: true,
          });
        }

        const snapshot = `${pendingMediaWork}:${embeddingFailed}:${taggingFailed}:${captionFailed}`;

        return {
          id: folder.id,
          name: folder.name,
          stages,
          hasFailedEmbeddings,
          hasFailedTagging,
          hasFailedCaptions,
          pendingMediaWork,
          embeddingProcessed,
          embeddingTotal,
          currentFile: index && !index.done ? (index.current_file || null) : null,
          snapshot,
        };
      })
      .filter((t): t is Task => t !== null)
      .filter((t) => dismissed[t.id] !== t.snapshot);
  }, [folders, indexingProgress, mediaJobProgress, dismissed]);

  // Synthetic task for duplicate scanning — negative id so dismiss/retry are suppressed
  const duplicateScanTask: Task | null = duplicateScanning ? {
    id: -1,
    name: "Duplicate Scan",
    stages: [{
      label: duplicateScanProgress?.phase === "checking"
        ? "Checking"
        : duplicateScanProgress?.phase === "confirming"
          ? "Confirming"
          : "Hashing",
      detail: duplicateScanProgress
        ? `${duplicateScanProgress.processed.toLocaleString()} / ${duplicateScanProgress.total.toLocaleString()}${duplicateScanProgress.skipped > 0 ? ` · ${duplicateScanProgress.skipped.toLocaleString()} skipped` : ""}`
        : "Starting…",
      progress: duplicateScanProgress && duplicateScanProgress.total > 0
        ? (duplicateScanProgress.processed / duplicateScanProgress.total) * 100
        : null,
      failed: false,
    }],
    hasFailedEmbeddings: false,
    hasFailedTagging: false,
    hasFailedCaptions: false,
    pendingMediaWork: 1,
    embeddingProcessed: 0,
    embeddingTotal: 0,
    currentFile: null,
    snapshot: "",
  } : null;

  const allTasks = duplicateScanTask ? [duplicateScanTask, ...tasks] : tasks;

  if (allTasks.length === 0) return null;

  const primary = allTasks[0];
  const extraCount = allTasks.length - 1;
  const hasFailed = tasks.some((t) => (t.hasFailedEmbeddings || t.hasFailedTagging || t.hasFailedCaptions) && t.pendingMediaWork === 0);

  // Best progress bar value: use embedding progress if available (most informative),
  // otherwise tagging progress, otherwise fall back to scanning progress, otherwise indeterminate.
  const embeddingStage = primary.stages.find((s) => s.label === "Embeddings");
  const taggingStage = primary.stages.find((s) => s.label === "Tags");
  const scanningStage = primary.stages.find((s) => s.label === "Scanning");
  const duplicateStage = primary.id === -1 ? primary.stages[0] : null;
  const barProgress = embeddingStage?.progress ?? taggingStage?.progress ?? scanningStage?.progress ?? duplicateStage?.progress ?? null;

  return (
    <div className="shrink-0 border-b border-white/[0.06]">
      {/* Slim bar */}
      <div
        className={`group flex items-center gap-3 px-5 h-11 cursor-pointer select-none transition-colors ${
          expanded ? "bg-white/[0.03]" : "hover:bg-white/[0.02]"
        }`}
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Pulse dot */}
        <div className="relative shrink-0">
          <div className={`h-1.5 w-1.5 rounded-full ${hasFailed ? "bg-amber-400" : "bg-blue-400"}`} />
          <div className={`absolute inset-0 h-1.5 w-1.5 rounded-full animate-ping opacity-60 ${hasFailed ? "bg-amber-400" : "bg-blue-400"}`} />
        </div>

        {/* Folder name */}
        <span className="text-[13px] font-medium text-white/60 shrink-0">{primary.name}</span>

        {/* Stage tags — all active stages visible simultaneously */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0 overflow-hidden">
          {primary.stages.map((stage) => {
            const workerKey = WORKER_FOR_STAGE[stage.label];
            const isPaused = workerKey ? isWorkerPaused(primary.id, workerKey) : false;
            return (
              <span
                key={stage.label}
                className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] shrink-0 ${
                  stage.failed
                    ? "bg-amber-500/10 text-amber-400"
                    : isPaused
                      ? "bg-white/4 text-gray-600"
                      : "bg-white/5 text-gray-400"
                }`}
              >
                <span>{stage.label}</span>
                <span className={`tabular-nums ${stage.failed ? "text-amber-500" : isPaused ? "text-gray-700" : "text-gray-600"}`}>
                  {stage.detail}
                </span>
                {workerKey && (
                  <button
                    className="ml-0.5 opacity-0 group-hover:opacity-100 hover:text-white transition-opacity"
                    title={isPaused ? `Resume ${stage.label}` : `Pause ${stage.label}`}
                    onClick={(e) => { e.stopPropagation(); toggleWorker(primary.id, workerKey); }}
                  >
                    {isPaused ? (
                      <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    ) : (
                      <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                      </svg>
                    )}
                  </button>
                )}
              </span>
            );
          })}
        </div>

        {/* Progress bar — embedding or scanning progress, pulsing if indeterminate */}
        <div className="w-24 h-px bg-white/8 rounded-full overflow-hidden shrink-0">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              hasFailed
                ? "bg-amber-400/60"
                : barProgress === null
                  ? "bg-blue-500/40 animate-pulse w-full"
                  : "bg-blue-500"
            }`}
            style={barProgress !== null ? { width: `${barProgress}%` } : undefined}
          />
        </div>

        {/* Extra folders badge */}
        {extraCount > 0 && (
          <span className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] text-gray-500 shrink-0">
            +{extraCount}
          </span>
        )}

        {/* Retry (failed embeddings only) */}
        {primary.hasFailedEmbeddings && primary.pendingMediaWork === 0 && (
          <button
            className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-300 hover:bg-amber-500/20 transition-colors shrink-0"
            onClick={(e) => { e.stopPropagation(); void retryFailedEmbeddings(primary.id); }}
          >
            Retry
          </button>
        )}

        {/* Expand chevron (only when multiple tasks) */}
        {allTasks.length > 1 && (
          <svg
            className={`h-3.5 w-3.5 text-gray-600 transition-transform duration-200 shrink-0 ${expanded ? "rotate-180" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}

        {/* Dismiss — hidden for system tasks like duplicate scan */}
        {primary.id >= 0 && (
          <button
            className="p-1 rounded-md text-gray-600 hover:text-gray-300 hover:bg-white/8 transition-colors shrink-0"
            title="Dismiss"
            onClick={(e) => { e.stopPropagation(); dismissTask(primary.id, primary.snapshot); }}
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Expanded panel — one row per folder */}
      {expanded && (
        <div className="border-t border-white/[0.06] bg-white/[0.02] px-5 py-3 space-y-3">
          {allTasks.map((task) => {
            const taskEmbeddingStage = task.stages.find((s) => s.label === "Embeddings");
            const taskTaggingStage = task.stages.find((s) => s.label === "Tags");
            const taskScanningStage = task.stages.find((s) => s.label === "Scanning");
            const taskDuplicateStage = task.id === -1 ? task.stages[0] : null;
            const taskBarProgress = taskEmbeddingStage?.progress ?? taskTaggingStage?.progress ?? taskScanningStage?.progress ?? taskDuplicateStage?.progress ?? null;
            const taskHasFailed = (task.hasFailedEmbeddings || task.hasFailedTagging || task.hasFailedCaptions) && task.pendingMediaWork === 0;

            return (
              <div key={task.id}>
                <div className="flex items-center gap-3">
                  <span className="text-[12px] text-white/50 w-28 truncate shrink-0">{task.name}</span>

                  <div className="flex items-center gap-1.5 flex-1 min-w-0 overflow-hidden">
                    {task.stages.map((stage) => {
                      const workerKey = WORKER_FOR_STAGE[stage.label];
                      const isPaused = workerKey ? isWorkerPaused(task.id, workerKey) : false;
                      return (
                        <span
                          key={stage.label}
                          className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] shrink-0 ${
                            stage.failed
                              ? "bg-amber-500/10 text-amber-400"
                              : isPaused
                                ? "bg-white/4 text-gray-600"
                                : "bg-white/5 text-gray-500"
                          }`}
                        >
                          {isPaused && (
                            <svg className="h-2 w-2 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                            </svg>
                          )}
                          <span>{stage.label}</span>
                          <span className={`tabular-nums ${stage.failed ? "text-amber-500" : "text-gray-600"}`}>
                            {stage.detail}
                          </span>
                          {workerKey && (
                            <button
                              className="ml-0.5 text-gray-600 hover:text-white transition-colors"
                              title={isPaused ? `Resume ${stage.label}` : `Pause ${stage.label}`}
                              onClick={() => toggleWorker(task.id, workerKey)}
                            >
                              {isPaused ? (
                                <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M8 5v14l11-7z" />
                                </svg>
                              ) : (
                                <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                                </svg>
                              )}
                            </button>
                          )}
                        </span>
                      );
                    })}
                  </div>

                  <div className="w-20 h-px bg-white/8 rounded-full overflow-hidden shrink-0">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        taskHasFailed
                          ? "bg-amber-400/60"
                          : taskBarProgress === null
                            ? "bg-blue-500/40 animate-pulse w-full"
                            : "bg-blue-500"
                      }`}
                      style={taskBarProgress !== null ? { width: `${taskBarProgress}%` } : undefined}
                    />
                  </div>

                  {taskHasFailed && (
                    <button
                      className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-300 hover:bg-amber-500/20 transition-colors shrink-0"
                      onClick={() => {
                        if (task.hasFailedEmbeddings) void retryFailedEmbeddings(task.id);
                        if (task.hasFailedTagging) void queueTaggingJobs(task.id);
                      }}
                    >
                      Retry
                    </button>
                  )}

                  {task.id >= 0 && (
                    <button
                      className="p-1 rounded-md text-gray-600 hover:text-gray-300 hover:bg-white/8 transition-colors shrink-0"
                      title="Dismiss"
                      onClick={() => dismissTask(task.id, task.snapshot)}
                    >
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>

                {task.currentFile && (
                  <p className="text-[10px] text-gray-600 truncate mt-1 pl-[calc(7rem+0.75rem)]">
                    {task.currentFile}
                  </p>
                )}

                {/* Failed embedding file list */}
                {taskHasFailed && failedItems[task.id] && failedItems[task.id].length > 0 && (
                  <div className="mt-2 pl-[calc(7rem+0.75rem)] space-y-0.5">
                    {failedItems[task.id].map((item) => (
                      <div key={item.image_id} className="flex items-start gap-1.5 min-w-0">
                        <svg className="h-2.5 w-2.5 text-amber-500 shrink-0 mt-px" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                            d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                        </svg>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] text-amber-400/80 truncate font-medium">{item.filename}</p>
                          {item.error && (
                            <p className="text-[9px] text-gray-600 truncate">{item.error}</p>
                          )}
                        </div>
                        <button
                          className="shrink-0 text-gray-700 hover:text-gray-300 transition-colors"
                          title="Reveal in Explorer"
                          onClick={() => void revealItemInDir(item.path)}
                        >
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
