import { DuplicateGroup, useGalleryStore } from '../../store'
import { mediaSrc } from '../../lib/mediaSrc'
import { Tooltip } from '../Tooltip'
import { formatBytes } from './format'

export function DuplicateGroupCard({ group }: { group: DuplicateGroup }) {
  const selectedIds = useGalleryStore((state) => state.duplicateSelectedIds)
  const toggleDuplicateSelected = useGalleryStore((state) => state.toggleDuplicateSelected)
  const selectAllDuplicates = useGalleryStore((state) => state.selectAllDuplicates)
  const groupSelectedCount = group.images.filter((image) => selectedIds.has(image.id)).length
  const noneSelected = groupSelectedCount === 0

  const handleKeepFirst = () => {
    const toDelete = group.images.slice(1).map((image) => image.id)
    for (const image of group.images) {
      if (selectedIds.has(image.id)) toggleDuplicateSelected(image.id)
    }
    selectAllDuplicates(toDelete)
  }

  const handleDeselectGroup = () => {
    for (const image of group.images) {
      if (selectedIds.has(image.id)) toggleDuplicateSelected(image.id)
    }
  }

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-gray-400">
            {group.images.length} copies
          </span>
          <span className="text-[11px] text-white/30">{formatBytes(group.file_size)} each</span>
          <span className="text-[11px] text-white/20">
            {formatBytes(group.file_size * (group.images.length - 1))} wasted
          </span>
        </div>
        <div className="flex items-center gap-2">
          {noneSelected ? (
            <button
              className="text-[11px] text-white/35 transition-colors hover:text-white/70"
              onClick={handleKeepFirst}
            >
              Keep first
            </button>
          ) : (
            <button
              className="text-[11px] text-white/35 transition-colors hover:text-white/70"
              onClick={handleDeselectGroup}
            >
              Deselect all
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        {group.images.map((image) => {
          const isSelected = selectedIds.has(image.id)
          const src = mediaSrc(image.thumbnail_path)
          return (
            <Tooltip key={image.id} label={image.path} anchorToCursor>
              <button
                className={`media-dark-surface group relative overflow-hidden rounded-xl border transition-all ${
                  isSelected
                    ? 'border-red-400/50 ring-1 ring-red-400/30'
                    : 'border-white/8 hover:border-white/20'
                }`}
                style={{ width: 140, height: 105 }}
                onClick={() => toggleDuplicateSelected(image.id)}
              >
                {src ? (
                  <img src={src} alt="" className="h-full w-full object-cover" draggable={false} />
                ) : (
                  <div className="h-full w-full bg-white/[0.03]" />
                )}
                {isSelected ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-red-950/60">
                    <svg
                      className="h-6 w-6 text-red-300"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </div>
                ) : null}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-2 pt-4 pb-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <p className="truncate text-[9px] text-white/60">
                    {image.path.split(/[\\/]/).slice(-2).join('/')}
                  </p>
                </div>
              </button>
            </Tooltip>
          )
        })}
      </div>
    </div>
  )
}
