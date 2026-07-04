import { invoke } from '@tauri-apps/api/core'
import type { StateCreator } from 'zustand'
import { notifyTaskComplete } from '../notifications'
import type { GalleryStore } from './index'
import type { DuplicateGroup, DuplicateScanProgress, DuplicateScanResult } from './types'

export interface DuplicateSlice {
  duplicateGroups: DuplicateGroup[]
  duplicateScanning: boolean
  duplicateScanProgress: DuplicateScanProgress | null
  duplicateScanError: string | null
  duplicateScanWarning: string | null
  duplicateSelectedIds: Set<number>
  duplicateLastScanned: number | null // Unix timestamp (seconds)
  duplicateScanFolderId: number | null | undefined // undefined = never scanned

  loadDuplicateScanCache: (folderId?: number | null) => Promise<void>
  scanDuplicates: (folderId?: number | null) => Promise<void>
  toggleDuplicateSelected: (imageId: number) => void
  selectAllDuplicates: (imageIds: number[]) => void
  selectKeepFirstAllGroups: () => void
  clearDuplicateSelection: () => void
  deleteSelectedDuplicates: () => Promise<number>
}

export const createDuplicateSlice: StateCreator<GalleryStore, [], [], DuplicateSlice> = (
  set,
  get
) => ({
  duplicateGroups: [],
  duplicateScanning: false,
  duplicateScanProgress: null,
  duplicateScanError: null,
  duplicateScanWarning: null,
  duplicateSelectedIds: new Set(),
  duplicateLastScanned: null,
  duplicateScanFolderId: undefined,

  loadDuplicateScanCache: async (folderId = null) => {
    interface CacheResult {
      groups: DuplicateGroup[]
      scanned_at: number
    }
    const cached = await invoke<CacheResult | null>('load_duplicate_scan_cache', {
      folderId: folderId ?? null,
    })
    if (cached) {
      set({
        duplicateGroups: cached.groups,
        duplicateLastScanned: cached.scanned_at,
        duplicateScanFolderId: folderId,
        duplicateScanWarning: null,
      })
    }
  },

  scanDuplicates: async (folderId = null) => {
    const { listen } = await import('@tauri-apps/api/event')
    set({
      duplicateScanning: true,
      duplicateGroups: [],
      duplicateScanProgress: null,
      duplicateScanError: null,
      duplicateScanWarning: null,
      duplicateSelectedIds: new Set(),
    })
    const unlisten = await listen<DuplicateScanProgress>('duplicate_scan_progress', (event) => {
      set({ duplicateScanProgress: event.payload })
    })
    try {
      const result = await invoke<DuplicateScanResult>('find_duplicates', {
        folderId: folderId ?? null,
      })
      const warning =
        result.skipped_files > 0
          ? `${result.skipped_files.toLocaleString()} file${result.skipped_files === 1 ? '' : 's'} could not be read and were skipped.`
          : null
      set({
        duplicateGroups: result.groups,
        duplicateLastScanned: Math.floor(Date.now() / 1000),
        duplicateScanFolderId: folderId,
        duplicateScanWarning: warning,
      })
      void notifyTaskComplete(
        'Duplicate scan complete',
        `${result.groups.length === 1 ? 'Found 1 duplicate group.' : `Found ${result.groups.length.toLocaleString()} duplicate groups.`}${warning ? ` ${warning}` : ''}`
      )
    } catch (e) {
      set({ duplicateScanError: String(e) })
    } finally {
      unlisten()
      set({ duplicateScanning: false })
    }
  },

  toggleDuplicateSelected: (imageId) => {
    set((state) => {
      const next = new Set(state.duplicateSelectedIds)
      if (next.has(imageId)) next.delete(imageId)
      else next.add(imageId)
      return { duplicateSelectedIds: next }
    })
  },

  selectAllDuplicates: (imageIds) => {
    set((state) => {
      const next = new Set(state.duplicateSelectedIds)
      for (const id of imageIds) next.add(id)
      return { duplicateSelectedIds: next }
    })
  },

  selectKeepFirstAllGroups: () => {
    const { duplicateGroups } = get()
    const toMark = new Set<number>()
    for (const group of duplicateGroups) {
      for (const img of group.images.slice(1)) toMark.add(img.id)
    }
    set({ duplicateSelectedIds: toMark })
  },

  clearDuplicateSelection: () => set({ duplicateSelectedIds: new Set() }),

  deleteSelectedDuplicates: async () => {
    const { duplicateSelectedIds, duplicateGroups } = get()
    const ids = Array.from(duplicateSelectedIds)
    if (ids.length === 0) return 0
    // Backend returns only the IDs that were actually removed from disk.
    const succeededIds = await invoke<number[]>('delete_images_from_disk', {
      params: { image_ids: ids },
    })
    const succeededSet = new Set(succeededIds)
    // Only remove images confirmed deleted — failed files remain visible so the user can retry.
    set((state) => ({
      duplicateSelectedIds: new Set(),
      duplicateGroups: state.duplicateGroups
        .map((g) => ({ ...g, images: g.images.filter((img) => !succeededSet.has(img.id)) }))
        .filter((g) => g.images.length > 1),
    }))
    // Invalidate the persisted cache for every affected scope:
    // - global "all" cache (always, since a folder-scoped deletion still makes the global result stale)
    // - each folder that contained a deleted image (so a folder-scoped scan is also evicted)
    const affectedFolderIds = new Set<number>(
      duplicateGroups
        .flatMap((g) => g.images)
        .filter((img) => succeededSet.has(img.id))
        .map((img) => img.folder_id)
    )
    await invoke('invalidate_duplicate_scan_cache', { folderId: null }) // global
    for (const folderId of affectedFolderIds) {
      await invoke('invalidate_duplicate_scan_cache', { folderId })
    }
    return succeededIds.length
  },
})
