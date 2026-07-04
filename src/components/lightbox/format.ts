import { AiRating } from '../../store'

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatDate(iso: string | null): string {
  if (!iso) return 'Unknown'
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function formatDuration(durationMs: number | null): string {
  if (!durationMs || durationMs <= 0) return 'Pending / unavailable'
  const totalSeconds = Math.floor(durationMs / 1000)
  const seconds = totalSeconds % 60
  const minutes = Math.floor(totalSeconds / 60) % 60
  const hours = Math.floor(totalSeconds / 3600)

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }

  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function embeddingLabel(status: string, model: string | null): string {
  if (status === 'ready') {
    return model ? `Ready (${model})` : 'Ready'
  }
  if (status === 'failed') {
    return 'Failed'
  }
  if (status === 'processing') {
    return 'Processing'
  }
  return 'Queued'
}

export function ratingPill(rating: AiRating): { label: string; className: string } {
  switch (rating) {
    case 'general':
      return {
        label: 'General',
        className: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-300',
      }
    case 'sensitive':
      return { label: 'Sensitive', className: 'border-sky-400/25 bg-sky-500/10 text-sky-300' }
    case 'questionable':
      return {
        label: 'Questionable',
        className: 'border-amber-400/25 bg-amber-500/10 text-amber-300',
      }
    case 'explicit':
      return { label: 'Explicit', className: 'border-red-400/25 bg-red-500/10 text-red-300' }
  }
}
