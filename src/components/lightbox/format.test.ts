import { describe, expect, it } from 'vitest'
import { embeddingLabel, formatBytes, formatDate, formatDuration, ratingPill } from './format'

describe('formatBytes', () => {
  it('formats each size tier', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })
})

describe('formatDate', () => {
  it('returns Unknown for null', () => {
    expect(formatDate(null)).toBe('Unknown')
  })

  it('formats ISO dates with a full year', () => {
    // Exact output is locale-dependent; assert the stable parts.
    const formatted = formatDate('2024-03-15T12:00:00Z')
    expect(formatted).toContain('2024')
    expect(formatted).not.toBe('Unknown')
  })
})

describe('formatDuration', () => {
  it('reports pending for missing or zero durations', () => {
    expect(formatDuration(null)).toBe('Pending / unavailable')
    expect(formatDuration(0)).toBe('Pending / unavailable')
    expect(formatDuration(-5)).toBe('Pending / unavailable')
  })

  it('formats minutes and hours', () => {
    expect(formatDuration(65_000)).toBe('1:05')
    expect(formatDuration(3_661_000)).toBe('1:01:01')
  })
})

describe('embeddingLabel', () => {
  it('labels each status', () => {
    expect(embeddingLabel('ready', 'clip-vit')).toBe('Ready (clip-vit)')
    expect(embeddingLabel('ready', null)).toBe('Ready')
    expect(embeddingLabel('failed', null)).toBe('Failed')
    expect(embeddingLabel('processing', null)).toBe('Processing')
    expect(embeddingLabel('pending', null)).toBe('Queued')
  })
})

describe('ratingPill', () => {
  it('maps each AI rating to a label and tone', () => {
    expect(ratingPill('general').label).toBe('General')
    expect(ratingPill('general').className).toContain('emerald')
    expect(ratingPill('sensitive').label).toBe('Sensitive')
    expect(ratingPill('sensitive').className).toContain('sky')
    expect(ratingPill('questionable').label).toBe('Questionable')
    expect(ratingPill('questionable').className).toContain('amber')
    expect(ratingPill('explicit').label).toBe('Explicit')
    expect(ratingPill('explicit').className).toContain('red')
  })
})
