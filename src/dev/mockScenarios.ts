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
  | 'new-user'
  | 'just-updated'

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
  'new-user',
  'just-updated',
])

// Scenarios that start with no folders or media. 'empty' is a bare library
// with onboarding already behind it; 'new-user' is the true first run and
// additionally opens the onboarding tour with no tagger model downloaded.
export function isEmptyLibraryScenario(scenario: MockScenario): boolean {
  return scenario === 'empty' || scenario === 'new-user'
}

export function getMockScenario(): MockScenario {
  if (typeof window === 'undefined') return 'rich'
  const value = new URLSearchParams(window.location.search).get('scenario')
  return value && SCENARIOS.has(value as MockScenario) ? (value as MockScenario) : 'rich'
}
