import { SortControl } from './toolbar/SortControl'
import { ToolbarFilters } from './toolbar/ToolbarFilters'
import { ToolbarSearch } from './toolbar/ToolbarSearch'
import { ToolbarTitle } from './toolbar/ToolbarTitle'
import { useToolbarSearch } from './toolbar/useToolbarSearch'
import { ZoomControl } from './toolbar/ZoomControl'

export function Toolbar() {
  const searchState = useToolbarSearch()

  return (
    <div className="relative z-40 shrink-0 border-b border-white/[0.06] bg-gray-950/80 backdrop-blur-xl">
      <div className="flex h-12 items-center gap-2 px-3 lg:gap-3 lg:px-5">
        <ToolbarTitle parsedSearch={searchState.parsedSearch} />
        <div className="flex-1" />
        <ToolbarSearch searchState={searchState} />
        <SortControl />
        <div className="h-4 w-px shrink-0 bg-white/10" />
        <ZoomControl />
      </div>
      <ToolbarFilters />
    </div>
  )
}
