import { SearchCommand } from '../../store'
import { Tooltip } from '../Tooltip'
import { CloseIcon } from '../icons'
import { useToolbarSearch } from './useToolbarSearch'

type ToolbarSearchState = ReturnType<typeof useToolbarSearch>

export function ToolbarSearch({ searchState }: { searchState: ToolbarSearchState }) {
  return (
    <div ref={searchState.searchShellRef} className="relative">
      <div className="flex items-center overflow-hidden rounded-lg border border-white/8 bg-white/5">
        <div className="relative">
          <svg
            className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-gray-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"
            />
          </svg>
          <input
            ref={searchState.searchInputRef}
            type="text"
            value={searchState.searchQuery}
            onChange={(event) => searchState.handleSearchChange(event.target.value)}
            onKeyDown={searchState.handleSearchKeyDown}
            onFocus={() => searchState.setSearchPanelOpen(true)}
            placeholder="Search files, or use /s /t"
            className={`w-40 bg-transparent py-1.5 pr-9 text-sm text-white transition-colors placeholder:text-gray-600 focus:outline-none lg:w-52 xl:w-64 ${
              searchState.searchCommand !== null ? 'pl-16' : 'pl-8'
            }`}
          />
          {searchState.searchCommand !== null ? (
            <div className="absolute top-1/2 left-8 flex -translate-y-1/2">
              <Tooltip label="Remove search command" anchorToCursor>
                <button
                  type="button"
                  className="rounded-md border border-white/10 bg-white/[0.05] px-1.5 py-0.5 font-mono text-[11px] text-gray-300 transition-colors hover:bg-white/[0.08] hover:text-white"
                  onClick={searchState.removeSearchCommand}
                >
                  {searchState.commandPrefix(searchState.searchCommand)}
                </button>
              </Tooltip>
            </div>
          ) : null}
          {searchState.searchQuery.trim().length > 0 || searchState.searchCommand !== null ? (
            <div className="absolute top-1/2 right-2 flex -translate-y-1/2">
              <Tooltip label="Clear search" anchorToCursor>
                <button
                  aria-label="Clear search"
                  className="rounded-md p-1 text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-200"
                  onClick={searchState.clearSearchInput}
                >
                  <CloseIcon className="h-3.5 w-3.5" />
                </button>
              </Tooltip>
            </div>
          ) : null}
        </div>
      </div>

      {searchState.showTagSuggestions && searchState.tagSuggestions.length > 0 ? (
        <div className="absolute top-full left-0 z-50 mt-1.5 w-72 rounded-xl border border-white/10 bg-gray-950/98 py-1 shadow-2xl backdrop-blur">
          {searchState.tagSuggestions.map((entry) => (
            <button
              key={entry.tag}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-white/[0.05]"
              onMouseDown={(event) => {
                event.preventDefault()
                searchState.chooseTagSuggestion(entry.tag)
              }}
            >
              <span className="text-sm text-white/88">{entry.tag}</span>
              <span className="shrink-0 text-[11px] text-white/30 tabular-nums">
                {entry.count.toLocaleString()}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {searchState.showTagSuggestions &&
      searchState.tagSuggestions.length === 0 &&
      searchState.searchQuery.trim().length > 0 ? (
        <div className="absolute top-full left-0 z-50 mt-1.5 w-72 rounded-xl border border-white/10 bg-gray-950/98 px-3 py-2.5 shadow-2xl backdrop-blur">
          <p className="text-xs text-white/25">No matching tags</p>
        </div>
      ) : null}

      {searchState.searchCommand === 'semantic' && searchState.searchPanelOpen ? (
        <div className="absolute top-full left-0 z-50 mt-1.5 w-72 rounded-xl border border-white/10 bg-gray-950/98 px-3 py-2.5 shadow-2xl backdrop-blur">
          <p className="text-xs text-white/40">Search by meaning and visual concepts</p>
        </div>
      ) : null}

      {searchState.showCommandHints ? (
        <div className="absolute top-full left-0 z-50 mt-1.5 w-64 rounded-xl border border-white/10 bg-gray-950/98 py-1 shadow-2xl backdrop-blur">
          {(
            [
              {
                command: 'tag' as SearchCommand,
                prefix: '/t',
                label: 'Tags',
                description: 'Search user and AI tags',
              },
              {
                command: 'semantic' as SearchCommand,
                prefix: '/s',
                label: 'Semantic',
                description: 'Search by meaning, object, mood',
              },
            ] as const
          ).map((option) => (
            <button
              key={option.prefix}
              className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-white/[0.05]"
              onMouseDown={(event) => {
                event.preventDefault()
                searchState.chooseCommandHint(option.command)
              }}
            >
              <span className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[11px] text-gray-400">
                {option.prefix}
              </span>
              <div>
                <p className="text-sm text-gray-200">{option.label}</p>
                <p className="text-xs text-gray-500">{option.description}</p>
              </div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
