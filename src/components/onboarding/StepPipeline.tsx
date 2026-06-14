import { useEffect, useState } from "react";
import { FakeProgressBar, FakeStageTag, ReplayButton } from "./fakes";

const STAGES = ["Thumbnails", "Metadata", "Embeddings", "Tags"] as const;
const STAGE_TOTAL = 128;
const TICK_MS = 80;
const STEP_PER_TICK = 8;

/// A one-shot fake of the background-tasks bar: each stage drains in order,
/// then it stops at "all done" with a replay control.
export function StepPipeline() {
  const [stageIndex, setStageIndex] = useState(0);
  const [filled, setFilled] = useState(0);

  const finished = stageIndex >= STAGES.length;

  useEffect(() => {
    if (finished) return;
    const timer = setTimeout(() => {
      // Read from the closure and call setters directly — nesting one setter
      // inside another's updater double-advances under React StrictMode.
      if (filled + STEP_PER_TICK < STAGE_TOTAL) {
        setFilled(filled + STEP_PER_TICK);
      } else {
        setStageIndex(stageIndex + 1);
        setFilled(0);
      }
    }, TICK_MS);
    return () => clearTimeout(timer);
  }, [filled, stageIndex, finished]);

  const replay = () => {
    setStageIndex(0);
    setFilled(0);
  };

  const remaining = STAGE_TOTAL - filled;

  return (
    <div>
      <p className="text-sm leading-relaxed text-gray-300">
        After indexing, Phokus works through a strict pipeline: thumbnails first, then video metadata,
        then visual embeddings (for similarity and semantic search), then AI tags. One stage at a time,
        so each runs at full speed.
      </p>

      <p className="mt-5 text-xs text-gray-500">
        While it's working you'll see this bar above the gallery — here's a preview:
      </p>

      {/* Fake BackgroundTasks slim bar */}
      <div className="mt-3 rounded-lg border border-white/[0.07] bg-white/[0.02] px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="relative flex h-1.5 w-1.5 shrink-0">
            {!finished ? (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-60" />
            ) : null}
            <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${finished ? "bg-emerald-400" : "bg-blue-400"}`} />
          </span>
          <span className="text-[13px] font-medium text-white/60">Holiday Photos</span>
          <div className="flex items-center gap-1.5">
            {STAGES.map((stage, i) => (
              <FakeStageTag
                key={stage}
                label={!finished && i === stageIndex ? `${stage} · ${remaining}` : stage}
                state={finished || i < stageIndex ? "done" : i === stageIndex ? "active" : "waiting"}
              />
            ))}
          </div>
          <FakeProgressBar fraction={finished ? 1 : filled / STAGE_TOTAL} className="ml-auto w-24" />
        </div>
      </div>

      <div className="mt-6 flex items-start justify-between gap-4">
        <div className="divide-y divide-white/[0.05] text-xs leading-relaxed text-gray-500">
          <p className="pb-2.5">
            <span className="text-gray-300">It's all interruptible.</span> Close the app whenever you like —
            the queue picks up where it left off next launch.
          </p>
          <p className="pt-2.5">
            <span className="text-gray-300">Per-folder control.</span> Right-click a folder in the sidebar to
            pause its background work, and click the bar itself to expand a detailed per-folder view.
          </p>
        </div>
        {finished ? <ReplayButton onClick={replay} /> : null}
      </div>
    </div>
  );
}
