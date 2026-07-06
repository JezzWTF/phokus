import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => `asset://localhost/${path}`,
}))

import { mediaSrc } from './mediaSrc'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('mediaSrc', () => {
  it('returns null for a null path', () => {
    expect(mediaSrc(null)).toBeNull()
  })

  it('delegates to convertFileSrc outside UI Lab mode', () => {
    expect(mediaSrc('C:/media/image.jpg')).toBe('asset://localhost/C:/media/image.jpg')
  })

  it('passes through absolute/http paths unchanged in UI Lab mode', () => {
    vi.stubEnv('MODE', 'ui')
    expect(mediaSrc('/dev-media/image.jpg')).toBe('/dev-media/image.jpg')
    expect(mediaSrc('http://example.com/image.jpg')).toBe('http://example.com/image.jpg')
  })

  it('rewrites mock:// paths to /dev-media/ in UI Lab mode', () => {
    vi.stubEnv('MODE', 'ui')
    expect(mediaSrc('mock://folder/image.jpg')).toBe('/dev-media/folder/image.jpg')
  })

  it('falls back to convertFileSrc for other paths in UI Lab mode', () => {
    vi.stubEnv('MODE', 'ui')
    expect(mediaSrc('C:/media/image.jpg')).toBe('asset://localhost/C:/media/image.jpg')
  })
})
