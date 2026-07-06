import { describe, expect, it } from 'vitest'
import { getChangelogForVersion } from './changelog'

describe('getChangelogForVersion', () => {
  it('returns null for a null/undefined version', () => {
    expect(getChangelogForVersion(null)).toBeNull()
    expect(getChangelogForVersion(undefined)).toBeNull()
  })

  it('never surfaces the in-progress Unreleased section', () => {
    expect(getChangelogForVersion('Unreleased')).toBeNull()
    expect(getChangelogForVersion('unreleased')).toBeNull()
  })

  it('returns null for a version with no matching entry', () => {
    expect(getChangelogForVersion('99.9.9')).toBeNull()
  })

  it('resolves a plain released version', () => {
    const entry = getChangelogForVersion('0.1.1')
    expect(entry?.version).toBe('0.1.1')
    expect(entry?.date).toBe('2026-06-23')
  })

  it('strips a leading "v" from the version string', () => {
    expect(getChangelogForVersion('v0.1.1')?.version).toBe('0.1.1')
  })

  it('strips dev/UI-lab build suffixes so they resolve to the base version', () => {
    expect(getChangelogForVersion('0.1.1-dev')?.version).toBe('0.1.1')
    expect(getChangelogForVersion('0.1.1-ui')?.version).toBe('0.1.1')
    expect(getChangelogForVersion('0.1.1-beta.1')?.version).toBe('0.1.1')
  })
})
