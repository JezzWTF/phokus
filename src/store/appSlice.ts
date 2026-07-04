import { invoke } from '@tauri-apps/api/core'
import { getVersion } from '@tauri-apps/api/app'
import { relaunch } from '@tauri-apps/plugin-process'
import { check, Update } from '@tauri-apps/plugin-updater'
import type { StateCreator } from 'zustand'
import { getChangelogForVersion } from '../changelog'
import type { GalleryStore } from './index'
import type { FfmpegStatus, FolderWorkerStates, UpdateStatus, WorkerKey } from './types'
import { WORKER_KEYS } from './types'

// The Update handle from the plugin carries the download method; it's not
// serializable state, so it lives outside the store.
let pendingUpdate: Update | null = null

export interface AppSlice {
  appVersion: string | null
  buildVariant: 'cpu' | 'cuda' | null
  updateStatus: UpdateStatus
  updateVersion: string | null
  updateProgress: number | null // 0..1 download progress, null while size unknown
  updateError: string | null
  updateDismissed: boolean
  // "What's New" greeting after a version change. `whatsNewToast` holds the
  // version to advertise in the corner toast (null = hidden); `whatsNewOpen`
  // controls the full changelog modal.
  whatsNewOpen: boolean
  whatsNewToast: string | null

  ffmpegStatus: FfmpegStatus
  ffmpegProgress: { downloaded_bytes: number; total_bytes: number } | null
  ffmpegError: string | null
  onboardingCompleted: boolean | null // null = not loaded yet
  onboardingOpen: boolean
  onboardingStep: number

  workerPausesPersist: boolean
  // Per-folder background-worker pause flags, shared by the BackgroundTasks
  // bar and the sidebar folder context menu.
  workerPaused: Record<number, Record<WorkerKey, boolean>>

  colorBackfill: { processed: number; total: number; done: boolean } | null

  loadAppVersion: () => Promise<void>
  checkForUpdates: (options?: { quiet?: boolean }) => Promise<void>
  installUpdate: () => Promise<void>
  dismissUpdate: () => void
  initWhatsNew: () => Promise<void>
  openWhatsNew: () => void
  closeWhatsNew: () => void
  dismissWhatsNewToast: () => void
  loadFfmpegStatus: () => Promise<void>
  retryFfmpegDownload: () => Promise<void>
  loadOnboardingCompleted: () => Promise<void>
  completeOnboarding: () => void
  openOnboarding: () => void
  setOnboardingStep: (step: number) => void
  loadWorkerPausesPersist: () => Promise<void>
  setWorkerPausesPersist: (persist: boolean) => void
  loadWorkerStates: () => Promise<void>
  setWorkerPaused: (folderId: number, worker: WorkerKey, paused: boolean) => void
  setAllWorkersPaused: (folderId: number, paused: boolean) => void
}

export const createAppSlice: StateCreator<GalleryStore, [], [], AppSlice> = (set, get) => ({
  appVersion: null,
  buildVariant: null,
  updateStatus: 'idle',
  updateVersion: null,
  updateProgress: null,
  updateError: null,
  updateDismissed: false,
  whatsNewOpen: false,
  whatsNewToast: null,

  ffmpegStatus: 'unknown',
  ffmpegProgress: null,
  ffmpegError: null,
  onboardingCompleted: null,
  onboardingOpen: false,
  onboardingStep: 0,

  workerPausesPersist: false,
  workerPaused: {},

  colorBackfill: null,

  loadAppVersion: async () => {
    try {
      set({ appVersion: await getVersion() })
    } catch {
      // leave null; the UI falls back to a dash
    }
    try {
      const variant = await invoke<string>('get_build_variant')
      set({ buildVariant: variant === 'cuda' ? 'cuda' : 'cpu' })
    } catch {
      // leave null; the badge is hidden until known
    }
  },

  checkForUpdates: async (options) => {
    const quiet = options?.quiet ?? false
    const { updateStatus } = get()
    if (
      updateStatus === 'checking' ||
      updateStatus === 'downloading' ||
      updateStatus === 'installing'
    )
      return

    set({ updateStatus: 'checking', updateError: null })
    try {
      const update = await check()
      if (update) {
        pendingUpdate = update
        set({ updateStatus: 'available', updateVersion: update.version, updateDismissed: false })
      } else {
        pendingUpdate = null
        set({ updateStatus: 'upToDate', updateVersion: null })
      }
    } catch (error) {
      pendingUpdate = null
      if (quiet) {
        // Launch-time check: stay silent on network/endpoint failures.
        set({ updateStatus: 'idle' })
      } else {
        set({
          updateStatus: 'error',
          updateError: error instanceof Error ? error.message : String(error),
        })
      }
    }
  },

  installUpdate: async () => {
    const update = pendingUpdate
    if (!update || get().updateStatus !== 'available') return

    // Clearing the dismissed flag re-surfaces the progress toast: the user may
    // have clicked "Later" on the prompt and then triggered the install from the
    // title-bar button or Settings, and they should still see download progress.
    set({
      updateStatus: 'downloading',
      updateProgress: null,
      updateError: null,
      updateDismissed: false,
    })
    try {
      let contentLength: number | null = null
      let downloaded = 0
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            contentLength = event.data.contentLength ?? null
            set({ updateProgress: contentLength ? 0 : null })
            break
          case 'Progress':
            downloaded += event.data.chunkLength
            if (contentLength) {
              set({ updateProgress: Math.min(downloaded / contentLength, 1) })
            }
            break
          case 'Finished':
            set({ updateStatus: 'installing', updateProgress: 1 })
            break
        }
      })
      await relaunch()
    } catch (error) {
      set({
        updateStatus: 'error',
        updateError: error instanceof Error ? error.message : String(error),
      })
    }
  },

  dismissUpdate: () => set({ updateDismissed: true }),

  initWhatsNew: async () => {
    try {
      const current = await getVersion()
      const lastSeen = (await invoke<string | null>('get_last_seen_version')) || null
      // Already greeted this version — nothing to do, and no need to rewrite.
      if (lastSeen === current) return

      let shouldShow: boolean
      if (lastSeen) {
        // A recorded earlier version means this launch is a genuine upgrade.
        shouldShow = true
      } else {
        // No record yet. Fresh installs are covered by the welcome tour, so only
        // greet users who have already completed onboarding (i.e. upgraded into
        // this feature) rather than someone opening the app for the first time.
        shouldShow = await invoke<boolean>('get_onboarding_completed').catch(() => false)
      }

      // Only surface the prompt if we actually have notes for this version.
      if (shouldShow && getChangelogForVersion(current)) {
        set({ whatsNewToast: current })
      }
      await invoke('set_last_seen_version', { version: current }).catch(() => {})
    } catch {
      // Non-fatal: the greeting is a nicety, never block startup on it.
    }
  },

  openWhatsNew: () => set({ whatsNewOpen: true, whatsNewToast: null }),

  closeWhatsNew: () => set({ whatsNewOpen: false }),

  dismissWhatsNewToast: () => set({ whatsNewToast: null }),

  loadFfmpegStatus: async () => {
    try {
      const status = await invoke<{ installed: boolean; downloading: boolean; failed: boolean }>(
        'get_ffmpeg_status'
      )
      if (status.installed) {
        set({ ffmpegStatus: 'installed' })
      } else if (status.failed) {
        // The download failed before our event listener attached — surface
        // the error state so the retry button is reachable.
        set({
          ffmpegStatus: 'error',
          ffmpegError: 'The download could not be completed. Check your connection and retry.',
        })
      } else {
        // Not installed and possibly not downloading yet — the provision
        // thread starts with the app, so treat the gap as "starting" and let
        // the first ffmpeg-progress event settle the real state.
        set({ ffmpegStatus: 'starting' })
      }
    } catch {
      // leave "unknown"; events will correct it
    }
  },

  retryFfmpegDownload: async () => {
    set({ ffmpegStatus: 'starting', ffmpegError: null, ffmpegProgress: null })
    try {
      await invoke('retry_ffmpeg_download')
    } catch (error) {
      set({
        ffmpegStatus: 'error',
        ffmpegError: error instanceof Error ? error.message : String(error),
      })
    }
  },

  loadOnboardingCompleted: async () => {
    try {
      const completed = await invoke<boolean>('get_onboarding_completed')
      set(
        completed
          ? { onboardingCompleted: true }
          : { onboardingCompleted: false, onboardingOpen: true, onboardingStep: 0 }
      )
    } catch {
      // If the flag can't be read, don't trap the user in onboarding.
      set({ onboardingCompleted: true })
    }
  },

  completeOnboarding: () => {
    set({ onboardingOpen: false, onboardingCompleted: true })
    void invoke('set_onboarding_completed', { completed: true }).catch(() => {})
  },

  openOnboarding: () => set({ onboardingOpen: true, onboardingStep: 0 }),

  setOnboardingStep: (step) => set({ onboardingStep: step }),

  loadWorkerPausesPersist: async () => {
    try {
      const persist = await invoke<boolean>('get_worker_pauses_persist')
      set({ workerPausesPersist: persist })
    } catch {
      // fall back to in-memory default
    }
  },

  setWorkerPausesPersist: (persist) => {
    set({ workerPausesPersist: persist })
    void invoke('set_worker_pauses_persist', { persist }).catch(() => {})
  },

  loadWorkerStates: async () => {
    const folderIds = get().folders.map((folder) => folder.id)
    if (folderIds.length === 0) {
      set({ workerPaused: {} })
      return
    }
    try {
      const states = await invoke<FolderWorkerStates[]>('get_worker_states', { folderIds })
      set({
        workerPaused: Object.fromEntries(
          states.map((state) => [
            state.folder_id,
            {
              thumbnail: state.thumbnail_paused,
              metadata: state.metadata_paused,
              embedding: state.embedding_paused,
              tagging: state.tagging_paused,
            },
          ])
        ),
      })
    } catch {
      // leave the existing snapshot in place
    }
  },

  setWorkerPaused: (folderId, worker, paused) => {
    set((state) => {
      const current = state.workerPaused[folderId] ?? {
        thumbnail: false,
        metadata: false,
        embedding: false,
        tagging: false,
      }
      return {
        workerPaused: {
          ...state.workerPaused,
          [folderId]: { ...current, [worker]: paused },
        },
      }
    })
    void invoke('set_worker_paused', { worker, folderId, paused }).catch(() => {})
  },

  setAllWorkersPaused: (folderId, paused) => {
    set((state) => ({
      workerPaused: {
        ...state.workerPaused,
        [folderId]: { thumbnail: paused, metadata: paused, embedding: paused, tagging: paused },
      },
    }))
    for (const worker of WORKER_KEYS) {
      void invoke('set_worker_paused', { worker, folderId, paused }).catch(() => {})
    }
  },
})
