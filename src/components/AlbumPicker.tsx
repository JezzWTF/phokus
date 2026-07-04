import { useState } from 'react'
import { useGalleryStore } from '../store'

/**
 * Album list plus a create-new-album form. The host decides what picking
 * means — the bulk bar adds the current selection; a newly created album is
 * picked immediately.
 */
export function AlbumPicker({ onPick }: { onPick: (albumId: number) => Promise<void> | void }) {
  const albums = useGalleryStore((state) => state.albums)
  const createAlbum = useGalleryStore((state) => state.createAlbum)
  const [creating, setCreating] = useState(false)
  const [newAlbumName, setNewAlbumName] = useState('')

  const handleCreate = async () => {
    const name = newAlbumName.trim()
    if (!name || creating) return
    setCreating(true)
    try {
      const album = await createAlbum(name)
      setNewAlbumName('')
      await onPick(album.id)
    } finally {
      setCreating(false)
    }
  }

  return (
    <>
      <div className="max-h-48 overflow-y-auto">
        {albums.length === 0 ? (
          <p className="px-2 py-2 text-[11px] text-gray-600">No albums yet — create one below.</p>
        ) : (
          albums.map((album) => (
            <button
              key={album.id}
              className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs text-gray-300 transition-colors hover:bg-white/5 hover:text-white"
              onClick={() => void onPick(album.id)}
            >
              <span className="truncate">{album.name}</span>
              <span className="shrink-0 text-[10px] text-gray-600">{album.image_count}</span>
            </button>
          ))
        )}
      </div>
      <form
        className="mt-1 flex gap-1 border-t border-white/[0.06] pt-2"
        onSubmit={(event) => {
          event.preventDefault()
          void handleCreate()
        }}
      >
        <input
          className="min-w-0 flex-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white placeholder-gray-600 focus:border-white/20 focus:outline-none"
          placeholder="New album…"
          value={newAlbumName}
          onChange={(event) => setNewAlbumName(event.target.value)}
          disabled={creating}
        />
        <button
          type="submit"
          className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-gray-300 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
          disabled={creating || !newAlbumName.trim()}
        >
          Add
        </button>
      </form>
    </>
  )
}
