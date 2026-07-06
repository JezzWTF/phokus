import { describe, expect, it } from 'vitest'
import { makeImage } from '../../test/factories'
import { groupImages } from './timelineModel'

describe('groupImages', () => {
  it('buckets images by year-month, preferring taken_at over modified_at', () => {
    const groups = groupImages([
      makeImage({ id: 1, taken_at: '2026-03-05T00:00:00Z', modified_at: '2026-01-01T00:00:00Z' }),
      makeImage({ id: 2, taken_at: null, modified_at: '2026-03-20T00:00:00Z' }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].key).toBe('2026-03')
    expect(groups[0].images.map((i) => i.id)).toEqual([1, 2])
  })

  it('sorts groups chronologically ascending', () => {
    const groups = groupImages([
      makeImage({ id: 1, taken_at: '2026-06-01T00:00:00Z' }),
      makeImage({ id: 2, taken_at: '2026-01-01T00:00:00Z' }),
      makeImage({ id: 3, taken_at: '2026-03-01T00:00:00Z' }),
    ])

    expect(groups.map((g) => g.key)).toEqual(['2026-01', '2026-03', '2026-06'])
  })

  it('buckets images with no date under "unknown" and sorts it last', () => {
    const groups = groupImages([
      makeImage({ id: 1, taken_at: null, modified_at: null }),
      makeImage({ id: 2, taken_at: '2026-01-01T00:00:00Z' }),
    ])

    expect(groups.map((g) => g.key)).toEqual(['2026-01', 'unknown'])
    expect(groups[1].label).toBe('Unknown Date')
  })

  it('returns no groups for an empty image list', () => {
    expect(groupImages([])).toEqual([])
  })
})
