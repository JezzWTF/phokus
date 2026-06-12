import { useEffect, useState } from "react";
import { FakeProgressBar, FakeStageTag } from "./fakes";

const STAGES = ["Thumbnails", "Metadata", "Embeddings", "Tags"] as const;
const STAGE_TOTAL = 128;
const TICK_MS = 90;
const STEP_PER_TICK = 6;

/// A looping, entirely fake render of the background-tasks bar: each stage
/// drains in order, then the cycle restarts.
export function StepPipeline() {
  const [stageIndex, setStageIndex] = useState(0);
  const [done, setDone] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setDone((current) => {
        if (current + STEP_PER_TICK < STAGE_TOTAL) return current + STEP_PER_TICK;
        setStageIndex((stage) => (stage + 1) % STAGES.length);
        return 0;
      });
    }, TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const remaining = STAGE_TOTAL - done;

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
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-blue-400" />
          </span>
          <span className="text-[13px] font-medium text-white/60">Holiday Photos</span>
          <div className="flex items-center gap-1.5">
            {STAGES.map((stage, i) => (
              <FakeStageTag
                key={stage}
                label={i === stageIndex ? `${stage} · ${remaining}` : stage}
                state={i < stageIndex ? "done" : i === stageIndex ? "active" : "waiting"}
              />
            ))}
          </div>
          <FakeProgressBar fraction={done / STAGE_TOTAL} className="ml-auto w-24" />
        </div>
      </div>

      <div className="mt-6 divide-y divide-white/[0.05] text-xs leading-relaxed text-gray-500">
        <p className="py-2.5">
          <span className="text-gray-300">It's all interruptible.</span> Close the app whenever you like —
          the queue picks up where it left off next launch.
        </p>
        <p className="py-2.5">
          <span className="text-gray-300">Per-folder control.</span> Right-click a folder in the sidebar to
          pause its background work, and click the bar itself to expand a detailed per-folder view.
        </p>
      </div>
    </div>
  );
}
