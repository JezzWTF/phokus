import { useEffect } from "react";
import { TaggerModelProgress, useGalleryStore } from "../../store";
import { FakeProgressBar, formatBytes } from "./fakes";

const FAKE_TAGS = ["landscape", "sunset", "outdoors", "no_humans", "ocean", "cloudy_sky"];

// Prefer the current file's byte fraction (the 1.3 GB model dominates); fall
// back to the coarse step count; null renders an indeterminate bar.
function taggerDownloadFraction(progress: TaggerModelProgress | null): number | null {
  if (!progress) return null;
  if (progress.downloaded_bytes != null && progress.total_bytes != null && progress.total_bytes > 0) {
    return progress.downloaded_bytes / progress.total_bytes;
  }
  if (progress.total_files > 0) return progress.completed_files / progress.total_files;
  return null;
}

export function StepAiFeatures() {
  const taggerModelStatus = useGalleryStore((s) => s.taggerModelStatus);
  const taggerModelPreparing = useGalleryStore((s) => s.taggerModelPreparing);
  const taggerModelProgress = useGalleryStore((s) => s.taggerModelProgress);
  const taggerModelError = useGalleryStore((s) => s.taggerModelError);
  const prepareTaggerModel = useGalleryStore((s) => s.prepareTaggerModel);
  const loadTaggerModelStatus = useGalleryStore((s) => s.loadTaggerModelStatus);

  useEffect(() => {
    void loadTaggerModelStatus();
  }, [loadTaggerModelStatus]);

  const taggerReady = taggerModelStatus?.ready ?? false;

  return (
    <div>
      <p className="text-sm leading-relaxed text-gray-300">
        Phokus's AI runs entirely on this machine — nothing is sent anywhere. Semantic search sets
        itself up automatically; AI tagging is optional and only downloads if you want it.
      </p>

      <h4 className="mt-6 text-[12px] font-semibold uppercase tracking-[0.08em] text-gray-400">AI tagging — optional</h4>
      <div className="mt-1 divide-y divide-white/[0.05]">
        <div className="py-4">
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <p className="text-sm text-white">Automatic tags for every image</p>
              <p className="mt-1 text-xs leading-relaxed text-gray-500">
                The WD tagger model (~1.3 GB download) labels images so you can search with{" "}
                <code className="rounded bg-white/[0.07] px-1 py-0.5 text-[11px] text-gray-200">/t</code> — tags look like:
              </p>
              <span className="mt-2 flex flex-wrap gap-1.5">
                {FAKE_TAGS.map((tag) => (
                  <span key={tag} className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-gray-400">
                    {tag}
                  </span>
                ))}
              </span>
            </div>
            <div className="shrink-0">
              {taggerReady ? (
                <span className="inline-flex rounded-md border border-emerald-400/25 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                  Installed
                </span>
              ) : (
                <button
                  className="rounded-md border border-white/10 bg-white/[0.055] px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                  onClick={() => void prepareTaggerModel()}
                  disabled={taggerModelPreparing}
                >
                  {taggerModelPreparing ? "Downloading..." : "Download now"}
                </button>
              )}
            </div>
          </div>
          {taggerModelPreparing ? (
            <div className="mt-3">
              <FakeProgressBar fraction={taggerDownloadFraction(taggerModelProgress)} />
              <div className="mt-1.5 flex items-center justify-between gap-3 text-[11px] text-gray-600">
                <span className="truncate">{taggerModelProgress?.current_file ?? "Preparing..."}</span>
                {taggerModelProgress?.downloaded_bytes != null && taggerModelProgress.total_bytes != null ? (
                  <span className="shrink-0 tabular-nums">
                    {formatBytes(taggerModelProgress.downloaded_bytes)} / {formatBytes(taggerModelProgress.total_bytes)}
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}
          {!taggerModelPreparing && taggerModelError ? (
            <p className="mt-2 text-xs leading-relaxed text-amber-300/90">
              Download failed: {taggerModelError}
            </p>
          ) : null}
        </div>
      </div>

      <h4 className="mt-6 text-[12px] font-semibold uppercase tracking-[0.08em] text-gray-400">Semantic search & similarity — built in</h4>
      <div className="mt-1 divide-y divide-white/[0.05]">
        <div className="py-4">
          <p className="text-sm text-white">Search by meaning, find look-alikes</p>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">
            Powers <code className="rounded bg-white/[0.07] px-1 py-0.5 text-[11px] text-gray-200">/s</code> search,
            "find similar", and the Explore view, so it's part of the standard pipeline: the CLIP model
            (~330 MB) downloads automatically the first time embeddings run. Nothing to do — you'll see it
            in the background-tasks bar.
          </p>
        </div>
      </div>

      <p className="mt-5 text-xs leading-relaxed text-gray-500">
        That's the tour. Add folders from the sidebar, and revisit any of this from Settings — including
        re-running this tour.
      </p>
    </div>
  );
}
