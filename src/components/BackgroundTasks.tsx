import { useMemo } from "react";
import { useGalleryStore } from "../store";

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
      <div
        className="h-full rounded-full bg-blue-400 transition-all duration-300"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

export function BackgroundTasks() {
  const folders = useGalleryStore((state) => state.folders);
  const indexingProgress = useGalleryStore((state) => state.indexingProgress);
  const mediaJobProgress = useGalleryStore((state) => state.mediaJobProgress);
  const retryFailedEmbeddings = useGalleryStore((state) => state.retryFailedEmbeddings);

  const tasks = useMemo(() => {
    return folders
      .map((folder) => {
        const index = indexingProgress[folder.id];
        const jobs = mediaJobProgress[folder.id];
        const pendingMediaWork =
          (jobs?.thumbnail_pending ?? 0) +
          (jobs?.metadata_pending ?? 0) +
          (jobs?.embedding_pending ?? 0);
        const embeddingProcessed = (jobs?.embedding_ready ?? 0) + (jobs?.embedding_failed ?? 0);
        const embeddingTotal = embeddingProcessed + (jobs?.embedding_pending ?? 0);
        const hasFailedEmbeddings = (jobs?.embedding_failed ?? 0) > 0;

        if (!index && pendingMediaWork === 0 && !hasFailedEmbeddings) {
          return null;
        }

        const indexPercent = index && index.total > 0 ? (index.indexed / index.total) * 100 : 0;
        const embeddingPercent = embeddingTotal > 0 ? (embeddingProcessed / embeddingTotal) * 100 : 0;
        return {
          id: folder.id,
          name: folder.name,
          index,
          jobs,
          pendingMediaWork,
          indexPercent,
          embeddingProcessed,
          embeddingTotal,
          embeddingPercent,
          hasFailedEmbeddings,
        };
      })
      .filter((task) => task !== null);
  }, [folders, indexingProgress, mediaJobProgress]);

  if (tasks.length === 0) {
    return null;
  }

  return (
    <div className="border-b border-white/5 bg-gray-950/40 px-5 py-2 backdrop-blur-xl">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Background Tasks</h3>
        <span className="text-xs text-gray-500">{tasks.length} active</span>
      </div>
      <div className="grid gap-2 xl:grid-cols-2">
        {tasks.map((task) => (
          <div key={task.id} className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">{task.name}</p>
                <p className="text-[11px] text-gray-500">
                  {task.index && !task.index.done
                    ? `${task.index.indexed.toLocaleString()} of ${task.index.total.toLocaleString()} scanned`
                    : task.hasFailedEmbeddings && task.pendingMediaWork === 0
                      ? `Embedding failures require attention`
                      : `${task.pendingMediaWork.toLocaleString()} media jobs remaining`}
                </p>
              </div>
              <div className="text-right text-[11px] text-gray-400">
                {task.jobs?.thumbnail_pending ? <div>{task.jobs.thumbnail_pending.toLocaleString()} thumbnails</div> : null}
                {task.jobs?.metadata_pending ? <div>{task.jobs.metadata_pending.toLocaleString()} metadata</div> : null}
                {task.embeddingTotal > 0 ? (
                  <div>
                    {task.embeddingProcessed.toLocaleString()} / {task.embeddingTotal.toLocaleString()} embeddings
                  </div>
                ) : null}
                {task.jobs?.embedding_failed ? <div>{task.jobs.embedding_failed.toLocaleString()} failed</div> : null}
              </div>
            </div>

            {task.index && !task.index.done ? (
              <div className="mt-2 space-y-1">
                <ProgressBar value={task.indexPercent} />
                <p className="truncate text-[11px] text-gray-500">{task.index.current_file || "Scanning..."}</p>
              </div>
            ) : task.embeddingTotal > 0 && (task.jobs?.embedding_pending ?? 0) > 0 ? (
              <div className="mt-2 space-y-1">
                <ProgressBar value={task.embeddingPercent} />
                <p className="text-[11px] text-gray-500">
                  {task.embeddingProcessed.toLocaleString()} completed, {task.jobs?.embedding_pending?.toLocaleString() ?? 0} remaining
                </p>
              </div>
            ) : task.hasFailedEmbeddings ? (
              <div className="mt-2 space-y-1">
                <ProgressBar value={100} />
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] text-amber-300">
                    {task.jobs?.embedding_failed?.toLocaleString() ?? 0} embedding failures need attention
                  </p>
                  <button
                    className="rounded-full border border-amber-400/20 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-200 hover:bg-amber-500/20"
                    onClick={() => void retryFailedEmbeddings(task.id)}
                  >
                    Retry
                  </button>
                </div>
              </div>
            ) : task.pendingMediaWork > 0 ? (
              <div className="mt-2 space-y-1">
                <ProgressBar value={0} />
                <p className="text-[11px] text-gray-500">Processing thumbnails, metadata, and embeddings</p>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
