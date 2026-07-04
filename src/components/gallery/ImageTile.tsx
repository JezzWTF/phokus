import { useState } from 'react'
import { ImageRecord, useGalleryStore } from '../../store'
import { mediaSrc } from '../../lib/mediaSrc'
import { Tooltip } from '../Tooltip'
import { CheckIcon, PhotoIcon, PlayIcon, StarIcon, WarningIcon } from '../icons'
import { formatDuration } from './format'
import { TruncatedFilename } from './TruncatedFilename'

export function ImageTile({
  image,
  onClick,
  onContextMenu,
}: {
  image: ImageRecord
  onClick: () => void
  onContextMenu: (event: React.MouseEvent<HTMLDivElement>) => void
}) {
  const [loaded, setLoaded] = useState(false)
  const [errored, setErrored] = useState(false)
  const findSimilar = useGalleryStore((state) => state.findSimilar)
  const selected = useGalleryStore((state) => state.gallerySelectedIds.has(image.id))
  const selectionActive = useGalleryStore((state) => state.gallerySelectedIds.size > 0)
  const toggleGallerySelected = useGalleryStore((state) => state.toggleGallerySelected)
  const canFindSimilar = image.embedding_status === 'ready'

  const src = mediaSrc(image.thumbnail_path)

  return (
    <div
      className={`media-dark-surface group relative overflow-hidden rounded-xl bg-white/[0.04] text-left transition-shadow focus:outline-none ${
        selected ? 'ring-2 ring-blue-400/80 ring-inset' : ''
      }`}
      style={{ width: '100%', aspectRatio: '1 / 1' }}
      onContextMenu={onContextMenu}
    >
      <button
        type="button"
        className="absolute inset-0 z-10 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80"
        aria-label={`Open ${image.filename}`}
        onClick={(event) => {
          event.stopPropagation()
          if (selectionActive) toggleGallerySelected(image.id)
          else onClick()
        }}
        onDoubleClick={(event) => {
          event.stopPropagation()
          onClick()
        }}
      />
      <button
        type="button"
        role="checkbox"
        aria-checked={selected}
        aria-label={selected ? 'Deselect' : 'Select'}
        className="group/cb absolute top-0 left-0 z-20 h-11 w-11 cursor-pointer"
        onClick={(event) => {
          event.stopPropagation()
          toggleGallerySelected(image.id)
        }}
      >
        <div
          className={`absolute top-2 left-2 flex h-5 w-5 items-center justify-center rounded-full border transition-all duration-150 ${
            selected
              ? 'border-blue-400 bg-blue-500 text-white opacity-100'
              : 'border-white/70 bg-black/40 text-transparent opacity-0 backdrop-blur-sm group-hover/cb:opacity-100'
          }`}
        >
          <CheckIcon className="h-3 w-3" strokeWidth={3} />
        </div>
      </button>

      {src && !errored ? (
        <>
          {!loaded ? <div className="absolute inset-0 animate-pulse bg-white/[0.04]" /> : null}
          <img
            src={src}
            alt={image.filename}
            className={`h-full w-full object-cover transition-all duration-300 ${
              loaded ? 'scale-100 opacity-100' : 'scale-[1.02] opacity-0'
            } group-hover:scale-[1.03]`}
            loading="lazy"
            onLoad={() => setLoaded(true)}
            onError={() => setErrored(true)}
          />
        </>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-white/[0.03] text-white/20">
          {image.media_kind === 'video' ? (
            <PlayIcon className="h-7 w-7" />
          ) : (
            <PhotoIcon className="h-7 w-7" strokeWidth={1} />
          )}
        </div>
      )}

      {image.media_kind === 'video' ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-full bg-black/40 p-3 text-white opacity-50 backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-90">
            <PlayIcon className="h-5 w-5" />
          </div>
        </div>
      ) : null}

      <div className="pointer-events-none absolute top-2 right-2 flex flex-col items-end gap-1">
        {image.embedding_status === 'failed' ? (
          <Tooltip
            label={image.embedding_error ?? 'Embedding failed'}
            followCursor
            className="pointer-events-auto"
          >
            <div className="flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-amber-400 backdrop-blur-sm">
              <WarningIcon className="h-2.5 w-2.5 shrink-0" strokeWidth={2.5} />
            </div>
          </Tooltip>
        ) : null}
        {image.favorite ? (
          <div className="rounded-full bg-black/50 p-1 text-rose-400 backdrop-blur-sm">
            <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" />
            </svg>
          </div>
        ) : null}
        {image.rating > 0 ? (
          <div className="flex items-center gap-0.5 rounded-md bg-black/60 px-1.5 py-1 text-amber-300 backdrop-blur-sm">
            {Array.from({ length: image.rating }, (_, index) => (
              <StarIcon key={index} className="h-2.5 w-2.5" />
            ))}
          </div>
        ) : null}
        {image.media_kind === 'video' && image.duration_ms ? (
          <div className="rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white/80 backdrop-blur-sm">
            {formatDuration(image.duration_ms)}
          </div>
        ) : null}
      </div>

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />

      <div className="absolute right-0 bottom-0 left-0 z-20 translate-y-1 p-2.5 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
        <TruncatedFilename filename={image.filename} />
        <div className="mt-1.5 flex items-center justify-between gap-2">
          {image.rating > 0 ? (
            <div className="flex items-center gap-0.5">
              {Array.from({ length: image.rating }, (_, index) => (
                <StarIcon key={index} className="h-2.5 w-2.5 text-amber-300" />
              ))}
            </div>
          ) : (
            <span />
          )}
          <button
            className={`pointer-events-auto relative z-20 rounded-md px-2 py-0.5 text-[10px] backdrop-blur-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80 ${
              canFindSimilar
                ? 'bg-white/10 text-white/80 hover:bg-white/20 hover:text-white'
                : 'cursor-not-allowed bg-white/5 text-white/30'
            }`}
            onClick={(event) => {
              event.stopPropagation()
              if (!canFindSimilar) return
              findSimilar(image.id, image.folder_id)
            }}
            disabled={!canFindSimilar}
          >
            Similar
          </button>
        </div>
      </div>
    </div>
  )
}
