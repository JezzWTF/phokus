import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeFolderProgress, makeImage } from '../test/factories'
import {
  countNewImages,
  imagesAffectScope,
  initialAiCaptionsEnabled,
  initialBoolSetting,
  initialNumberSetting,
  isCurrentGalleryRequest,
  matchesFilters,
  matchesSearch,
  mergeImages,
  mergeIntoVisibleWindow,
  nextGalleryRequestToken,
  parseSearchValue,
  replaceExistingImages,
  replaceImage,
  scopeHasTaggingPending,
  searchModeLabel,
  taggingProgressAffectsScope,
  tileSizeForZoom,
} from './helpers'

describe('parseSearchValue', () => {
  it('returns empty filename search for blank input', () => {
    expect(parseSearchValue('')).toEqual({ mode: 'filename', query: '', prefix: null })
    expect(parseSearchValue('   ')).toEqual({ mode: 'filename', query: '', prefix: null })
  })

  it('treats plain text as filename search', () => {
    expect(parseSearchValue('sunset')).toEqual({ mode: 'filename', query: 'sunset', prefix: null })
  })

  it('parses slash prefixes', () => {
    expect(parseSearchValue('/s beach')).toEqual({ mode: 'semantic', query: 'beach', prefix: '/s' })
    expect(parseSearchValue('/t cat')).toEqual({ mode: 'tag', query: 'cat', prefix: '/t' })
    expect(parseSearchValue('/f holiday')).toEqual({
      mode: 'filename',
      query: 'holiday',
      prefix: '/f',
    })
  })

  it('parses a bare slash prefix with no query yet', () => {
    expect(parseSearchValue('/s')).toEqual({ mode: 'semantic', query: '', prefix: '/s' })
    expect(parseSearchValue('/t')).toEqual({ mode: 'tag', query: '', prefix: '/t' })
  })

  it('is case-insensitive on slash prefixes', () => {
    expect(parseSearchValue('/S beach')).toEqual({ mode: 'semantic', query: 'beach', prefix: '/s' })
  })

  it('keeps multi-word queries intact', () => {
    expect(parseSearchValue('/s beach at sunset').query).toBe('beach at sunset')
  })

  it('falls back to filename for unknown slash prefixes', () => {
    expect(parseSearchValue('/x foo')).toEqual({ mode: 'filename', query: 'foo', prefix: null })
  })

  it('parses colon prefixes', () => {
    expect(parseSearchValue('s: beach')).toEqual({ mode: 'semantic', query: 'beach', prefix: 's:' })
    expect(parseSearchValue('t:cat')).toEqual({ mode: 'tag', query: 'cat', prefix: 't:' })
    expect(parseSearchValue('f: holiday')).toEqual({
      mode: 'filename',
      query: 'holiday',
      prefix: 'f:',
    })
    expect(parseSearchValue('S: beach')).toEqual({ mode: 'semantic', query: 'beach', prefix: 's:' })
  })

  it('falls back to filename for unknown colon prefixes', () => {
    expect(parseSearchValue('x: foo')).toEqual({ mode: 'filename', query: 'foo', prefix: null })
  })

  it('does not treat multi-letter colon words as prefixes', () => {
    expect(parseSearchValue('note: hello')).toEqual({
      mode: 'filename',
      query: 'note: hello',
      prefix: null,
    })
  })
})

describe('searchModeLabel / tileSizeForZoom', () => {
  it('labels every search mode', () => {
    expect(searchModeLabel('semantic')).toBe('Semantic Search')
    expect(searchModeLabel('tag')).toBe('Tag Search')
    expect(searchModeLabel('filename')).toBe('Filename Search')
  })

  it('maps zoom presets to tile sizes', () => {
    expect(tileSizeForZoom('compact')).toBe(160)
    expect(tileSizeForZoom('comfortable')).toBe(220)
    expect(tileSizeForZoom('detail')).toBe(280)
  })
})

describe('matchesSearch', () => {
  it('matches any image when search is empty', () => {
    expect(matchesSearch(makeImage(), '')).toBe(true)
  })

  it('matches filename substrings case-insensitively', () => {
    const image = makeImage({ filename: 'Beach_Sunset.JPG' })
    expect(matchesSearch(image, 'sunset')).toBe(true)
    expect(matchesSearch(image, 'SUNSET')).toBe(true)
    expect(matchesSearch(image, 'mountain')).toBe(false)
  })
})

describe('matchesFilters', () => {
  const pass = (image = makeImage()) =>
    matchesFilters(image, null, 'all', false, 0, false, false, '')

  it('passes with no filters active', () => {
    expect(pass()).toBe(true)
  })

  it('filters by folder', () => {
    const image = makeImage({ folder_id: 2 })
    expect(matchesFilters(image, 2, 'all', false, 0, false, false, '')).toBe(true)
    expect(matchesFilters(image, 3, 'all', false, 0, false, false, '')).toBe(false)
  })

  it('filters by media kind', () => {
    const video = makeImage({ media_kind: 'video' })
    expect(matchesFilters(video, null, 'video', false, 0, false, false, '')).toBe(true)
    expect(matchesFilters(video, null, 'image', false, 0, false, false, '')).toBe(false)
  })

  it('filters favorites and minimum rating', () => {
    const image = makeImage({ favorite: false, rating: 2 })
    expect(matchesFilters(image, null, 'all', true, 0, false, false, '')).toBe(false)
    expect(matchesFilters(image, null, 'all', false, 3, false, false, '')).toBe(false)
    expect(matchesFilters(image, null, 'all', false, 2, false, false, '')).toBe(true)
  })

  it('filters failed embeddings and failed tagging', () => {
    const healthy = makeImage({ embedding_status: 'ready', ai_tagger_error: null })
    const broken = makeImage({ embedding_status: 'failed', ai_tagger_error: 'boom' })
    expect(matchesFilters(healthy, null, 'all', false, 0, true, false, '')).toBe(false)
    expect(matchesFilters(broken, null, 'all', false, 0, true, false, '')).toBe(true)
    expect(matchesFilters(healthy, null, 'all', false, 0, false, true, '')).toBe(false)
    expect(matchesFilters(broken, null, 'all', false, 0, false, true, '')).toBe(true)
  })

  it('applies the search term', () => {
    const image = makeImage({ filename: 'cat.jpg' })
    expect(matchesFilters(image, null, 'all', false, 0, false, false, 'cat')).toBe(true)
    expect(matchesFilters(image, null, 'all', false, 0, false, false, 'dog')).toBe(false)
  })
})

describe('mergeImages', () => {
  it('deduplicates by path, letting new records win', () => {
    const stale = makeImage({ path: 'C:/media/a.jpg', filename: 'a.jpg', rating: 0 })
    const fresh = makeImage({ path: 'C:/media/a.jpg', filename: 'a.jpg', rating: 5 })
    const merged = mergeImages([stale], [fresh], 'name_asc')
    expect(merged).toHaveLength(1)
    expect(merged[0].rating).toBe(5)
  })

  it('sorts by name in both directions', () => {
    const a = makeImage({ path: 'a', filename: 'apple.jpg' })
    const b = makeImage({ path: 'b', filename: 'banana.jpg' })
    expect(mergeImages([b], [a], 'name_asc').map((i) => i.filename)).toEqual([
      'apple.jpg',
      'banana.jpg',
    ])
    expect(mergeImages([b], [a], 'name_desc').map((i) => i.filename)).toEqual([
      'banana.jpg',
      'apple.jpg',
    ])
  })

  it('sorts by modified date, treating null as the epoch', () => {
    const older = makeImage({ path: 'a', modified_at: '2025-01-01T00:00:00Z' })
    const newer = makeImage({ path: 'b', modified_at: '2026-01-01T00:00:00Z' })
    const undated = makeImage({ path: 'c', modified_at: null })
    const asc = mergeImages([newer, undated], [older], 'date_asc')
    expect(asc.map((i) => i.path)).toEqual(['c', 'a', 'b'])
    const desc = mergeImages([newer, undated], [older], 'date_desc')
    expect(desc.map((i) => i.path)).toEqual(['b', 'a', 'c'])
  })

  it('sorts by size, rating, and duration', () => {
    const small = makeImage({ path: 'a', file_size: 10, rating: 1, duration_ms: 100 })
    const large = makeImage({ path: 'b', file_size: 20, rating: 3, duration_ms: null })
    expect(mergeImages([large], [small], 'size_asc')[0].path).toBe('a')
    expect(mergeImages([large], [small], 'size_desc')[0].path).toBe('b')
    expect(mergeImages([large], [small], 'rating_asc')[0].path).toBe('a')
    expect(mergeImages([large], [small], 'rating_desc')[0].path).toBe('b')
    // null duration sorts as 0
    expect(mergeImages([large], [small], 'duration_asc')[0].path).toBe('b')
    expect(mergeImages([large], [small], 'duration_desc')[0].path).toBe('a')
  })

  it('falls back to modified_at when taken_at is missing', () => {
    const taken = makeImage({
      path: 'a',
      taken_at: '2024-01-01T00:00:00Z',
      modified_at: '2026-01-01T00:00:00Z',
    })
    const untaken = makeImage({
      path: 'b',
      taken_at: null,
      modified_at: '2025-01-01T00:00:00Z',
    })
    expect(mergeImages([taken], [untaken], 'taken_asc').map((i) => i.path)).toEqual(['a', 'b'])
    expect(mergeImages([taken], [untaken], 'taken_desc').map((i) => i.path)).toEqual(['b', 'a'])
  })
})

describe('mergeIntoVisibleWindow', () => {
  it('limits the merged list to the window size', () => {
    const images = [1, 2, 3, 4].map((n) => makeImage({ path: `p${n}`, filename: `${n}.jpg` }))
    const windowed = mergeIntoVisibleWindow(images.slice(0, 2), images.slice(2), 'name_asc', 3)
    expect(windowed).toHaveLength(3)
    expect(windowed.map((i) => i.filename)).toEqual(['1.jpg', '2.jpg', '3.jpg'])
  })

  it('clamps negative window sizes to zero', () => {
    expect(mergeIntoVisibleWindow([makeImage()], [], 'name_asc', -1)).toEqual([])
  })
})

describe('countNewImages', () => {
  it('counts only paths not already present', () => {
    const current = [makeImage({ path: 'a' })]
    const incoming = [makeImage({ path: 'a' }), makeImage({ path: 'b' }), makeImage({ path: 'c' })]
    expect(countNewImages(current, incoming)).toBe(2)
  })

  it('counts duplicate new paths once', () => {
    const incoming = [makeImage({ path: 'b' }), makeImage({ path: 'b' })]
    expect(countNewImages([], incoming)).toBe(1)
  })
})

describe('replaceImage / replaceExistingImages', () => {
  it('replaceImage swaps the matching record and re-sorts', () => {
    const a = makeImage({ path: 'a', filename: 'a.jpg' })
    const b = makeImage({ path: 'b', filename: 'b.jpg' })
    const renamed = makeImage({ path: 'a', filename: 'z.jpg' })
    const result = replaceImage([a, b], renamed, 'name_asc')
    expect(result.map((i) => i.filename)).toEqual(['b.jpg', 'z.jpg'])
  })

  it('replaceExistingImages swaps in place without re-sorting', () => {
    const a = makeImage({ path: 'a', rating: 0 })
    const b = makeImage({ path: 'b', rating: 0 })
    const updated = makeImage({ path: 'b', rating: 5 })
    const result = replaceExistingImages([b, a], [updated])
    expect(result.map((i) => i.path)).toEqual(['b', 'a'])
    expect(result[0].rating).toBe(5)
  })

  it('replaceExistingImages ignores updates for unknown paths and returns the same array', () => {
    const current = [makeImage({ path: 'a' })]
    const result = replaceExistingImages(current, [makeImage({ path: 'zzz' })])
    expect(result).toBe(current)
  })
})

describe('localStorage-backed initial settings', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function stubLocalStorage(entries: Record<string, string>) {
    const store = new Map(Object.entries(entries))
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
      },
    })
  }

  it('returns the fallback when window is undefined', () => {
    expect(initialBoolSetting('missing', true)).toBe(true)
    expect(initialNumberSetting('missing', 7, 0, 10)).toBe(7)
    expect(initialAiCaptionsEnabled('missing')).toBe(false)
  })

  it('initialAiCaptionsEnabled only enables on the literal string "true"', () => {
    stubLocalStorage({ on: 'true', off: 'yes' })
    expect(initialAiCaptionsEnabled('on')).toBe(true)
    expect(initialAiCaptionsEnabled('off')).toBe(false)
    expect(initialAiCaptionsEnabled('absent')).toBe(false)
  })

  it('reads booleans from storage', () => {
    stubLocalStorage({ on: 'true', off: 'false' })
    expect(initialBoolSetting('on', false)).toBe(true)
    expect(initialBoolSetting('off', true)).toBe(false)
    expect(initialBoolSetting('absent', true)).toBe(true)
  })

  it('clamps stored numbers to the allowed range', () => {
    stubLocalStorage({ low: '-5', high: '999', ok: '4', junk: 'abc' })
    expect(initialNumberSetting('low', 5, 0, 10)).toBe(0)
    expect(initialNumberSetting('high', 5, 0, 10)).toBe(10)
    expect(initialNumberSetting('ok', 5, 0, 10)).toBe(4)
    expect(initialNumberSetting('junk', 5, 0, 10)).toBe(5)
    expect(initialNumberSetting('absent', 5, 0, 10)).toBe(5)
  })
})

describe('gallery request tokens', () => {
  it('only the most recent token is current', () => {
    const first = nextGalleryRequestToken()
    expect(isCurrentGalleryRequest(first)).toBe(true)
    const second = nextGalleryRequestToken()
    expect(second).toBeGreaterThan(first)
    expect(isCurrentGalleryRequest(first)).toBe(false)
    expect(isCurrentGalleryRequest(second)).toBe(true)
  })
})

describe('tagging scope helpers', () => {
  it('scopeHasTaggingPending checks a single folder scope', () => {
    const progress = { 1: makeFolderProgress({ folder_id: 1, tagging_pending: 3 }) }
    expect(scopeHasTaggingPending(progress, 1)).toBe(true)
    expect(scopeHasTaggingPending(progress, 2)).toBe(false)
  })

  it('scopeHasTaggingPending checks all folders when scope is null', () => {
    const progress = {
      1: makeFolderProgress({ folder_id: 1, tagging_pending: 0 }),
      2: makeFolderProgress({ folder_id: 2, tagging_pending: 1 }),
    }
    expect(scopeHasTaggingPending(progress, null)).toBe(true)
    expect(scopeHasTaggingPending({}, null)).toBe(false)
  })

  it('taggingProgressAffectsScope matches null or same-folder scopes', () => {
    expect(taggingProgressAffectsScope(1, null)).toBe(true)
    expect(taggingProgressAffectsScope(1, 1)).toBe(true)
    expect(taggingProgressAffectsScope(1, 2)).toBe(false)
  })

  it('imagesAffectScope checks folder membership', () => {
    const images = [makeImage({ folder_id: 1 }), makeImage({ folder_id: 2 })]
    expect(imagesAffectScope(images, null)).toBe(true)
    expect(imagesAffectScope(images, 2)).toBe(true)
    expect(imagesAffectScope(images, 3)).toBe(false)
  })
})
