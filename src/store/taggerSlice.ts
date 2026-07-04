import { invoke } from '@tauri-apps/api/core'
import type { StateCreator } from 'zustand'
import type { GalleryStore } from './index'
import type {
  TaggerAcceleration,
  TaggerModel,
  TaggerModelProgress,
  TaggerModelStatus,
  TaggerRuntimeProbe,
  TaggingQueueScope,
} from './types'

export interface TaggerSlice {
  taggerModelStatus: TaggerModelStatus | null
  taggerModelPreparing: boolean
  taggerModelError: string | null
  taggerModelProgress: TaggerModelProgress | null
  taggerModel: TaggerModel
  taggerAcceleration: TaggerAcceleration
  taggerThreshold: number
  taggerBatchSize: number
  taggerRuntimeProbe: TaggerRuntimeProbe | null
  taggerRuntimeChecking: boolean
  taggingQueueScope: TaggingQueueScope
  taggingQueueFolderIds: number[]

  loadTaggerModelStatus: () => Promise<void>
  prepareTaggerModel: () => Promise<void>
  deleteTaggerModel: () => Promise<void>
  loadTaggerAcceleration: () => Promise<void>
  setTaggerAcceleration: (acceleration: TaggerAcceleration) => Promise<void>
  loadTaggerModel: () => Promise<void>
  setTaggerModel: (model: TaggerModel) => Promise<void>
  loadTaggerThreshold: () => Promise<void>
  setTaggerThreshold: (threshold: number, model?: TaggerModel) => Promise<void>
  loadTaggerBatchSize: () => Promise<void>
  setTaggerBatchSize: (batchSize: number) => Promise<void>
  probeTaggerRuntime: () => Promise<void>
  queueTaggingJobs: (folderId?: number | null) => Promise<number>
  queueTaggingJobsForFolders: (folderIds: number[]) => Promise<number>
  queueTaggingForImage: (imageId: number) => Promise<number>
  clearTaggingJobs: (folderId?: number | null) => Promise<number>
  clearTaggingJobsForFolders: (folderIds: number[]) => Promise<number>
  resetAiTags: (folderId?: number | null) => Promise<number>
  resetAiTagsForFolders: (folderIds: number[]) => Promise<number>
  loadTaggingQueueScope: () => Promise<void>
  setTaggingQueueScope: (scope: TaggingQueueScope) => void
  loadTaggingQueueFolderIds: () => Promise<void>
  toggleTaggingQueueFolder: (folderId: number) => void
  setTaggingQueueFolderIds: (folderIds: number[]) => void
}

export const createTaggerSlice: StateCreator<GalleryStore, [], [], TaggerSlice> = (set, get) => ({
  taggerModelStatus: null,
  taggerModelPreparing: false,
  taggerModelError: null,
  taggerModelProgress: null,
  taggerModel: 'wd',
  taggerAcceleration: 'auto',
  taggerThreshold: 0.35,
  taggerBatchSize: 8,
  taggerRuntimeProbe: null,
  taggerRuntimeChecking: false,
  taggingQueueScope: 'all',
  taggingQueueFolderIds: [],

  loadTaggerModelStatus: async () => {
    try {
      const taggerModelStatus = await invoke<TaggerModelStatus>('get_tagger_model_status')
      set({ taggerModelStatus, taggerModelError: null })
    } catch (error) {
      set({ taggerModelError: String(error) })
    }
  },

  loadTaggerAcceleration: async () => {
    try {
      const taggerAcceleration = await invoke<TaggerAcceleration>('get_tagger_acceleration')
      set({ taggerAcceleration })
    } catch (error) {
      set({ taggerModelError: String(error) })
    }
  },

  setTaggerAcceleration: async (acceleration) => {
    const taggerAcceleration = await invoke<TaggerAcceleration>('set_tagger_acceleration', {
      params: { acceleration },
    })
    set({ taggerAcceleration, taggerRuntimeProbe: null })
  },

  loadTaggerModel: async () => {
    try {
      const taggerModel = await invoke<TaggerModel>('get_tagger_model')
      // Never clobber the valid default with a missing/blank backend response.
      if (taggerModel) set({ taggerModel })
    } catch (error) {
      set({ taggerModelError: String(error) })
    }
  },

  setTaggerModel: async (model) => {
    const taggerModel = await invoke<TaggerModel>('set_tagger_model', {
      params: { model },
    })
    // Switching models changes both readiness and the active threshold setting,
    // so refresh them together for the selected model.
    try {
      const [taggerModelStatus, taggerThreshold] = await Promise.all([
        invoke<TaggerModelStatus>('get_tagger_model_status'),
        invoke<number>('get_tagger_threshold'),
      ])
      set({
        taggerModel,
        taggerModelStatus,
        taggerThreshold,
        taggerModelError: null,
        taggerRuntimeProbe: null,
      })
    } catch (error) {
      set({ taggerModel, taggerRuntimeProbe: null, taggerModelError: String(error) })
    }
  },

  loadTaggerThreshold: async () => {
    try {
      const taggerThreshold = await invoke<number>('get_tagger_threshold')
      set({ taggerThreshold })
    } catch (error) {
      set({ taggerModelError: String(error) })
    }
  },

  setTaggerThreshold: async (threshold, model) => {
    const taggerThreshold = await invoke<number>('set_tagger_threshold', {
      params: { threshold, model },
    })
    if (!model || get().taggerModel === model) {
      set({ taggerThreshold })
    }
  },

  loadTaggerBatchSize: async () => {
    try {
      const taggerBatchSize = await invoke<number>('get_tagger_batch_size')
      set({ taggerBatchSize })
    } catch (error) {
      set({ taggerModelError: String(error) })
    }
  },

  setTaggerBatchSize: async (batchSize) => {
    const taggerBatchSize = await invoke<number>('set_tagger_batch_size', {
      params: { batch_size: batchSize },
    })
    set({ taggerBatchSize })
  },

  prepareTaggerModel: async () => {
    set({ taggerModelPreparing: true, taggerModelError: null, taggerModelProgress: null })
    try {
      const taggerModelStatus = await invoke<TaggerModelStatus>('prepare_tagger_model')
      set({
        taggerModelStatus,
        taggerModelPreparing: false,
        taggerModelError: null,
        taggerModelProgress: null,
      })
    } catch (error) {
      set({
        taggerModelPreparing: false,
        taggerModelError: String(error),
        taggerModelProgress: null,
      })
    }
  },

  deleteTaggerModel: async () => {
    set({ taggerModelPreparing: true, taggerModelError: null, taggerModelProgress: null })
    try {
      const taggerModelStatus = await invoke<TaggerModelStatus>('delete_tagger_model')
      set({
        taggerModelStatus,
        taggerModelPreparing: false,
        taggerModelError: null,
        taggerModelProgress: null,
        taggerRuntimeProbe: null,
      })
    } catch (error) {
      set({
        taggerModelPreparing: false,
        taggerModelError: String(error),
        taggerModelProgress: null,
      })
    }
  },

  probeTaggerRuntime: async () => {
    set({ taggerRuntimeChecking: true, taggerModelError: null })
    try {
      const taggerRuntimeProbe = await invoke<TaggerRuntimeProbe>('probe_tagger_runtime')
      set({ taggerRuntimeProbe, taggerRuntimeChecking: false, taggerModelError: null })
    } catch (error) {
      set({
        taggerRuntimeChecking: false,
        taggerModelError: String(error),
        taggerRuntimeProbe: null,
      })
    }
  },

  queueTaggingJobs: async (folderId = get().selectedFolderId) => {
    const queued = await invoke<number>('queue_tagging_jobs', {
      params: { folder_id: folderId ?? null, image_id: null },
    })
    await get().loadBackgroundJobProgress()
    return queued
  },

  queueTaggingJobsForFolders: async (folderIds) => {
    const queued = await invoke<number>('queue_tagging_jobs', {
      params: { folder_id: null, folder_ids: folderIds, image_id: null },
    })
    await get().loadBackgroundJobProgress()
    return queued
  },

  queueTaggingForImage: async (imageId) => {
    const queued = await invoke<number>('queue_tagging_jobs', {
      params: { folder_id: null, image_id: imageId },
    })
    await get().loadBackgroundJobProgress()
    return queued
  },

  clearTaggingJobs: async (folderId = get().selectedFolderId) => {
    const cleared = await invoke<number>('clear_tagging_jobs', {
      params: { folder_id: folderId ?? null },
    })
    await get().loadBackgroundJobProgress()
    return cleared
  },

  clearTaggingJobsForFolders: async (folderIds) => {
    const cleared = await invoke<number>('clear_tagging_jobs', {
      params: { folder_id: null, folder_ids: folderIds },
    })
    await get().loadBackgroundJobProgress()
    return cleared
  },

  resetAiTags: async (folderId = get().selectedFolderId) => {
    const reset = await invoke<number>('reset_ai_tags', {
      params: { folder_id: folderId ?? null, folder_ids: null },
    })
    set({
      exploreTagsFolderId: undefined,
      visualClusterFolderId: undefined,
      visualClusterEntries: [],
    })
    await get().loadBackgroundJobProgress()
    await get().loadImages(true)
    return reset
  },

  resetAiTagsForFolders: async (folderIds) => {
    const reset = await invoke<number>('reset_ai_tags', {
      params: { folder_id: null, folder_ids: folderIds },
    })
    set({
      exploreTagsFolderId: undefined,
      visualClusterFolderId: undefined,
      visualClusterEntries: [],
    })
    await get().loadBackgroundJobProgress()
    await get().loadImages(true)
    return reset
  },

  loadTaggingQueueScope: async () => {
    try {
      const scope = await invoke<TaggingQueueScope>('get_tagging_queue_scope')
      set({ taggingQueueScope: scope })
    } catch {
      // silently fall back to in-memory default
    }
  },

  setTaggingQueueScope: (taggingQueueScope) => {
    set((state) => ({
      taggingQueueScope,
      taggingQueueFolderIds: state.taggingQueueFolderIds,
    }))
    void invoke('set_tagging_queue_scope', { scope: taggingQueueScope }).catch(() => {})
  },

  loadTaggingQueueFolderIds: async () => {
    try {
      const folderIds = await invoke<number[]>('get_tagging_queue_folder_ids')
      set({ taggingQueueFolderIds: folderIds })
    } catch {
      // silently fall back to in-memory default
    }
  },

  toggleTaggingQueueFolder: (folderId) => {
    set((state) => {
      const next = state.taggingQueueFolderIds.includes(folderId)
        ? state.taggingQueueFolderIds.filter((id) => id !== folderId)
        : [...state.taggingQueueFolderIds, folderId].sort((a, b) => a - b)
      void invoke('set_tagging_queue_folder_ids', { folder_ids: next }).catch(() => {})
      return { taggingQueueFolderIds: next }
    })
  },

  setTaggingQueueFolderIds: (taggingQueueFolderIds) => {
    set({ taggingQueueFolderIds })
    void invoke('set_tagging_queue_folder_ids', { folder_ids: taggingQueueFolderIds }).catch(
      () => {}
    )
  },
})
