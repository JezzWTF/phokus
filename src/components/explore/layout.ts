export const ACCENTS = [
  '#60a5fa',
  '#c084fc',
  '#4ade80',
  '#fbbf24',
  '#f472b4',
  '#2dd4bf',
  '#fb923c',
  '#a78bfa',
  '#34d399',
  '#f87171',
]

// Darker variants of each accent for the light theme -- the bright originals are
// tuned for dark cards and wash out on the cream background.
export const LIGHT_ACCENTS = [
  '#2563eb',
  '#9333ea',
  '#16a34a',
  '#d97706',
  '#db2777',
  '#0d9488',
  '#ea580c',
  '#7c3aed',
  '#059669',
  '#dc2626',
]

export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

export function seeded(n: number): number {
  const x = Math.sin(n * 9301 + 49297) * 233280
  return x - Math.floor(x)
}
