import { useEffect, useState } from "react";
import { FolderJobProgress, useGalleryStore } from "../store";

// Dev-only screenshot/demo helper. Injects frozen UI states that are otherwise
// too transient to capture (e.g. the background-worker pipeline, which drains
// in under a second on a fast machine). Gated by import.meta.env.DEV in App.tsx
// so the whole thing is tree-shaken out of production builds.
//
// Toggle the controls with Ctrl+Shift+D. Injected state persists in the store
// while the panel is hidden, so: open → inject → hide → screenshot.

function emptyProgress(folderId: number): FolderJobProgress {
  return {
    folder_id: folderId,
    thumbnail_pending: 0,
    metadata_pending: 0,
    embedding_pending: 0,
    embedding_ready: 0,
    embedding_failed: 0,
    caption_pending: 0,
    caption_ready: 0,
    caption_failed: 0,
    tagging_pending: 0,
    tagging_ready: 0,
    tagging_failed: 0,
  };
}

// A believable multi-folder "busy pipeline" — three folders at different stages.
const BUSY_PRESETS: Partial<FolderJobProgress>[] = [
  // Embeddings actively running, tagging queued behind it.
  { embedding_ready: 34, embedding_pending: 16, tagging_pending: 50 },
  // Just started: thumbnails draining, everything else queued.
  { thumbnail_pending: 11, embedding_pending: 50, tagging_pending: 50 },
  // Late stage: embeddings done, tagging running.
  { embedding_ready: 40, tagging_ready: 18, tagging_pending: 22 },
];

export function DemoPanel() {
  const folders = useGalleryStore((state) => state.folders);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "d") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const injectBusy = () => {
    const progress: Record<number, FolderJobProgress> = {};
    folders.slice(0, BUSY_PRESETS.length).forEach((folder, index) => {
      progress[folder.id] = { ...emptyProgress(folder.id), ...BUSY_PRESETS[index] };
    });
    useGalleryStore.setState({ mediaJobProgress: progress });
  };

  const injectSingleEmbedding = () => {
    const folder = folders[0];
    if (!folder) return;
    useGalleryStore.setState({
      mediaJobProgress: {
        [folder.id]: { ...emptyProgress(folder.id), embedding_ready: 27, embedding_pending: 23 },
      },
    });
  };

  const clear = () => useGalleryStore.setState({ mediaJobProgress: {} });

  if (!open) return null;

  return (
    <div className="fixed bottom-4 left-4 z-[100] w-56 rounded-lg border border-amber-400/40 bg-amber-950/90 p-3 text-xs text-amber-100 shadow-xl backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold uppercase tracking-wide">Demo · Ctrl+Shift+D</span>
      </div>
      <p className="mb-2 text-[11px] leading-snug text-amber-200/70">
        Inject a frozen worker-bar state, hide this panel, then screenshot.
      </p>
      <div className="flex flex-col gap-1.5">
        <button
          className="rounded-md border border-amber-400/30 bg-amber-500/15 px-2 py-1.5 text-left hover:bg-amber-500/25"
          onClick={injectBusy}
        >
          Pipeline: busy (3 folders)
        </button>
        <button
          className="rounded-md border border-amber-400/30 bg-amber-500/15 px-2 py-1.5 text-left hover:bg-amber-500/25"
          onClick={injectSingleEmbedding}
        >
          Pipeline: embedding (1 folder)
        </button>
        <button
          className="rounded-md border border-white/10 bg-white/[0.06] px-2 py-1.5 text-left text-gray-300 hover:bg-white/10"
          onClick={clear}
        >
          Clear injected state
        </button>
      </div>
    </div>
  );
}
