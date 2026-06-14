import { useEffect, useRef, useState } from "react";
import { FolderJobProgress, useGalleryStore } from "../store";

// Dev-only screenshot/demo helper. Injects frozen UI states that are otherwise
// too transient (or unreachable) to capture: the background-worker pipeline,
// which drains in under a second, and the auto-updater flow, which never fires
// locally because there's no remote latest.json to check against.
// Gated by import.meta.env.DEV in App.tsx so the whole thing is tree-shaken out
// of production builds.
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

const DEMO_UPDATE_VERSION = "0.2.0";

export function DemoPanel() {
  const folders = useGalleryStore((state) => state.folders);
  const [open, setOpen] = useState(false);
  const downloadTimer = useRef<number | null>(null);

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

  const stopTimer = () => {
    if (downloadTimer.current !== null) {
      window.clearInterval(downloadTimer.current);
      downloadTimer.current = null;
    }
  };

  // Stop any running download animation when the panel unmounts.
  useEffect(() => stopTimer, []);

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

  // --- Updater flow ---------------------------------------------------------
  // These drive the real UpdateToast + Settings "About" row. The Install button
  // stays inert (there's no real pendingUpdate), so this validates the
  // presentation only — see DemoPanel's header note for the real e2e path.

  const updateAvailable = () => {
    stopTimer();
    useGalleryStore.setState({
      updateStatus: "available",
      updateVersion: DEMO_UPDATE_VERSION,
      updateProgress: null,
      updateError: null,
      updateDismissed: false,
    });
  };

  // Indeterminate pulse, then climb 0 → 100%, then flip to "installing".
  const simulateDownload = () => {
    stopTimer();
    useGalleryStore.setState({
      updateStatus: "downloading",
      updateVersion: DEMO_UPDATE_VERSION,
      updateProgress: null,
      updateError: null,
      updateDismissed: false,
    });
    let progress = 0;
    window.setTimeout(() => {
      downloadTimer.current = window.setInterval(() => {
        progress = Math.min(progress + 0.07, 1);
        useGalleryStore.setState({ updateProgress: progress });
        if (progress >= 1) {
          stopTimer();
          useGalleryStore.setState({ updateStatus: "installing" });
        }
      }, 200);
    }, 700);
  };

  const updateInstalling = () => {
    stopTimer();
    useGalleryStore.setState({
      updateStatus: "installing",
      updateVersion: DEMO_UPDATE_VERSION,
      updateProgress: 1,
      updateDismissed: false,
    });
  };

  const updateError = () => {
    stopTimer();
    useGalleryStore.setState({
      updateStatus: "error",
      updateError: "Could not reach the update server (connection timed out).",
      updateDismissed: false,
    });
  };

  const updateUpToDate = () => {
    stopTimer();
    useGalleryStore.setState({ updateStatus: "upToDate", updateVersion: null, updateError: null });
  };

  const resetUpdate = () => {
    stopTimer();
    useGalleryStore.setState({
      updateStatus: "idle",
      updateVersion: null,
      updateProgress: null,
      updateError: null,
      updateDismissed: false,
    });
  };

  if (!open) return null;

  const injectBtn =
    "rounded-md border border-amber-400/30 bg-amber-500/15 px-2 py-1.5 text-left hover:bg-amber-500/25";
  const neutralBtn =
    "rounded-md border border-white/10 bg-white/[0.06] px-2 py-1.5 text-left text-gray-300 hover:bg-white/10";

  return (
    <div className="fixed bottom-4 left-4 z-[100] max-h-[calc(100vh-2rem)] w-56 overflow-y-auto rounded-lg border border-amber-400/40 bg-amber-950/90 p-3 text-xs text-amber-100 shadow-xl backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold uppercase tracking-wide">Demo · Ctrl+Shift+D</span>
      </div>

      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-200/60">Pipeline</p>
      <p className="mb-2 text-[11px] leading-snug text-amber-200/70">
        Inject a frozen worker-bar state, hide this panel, then screenshot.
      </p>
      <div className="flex flex-col gap-1.5">
        <button className={injectBtn} onClick={injectBusy}>
          Pipeline: busy (3 folders)
        </button>
        <button className={injectBtn} onClick={injectSingleEmbedding}>
          Pipeline: embedding (1 folder)
        </button>
        <button className={neutralBtn} onClick={clear}>
          Clear injected state
        </button>
      </div>

      <div className="my-3 h-px bg-amber-400/20" />

      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-200/60">Update flow</p>
      <p className="mb-2 text-[11px] leading-snug text-amber-200/70">
        Drives the real toast (bottom-right) + Settings → About row. Install is inert here.
      </p>
      <div className="flex flex-col gap-1.5">
        <button className={injectBtn} onClick={updateAvailable}>
          Update available
        </button>
        <button className={injectBtn} onClick={simulateDownload}>
          Simulate download → install
        </button>
        <button className={injectBtn} onClick={updateInstalling}>
          Installing
        </button>
        <button className={injectBtn} onClick={updateError}>
          Check failed (error)
        </button>
        <button className={injectBtn} onClick={updateUpToDate}>
          Up to date
        </button>
        <button className={neutralBtn} onClick={resetUpdate}>
          Reset updater state
        </button>
      </div>
    </div>
  );
}
