import { invoke } from '@tauri-apps/api/core'
import type { StateCreator } from 'zustand'
import { isCurrentGalleryRequest, nextGalleryRequestToken, parseSearchValue } from './helpers'
import type { GalleryStore } from './index'
import type {
  ExploreMode,
  ExploreTagEntry,
  ImageExif,
  ImageRecord,
  ImageTag,
  RelatedTagEntry,
  VisualClusterEntry,
} from './types'

let visualClusterRequestToken = 0
let exploreTagRequestToken = 0

export interface ExploreSlice {
  exploreMode: ExploreMode
  tagManagerOpen: boolean
  visualClusterEntries: VisualClusterEntry[]
  visualClusterLoading: boolean
  visualClusterFolderId: number | null | undefined // undefined = never loaded
  exploreTagEntries: ExploreTagEntry[]
  exploreTagLoading: boolean
  // Cache-freshness key: the folder the loaded tags belong to. Set to undefined
  // by content mutations (tag add/remove/rename/delete) to mark the cache dirty
  // and force the next load to refetch.
  exploreTagsFolderId: number | null | undefined
  // The folder whose tags are actually on screen. Kept separate from the dirty
  // marker above so a same-folder invalidation isn't mistaken for a folder switch
  // (which would wipe the visible list and remount manager UI mid-refresh).
  exploreTagsShownFolderId: number | null | undefined
  relatedTagsByKey: Record<string, RelatedTagEntry[]>

  setExploreMode: (mode: ExploreMode) => void
  setTagManagerOpen: (open: boolean) => void
  openTagManager: () => void
  loadVisualClusters: (options?: { force?: boolean }) => Promise<void>
  loadExploreTags: (options?: { force?: boolean }) => Promise<void>
  loadRelatedTags: (tag: string) => Promise<RelatedTagEntry[]>
  showVisualCluster: (imageIds: number[]) => Promise<void>
  suggestImageTags: (imageId: number) => Promise<string[]>
  getImageTags: (imageId: number) => Promise<ImageTag[]>
  addUserTag: (imageId: number, tag: string) => Promise<ImageTag>
  removeTag: (tagId: number) => Promise<void>
  getImageExif: (imageId: number) => Promise<ImageExif>
  renameTag: (from: string, to: string) => Promise<void>
  deleteTag: (tag: string) => Promise<number>
}

export const createExploreSlice: StateCreator<GalleryStore, [], [], ExploreSlice> = (set, get) => ({
  exploreMode: 'visual',
  tagManagerOpen: false,
  visualClusterEntries: [],
  visualClusterLoading: false,
  visualClusterFolderId: undefined,
  exploreTagEntries: [],
  exploreTagLoading: false,
  exploreTagsFolderId: undefined,
  exploreTagsShownFolderId: undefined,
  relatedTagsByKey: {},

  setExploreMode: (exploreMode) =>
    // Manage mode only exists for the tag view; drop it when switching to visual
    // clusters so re-entering the tag view starts in the normal browse state.
    set(exploreMode === 'visual' ? { exploreMode, tagManagerOpen: false } : { exploreMode }),
  setTagManagerOpen: (tagManagerOpen) => set({ tagManagerOpen }),
  // Jump straight to the tag manager from anywhere (e.g. the Settings panel):
  // switch to Explore, select the tag view, open manage mode, and close Settings.
  openTagManager: () => {
    get().setView('explore')
    set({ exploreMode: 'tags', tagManagerOpen: true, settingsOpen: false })
  },

  loadVisualClusters: async (options) => {
    const { selectedFolderId, visualClusterFolderId, visualClusterLoading } = get()
    const force = options?.force ?? false
    // Skip if already loaded for this folder and not currently loading
    if (
      !force &&
      !visualClusterLoading &&
      visualClusterFolderId !== undefined &&
      visualClusterFolderId === selectedFolderId
    ) {
      return
    }
    const requestToken = ++visualClusterRequestToken
    // On a real folder switch, drop the previous folder's clusters so the loading
    // panel shows instead of lingering stale results. A same-folder refresh keeps
    // them to avoid a flicker when the cache returns instantly.
    const isFolderSwitch = visualClusterFolderId !== selectedFolderId
    set({
      visualClusterLoading: true,
      visualClusterFolderId: selectedFolderId,
      ...(isFolderSwitch ? { visualClusterEntries: [] } : {}),
    })
    try {
      const entries = await invoke<VisualClusterEntry[]>('get_visual_clusters', {
        folderId: selectedFolderId,
      })
      if (requestToken !== visualClusterRequestToken) return
      set({ visualClusterEntries: entries, visualClusterLoading: false })
    } catch (error) {
      if (requestToken !== visualClusterRequestToken) return
      console.error('Failed to load tag cloud:', error)
      set({ visualClusterLoading: false })
    }
  },

  loadExploreTags: async (options) => {
    const { selectedFolderId, exploreTagsFolderId, exploreTagLoading } = get()
    const force = options?.force ?? false
    if (!force && exploreTagLoading) {
      return
    }
    if (
      !force &&
      !exploreTagLoading &&
      exploreTagsFolderId !== undefined &&
      exploreTagsFolderId === selectedFolderId
    ) {
      return
    }
    const requestToken = ++exploreTagRequestToken
    // A real folder switch is decided by what's currently *shown*, not by the
    // dirty marker — a same-folder invalidation nulls exploreTagsFolderId but
    // leaves exploreTagsShownFolderId pointing at the displayed folder, so the
    // visible list (and manager UI state) survives the refresh. On an actual
    // switch, drop the previous folder's tags so the loading panel shows.
    const { exploreTagsShownFolderId } = get()
    const isFolderSwitch =
      exploreTagsShownFolderId !== undefined && exploreTagsShownFolderId !== selectedFolderId
    set({
      exploreTagLoading: true,
      exploreTagsFolderId: selectedFolderId,
      exploreTagsShownFolderId: selectedFolderId,
      ...(isFolderSwitch ? { exploreTagEntries: [], relatedTagsByKey: {} } : {}),
    })
    try {
      const entries = await invoke<ExploreTagEntry[]>('get_explore_tags', {
        params: { folder_id: selectedFolderId, limit: 180 },
      })
      if (requestToken !== exploreTagRequestToken) return
      set({ exploreTagEntries: entries, exploreTagLoading: false, relatedTagsByKey: {} })
    } catch (error) {
      if (requestToken !== exploreTagRequestToken) return
      console.error('Failed to load explore tags:', error)
      set({ exploreTagLoading: false })
    }
  },

  loadRelatedTags: async (tag) => {
    const trimmed = tag.trim()
    if (!trimmed) return []

    const { selectedFolderId, relatedTagsByKey } = get()
    const key = `${selectedFolderId ?? 'all'}:${trimmed}`
    if (relatedTagsByKey[key]) {
      return relatedTagsByKey[key]
    }

    const entries = await invoke<RelatedTagEntry[]>('get_related_tags', {
      params: { tag: trimmed, folder_id: selectedFolderId, limit: 18 },
    })
    set((state) => ({
      relatedTagsByKey: {
        ...state.relatedTagsByKey,
        [key]: entries,
      },
    }))
    return entries
  },

  showVisualCluster: async (imageIds) => {
    const requestToken = nextGalleryRequestToken()
    set((state) => ({
      activeView: 'gallery',
      search: '',
      images: [],
      totalImages: imageIds.length,
      loadedCount: 0,
      loadingImages: true,
      collectionTitle: 'Explore Cluster',
      imageLoadError: null,
      similarSourceImageId: null,
      similarSourceFolderId: null,
      similarHasMore: false,
      similarFolderId: null,
      gallerySelectedIds: new Set<number>(),
      selectedAlbumId: null,
      galleryScrollResetKey: state.galleryScrollResetKey + 1,
    }))

    try {
      const images = await invoke<ImageRecord[]>('get_images_by_ids', {
        params: { image_ids: imageIds },
      })
      if (!isCurrentGalleryRequest(requestToken)) return
      set({
        images,
        totalImages: images.length,
        loadedCount: images.length,
        loadingImages: false,
        imageLoadError: null,
        collectionTitle: 'Explore Cluster',
      })
    } catch (error) {
      if (!isCurrentGalleryRequest(requestToken)) return
      set({
        images: [],
        totalImages: 0,
        loadedCount: 0,
        loadingImages: false,
        imageLoadError: String(error),
        collectionTitle: 'Explore Cluster',
      })
    }
  },

  suggestImageTags: async (imageId) => {
    return invoke<string[]>('suggest_image_tags', {
      params: { image_id: imageId, limit: 2 },
    })
  },

  getImageTags: async (imageId) => {
    return invoke<ImageTag[]>('get_image_tags', {
      params: { image_id: imageId },
    })
  },

  addUserTag: async (imageId, tag) => {
    const result = await invoke<ImageTag>('add_user_tag', {
      params: { image_id: imageId, tag },
    })
    // Invalidate explore tags cache so new tag appears immediately
    set({ exploreTagsFolderId: undefined })
    return result
  },

  removeTag: async (tagId) => {
    await invoke<void>('remove_tag', {
      params: { tag_id: tagId },
    })
    // Invalidate explore tags cache so removed tag disappears immediately
    set({ exploreTagsFolderId: undefined })
  },

  getImageExif: async (imageId) => {
    return invoke<ImageExif>('get_image_exif', { params: { image_id: imageId } })
  },

  renameTag: async (from, to) => {
    await invoke('rename_tag', { params: { from, to } })
    // Tag content changed — invalidate the explore-tags and visual-cluster caches.
    // Keep the current tag list visible while the refresh runs so manager UI
    // state such as filtering and sorting is not lost to a loading remount.
    set({
      exploreTagsFolderId: undefined,
      visualClusterFolderId: undefined,
      visualClusterEntries: [],
    })
    const parsed = parseSearchValue(get().search)
    if (parsed.mode === 'tag' && parsed.query === from) {
      // An active tag-search points at the old name — repoint it so the gallery
      // refreshes instead of showing stale results for a tag that no longer exists.
      get().setSearch(`/t ${to}`)
    } else if (get().activeView === 'explore') {
      await get().loadExploreTags()
    }
  },

  deleteTag: async (tag) => {
    const removed = await invoke<number>('delete_tag', { params: { tag } })
    // Keep the current tag list visible while the refresh runs so manager UI
    // state such as filtering and sorting is not lost to a loading remount.
    set({
      exploreTagsFolderId: undefined,
      visualClusterFolderId: undefined,
      visualClusterEntries: [],
    })
    const parsed = parseSearchValue(get().search)
    if (parsed.mode === 'tag' && parsed.query === tag) {
      // The searched tag is gone — reload so the now-empty result is reflected.
      void get().loadImages(true)
    } else if (get().activeView === 'explore') {
      await get().loadExploreTags()
    }
    return removed
  },
})
