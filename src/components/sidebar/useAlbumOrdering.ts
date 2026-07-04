import { useEffect, useRef, useState } from 'react'
import { useGalleryStore, type Album } from '../../store'

export function useAlbumOrdering(albums: Album[], reorderAlbums: (ids: number[]) => Promise<void>) {
  const [orderedAlbums, setOrderedAlbums] = useState(albums)
  const orderedAlbumsRef = useRef(albums)
  const [draggingAlbum, setDraggingAlbum] = useState(false)

  // Keep the local drag order in sync with the store except mid-drag, so a
  // background album refresh doesn't yank the row out from under the pointer.
  useEffect(() => {
    if (draggingAlbum) return
    setOrderedAlbums(albums)
    orderedAlbumsRef.current = albums
  }, [albums, draggingAlbum])

  const handleAlbumReorder = (ids: number[]) => {
    const byId = new Map(orderedAlbumsRef.current.map((album) => [album.id, album]))
    const next = ids
      .map((id) => byId.get(id))
      .filter((album): album is Album => album !== undefined)
    orderedAlbumsRef.current = next
    setOrderedAlbums(next)
  }

  const finishAlbumReorder = () => {
    setDraggingAlbum(false)
    const nextIds = orderedAlbumsRef.current.map((album) => album.id)
    // Read live store order (not the render-time closure) in case albums changed.
    const currentIds = useGalleryStore.getState().albums.map((album) => album.id)
    const snapshotIds = albums.map((album) => album.id)
    if (
      snapshotIds.length !== currentIds.length ||
      snapshotIds.some((id, index) => id !== currentIds[index])
    ) {
      orderedAlbumsRef.current = useGalleryStore.getState().albums
      setOrderedAlbums(orderedAlbumsRef.current)
      return
    }
    if (
      nextIds.length !== currentIds.length ||
      nextIds.some((id, index) => id !== currentIds[index])
    ) {
      void reorderAlbums(nextIds)
    }
  }

  return {
    finishAlbumReorder,
    handleAlbumReorder,
    orderedAlbums,
    setDraggingAlbum,
  }
}
