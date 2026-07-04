import { useEffect } from 'react'
import { TaggerModel, TaggerModelProgress, useGalleryStore } from '../../store'
import { TAGGER_MODELS } from '../../taggerModels'
import { FakeProgressBar, formatBytes } from './fakes'

const FAKE_TAGS = ['landscape', 'sunset', 'outdoors', 'no_humans', 'ocean', 'cloudy_sky']

// Prefer the current file's byte fraction (the 1.3 GB model dominates); fall
// back to the coarse step count; null renders an indeterminate bar.
function taggerDownloadFraction(progress: TaggerModelProgress | null): number | null {
  if (!progress) return null
  if (
    progress.downloaded_bytes != null &&
    progress.total_bytes != null &&
    progress.total_bytes > 0
  ) {
    return progress.downloaded_bytes / progress.total_bytes
  }
  if (progress.total_files > 0) return progress.completed_files / progress.total_files
  return null
}

function TaggerModelChoice({
  model,
  current,
  disabled,
  onSelect,
}: {
  model: TaggerModel
  current: TaggerModel
  disabled: boolean
  onSelect: (model: TaggerModel) => void
}) {
  const active = model === current
  return (
    <button
      type="button"
      className={`rounded-md border px-3 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
        active
          ? 'light-theme:border-emerald-600/50 light-theme:bg-emerald-100 light-theme:text-emerald-700 border-emerald-400/35 bg-emerald-500/15 text-emerald-200'
          : 'light-theme:text-gray-600 light-theme:hover:bg-gray-900 light-theme:hover:text-white border-transparent text-gray-500 hover:bg-white/[0.06] hover:text-gray-200'
      }`}
      disabled={disabled}
      onClick={() => onSelect(model)}
    >
      {TAGGER_MODELS[model].tab}
    </button>
  )
}

export function StepAiFeatures() {
  const taggerModelStatus = useGalleryStore((s) => s.taggerModelStatus)
  const taggerModelPreparing = useGalleryStore((s) => s.taggerModelPreparing)
  const taggerModelProgress = useGalleryStore((s) => s.taggerModelProgress)
  const taggerModelError = useGalleryStore((s) => s.taggerModelError)
  const taggerModel = useGalleryStore((s) => s.taggerModel)
  const prepareTaggerModel = useGalleryStore((s) => s.prepareTaggerModel)
  const loadTaggerModel = useGalleryStore((s) => s.loadTaggerModel)
  const loadTaggerModelStatus = useGalleryStore((s) => s.loadTaggerModelStatus)
  const setTaggerModel = useGalleryStore((s) => s.setTaggerModel)

  useEffect(() => {
    void loadTaggerModel()
    void loadTaggerModelStatus()
  }, [loadTaggerModel, loadTaggerModelStatus])

  const taggerReady = taggerModelStatus?.ready ?? false
  const taggerStatusLabel = taggerReady
    ? 'Installed'
    : taggerModelPreparing
      ? 'Preparing'
      : 'Not installed'

  return (
    <div>
      <p className="text-sm leading-relaxed text-gray-300">
        Phokus's AI runs entirely on this machine — nothing is sent anywhere. Semantic search sets
        itself up automatically; AI tagging is optional and only downloads if you want it.
      </p>

      <h4 className="mt-6 text-[12px] font-semibold tracking-[0.08em] text-gray-400 uppercase">
        AI tagging — optional
      </h4>
      <div className="light-theme:divide-gray-300/70 mt-1 divide-y divide-white/[0.05]">
        <div className="py-4">
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <p className="text-sm text-white">Automatic tags for every image</p>
              <p className="mt-1 text-xs leading-relaxed text-gray-500">
                The AI tagger model labels images so you can search with{' '}
                <code className="light-theme:bg-gray-800 light-theme:text-gray-100 rounded bg-gray-900 px-1 py-0.5 text-[11px] text-gray-200">
                  /t
                </code>{' '}
                — tags look like:
              </p>
              <div className="light-theme:border-gray-300/80 mt-3 inline-flex max-w-full flex-wrap items-center gap-1 rounded-lg border border-white/[0.07] p-0.5">
                {(['wd', 'joytag'] as const).map((model) => (
                  <TaggerModelChoice
                    key={model}
                    model={model}
                    current={taggerModel}
                    disabled={taggerModelPreparing}
                    onSelect={(nextModel) => {
                      if (nextModel === taggerModel) return
                      void setTaggerModel(nextModel)
                    }}
                  />
                ))}
              </div>
              <p className="mt-2 text-[11px] text-gray-600">
                Current: {TAGGER_MODELS[taggerModel].name} · {taggerStatusLabel}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-gray-500">
                {TAGGER_MODELS[taggerModel].description}
              </p>
              <span className="mt-2 flex flex-wrap gap-1.5">
                {FAKE_TAGS.map((tag) => (
                  <span
                    key={tag}
                    className="light-theme:border-gray-300/70 light-theme:bg-gray-900 light-theme:text-gray-600 rounded-md border border-white/10 bg-gray-900/50 px-2 py-0.5 text-[11px] text-gray-400"
                  >
                    {tag}
                  </span>
                ))}
              </span>
            </div>
            <div className="shrink-0">
              {taggerReady ? (
                <span className="light-theme:border-emerald-600/40 light-theme:bg-emerald-100 light-theme:text-emerald-700 inline-flex rounded-md border border-emerald-400/25 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                  Installed
                </span>
              ) : (
                <button
                  className="light-theme:border-gray-700/50 light-theme:bg-gray-900 light-theme:text-white light-theme:hover:bg-gray-800 light-theme:hover:text-white rounded-md border border-white/10 bg-white/[0.055] px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                  onClick={() => void prepareTaggerModel()}
                  disabled={taggerModelPreparing}
                >
                  {taggerModelPreparing ? 'Downloading...' : 'Download now'}
                </button>
              )}
            </div>
          </div>
          {taggerModelPreparing ? (
            <div className="mt-3">
              <FakeProgressBar fraction={taggerDownloadFraction(taggerModelProgress)} />
              <div className="mt-1.5 flex items-center justify-between gap-3 text-[11px] text-gray-600">
                <span className="truncate">
                  {taggerModelProgress?.current_file ?? 'Preparing...'}
                </span>
                {taggerModelProgress?.downloaded_bytes != null &&
                taggerModelProgress.total_bytes != null ? (
                  <span className="shrink-0 tabular-nums">
                    {formatBytes(taggerModelProgress.downloaded_bytes)} /{' '}
                    {formatBytes(taggerModelProgress.total_bytes)}
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}
          {!taggerModelPreparing && taggerModelError ? (
            <p className="light-theme:text-amber-700 mt-2 text-xs leading-relaxed text-amber-300/90">
              Download failed: {taggerModelError}
            </p>
          ) : null}
        </div>
      </div>

      <h4 className="mt-6 text-[12px] font-semibold tracking-[0.08em] text-gray-400 uppercase">
        Semantic search & similarity — built in
      </h4>
      <div className="light-theme:divide-gray-300/70 mt-1 divide-y divide-white/[0.05]">
        <div className="py-4">
          <p className="text-sm text-white">Search by meaning, find look-alikes</p>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">
            Powers{' '}
            <code className="light-theme:bg-gray-800 light-theme:text-gray-100 rounded bg-gray-900 px-1 py-0.5 text-[11px] text-gray-200">
              /s
            </code>{' '}
            search, "find similar", and the Explore view, so it's part of the standard pipeline: the
            CLIP model (~580 MB) downloads automatically the first time embeddings run. Nothing to
            do — you'll see it in the background-tasks bar.
          </p>
        </div>
      </div>

      <p className="mt-5 text-xs leading-relaxed text-gray-500">
        Semantic search and similarity are part of the standard pipeline; AI tagging stays optional
        and can be downloaded any time from Settings.
      </p>
    </div>
  )
}
