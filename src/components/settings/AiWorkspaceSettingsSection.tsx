import { useEffect, useMemo, useRef, useState } from 'react'
import { useGalleryStore } from '../../store'
import { TAGGER_MODELS } from '../../taggerModels'
import {
  formatBytesShort,
  ScopeButton,
  SettingsGroup,
  SettingsItem,
  settingsButtonClass,
  StatusPill,
  TaggerAccelerationButton,
  TaggerModelButton,
} from './shared'

export function AiWorkspaceSettingsSection() {
  const folders = useGalleryStore((state) => state.folders)
  const mediaJobProgress = useGalleryStore((state) => state.mediaJobProgress)
  const taggingQueueScope = useGalleryStore((state) => state.taggingQueueScope)
  const taggingQueueFolderIds = useGalleryStore((state) => state.taggingQueueFolderIds)
  const setTaggingQueueScope = useGalleryStore((state) => state.setTaggingQueueScope)
  const toggleTaggingQueueFolder = useGalleryStore((state) => state.toggleTaggingQueueFolder)
  const setTaggingQueueFolderIds = useGalleryStore((state) => state.setTaggingQueueFolderIds)
  const taggerModelStatus = useGalleryStore((state) => state.taggerModelStatus)
  const taggerModelPreparing = useGalleryStore((state) => state.taggerModelPreparing)
  const taggerModelProgress = useGalleryStore((state) => state.taggerModelProgress)
  const taggerModelError = useGalleryStore((state) => state.taggerModelError)
  const taggerAcceleration = useGalleryStore((state) => state.taggerAcceleration)
  const taggerThreshold = useGalleryStore((state) => state.taggerThreshold)
  const taggerBatchSize = useGalleryStore((state) => state.taggerBatchSize)
  const taggerRuntimeProbe = useGalleryStore((state) => state.taggerRuntimeProbe)
  const taggerRuntimeChecking = useGalleryStore((state) => state.taggerRuntimeChecking)
  const prepareTaggerModel = useGalleryStore((state) => state.prepareTaggerModel)
  const deleteTaggerModel = useGalleryStore((state) => state.deleteTaggerModel)
  const setTaggerAcceleration = useGalleryStore((state) => state.setTaggerAcceleration)
  const taggerModel = useGalleryStore((state) => state.taggerModel)
  const setTaggerModel = useGalleryStore((state) => state.setTaggerModel)
  const setTaggerThreshold = useGalleryStore((state) => state.setTaggerThreshold)
  const setTaggerBatchSize = useGalleryStore((state) => state.setTaggerBatchSize)
  const probeTaggerRuntime = useGalleryStore((state) => state.probeTaggerRuntime)
  const queueTaggingJobs = useGalleryStore((state) => state.queueTaggingJobs)
  const queueTaggingJobsForFolders = useGalleryStore((state) => state.queueTaggingJobsForFolders)
  const clearTaggingJobs = useGalleryStore((state) => state.clearTaggingJobs)
  const clearTaggingJobsForFolders = useGalleryStore((state) => state.clearTaggingJobsForFolders)
  const resetAiTags = useGalleryStore((state) => state.resetAiTags)
  const resetAiTagsForFolders = useGalleryStore((state) => state.resetAiTagsForFolders)
  const openTagManager = useGalleryStore((state) => state.openTagManager)

  const [taggerQueueStatus, setTaggerQueueStatus] = useState<string | null>(null)
  const [taggerQueueing, setTaggerQueueing] = useState(false)
  const [taggerClearing, setTaggerClearing] = useState(false)
  const [taggerResetConfirming, setTaggerResetConfirming] = useState(false)
  const [taggerResetting, setTaggerResetting] = useState(false)
  const [taggerAccelerationSaving, setTaggerAccelerationSaving] = useState(false)
  const [taggerAccelerationError, setTaggerAccelerationError] = useState<string | null>(null)
  const [taggerModelSwitching, setTaggerModelSwitching] = useState(false)
  const [taggerModelSwitchError, setTaggerModelSwitchError] = useState<string | null>(null)
  const [taggerThresholdDraft, setTaggerThresholdDraft] = useState<string | null>(null)
  const [taggerThresholdSaving, setTaggerThresholdSaving] = useState(false)
  const [taggerThresholdError, setTaggerThresholdError] = useState<string | null>(null)
  const [taggerBatchSizeDraft, setTaggerBatchSizeDraft] = useState<string | null>(null)
  const [taggerBatchSizeSaving, setTaggerBatchSizeSaving] = useState(false)
  const [taggerBatchSizeError, setTaggerBatchSizeError] = useState<string | null>(null)

  const thresholdErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const batchSizeErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (thresholdErrorTimerRef.current) clearTimeout(thresholdErrorTimerRef.current)
      if (batchSizeErrorTimerRef.current) clearTimeout(batchSizeErrorTimerRef.current)
    }
  }, [])

  const selectedFolders = useMemo(
    () => folders.filter((folder) => taggingQueueFolderIds.includes(folder.id)),
    [folders, taggingQueueFolderIds]
  )

  const taggerReady = taggerModelStatus?.ready ?? false
  const queueScopeLabel =
    taggingQueueScope === 'all'
      ? 'all media'
      : selectedFolders.length > 0
        ? `${selectedFolders.length} selected folder${selectedFolders.length === 1 ? '' : 's'}`
        : 'no folders selected'
  const thresholdDisplay = taggerThresholdDraft ?? String(taggerThreshold)
  const batchSizeDisplay = taggerBatchSizeDraft ?? String(taggerBatchSize)
  const taggerBytesKnown =
    taggerModelProgress?.downloaded_bytes != null &&
    taggerModelProgress.total_bytes != null &&
    taggerModelProgress.total_bytes > 0
  const taggerDownloadLabel = taggerBytesKnown
    ? `Downloading ${formatBytesShort(taggerModelProgress!.downloaded_bytes!)} / ${formatBytesShort(taggerModelProgress!.total_bytes!)}`
    : taggerModelProgress
      ? `Downloading ${taggerModelProgress.completed_files}/${taggerModelProgress.total_files}`
      : taggerModelPreparing
        ? 'Preparing AI tagger...'
        : taggerReady
          ? 'Installed'
          : 'Install model'
  const taggerDownloadPercent = taggerBytesKnown
    ? Math.round((taggerModelProgress!.downloaded_bytes! / taggerModelProgress!.total_bytes!) * 100)
    : taggerModelProgress
      ? Math.round(
          (taggerModelProgress.completed_files / Math.max(taggerModelProgress.total_files, 1)) * 100
        )
      : 0

  const runQueueAction = (action: 'queue' | 'clear') => {
    const selectedIds = taggingQueueFolderIds
    const perform =
      taggingQueueScope === 'all'
        ? action === 'queue'
          ? queueTaggingJobs(null)
          : clearTaggingJobs(null)
        : selectedIds.length > 0
          ? action === 'queue'
            ? queueTaggingJobsForFolders(selectedIds)
            : clearTaggingJobsForFolders(selectedIds)
          : Promise.resolve(0)

    if (action === 'queue') {
      setTaggerQueueing(true)
    } else {
      setTaggerClearing(true)
    }
    setTaggerQueueStatus(null)
    setTaggerResetConfirming(false)

    void perform
      .then((count) => {
        if (taggingQueueScope === 'selected' && selectedIds.length === 0) {
          setTaggerQueueStatus('Choose at least one folder before running tagging jobs.')
          return
        }
        setTaggerQueueStatus(
          count === 0
            ? action === 'queue'
              ? 'No missing tags found for the current target.'
              : 'No queued tagging jobs to clear for the current target.'
            : action === 'queue'
              ? `Queued ${count.toLocaleString()} image${count === 1 ? '' : 's'} for tagging.`
              : `Cleared ${count.toLocaleString()} queued tagging job${count === 1 ? '' : 's'}.`
        )
      })
      .catch((error) => setTaggerQueueStatus(String(error)))
      .finally(() => {
        if (action === 'queue') {
          setTaggerQueueing(false)
        } else {
          setTaggerClearing(false)
        }
      })
  }

  const runResetAiTags = () => {
    if (!taggerResetConfirming) {
      setTaggerResetConfirming(true)
      setTaggerQueueStatus(
        `Reset AI tags for ${queueScopeLabel}? User tags are preserved, and retagging is not queued automatically.`
      )
      return
    }

    const selectedIds = taggingQueueFolderIds
    const perform =
      taggingQueueScope === 'all'
        ? resetAiTags(null)
        : selectedIds.length > 0
          ? resetAiTagsForFolders(selectedIds)
          : Promise.resolve(0)

    setTaggerResetting(true)
    setTaggerQueueStatus(null)

    void perform
      .then((count) => {
        if (taggingQueueScope === 'selected' && selectedIds.length === 0) {
          setTaggerQueueStatus('Choose at least one folder before resetting AI tags.')
          return
        }
        setTaggerQueueStatus(
          count === 0
            ? 'No AI tag data found for the current target.'
            : `Reset AI tags for ${count.toLocaleString()} image${count === 1 ? '' : 's'}. Queue tagging when you're ready to retag.`
        )
      })
      .catch((error) => setTaggerQueueStatus(String(error)))
      .finally(() => {
        setTaggerResetting(false)
        setTaggerResetConfirming(false)
      })
  }

  return (
    <div className="mt-8 space-y-9">
      <SettingsGroup title="Model">
        <SettingsItem
          label="Tagging model"
          description="Choose which model generates tags. JoyTag suits photos and NSFW; WD is anime-focused. Switching may require a one-time download."
        >
          <div className="flex flex-col items-end gap-1.5">
            <div className="light-theme:border-gray-300/80 flex rounded-lg border border-white/[0.07] p-0.5">
              {(['wd', 'joytag'] as const).map((model) => (
                <TaggerModelButton
                  key={model}
                  model={model}
                  current={taggerModel}
                  onSelect={(nextModel) => {
                    if (nextModel === taggerModel) return
                    setTaggerThresholdDraft(null)
                    setTaggerThresholdError(null)
                    if (thresholdErrorTimerRef.current) clearTimeout(thresholdErrorTimerRef.current)
                    setTaggerModelSwitching(true)
                    setTaggerModelSwitchError(null)
                    void setTaggerModel(nextModel)
                      .catch((error: unknown) => setTaggerModelSwitchError(String(error)))
                      .finally(() => setTaggerModelSwitching(false))
                  }}
                >
                  {TAGGER_MODELS[model].tab}
                </TaggerModelButton>
              ))}
            </div>
            {taggerModelSwitchError ? (
              <p className="text-[11px] text-amber-300">{taggerModelSwitchError}</p>
            ) : (
              <p className="text-[11px] text-gray-600">
                {taggerModelSwitching
                  ? 'Switching...'
                  : `Current: ${TAGGER_MODELS[taggerModel].name}`}
              </p>
            )}
          </div>
        </SettingsItem>

        <SettingsItem
          label={
            <>
              {TAGGER_MODELS[taggerModel].name}{' '}
              <span className="ml-1.5 align-middle">
                <StatusPill tone={taggerReady ? 'ready' : taggerModelPreparing ? 'busy' : 'muted'}>
                  {taggerReady ? 'Installed' : taggerModelPreparing ? 'Preparing' : 'Not installed'}
                </StatusPill>
              </span>
            </>
          }
          description={TAGGER_MODELS[taggerModel].description}
        >
          <div className="flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-2">
              {taggerReady ? (
                <>
                  <button
                    className={settingsButtonClass}
                    onClick={() => void probeTaggerRuntime()}
                    disabled={taggerRuntimeChecking}
                  >
                    {taggerRuntimeChecking ? 'Checking runtime...' : 'Check runtime'}
                  </button>
                  <button
                    className="light-theme:border-red-400/50 light-theme:bg-red-50 light-theme:text-red-700 light-theme:hover:bg-red-100 rounded-md border border-red-400/20 bg-red-500/10 px-3 py-1.5 text-xs text-red-200 transition-colors hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-45"
                    onClick={() => void deleteTaggerModel()}
                    disabled={taggerModelPreparing}
                  >
                    Delete model files
                  </button>
                </>
              ) : (
                <button
                  className={`relative overflow-hidden ${settingsButtonClass}`}
                  onClick={() => void prepareTaggerModel()}
                  disabled={taggerModelPreparing}
                >
                  {taggerModelProgress ? (
                    <span
                      className="absolute inset-y-0 left-0 bg-emerald-400/15 transition-[width] duration-200"
                      style={{ width: `${taggerDownloadPercent}%` }}
                    />
                  ) : null}
                  <span className="relative">{taggerDownloadLabel}</span>
                </button>
              )}
            </div>
            {taggerRuntimeProbe ? (
              <div className="text-right">
                <p className="text-xs text-gray-400">
                  Runtime check{' '}
                  <span className="ml-1.5 align-middle">
                    <StatusPill tone="ready">Ready</StatusPill>
                  </span>{' '}
                  <span className="ml-2 text-gray-600">
                    · acceleration: {taggerRuntimeProbe.acceleration}
                  </span>
                </p>
                <p className="mt-1 font-mono text-xs break-all text-gray-600">
                  {taggerRuntimeProbe.session.file}
                </p>
              </div>
            ) : null}
          </div>
        </SettingsItem>

        <SettingsItem
          label="Tagger acceleration"
          description="Use DirectML when available, or fall back to CPU for reliability."
        >
          <div className="flex flex-col items-end gap-1.5">
            <div className="light-theme:border-gray-300/80 flex rounded-lg border border-white/[0.07] p-0.5">
              {(['auto', 'directml', 'cpu'] as const).map((acceleration) => (
                <TaggerAccelerationButton
                  key={acceleration}
                  acceleration={acceleration}
                  current={taggerAcceleration}
                  onSelect={(nextAcceleration) => {
                    setTaggerAccelerationSaving(true)
                    setTaggerAccelerationError(null)
                    void setTaggerAcceleration(nextAcceleration)
                      .catch((error: unknown) => setTaggerAccelerationError(String(error)))
                      .finally(() => setTaggerAccelerationSaving(false))
                  }}
                >
                  {acceleration === 'directml'
                    ? 'DirectML'
                    : acceleration === 'cpu'
                      ? 'CPU'
                      : 'Auto'}
                </TaggerAccelerationButton>
              ))}
            </div>
            {taggerAccelerationError ? (
              <p className="text-[11px] text-amber-300">{taggerAccelerationError}</p>
            ) : (
              <p className="text-[11px] text-gray-600">
                {taggerAccelerationSaving ? 'Saving...' : `Current: ${taggerAcceleration}`}
              </p>
            )}
          </div>
        </SettingsItem>

        <SettingsItem
          label="Confidence threshold"
          description="Lower values keep more tags. Higher values are stricter and usually cleaner."
        >
          <div className="flex flex-col items-end gap-1.5">
            <input
              type="number"
              min="0.05"
              max="0.99"
              step="0.05"
              className="w-20 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white focus:border-white/20 focus:outline-none"
              value={thresholdDisplay}
              onChange={(event) => setTaggerThresholdDraft(event.target.value)}
              onBlur={(event) => {
                const value = parseFloat(event.currentTarget.value)
                if (!isNaN(value) && value >= 0.05 && value <= 0.99) {
                  setTaggerThresholdError(null)
                  setTaggerThresholdSaving(true)
                  void setTaggerThreshold(value, taggerModel)
                    .catch((error: unknown) => setTaggerThresholdError(String(error)))
                    .finally(() => {
                      setTaggerThresholdDraft(null)
                      setTaggerThresholdSaving(false)
                    })
                } else {
                  setTaggerThresholdDraft(null)
                  setTaggerThresholdError('Must be 0.05 – 0.99')
                  if (thresholdErrorTimerRef.current) clearTimeout(thresholdErrorTimerRef.current)
                  thresholdErrorTimerRef.current = setTimeout(
                    () => setTaggerThresholdError(null),
                    2000
                  )
                }
              }}
            />
            {taggerThresholdError ? (
              <p className="text-[11px] text-amber-300">{taggerThresholdError}</p>
            ) : (
              <p className="text-[11px] text-gray-600">
                {taggerThresholdSaving
                  ? 'Saving...'
                  : `Default: ${TAGGER_MODELS[taggerModel].defaultThreshold}`}
              </p>
            )}
          </div>
        </SettingsItem>

        <SettingsItem
          label="Tagging batch size"
          description="Number of images processed concurrently during tag generation."
        >
          <div className="flex flex-col items-end gap-1.5">
            <input
              type="number"
              min="1"
              max="100"
              step="1"
              className="w-20 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white focus:border-white/20 focus:outline-none"
              value={batchSizeDisplay}
              onChange={(event) => setTaggerBatchSizeDraft(event.target.value)}
              onBlur={() => {
                const value = parseInt(batchSizeDisplay, 10)
                if (!isNaN(value) && value >= 1 && value <= 100) {
                  setTaggerBatchSizeError(null)
                  setTaggerBatchSizeSaving(true)
                  void setTaggerBatchSize(value)
                    .catch((error: unknown) => setTaggerQueueStatus(String(error)))
                    .finally(() => {
                      setTaggerBatchSizeDraft(null)
                      setTaggerBatchSizeSaving(false)
                    })
                } else {
                  setTaggerBatchSizeDraft(null)
                  setTaggerBatchSizeError('Must be 1 – 100')
                  if (batchSizeErrorTimerRef.current) clearTimeout(batchSizeErrorTimerRef.current)
                  batchSizeErrorTimerRef.current = setTimeout(
                    () => setTaggerBatchSizeError(null),
                    2000
                  )
                }
              }}
            />
            {taggerBatchSizeError ? (
              <p className="text-[11px] text-amber-300">{taggerBatchSizeError}</p>
            ) : (
              <p className="text-[11px] text-gray-600">
                {taggerBatchSizeSaving ? 'Saving...' : 'Default: 8'}
              </p>
            )}
          </div>
        </SettingsItem>

        <SettingsItem label="Model location" vertical>
          <div>
            <p className="font-mono text-xs break-all text-gray-600">
              {taggerReady ? taggerModelStatus?.local_dir : 'Not downloaded'}
            </p>
            {taggerModelProgress?.current_file ? (
              <p className="mt-2 text-xs break-all text-gray-500">
                {taggerModelProgress.current_file}
              </p>
            ) : null}
            {taggerModelError ? (
              <p className="mt-2 text-xs text-amber-300">{taggerModelError}</p>
            ) : null}
          </div>
        </SettingsItem>
      </SettingsGroup>

      <SettingsGroup
        title="Queue targets"
        description="Choose which folders to include when queuing tagging jobs."
      >
        <SettingsItem
          label="Target scope"
          description="Queue across the full library, or choose a specific folder set and keep the modal open while you work through it."
        >
          <div className="light-theme:border-gray-300/80 flex rounded-lg border border-white/[0.07] p-0.5">
            <ScopeButton scope="all" current={taggingQueueScope} onSelect={setTaggingQueueScope}>
              All media
            </ScopeButton>
            <ScopeButton
              scope="selected"
              current={taggingQueueScope}
              onSelect={setTaggingQueueScope}
            >
              Selected folders
            </ScopeButton>
          </div>
        </SettingsItem>

        <div className="py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-white">Folder selection</p>
              <p className="mt-1 text-xs leading-relaxed text-gray-500">
                Current target: {queueScopeLabel}.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                className="light-theme:border-gray-700/50 light-theme:bg-gray-900 light-theme:text-white light-theme:hover:bg-gray-800 light-theme:hover:text-white rounded-md border border-white/10 bg-white/[0.045] px-2.5 py-1 text-[11px] text-gray-400 transition-colors hover:bg-white/[0.075] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                onClick={() => setTaggingQueueFolderIds(folders.map((folder) => folder.id))}
                disabled={taggingQueueScope === 'all' || folders.length === 0}
              >
                Select all
              </button>
              <button
                className="light-theme:border-gray-700/50 light-theme:bg-gray-900 light-theme:text-white light-theme:hover:bg-gray-800 light-theme:hover:text-white rounded-md border border-white/10 bg-white/[0.045] px-2.5 py-1 text-[11px] text-gray-400 transition-colors hover:bg-white/[0.075] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                onClick={() => setTaggingQueueFolderIds([])}
                disabled={taggingQueueScope === 'all' || taggingQueueFolderIds.length === 0}
              >
                Clear
              </button>
            </div>
          </div>

          <div
            className={`mt-2 max-h-64 divide-y divide-white/[0.04] overflow-y-auto pr-1 ${taggingQueueScope === 'selected' ? 'opacity-100' : 'opacity-60'}`}
          >
            {folders.map((folder) => {
              const active = taggingQueueFolderIds.includes(folder.id)
              const progress = mediaJobProgress[folder.id]
              return (
                <button
                  key={folder.id}
                  type="button"
                  className={`flex w-full items-center justify-between gap-3 px-1 py-2 text-left transition-colors disabled:cursor-not-allowed ${
                    active ? 'text-white' : 'text-gray-400 hover:text-gray-200'
                  }`}
                  onClick={() => toggleTaggingQueueFolder(folder.id)}
                  disabled={taggingQueueScope === 'all'}
                >
                  <p className="min-w-0 truncate text-sm">{folder.name}</p>
                  <div className="flex shrink-0 items-center gap-3">
                    {(progress?.tagging_pending ?? 0) > 0 ? (
                      <StatusPill tone="busy">{progress?.tagging_pending} queued</StatusPill>
                    ) : null}
                    <span className="text-[11px] text-gray-600 tabular-nums">
                      {folder.image_count.toLocaleString()} items
                    </span>
                    <span
                      className={`h-4 w-4 rounded-full border ${active ? 'border-emerald-300 bg-emerald-300' : 'border-white/15 bg-transparent'}`}
                    />
                  </div>
                </button>
              )
            })}
            {folders.length === 0 ? (
              <p className="py-2 text-sm text-gray-500">
                Add a folder first to enable targeted tagging queues.
              </p>
            ) : null}
          </div>
        </div>

        <SettingsItem
          label="Queue tagging jobs"
          description="Generate missing AI tags for the current target. Results flow back into the library as the background worker finishes."
        >
          <div className="flex items-center gap-2">
            <button
              className={settingsButtonClass}
              onClick={() => runQueueAction('queue')}
              disabled={
                !taggerReady ||
                taggerQueueing ||
                taggerClearing ||
                taggerResetting ||
                (taggingQueueScope === 'selected' && taggingQueueFolderIds.length === 0)
              }
            >
              {taggerQueueing ? 'Queueing...' : 'Queue tagging'}
            </button>
            <button
              className="light-theme:border-amber-500/50 light-theme:bg-amber-50 light-theme:text-amber-700 light-theme:hover:bg-amber-100 rounded-md border border-amber-400/20 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200 transition-colors hover:bg-amber-500/15 disabled:cursor-not-allowed disabled:opacity-45"
              onClick={() => runQueueAction('clear')}
              disabled={
                taggerQueueing ||
                taggerClearing ||
                taggerResetting ||
                (taggingQueueScope === 'selected' && taggingQueueFolderIds.length === 0)
              }
            >
              {taggerClearing ? 'Clearing...' : 'Clear queued jobs'}
            </button>
            <button
              className={`rounded-md border px-3 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                taggerResetConfirming
                  ? 'light-theme:border-red-500/50 light-theme:bg-red-50 light-theme:text-red-700 light-theme:hover:bg-red-100 border-red-400/30 bg-red-500/15 text-red-200 hover:bg-red-500/25'
                  : 'light-theme:border-gray-700/50 light-theme:bg-gray-900 light-theme:text-white light-theme:hover:bg-gray-800 light-theme:hover:text-white border-white/10 bg-white/[0.055] text-gray-300 hover:bg-white/10 hover:text-white'
              }`}
              onClick={runResetAiTags}
              disabled={
                taggerQueueing ||
                taggerClearing ||
                taggerResetting ||
                (taggingQueueScope === 'selected' && taggingQueueFolderIds.length === 0)
              }
            >
              {taggerResetting
                ? 'Resetting...'
                : taggerResetConfirming
                  ? 'Confirm reset'
                  : 'Reset AI tags'}
            </button>
            {taggerResetConfirming ? (
              <button
                className="light-theme:border-gray-700/50 light-theme:text-gray-600 light-theme:hover:bg-gray-900 light-theme:hover:text-white rounded-md border border-white/10 px-3 py-1.5 text-xs text-gray-400 transition-colors hover:bg-white/[0.06] hover:text-white"
                onClick={() => {
                  setTaggerResetConfirming(false)
                  setTaggerQueueStatus(null)
                }}
                disabled={taggerResetting}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </SettingsItem>

        {taggerQueueStatus ? (
          <p className="pt-3 text-xs text-gray-500">{taggerQueueStatus}</p>
        ) : null}
      </SettingsGroup>

      <SettingsGroup
        title="Tag library"
        description="Review and clean up the tags across your library."
      >
        <SettingsItem
          label="Manage tags"
          description="Open the tag manager in Explore to search, rename, and delete tags."
        >
          <button className={settingsButtonClass} onClick={openTagManager}>
            Open tag manager
          </button>
        </SettingsItem>
      </SettingsGroup>
    </div>
  )
}
