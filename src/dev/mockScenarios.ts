export type MockScenario =
  | 'rich'
  | 'empty'
  | 'busy'
  | 'duplicates'
  | 'album'
  | 'errors'
  | 'huge'
  | 'extreme'
  | 'unready'
  | 'joytag-unready'

const SCENARIOS = new Set<MockScenario>([
  'rich',
  'empty',
  'busy',
  'duplicates',
  'album',
  'errors',
  'huge',
  'extreme',
  'unready',
  'joytag-unready',
])

export function getMockScenario(): MockScenario {
  if (typeof window === 'undefined') return 'rich'
  const value = new URLSearchParams(window.location.search).get('scenario')
  return value && SCENARIOS.has(value as MockScenario) ? (value as MockScenario) : 'rich'
}
