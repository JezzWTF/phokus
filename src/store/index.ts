import { create } from 'zustand'
import { appDataDir, join } from '@tauri-apps/api/path'
import { UnlistenFn } from '@tauri-apps/api/event'
import { createAlbumSlice, AlbumSlice } from './albumSlice'
import { createAppSlice, AppSlice } from './appSlice'
import { createCaptionSlice, CaptionSlice } from './captionSlice'
import { createDuplicateSlice, DuplicateSlice } from './duplicateSlice'
import { createExploreSlice, ExploreSlice } from './exploreSlice'
import { createGallerySlice, GallerySlice } from './gallerySlice'
import { createLibrarySlice, LibrarySlice } from './librarySlice'
import { createSearchSlice, SearchSlice } from './searchSlice'
import { createSettingsSlice, SettingsSlice } from './settingsSlice'
import { createTaggerSlice, TaggerSlice } from './taggerSlice'
import { subscribeToProgress } from './events'

export * from './types'
export { parseSearchValue, searchModeLabel, tileSizeForZoom } from './helpers'

export type GalleryStore = LibrarySlice &
  GallerySlice &
  SearchSlice &
  ExploreSlice &
  AlbumSlice &
  DuplicateSlice &
  TaggerSlice &
  CaptionSlice &
  SettingsSlice &
  AppSlice & {
    subscribeToProgress: () => Promise<UnlistenFn>
  }

export const useGalleryStore = create<GalleryStore>()((set, get, ...rest) => ({
  ...createLibrarySlice(set, get, ...rest),
  ...createGallerySlice(set, get, ...rest),
  ...createSearchSlice(set, get, ...rest),
  ...createExploreSlice(set, get, ...rest),
  ...createAlbumSlice(set, get, ...rest),
  ...createDuplicateSlice(set, get, ...rest),
  ...createTaggerSlice(set, get, ...rest),
  ...createCaptionSlice(set, get, ...rest),
  ...createSettingsSlice(set, get, ...rest),
  ...createAppSlice(set, get, ...rest),

  subscribeToProgress: () => subscribeToProgress(set, get),
}))

appDataDir().then(async (dir) => {
  useGalleryStore.getState().setCacheDir(await join(dir, 'thumbnails'))
})
