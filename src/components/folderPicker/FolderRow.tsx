import { DirEntry } from '../../store'
import { Tooltip } from '../Tooltip'
import { CheckIcon, ChevronRightIcon } from '../icons'

export function FolderRow({
  entry,
  selected,
  alreadyAdded,
  onToggle,
  onNavigate,
}: {
  entry: DirEntry
  selected: boolean
  alreadyAdded: boolean
  onToggle: () => void
  onNavigate: () => void
}) {
  return (
    <div
      className={`group flex h-11 items-center gap-3 rounded-md border px-3 transition-colors ${
        alreadyAdded
          ? 'light-theme:bg-gray-900 light-theme:text-gray-500 border-transparent bg-white/[0.025] text-gray-600'
          : selected
            ? 'light-theme:border-gray-700/45 light-theme:bg-gray-800/55 light-theme:text-white border-white/15 bg-white/[0.085] text-white shadow-[inset_0_0_0_1px_rgb(255_255_255_/_0.035)]'
            : 'light-theme:text-gray-500 light-theme:hover:bg-gray-900 light-theme:hover:text-white border-transparent text-gray-300 hover:bg-white/[0.055] hover:text-white'
      }`}
    >
      <button
        type="button"
        className={`grid h-5 w-5 shrink-0 place-items-center rounded border transition-colors ${
          selected
            ? 'light-theme:border-gray-700/55 light-theme:bg-gray-700 light-theme:text-white border-white/30 bg-gray-200 text-gray-950'
            : 'light-theme:border-gray-700/50 light-theme:bg-gray-950 border-white/15 bg-white/[0.035] text-transparent hover:border-white/30'
        } ${alreadyAdded ? 'cursor-not-allowed opacity-40' : ''}`}
        onClick={onToggle}
        disabled={alreadyAdded}
        aria-label={selected ? `Remove ${entry.name} from folders to add` : `Choose ${entry.name}`}
      >
        <CheckIcon className="h-3.5 w-3.5" />
      </button>

      <Tooltip label={entry.path} anchorToCursor className="min-w-0 flex-1">
        <button
          type="button"
          className="flex w-full min-w-0 items-center gap-2 text-left"
          onClick={onNavigate}
        >
          <svg
            className="h-4 w-4 shrink-0 text-amber-300/90"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M3 6.5A2.5 2.5 0 015.5 4h4.1l2 2H18.5A2.5 2.5 0 0121 8.5v9A2.5 2.5 0 0118.5 20h-13A2.5 2.5 0 013 17.5v-11z" />
          </svg>
          <span className="truncate text-sm">{entry.name}</span>
        </button>
      </Tooltip>

      {alreadyAdded ? (
        <span className="light-theme:border-gray-700/40 light-theme:bg-gray-950 rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-gray-500">
          Added
        </span>
      ) : null}

      <Tooltip label={entry.has_children ? 'Open folder' : 'No subfolders'} anchorToCursor>
        <button
          type="button"
          className="light-theme:hover:bg-gray-900 light-theme:hover:text-white rounded-md p-1 text-gray-500 transition-colors hover:bg-white/[0.06] hover:text-white"
          onClick={onNavigate}
        >
          <ChevronRightIcon className={`h-4 w-4 ${entry.has_children ? '' : 'opacity-45'}`} />
        </button>
      </Tooltip>
    </div>
  )
}
