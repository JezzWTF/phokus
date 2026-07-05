import { describe, expect, it } from 'vitest'
import { formatDuration } from './format'

describe('formatDuration', () => {
  it('returns null for missing or non-positive durations', () => {
    expect(formatDuration(null)).toBeNull()
    expect(formatDuration(0)).toBeNull()
    expect(formatDuration(-100)).toBeNull()
  })

  it('formats sub-hour durations as M:SS', () => {
    expect(formatDuration(1000)).toBe('0:01')
    expect(formatDuration(59_999)).toBe('0:59')
    expect(formatDuration(65_000)).toBe('1:05')
  })

  it('formats hour-plus durations as H:MM:SS', () => {
    expect(formatDuration(3_600_000)).toBe('1:00:00')
    expect(formatDuration(3_661_000)).toBe('1:01:01')
  })
})
