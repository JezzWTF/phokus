import { invoke } from '@tauri-apps/api/core'
import type { StateCreator } from 'zustand'
import type { GalleryStore } from './index'
import { PAGE_SIZE, isCurrentGalleryRequest, nextGalleryRequestToken } from './helpers'
import type { Album, ImageRecord } from './types'

export interface AlbumSlice {
  albums: Album[]
  albumsLoaded: boolean
  selectedAlbumId: number | null

  loadAlbums: () => Promise<void>
  createAlbum: (name: string) => Promise<Album>
  renameAlbum: (albumId: number, name: string) => Promise<void>
  deleteAlbum: (albumId: number) => Promise<void>
  deleteAlbums: (albumIds: number[]) => Promise<void>
  reorderAlbums: (albumIds: number[]) => Promise<void>
  addToAlbum: (albumId: number, imageIds: number[]) => Promise<number>
  removeFromAlbum: (albumId: number, imageIds: number[]) => Promise<void>
  viewAlbum: (albumId: number) => void
}

export const createAlbumSlice: StateCreator<GalleryStore, [], [], AlbumSlice> = (set, get) => ({
  albums: [],
  albumsLoaded: false,
  selectedAlbumId: null,

  loadAlbums: async () => {
    const albums = await invoke<Album[]>('list_albums')
    set({ albums, albumsLoaded: true })
  },

  createAlbum: async (name) => {
    const album = await invoke<Album>('create_album', { params: { name } })
    await get().loadAlbums()
    return album
  },

  renameAlbum: async (albumId, name) => {
    await invoke('rename_album', { params: { album_id: albumId, new_name: name } })
    await get().loadAlbums()
  },

  deleteAlbum: async (albumId) => {
    await invoke('delete_album', { params: { album_id: albumId } })
    // If the deleted album is being viewed, drop back to All Media.
    if (get().activeView === 'album' && get().selectedAlbumId === albumId) {
      set({ activeView: 'gallery', selectedAlbumId: null, collectionTitle: null })
      void get().loadImages(true)
    }
    await get().loadAlbums()
  },

  deleteAlbums: async (albumIds) => {
    if (albumIds.length === 0) return
    await invoke('delete_albums', { params: { album_ids: albumIds } })
    // If a deleted album is being viewed, drop back to All Media.
    if (
      get().activeView === 'album' &&
      get().selectedAlbumId !== null &&
      albumIds.includes(get().selectedAlbumId!)
    ) {
      set({ activeView: 'gallery', selectedAlbumId: null, collectionTitle: null })
      void get().loadImages(true)
    }
    await get().loadAlbums()
  },

  reorderAlbums: async (albumIds) => {
    const previous = get().albums
    const byId = new Map(previous.map((album) => [album.id, album]))
    const albums = albumIds
      .map((id, index) => {
        const album = byId.get(id)
        return album ? { ...album, sort_order: index + 1 } : null
      })
      .filter((album): album is Album => album !== null)
    set({ albums })
    try {
      await invoke('reorder_albums', { params: { album_ids: albumIds } })
    } catch (error) {
      set({ albums: previous })
      throw error
    }
  },

  addToAlbum: async (albumId, imageIds) => {
    if (imageIds.length === 0) return 0
    const added = await invoke<number>('add_images_to_album', {
      params: { album_id: albumId, image_ids: imageIds },
    })
    await get().loadAlbums()
    return added
  },

  removeFromAlbum: async (albumId, imageIds) => {
    if (imageIds.length === 0) return
    await invoke('remove_images_from_album', {
      params: { album_id: albumId, image_ids: imageIds },
    })
    // If viewing this album, splice the removed images out immediately.
    if (get().activeView === 'album' && get().selectedAlbumId === albumId) {
      const removed = new Set(imageIds)
      set((state) => {
        const nextImages = state.images.filter((image) => !removed.has(image.id))
        // Decrement by what was actually on screen, not the requested count —
        // some ids may live beyond the loaded page.
        const removedFromView = state.images.length - nextImages.length
        return {
          images: nextImages,
          loadedCount: nextImages.length,
          totalImages: Math.max(0, state.totalImages - removedFromView),
          gallerySelectedIds: new Set(
            [...state.gallerySelectedIds].filter((id) => !removed.has(id))
          ),
        }
      })
    }
    await get().loadAlbums()
  },

  viewAlbum: (albumId) => {
    const requestToken = nextGalleryRequestToken()
    const album = get().albums.find((entry) => entry.id === albumId)
    const sort = get().sort
    set((state) => ({
      activeView: 'album',
      selectedAlbumId: albumId,
      search: '',
      images: [],
      totalImages: album?.image_count ?? 0,
      loadedCount: 0,
      loadingImages: true,
      collectionTitle: album?.name ?? 'Album',
      imageLoadError: null,
      similarSourceImageId: null,
      similarSourceFolderId: null,
      similarSourceAlbumId: albumId,
      similarScope: 'current_album',
      similarHasMore: false,
      similarFolderId: null,
      similarCrop: null,
      gallerySelectedIds: new Set<number>(),
      galleryScrollResetKey: state.galleryScrollResetKey + 1,
    }))

    void (async () => {
      try {
        const result = await invoke<{
          images: ImageRecord[]
          total: number
          offset: number
          limit: number
        }>('get_album_images', {
          params: { album_id: albumId, sort, offset: 0, limit: PAGE_SIZE },
        })
        if (!isCurrentGalleryRequest(requestToken)) return
        set({
          images: result.images,
          totalImages: result.total,
          loadedCount: result.images.length,
          loadingImages: false,
          imageLoadError: null,
          collectionTitle: album?.name ?? 'Album',
        })
      } catch (error) {
        if (!isCurrentGalleryRequest(requestToken)) return
        set({
          images: [],
          totalImages: 0,
          loadedCount: 0,
          loadingImages: false,
          imageLoadError: String(error),
        })
      }
    })()
  },
})
