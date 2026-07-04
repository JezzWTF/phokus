import { invoke } from '@tauri-apps/api/core'
import type { StateCreator } from 'zustand'
import {
  PAGE_SIZE,
  SIMILAR_DISTANCE_THRESHOLD,
  isCurrentGalleryRequest,
  nextGalleryRequestToken,
} from './helpers'
import type { GalleryStore } from './index'
import type { SearchMode, SimilarImagesPage, SimilarScope } from './types'

export interface SearchSlice {
  search: string
  searchMode: SearchMode
  similarSourceImageId: number | null
  similarSourceFolderId: number | null
  similarSourceAlbumId: number | null // album a similar search was launched from (enables "Similar: Album")
  similarHasMore: boolean
  similarScope: SimilarScope
  similarFolderId: number | null
  similarCrop: { x: number; y: number; w: number; h: number } | null

  setSearch: (search: string) => void
  clearSearch: () => void
  resetSearch: () => void
  setSearchMode: (mode: SearchMode) => void
  searchForTag: (tag: string) => void
  loadSimilarImages: (
    imageId: number,
    folderId?: number | null,
    reset?: boolean,
    sourceFolderId?: number | null,
    albumId?: number | null
  ) => Promise<void>
  loadSimilarByRegion: (
    imageId: number,
    crop: { x: number; y: number; w: number; h: number },
    folderId?: number | null,
    sourceFolderId?: number | null,
    albumId?: number | null
  ) => Promise<void>
  // Entry points that decide scope (album when launched from an album, else folder/all per similarScope).
  findSimilar: (imageId: number, sourceFolderId: number | null) => Promise<void>
  findSimilarByRegion: (
    imageId: number,
    crop: { x: number; y: number; w: number; h: number },
    sourceFolderId: number | null
  ) => Promise<void>
  setSimilarScope: (scope: SimilarScope) => void
}

export const createSearchSlice: StateCreator<GalleryStore, [], [], SearchSlice> = (set, get) => ({
  search: '',
  searchMode: 'filename',
  similarSourceImageId: null,
  similarSourceFolderId: null,
  similarSourceAlbumId: null,
  similarHasMore: false,
  similarScope: 'all_media',
  similarFolderId: null,
  similarCrop: null,

  setSearch: (search) => {
    set({
      search,
      images: [],
      loadedCount: 0,
      collectionTitle: null,
      similarSourceImageId: null,
      similarHasMore: false,
      imageLoadError: null,
    })
    void get().loadImages(true)
  },

  clearSearch: () => {
    set({
      search: '',
      images: [],
      loadedCount: 0,
      collectionTitle: null,
      similarSourceImageId: null,
      similarHasMore: false,
      imageLoadError: null,
    })
    void get().loadImages(true)
  },

  resetSearch: () => {
    set({
      search: '',
      searchMode: 'filename',
      images: [],
      loadedCount: 0,
      collectionTitle: null,
      similarSourceImageId: null,
      similarHasMore: false,
      imageLoadError: null,
    })
    void get().loadImages(true)
  },

  setSearchMode: (searchMode) => {
    set({
      searchMode,
      images: [],
      loadedCount: 0,
      collectionTitle: null,
      similarSourceImageId: null,
      similarHasMore: false,
      imageLoadError: null,
    })
    void get().loadImages(true)
  },

  searchForTag: (tag) => {
    set({
      activeView: 'gallery',
      search: `/t ${tag}`,
      images: [],
      loadedCount: 0,
      collectionTitle: null,
      similarSourceImageId: null,
      similarHasMore: false,
      similarFolderId: null,
      imageLoadError: null,
    })
    void get().loadImages(true)
  },

  loadSimilarImages: async (
    imageId,
    folderId = get().selectedFolderId,
    reset = true,
    sourceFolderId = folderId ?? null,
    albumId = null
  ) => {
    const requestToken = nextGalleryRequestToken()
    const offset = reset ? 0 : get().loadedCount
    const similarScope: SimilarScope =
      albumId !== null ? 'current_album' : folderId === null ? 'all_media' : 'current_folder'
    // Album scope drives results off album membership, so the folder query is null.
    const queryFolderId = albumId !== null ? null : (folderId ?? null)
    set((state) => ({
      images: reset ? [] : state.images,
      loadedCount: reset ? 0 : state.loadedCount,
      loadingImages: true,
      collectionTitle: 'Similar Images',
      imageLoadError: null,
      similarSourceImageId: imageId,
      similarSourceFolderId: sourceFolderId,
      similarFolderId: queryFolderId,
      similarScope,
      // Force the gallery grid so results (and the bulk bar) render regardless
      // of which view the search was launched from.
      activeView: 'gallery',
      gallerySelectedIds: reset ? new Set<number>() : state.gallerySelectedIds,
      selectedAlbumId: null,
      galleryScrollResetKey: reset ? state.galleryScrollResetKey + 1 : state.galleryScrollResetKey,
    }))

    try {
      const result = await invoke<SimilarImagesPage>('find_similar_images', {
        params: {
          image_id: imageId,
          folder_id: queryFolderId,
          album_id: albumId,
          offset,
          limit: PAGE_SIZE,
          threshold: SIMILAR_DISTANCE_THRESHOLD,
        },
      })

      if (!isCurrentGalleryRequest(requestToken)) return

      set((state) => {
        const nextImages = reset ? result.images : [...state.images, ...result.images]
        const nextLoadedCount = nextImages.length
        return {
          images: nextImages,
          totalImages: result.has_more ? nextLoadedCount + 1 : nextLoadedCount,
          loadedCount: nextLoadedCount,
          loadingImages: false,
          imageLoadError: null,
          collectionTitle: 'Similar Images',
          similarSourceImageId: imageId,
          similarSourceFolderId: sourceFolderId,
          similarHasMore: result.has_more,
          similarFolderId: queryFolderId,
          similarScope,
          selectedImage: reset ? null : state.selectedImage,
        }
      })
    } catch (error) {
      if (!isCurrentGalleryRequest(requestToken)) return
      console.error('Failed to load similar images:', error)
      set({
        images: [],
        totalImages: 0,
        loadedCount: 0,
        loadingImages: false,
        imageLoadError: String(error),
        collectionTitle: 'Similar Images',
        similarSourceImageId: imageId,
        similarSourceFolderId: sourceFolderId,
        similarHasMore: false,
        similarFolderId: queryFolderId,
        similarScope,
        selectedImage: null,
      })
    }
  },

  loadSimilarByRegion: async (
    imageId,
    crop,
    folderId = get().selectedFolderId,
    sourceFolderId = folderId ?? null,
    albumId = null
  ) => {
    const requestToken = nextGalleryRequestToken()
    const similarScope: SimilarScope =
      albumId !== null ? 'current_album' : folderId === null ? 'all_media' : 'current_folder'
    const queryFolderId = albumId !== null ? null : (folderId ?? null)
    set((state) => ({
      images: [],
      loadedCount: 0,
      loadingImages: true,
      collectionTitle: 'Region Search Results',
      imageLoadError: null,
      similarSourceImageId: imageId,
      similarSourceFolderId: sourceFolderId,
      similarFolderId: queryFolderId,
      similarCrop: crop,
      similarScope,
      // Force the gallery grid so results (and the bulk bar) render regardless
      // of which view the search was launched from.
      activeView: 'gallery',
      gallerySelectedIds: new Set<number>(),
      selectedAlbumId: null,
      galleryScrollResetKey: state.galleryScrollResetKey + 1,
      selectedImage: null,
    }))

    try {
      const result = await invoke<SimilarImagesPage>('find_similar_by_region', {
        params: {
          image_id: imageId,
          crop_x: crop.x,
          crop_y: crop.y,
          crop_w: crop.w,
          crop_h: crop.h,
          folder_id: queryFolderId,
          album_id: albumId,
          offset: 0,
          limit: PAGE_SIZE,
        },
      })

      if (!isCurrentGalleryRequest(requestToken)) return

      set({
        images: result.images,
        totalImages: result.has_more ? result.images.length + 1 : result.images.length,
        loadedCount: result.images.length,
        loadingImages: false,
        imageLoadError: null,
        collectionTitle: 'Region Search Results',
        similarSourceImageId: imageId,
        similarSourceFolderId: sourceFolderId,
        similarHasMore: result.has_more,
        similarFolderId: queryFolderId,
        similarCrop: crop,
        similarScope,
      })
    } catch (error) {
      if (!isCurrentGalleryRequest(requestToken)) return
      console.error('Failed to load region search results:', error)
      set({
        images: [],
        totalImages: 0,
        loadedCount: 0,
        loadingImages: false,
        imageLoadError: String(error),
        collectionTitle: 'Region Search Results',
        similarSourceImageId: imageId,
        similarSourceFolderId: sourceFolderId,
        similarHasMore: false,
        similarFolderId: queryFolderId,
        similarCrop: crop,
        similarScope,
        selectedImage: null,
      })
    }
  },

  // Decide the scope at launch: album when triggered from an album, else the
  // current folder/all preference. Sets similarSourceAlbumId so the "Similar:
  // Album" pill and scope toggle work afterward.
  findSimilar: (imageId, sourceFolderId) => {
    const { activeView, selectedAlbumId, similarScope } = get()
    const albumOrigin = activeView === 'album' ? selectedAlbumId : null
    set({ similarSourceAlbumId: albumOrigin })
    // Respect the chosen scope; album is the default in an album view but the
    // user can override to Folder/All before searching.
    if (similarScope === 'current_album' && albumOrigin !== null) {
      return get().loadSimilarImages(imageId, null, true, sourceFolderId, albumOrigin)
    }
    const folderId = similarScope === 'current_folder' ? sourceFolderId : null
    return get().loadSimilarImages(imageId, folderId, true, sourceFolderId, null)
  },

  findSimilarByRegion: (imageId, crop, sourceFolderId) => {
    const { activeView, selectedAlbumId, similarScope } = get()
    const albumOrigin = activeView === 'album' ? selectedAlbumId : null
    set({ similarSourceAlbumId: albumOrigin })
    if (similarScope === 'current_album' && albumOrigin !== null) {
      return get().loadSimilarByRegion(imageId, crop, null, sourceFolderId, albumOrigin)
    }
    const folderId = similarScope === 'current_folder' ? sourceFolderId : null
    return get().loadSimilarByRegion(imageId, crop, folderId, sourceFolderId, null)
  },

  setSimilarScope: (similarScope) => {
    set({ similarScope })
    const {
      similarSourceImageId,
      similarSourceFolderId,
      similarSourceAlbumId,
      selectedFolderId,
      collectionTitle,
      similarCrop,
    } = get()
    if (similarSourceImageId === null) return
    const albumId = similarScope === 'current_album' ? similarSourceAlbumId : null
    const folderId =
      similarScope === 'current_folder' ? (similarSourceFolderId ?? selectedFolderId) : null
    if (collectionTitle === 'Region Search Results' && similarCrop !== null) {
      void get().loadSimilarByRegion(
        similarSourceImageId,
        similarCrop,
        folderId,
        similarSourceFolderId,
        albumId
      )
    } else {
      void get().loadSimilarImages(
        similarSourceImageId,
        folderId,
        true,
        similarSourceFolderId,
        albumId
      )
    }
  },
})
