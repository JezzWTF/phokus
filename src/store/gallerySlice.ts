import { invoke } from '@tauri-apps/api/core'
import type { StateCreator } from 'zustand'
import {
  PAGE_SIZE,
  TIMELINE_PAGE_SIZE,
  invalidateDuplicateScanCaches,
  isCurrentGalleryRequest,
  isDerivedCollectionTitle,
  mergeImages,
  nextGalleryRequestToken,
  parseSearchValue,
  replaceExistingImages,
  replaceImage,
} from './helpers'
import type { GalleryStore } from './index'
import type {
  ActiveView,
  ImageRecord,
  MediaFilter,
  SimilarImagesPage,
  SortOrder,
  ZoomPreset,
} from './types'

export interface GallerySlice {
  images: ImageRecord[]
  totalImages: number
  loadedCount: number
  loadingImages: boolean
  imageLoadError: string | null
  sort: SortOrder
  mediaFilter: MediaFilter
  favoritesOnly: boolean
  minimumRating: number
  failedEmbeddingsOnly: boolean
  failedTaggingOnly: boolean
  colorFilter: [number, number, number] | null // [r,g,b] dominant-color filter
  colorBackfill: { processed: number; total: number; done: boolean } | null
  zoomPreset: ZoomPreset
  selectedImage: ImageRecord | null
  collectionTitle: string | null
  galleryScrollResetKey: number
  activeView: ActiveView
  gallerySelectedIds: Set<number>

  loadImages: (reset?: boolean) => Promise<void>
  loadMoreImages: () => Promise<void>
  setSort: (sort: SortOrder) => void
  setMediaFilter: (filter: MediaFilter) => void
  setFavoritesOnly: (favoritesOnly: boolean) => void
  setMinimumRating: (minimumRating: number) => void
  setFailedEmbeddingsOnly: (failedEmbeddingsOnly: boolean) => void
  setFailedTaggingOnly: (failedTaggingOnly: boolean) => void
  setColorFilter: (color: [number, number, number] | null) => void
  showFailedTagging: (folderId: number) => void
  setZoomPreset: (zoomPreset: ZoomPreset) => void
  openImage: (image: ImageRecord) => void
  closeImage: () => void
  setView: (view: ActiveView) => void
  updateImageDetails: (
    imageId: number,
    updates: { favorite?: boolean; rating?: number }
  ) => Promise<void>

  // Gallery multi-select (Feature A)
  toggleGallerySelected: (imageId: number) => void
  selectAllGallery: () => void
  clearGallerySelection: () => void
  bulkSetFavorite: (favorite: boolean) => Promise<void>
  bulkSetRating: (rating: number) => Promise<void>
  bulkAddTags: (tags: string[]) => Promise<void>
  bulkRemoveTag: (tag: string) => Promise<void>
  bulkDeleteSelected: () => Promise<number>
}

const resetCollectionState = {
  images: [] as ImageRecord[],
  loadedCount: 0,
  collectionTitle: null as string | null,
  similarSourceImageId: null as number | null,
  similarHasMore: false,
  imageLoadError: null as string | null,
}

export const createGallerySlice: StateCreator<GalleryStore, [], [], GallerySlice> = (set, get) => ({
  images: [],
  totalImages: 0,
  loadedCount: 0,
  loadingImages: false,
  imageLoadError: null,
  sort: 'date_desc',
  mediaFilter: 'all',
  favoritesOnly: false,
  minimumRating: 0,
  failedEmbeddingsOnly: false,
  failedTaggingOnly: false,
  colorFilter: null,
  colorBackfill: null,
  zoomPreset: 'comfortable',
  selectedImage: null,
  collectionTitle: null,
  galleryScrollResetKey: 0,
  activeView: 'gallery',
  gallerySelectedIds: new Set(),

  loadImages: async (reset = false) => {
    const {
      selectedFolderId,
      search,
      sort,
      loadedCount,
      mediaFilter,
      favoritesOnly,
      minimumRating,
      failedEmbeddingsOnly,
      failedTaggingOnly,
      colorFilter,
      activeView,
    } = get()
    const parsedSearch = parseSearchValue(search)
    const requestToken = nextGalleryRequestToken()
    // Any fresh collection load invalidates a selection that referenced the
    // previous set of visible images.
    set({
      loadingImages: true,
      imageLoadError: null,
      ...(reset ? { gallerySelectedIds: new Set<number>() } : {}),
    })

    try {
      // Album view loads from the album membership, honoring sort changes from
      // the Toolbar while staying within the album (ignores folder/search/filters).
      if (activeView === 'album') {
        const albumId = get().selectedAlbumId
        if (albumId === null) {
          set({ loadingImages: false })
          return
        }
        const offset = reset ? 0 : loadedCount
        const result = await invoke<{
          images: ImageRecord[]
          total: number
          offset: number
          limit: number
        }>('get_album_images', {
          params: { album_id: albumId, sort, offset, limit: PAGE_SIZE },
        })
        if (!isCurrentGalleryRequest(requestToken)) return
        const albumName = get().albums.find((entry) => entry.id === albumId)?.name ?? 'Album'
        set((state) => ({
          images: reset ? result.images : [...state.images, ...result.images],
          totalImages: result.total,
          loadedCount: reset ? result.images.length : state.loadedCount + result.images.length,
          loadingImages: false,
          collectionTitle: albumName,
        }))
        return
      }

      if (parsedSearch.mode === 'semantic' && parsedSearch.query) {
        const images = await invoke<ImageRecord[]>('semantic_search_images', {
          params: {
            query: parsedSearch.query,
            folder_id: selectedFolderId,
            media_kind: mediaFilter === 'all' ? null : mediaFilter,
            favorites_only: favoritesOnly,
            rating_min: minimumRating > 0 ? minimumRating : null,
            limit: PAGE_SIZE,
          },
        })

        if (!isCurrentGalleryRequest(requestToken)) return
        set({
          images,
          totalImages: images.length,
          loadedCount: images.length,
          loadingImages: false,
          collectionTitle: `Semantic search: ${parsedSearch.query}`,
          selectedFolderId,
          similarSourceImageId: null,
          similarSourceFolderId: null,
          similarHasMore: false,
          similarFolderId: null,
        })
        return
      }

      if (parsedSearch.mode === 'tag' && parsedSearch.query) {
        const offset = reset ? 0 : loadedCount
        const result = await invoke<{
          images: ImageRecord[]
          total: number
          offset: number
          limit: number
        }>('search_images_by_tag', {
          params: {
            query: parsedSearch.query,
            folder_id: selectedFolderId,
            media_kind: mediaFilter === 'all' ? null : mediaFilter,
            favorites_only: favoritesOnly,
            rating_min: minimumRating > 0 ? minimumRating : null,
            color: colorFilter,
            limit: PAGE_SIZE,
            offset,
          },
        })

        if (!isCurrentGalleryRequest(requestToken)) return
        if (reset) {
          set({
            images: result.images,
            totalImages: result.total,
            loadedCount: result.images.length,
            loadingImages: false,
            collectionTitle: `Tag search: ${parsedSearch.query}`,
            selectedFolderId,
            similarSourceImageId: null,
            similarSourceFolderId: null,
            similarHasMore: false,
            similarFolderId: null,
          })
        } else {
          set((state) => ({
            images: [...state.images, ...result.images],
            loadedCount: state.loadedCount + result.images.length,
            totalImages: result.total,
            loadingImages: false,
          }))
        }
        return
      }

      const offset = reset ? 0 : loadedCount
      const result = await invoke<{
        images: ImageRecord[]
        total: number
        offset: number
        limit: number
      }>('get_images', {
        params: {
          folder_id: selectedFolderId,
          search: parsedSearch.query || null,
          media_kind: mediaFilter === 'all' ? null : mediaFilter,
          favorites_only: favoritesOnly,
          rating_min: minimumRating > 0 ? minimumRating : null,
          embedding_failed_only: failedEmbeddingsOnly,
          tagging_failed_only: failedTaggingOnly,
          color: colorFilter,
          sort,
          offset,
          limit: activeView === 'timeline' ? TIMELINE_PAGE_SIZE : PAGE_SIZE,
        },
      })

      if (!isCurrentGalleryRequest(requestToken)) return
      set((state) => ({
        images: reset ? result.images : [...state.images, ...result.images],
        totalImages: result.total,
        loadedCount: reset ? result.images.length : state.loadedCount + result.images.length,
        loadingImages: false,
        collectionTitle: reset ? null : state.collectionTitle,
        similarSourceImageId: null,
        similarSourceFolderId: null,
        similarHasMore: false,
        similarFolderId: null,
      }))
    } catch (error) {
      if (!isCurrentGalleryRequest(requestToken)) return
      console.error('Failed to load media:', error)
      set({ loadingImages: false, imageLoadError: String(error) })
    }
  },

  loadMoreImages: async () => {
    const {
      loadedCount,
      totalImages,
      loadingImages,
      collectionTitle,
      similarSourceImageId,
      similarHasMore,
      similarFolderId,
      similarCrop,
    } = get()
    if (loadingImages || loadedCount >= totalImages) return
    if (collectionTitle === 'Explore Cluster') return
    const { activeView, selectedAlbumId, sort } = get()
    if (activeView === 'album' && selectedAlbumId !== null) {
      const requestToken = nextGalleryRequestToken()
      set({ loadingImages: true })
      try {
        const result = await invoke<{
          images: ImageRecord[]
          total: number
          offset: number
          limit: number
        }>('get_album_images', {
          params: { album_id: selectedAlbumId, sort, offset: loadedCount, limit: PAGE_SIZE },
        })
        if (!isCurrentGalleryRequest(requestToken)) return
        set((state) => ({
          images: [...state.images, ...result.images],
          loadedCount: state.loadedCount + result.images.length,
          totalImages: result.total,
          loadingImages: false,
        }))
      } catch {
        if (!isCurrentGalleryRequest(requestToken)) return
        set({ loadingImages: false })
      }
      return
    }
    const pageAlbumId = get().similarScope === 'current_album' ? get().similarSourceAlbumId : null
    if (collectionTitle === 'Similar Images' && similarSourceImageId !== null) {
      if (!similarHasMore) return
      await get().loadSimilarImages(
        similarSourceImageId,
        similarFolderId,
        false,
        get().similarSourceFolderId ?? null,
        pageAlbumId
      )
      return
    }
    if (
      collectionTitle === 'Region Search Results' &&
      similarSourceImageId !== null &&
      similarCrop !== null
    ) {
      if (!similarHasMore) return
      const requestToken = nextGalleryRequestToken()
      set({ loadingImages: true })
      try {
        const result = await invoke<SimilarImagesPage>('find_similar_by_region', {
          params: {
            image_id: similarSourceImageId,
            crop_x: similarCrop.x,
            crop_y: similarCrop.y,
            crop_w: similarCrop.w,
            crop_h: similarCrop.h,
            folder_id: pageAlbumId !== null ? null : similarFolderId,
            album_id: pageAlbumId,
            offset: loadedCount,
            limit: PAGE_SIZE,
          },
        })
        if (!isCurrentGalleryRequest(requestToken)) return
        set((state) => ({
          images: [...state.images, ...result.images],
          loadedCount: state.loadedCount + result.images.length,
          totalImages: result.has_more
            ? state.loadedCount + result.images.length + 1
            : state.loadedCount + result.images.length,
          similarHasMore: result.has_more,
          loadingImages: false,
        }))
      } catch {
        if (!isCurrentGalleryRequest(requestToken)) return
        set({ loadingImages: false })
      }
      return
    }
    await get().loadImages(false)
  },

  setSort: (sort) => {
    set({ sort, ...resetCollectionState })
    void get().loadImages(true)
  },

  setMediaFilter: (mediaFilter) => {
    set({ mediaFilter, ...resetCollectionState })
    void get().loadImages(true)
  },

  setFavoritesOnly: (favoritesOnly) => {
    set({ favoritesOnly, ...resetCollectionState })
    void get().loadImages(true)
  },

  setMinimumRating: (minimumRating) => {
    set({ minimumRating, ...resetCollectionState })
    void get().loadImages(true)
  },

  setFailedEmbeddingsOnly: (failedEmbeddingsOnly) => {
    set({
      failedEmbeddingsOnly,
      failedTaggingOnly: failedEmbeddingsOnly ? false : get().failedTaggingOnly,
      ...resetCollectionState,
    })
    void get().loadImages(true)
  },

  setFailedTaggingOnly: (failedTaggingOnly) => {
    set({
      failedTaggingOnly,
      failedEmbeddingsOnly: failedTaggingOnly ? false : get().failedEmbeddingsOnly,
      ...resetCollectionState,
    })
    void get().loadImages(true)
  },

  setColorFilter: (colorFilter) => {
    set({ colorFilter, ...resetCollectionState })
    void get().loadImages(true)
  },

  showFailedTagging: (folderId) => {
    set({
      selectedFolderId: folderId,
      activeView: 'gallery',
      search: '',
      mediaFilter: 'all',
      favoritesOnly: false,
      minimumRating: 0,
      failedEmbeddingsOnly: false,
      failedTaggingOnly: true,
      images: [],
      loadedCount: 0,
      collectionTitle: null,
      similarSourceImageId: null,
      similarSourceFolderId: null,
      similarHasMore: false,
      similarFolderId: null,
      similarCrop: null,
      imageLoadError: null,
    })
    void get().loadImages(true)
  },

  setZoomPreset: (zoomPreset) => set({ zoomPreset }),

  openImage: (image) => set({ selectedImage: image }),
  closeImage: () => set({ selectedImage: null }),

  setView: (activeView) => {
    // Leaving an album view drops the album-origin similar scope.
    const similarScopeReset =
      get().similarScope === 'current_album' ? 'all_media' : get().similarScope
    if (activeView === 'timeline') {
      set({
        activeView,
        sort: 'taken_asc',
        images: [],
        loadedCount: 0,
        collectionTitle: null,
        similarSourceImageId: null,
        similarSourceFolderId: null,
        similarSourceAlbumId: null,
        similarScope: similarScopeReset,
        similarFolderId: null,
        similarHasMore: false,
        similarCrop: null,
        imageLoadError: null,
      })
      void get().loadImages(true)
      return
    }
    if (activeView === 'duplicates') {
      const { selectedFolderId, duplicateScanFolderId } = get()
      if (duplicateScanFolderId !== selectedFolderId) {
        set({
          activeView,
          duplicateGroups: [],
          duplicateLastScanned: null,
          duplicateScanFolderId: undefined,
          duplicateScanWarning: null,
        })
        void get().loadDuplicateScanCache(selectedFolderId)
        return
      }
    }
    // Entering Explore normally always starts in browse mode; openTagManager() is
    // the only path that re-opens manage mode (it runs this then sets the flag).
    set({
      activeView,
      similarSourceAlbumId: null,
      similarScope: similarScopeReset,
      ...(activeView === 'explore' ? { tagManagerOpen: false } : {}),
    })
  },

  updateImageDetails: async (imageId, updates) => {
    const updatedImage = await invoke<ImageRecord>('update_image_details', {
      params: {
        image_id: imageId,
        favorite: updates.favorite ?? null,
        rating: updates.rating ?? null,
      },
    })

    set((state) => ({
      // Derived collections (similar / region / semantic / tag / album results)
      // are ordered by relevance, not `state.sort` — re-sorting them on a
      // favorite/rating change would scramble the results. Replace in place
      // there; only the real sorted gallery re-sorts.
      images: isDerivedCollectionTitle(state.collectionTitle)
        ? replaceExistingImages(state.images, [updatedImage])
        : replaceImage(state.images, updatedImage, state.sort),
      selectedImage:
        state.selectedImage?.id === updatedImage.id ? updatedImage : state.selectedImage,
    }))
  },

  // ── Gallery multi-select (Feature A) ──────────────────────────────────────

  toggleGallerySelected: (imageId) => {
    set((state) => {
      const next = new Set(state.gallerySelectedIds)
      if (next.has(imageId)) next.delete(imageId)
      else next.add(imageId)
      return { gallerySelectedIds: next }
    })
  },

  selectAllGallery: () => {
    set((state) => ({ gallerySelectedIds: new Set(state.images.map((image) => image.id)) }))
  },

  clearGallerySelection: () => set({ gallerySelectedIds: new Set() }),

  bulkSetFavorite: async (favorite) => {
    const ids = Array.from(get().gallerySelectedIds)
    if (ids.length === 0) return
    const updated = await invoke<ImageRecord[]>('bulk_update_details', {
      params: { image_ids: ids, favorite, rating: null },
    })
    set((state) => {
      const match =
        state.selectedImage && updated.find((image) => image.id === state.selectedImage!.id)
      // Derived collections keep their relevance order (replace in place); only
      // the real sorted gallery re-sorts.
      return {
        images: isDerivedCollectionTitle(state.collectionTitle)
          ? replaceExistingImages(state.images, updated)
          : mergeImages(state.images, updated, state.sort),
        selectedImage: match ?? state.selectedImage,
      }
    })
  },

  bulkSetRating: async (rating) => {
    const ids = Array.from(get().gallerySelectedIds)
    if (ids.length === 0) return
    const updated = await invoke<ImageRecord[]>('bulk_update_details', {
      params: { image_ids: ids, favorite: null, rating },
    })
    set((state) => {
      const match =
        state.selectedImage && updated.find((image) => image.id === state.selectedImage!.id)
      return {
        images: isDerivedCollectionTitle(state.collectionTitle)
          ? replaceExistingImages(state.images, updated)
          : mergeImages(state.images, updated, state.sort),
        selectedImage: match ?? state.selectedImage,
      }
    })
  },

  bulkAddTags: async (tags) => {
    const ids = Array.from(get().gallerySelectedIds)
    const cleaned = tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0)
    if (ids.length === 0 || cleaned.length === 0) return
    await invoke<void>('bulk_add_tags', { params: { image_ids: ids, tags: cleaned } })
    // New tags landed — invalidate Explore tag caches.
    set({
      exploreTagsFolderId: undefined,
      visualClusterFolderId: undefined,
      visualClusterEntries: [],
    })
  },

  bulkRemoveTag: async (tag) => {
    const ids = Array.from(get().gallerySelectedIds)
    if (ids.length === 0 || !tag.trim()) return
    await invoke<void>('bulk_remove_tag', { params: { image_ids: ids, tag: tag.trim() } })
    set({
      exploreTagsFolderId: undefined,
      visualClusterFolderId: undefined,
      visualClusterEntries: [],
    })
  },

  bulkDeleteSelected: async () => {
    const ids = Array.from(get().gallerySelectedIds)
    if (ids.length === 0) return 0
    const affectedFolderIds = new Set<number>(
      get()
        .images.filter((image) => get().gallerySelectedIds.has(image.id))
        .map((image) => image.folder_id)
    )
    const succeededIds = await invoke<number[]>('delete_images_from_disk', {
      params: { image_ids: ids },
    })
    const succeededSet = new Set(succeededIds)
    set((state) => ({
      // Only remove images confirmed deleted — failed files remain selected for retry.
      images: state.images.filter((image) => !succeededSet.has(image.id)),
      loadedCount: state.images.filter((image) => !succeededSet.has(image.id)).length,
      totalImages: Math.max(0, state.totalImages - succeededIds.length),
      gallerySelectedIds: new Set(
        [...state.gallerySelectedIds].filter((id) => !succeededSet.has(id))
      ),
      // Deletion changes tag/duplicate/album aggregates.
      visualClusterFolderId: undefined,
      visualClusterEntries: [],
      exploreTagsFolderId: undefined,
    }))
    // The DB cascade already removed these from album_images; refresh counts/covers.
    void get().loadAlbums()
    await invalidateDuplicateScanCaches(affectedFolderIds)
    return succeededIds.length
  },
})
