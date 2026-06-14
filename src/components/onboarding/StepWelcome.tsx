import { useGalleryStore } from "../../store";
import { FakeProgressBar, formatBytes } from "./fakes";

export function FfmpegStatusRow() {
  const ffmpegStatus = useGalleryStore((s) => s.ffmpegStatus);
  const ffmpegProgress = useGalleryStore((s) => s.ffmpegProgress);
  const ffmpegError = useGalleryStore((s) => s.ffmpegError);
  const retryFfmpegDownload = useGalleryStore((s) => s.retryFfmpegDownload);

  if (ffmpegStatus === "installed") {
    return (
      <div className="flex items-center gap-2.5 py-3">
        <svg className="h-4 w-4 shrink-0 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div>
          <p className="text-sm text-white">Media engine ready</p>
          <p className="text-xs text-gray-500">FFmpeg is installed — video thumbnails and metadata are available.</p>
        </div>
      </div>
    );
  }

  if (ffmpegStatus === "error") {
    return (
      <div className="py-3">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <p className="text-sm text-white">Media engine download failed</p>
            <p className="mt-1 text-xs leading-relaxed text-amber-300/90">{ffmpegError}</p>
            <p className="mt-1.5 text-xs leading-relaxed text-gray-500">
              You can keep going — photos work without it. Video thumbnails and metadata will start
              automatically once the download succeeds.
            </p>
          </div>
          <button
            className="shrink-0 rounded-md border border-white/10 bg-white/[0.055] px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
            onClick={() => void retryFfmpegDownload()}
          >
            Retry download
          </button>
        </div>
      </div>
    );
  }

  const fraction =
    ffmpegStatus === "downloading" && ffmpegProgress && ffmpegProgress.total_bytes > 0
      ? ffmpegProgress.downloaded_bytes / ffmpegProgress.total_bytes
      : null;

  return (
    <div className="py-3">
      <div className="flex items-baseline justify-between gap-6">
        <p className="text-sm text-white">
          {ffmpegStatus === "unpacking" ? "Unpacking media engine..." : "Downloading media engine (FFmpeg)..."}
        </p>
        {ffmpegProgress ? (
          <span className="text-[11px] tabular-nums text-gray-500">
            {formatBytes(ffmpegProgress.downloaded_bytes)} / {formatBytes(ffmpegProgress.total_bytes)}
          </span>
        ) : null}
      </div>
      <FakeProgressBar fraction={ffmpegStatus === "unpacking" ? null : fraction} className="mt-2.5" />
      <p className="mt-2 text-xs leading-relaxed text-gray-500">
        FFmpeg powers video thumbnails and metadata. It downloads once in the background — you can keep
        using the tour and the app while it finishes.
      </p>
    </div>
  );
}

export function StepWelcome() {
  return (
    <div>
      <p className="text-sm leading-relaxed text-gray-300">
        Phokus is a local-first media library: point it at your folders and it builds a fast, searchable
        gallery with thumbnails, AI tags, and visual search. Everything is processed on this machine —
        your photos and videos never leave it.
      </p>
      <p className="mt-2.5 text-sm leading-relaxed text-gray-500">
        This short tour shows what to expect. Every step is skippable, and you can re-run it any time
        from Settings.
      </p>

      <h4 className="mt-7 text-[12px] font-semibold uppercase tracking-[0.08em] text-gray-400">First-time setup</h4>
      <div className="mt-1 divide-y divide-white/[0.05]">
        <FfmpegStatusRow />
      </div>
    </div>
  );
}
