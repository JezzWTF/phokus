import { SearchCommand } from '../../store'

export function commandPrefix(command: SearchCommand | null): string | null {
  switch (command) {
    case 'semantic':
      return '/s'
    case 'tag':
      return '/t'
    default:
      return null
  }
}

export function composeSearchValue(command: SearchCommand | null, query: string): string {
  const prefix = commandPrefix(command)
  if (!prefix) return query
  return query.length > 0 ? `${prefix} ${query}` : prefix
}
