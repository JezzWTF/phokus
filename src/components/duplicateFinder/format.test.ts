import { describe, expect, it } from 'vitest'
import type { DuplicateScanProgress } from '../../store'
import {
  duplicateProgressLabel,
  duplicateProgressPercent,
  formatBytes,
  formatRelativeTime,
} from './format'

function progress(overrides: Partial<DuplicateScanProgress> = {}): DuplicateScanProgress {
  return { phase: 'checking', processed: 0, total: 0, skipped: 0, ...overrides }
}

describe('formatBytes', () => {
  it('formats each size tier', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(1_048_576)).toBe('1.0 MB')
    expect(formatBytes(1_610_612_736)).toBe('1.5 GB')
  })
})

describe('formatRelativeTime', () => {
  const now = () => Math.floor(Date.now() / 1000)

  it('formats each time bucket', () => {
    expect(formatRelativeTime(now())).toBe('just now')
    expect(formatRelativeTime(now() - 120)).toBe('2m ago')
    expect(formatRelativeTime(now() - 7200)).toBe('2h ago')
    expect(formatRelativeTime(now() - 172_800)).toBe('2d ago')
  })
})

describe('duplicateProgressLabel', () => {
  it('returns null without progress', () => {
    expect(duplicateProgressLabel(null)).toBeNull()
  })

  it('labels each phase', () => {
    expect(duplicateProgressLabel(progress({ phase: 'checking' }))).toBe('Checking file sizes')
    expect(duplicateProgressLabel(progress({ phase: 'hashing' }))).toBe(
      'Hashing duplicate candidates'
    )
    expect(duplicateProgressLabel(progress({ phase: 'confirming' }))).toBe(
      'Confirming exact matches'
    )
  })
})

describe('duplicateProgressPercent', () => {
  it('returns 0 for missing progress or zero totals', () => {
    expect(duplicateProgressPercent(null)).toBe(0)
    expect(duplicateProgressPercent(progress({ processed: 5, total: 0 }))).toBe(0)
  })

  it('rounds to whole percent', () => {
    expect(duplicateProgressPercent(progress({ processed: 50, total: 200 }))).toBe(25)
    expect(duplicateProgressPercent(progress({ processed: 1, total: 3 }))).toBe(33)
  })
})
