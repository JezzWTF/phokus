import { convertFileSrc } from '@tauri-apps/api/core'

const MOCK_MEDIA_PREFIX = 'mock://'

export function mediaSrc(path: string | null): string | null {
  if (!path) return null

  if (import.meta.env.MODE === 'ui' && (path.startsWith('/') || path.startsWith('http'))) {
    return path
  }

  if (import.meta.env.MODE === 'ui' && path.startsWith(MOCK_MEDIA_PREFIX)) {
    return `/dev-media/${path.slice(MOCK_MEDIA_PREFIX.length)}`
  }

  return convertFileSrc(path)
}
