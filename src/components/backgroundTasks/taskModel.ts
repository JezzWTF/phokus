import type {
  DuplicateScanProgress,
  Folder,
  FolderJobProgress,
  IndexProgress,
  WorkerKey,
} from '../../store'
import type { BackgroundTask, TaskStage } from './types'

export function buildFolderTasks({
  dismissed,
  folders,
  indexingProgress,
  mediaJobProgress,
  workerPaused,
}: {
  dismissed: Record<number, string>
  folders: Folder[]
  indexingProgress: Record<number, IndexProgress>
  mediaJobProgress: Record<number, FolderJobProgress>
  workerPaused: Record<number, Record<WorkerKey, boolean>>
}): BackgroundTask[] {
  return folders
    .map((folder): BackgroundTask | null => {
      const index = indexingProgress[folder.id]
      const jobs = mediaJobProgress[folder.id]

      const thumbnailPending = jobs?.thumbnail_pending ?? 0
      const metadataPending = jobs?.metadata_pending ?? 0
      const embeddingPending = jobs?.embedding_pending ?? 0
      const embeddingReady = jobs?.embedding_ready ?? 0
      const embeddingFailed = jobs?.embedding_failed ?? 0
      const taggingPending = jobs?.tagging_pending ?? 0
      const taggingReady = jobs?.tagging_ready ?? 0
      const taggingFailed = jobs?.tagging_failed ?? 0
      const captionPending = jobs?.caption_pending ?? 0
      const captionReady = jobs?.caption_ready ?? 0
      const captionFailed = jobs?.caption_failed ?? 0

      const paused = workerPaused[folder.id]
      const isActive =
        (!!index && !index.done) ||
        (thumbnailPending > 0 && !(paused?.thumbnail ?? false)) ||
        (metadataPending > 0 && !(paused?.metadata ?? false)) ||
        (embeddingPending > 0 && !(paused?.embedding ?? false)) ||
        (taggingPending > 0 && !(paused?.tagging ?? false)) ||
        captionPending > 0

      const pendingMediaWork =
        thumbnailPending + metadataPending + embeddingPending + taggingPending + captionPending
      const embeddingProcessed = embeddingReady + embeddingFailed
      const embeddingTotal = embeddingProcessed + embeddingPending
      const taggingProcessed = taggingReady + taggingFailed
      const taggingTotal = taggingProcessed + taggingPending
      const captionProcessed = captionReady + captionFailed
      const captionTotal = captionProcessed + captionPending
      const hasFailedEmbeddings = embeddingFailed > 0
      const hasFailedTagging = taggingFailed > 0
      const hasFailedCaptions = captionFailed > 0

      if (
        !index &&
        pendingMediaWork === 0 &&
        !hasFailedEmbeddings &&
        !hasFailedTagging &&
        !hasFailedCaptions
      )
        return null

      const stages: TaskStage[] = []

      if (index && !index.done) {
        stages.push({
          label: 'Scanning',
          detail: `${index.indexed.toLocaleString()} / ${index.total.toLocaleString()}`,
          progress: index.total > 0 ? (index.indexed / index.total) * 100 : 0,
          failed: false,
        })
      }

      if (thumbnailPending > 0) {
        stages.push({
          label: 'Thumbnails',
          detail: thumbnailPending.toLocaleString(),
          progress: null,
          failed: false,
        })
      }

      if (metadataPending > 0) {
        stages.push({
          label: 'Metadata',
          detail: metadataPending.toLocaleString(),
          progress: null,
          failed: false,
        })
      }

      if (embeddingPending > 0) {
        stages.push({
          label: 'Embeddings',
          detail: `${embeddingProcessed.toLocaleString()} / ${embeddingTotal.toLocaleString()}`,
          progress: embeddingTotal > 0 ? (embeddingProcessed / embeddingTotal) * 100 : 0,
          failed: false,
        })
      }

      if (taggingPending > 0) {
        stages.push({
          label: 'Tags',
          detail: `${taggingProcessed.toLocaleString()} / ${taggingTotal.toLocaleString()}`,
          progress: taggingTotal > 0 ? (taggingProcessed / taggingTotal) * 100 : 0,
          failed: false,
        })
      }

      if (captionPending > 0) {
        stages.push({
          label: 'Captions',
          detail: `${captionProcessed.toLocaleString()} / ${captionTotal.toLocaleString()}`,
          progress: captionTotal > 0 ? (captionProcessed / captionTotal) * 100 : 0,
          failed: false,
        })
      }

      if (hasFailedEmbeddings && pendingMediaWork === 0) {
        stages.push({
          label: 'Failed',
          detail: `${embeddingFailed.toLocaleString()} embeddings`,
          progress: null,
          failed: true,
        })
      }

      if (hasFailedTagging && pendingMediaWork === 0) {
        stages.push({
          label: 'Failed',
          detail: `${taggingFailed.toLocaleString()} tags`,
          progress: null,
          failed: true,
        })
      }

      if (hasFailedCaptions && pendingMediaWork === 0) {
        stages.push({
          label: 'Failed',
          detail: `${captionFailed.toLocaleString()} captions`,
          progress: null,
          failed: true,
        })
      }

      const snapshot = `${pendingMediaWork}:${embeddingFailed}:${taggingFailed}:${captionFailed}`

      return {
        id: folder.id,
        name: folder.name,
        stages,
        isActive,
        hasFailedEmbeddings,
        hasFailedTagging,
        hasFailedCaptions,
        pendingMediaWork,
        embeddingProcessed,
        embeddingTotal,
        currentFile: index && !index.done ? index.current_file || null : null,
        snapshot,
      }
    })
    .filter((task): task is BackgroundTask => task !== null)
    .filter((task) => dismissed[task.id] !== task.snapshot)
    .sort((a, b) => Number(b.isActive) - Number(a.isActive))
}

export function buildDuplicateScanTask(
  duplicateScanning: boolean,
  duplicateScanProgress: DuplicateScanProgress | null
): BackgroundTask | null {
  if (!duplicateScanning) return null

  return {
    id: -1,
    name: 'Duplicate Scan',
    stages: [
      {
        label:
          duplicateScanProgress?.phase === 'checking'
            ? 'Checking'
            : duplicateScanProgress?.phase === 'confirming'
              ? 'Confirming'
              : 'Hashing',
        detail: duplicateScanProgress
          ? `${duplicateScanProgress.processed.toLocaleString()} / ${duplicateScanProgress.total.toLocaleString()}${duplicateScanProgress.skipped > 0 ? ` · ${duplicateScanProgress.skipped.toLocaleString()} skipped` : ''}`
          : 'Starting…',
        progress:
          duplicateScanProgress && duplicateScanProgress.total > 0
            ? (duplicateScanProgress.processed / duplicateScanProgress.total) * 100
            : null,
        failed: false,
      },
    ],
    isActive: true,
    hasFailedEmbeddings: false,
    hasFailedTagging: false,
    hasFailedCaptions: false,
    pendingMediaWork: 1,
    embeddingProcessed: 0,
    embeddingTotal: 0,
    currentFile: null,
    snapshot: '',
  }
}

export function taskProgress(task: BackgroundTask): number | null {
  const embeddingStage = task.stages.find((stage) => stage.label === 'Embeddings')
  const taggingStage = task.stages.find((stage) => stage.label === 'Tags')
  const scanningStage = task.stages.find((stage) => stage.label === 'Scanning')
  const duplicateStage = task.id === -1 ? task.stages[0] : null
  return (
    embeddingStage?.progress ??
    taggingStage?.progress ??
    scanningStage?.progress ??
    duplicateStage?.progress ??
    null
  )
}

export function taskHasTerminalFailure(task: BackgroundTask): boolean {
  return (
    (task.hasFailedEmbeddings || task.hasFailedTagging || task.hasFailedCaptions) &&
    task.pendingMediaWork === 0
  )
}
