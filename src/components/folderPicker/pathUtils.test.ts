import { describe, expect, it } from 'vitest'
import {
  buildBreadcrumbs,
  cleanAddressInput,
  folderName,
  friendlyDirectoryError,
  normalizePath,
} from './pathUtils'

describe('normalizePath', () => {
  it('converts backslashes, strips trailing slashes, and lowercases', () => {
    expect(normalizePath('C:\\Users\\Me\\Pictures\\')).toBe('c:/users/me/pictures')
    expect(normalizePath('/home/User/photos///')).toBe('/home/user/photos')
    expect(normalizePath('relative/path')).toBe('relative/path')
  })
})

describe('cleanAddressInput', () => {
  it('strips matching surrounding quotes', () => {
    expect(cleanAddressInput('"C:\\Photos"')).toBe('C:\\Photos')
    expect(cleanAddressInput("'C:\\Photos'")).toBe('C:\\Photos')
  })

  it('leaves mismatched quotes alone', () => {
    expect(cleanAddressInput('"C:\\Photos\'')).toBe('"C:\\Photos\'')
  })

  it('trims whitespace inside and outside quotes', () => {
    expect(cleanAddressInput('  " C:\\Photos "  ')).toBe('C:\\Photos')
    expect(cleanAddressInput('  C:\\Photos  ')).toBe('C:\\Photos')
  })
})

describe('friendlyDirectoryError', () => {
  it('maps not-found style errors to a friendly message', () => {
    expect(friendlyDirectoryError(new Error('The system cannot find the path specified.'))).toBe(
      'Folder not found. Check the path and try again.'
    )
    expect(friendlyDirectoryError(new Error('os error 3'))).toBe(
      'Folder not found. Check the path and try again.'
    )
    expect(friendlyDirectoryError('No such file or directory')).toBe(
      'Folder not found. Check the path and try again.'
    )
  })

  it('passes other messages through', () => {
    expect(friendlyDirectoryError(new Error('Access denied'))).toBe('Access denied')
    expect(friendlyDirectoryError(42)).toBe('42')
  })
})

describe('folderName', () => {
  it('returns the final path component', () => {
    expect(folderName('C:\\Users\\me\\Pictures')).toBe('Pictures')
    expect(folderName('/home/user/photos/')).toBe('photos')
  })

  it('handles roots', () => {
    expect(folderName('C:\\')).toBe('C:')
    expect(folderName('/')).toBe('/')
  })
})

describe('buildBreadcrumbs', () => {
  it('returns the home crumb for null paths', () => {
    expect(buildBreadcrumbs(null)).toEqual([{ label: 'This PC / Home', path: null }])
  })

  it('builds Windows drive breadcrumbs', () => {
    expect(buildBreadcrumbs('C:\\Users\\me')).toEqual([
      { label: 'This PC', path: null },
      { label: 'C:', path: 'C:' },
      { label: 'Users', path: 'C:\\Users' },
      { label: 'me', path: 'C:\\Users\\me' },
    ])
  })

  it('builds Unix breadcrumbs', () => {
    expect(buildBreadcrumbs('/home/user')).toEqual([
      { label: '/', path: null },
      { label: 'home', path: '/home' },
      { label: 'user', path: '/home/user' },
    ])
  })

  it('ignores trailing separators', () => {
    const crumbs = buildBreadcrumbs('C:\\Users\\')
    expect(crumbs.map((c) => c.label)).toEqual(['This PC', 'C:', 'Users'])
  })
})
