import { invoke } from "@tauri-apps/api/core";
import type { StateCreator } from "zustand";
import { initialBoolSetting, initialNumberSetting } from "./helpers";
import type { GalleryStore } from "./index";
import type {
  AppTheme,
  CleanupOrphanedThumbnailsResult,
  DatabaseInfo,
  OrphanedThumbnailsInfo,
  SlideshowOrder,
  SlideshowTransition,
  VacuumResult,
} from "./types";

const THEME_KEY = "phokus-theme";
const LIGHTBOX_AUTOPLAY_KEY = "phokus.lightboxAutoplay";
const LIGHTBOX_AUTO_MUTE_KEY = "phokus.lightboxAutoMute";
const SLIDESHOW_INTERVAL_KEY = "phokus.slideshowIntervalSeconds";
const SLIDESHOW_ORDER_KEY = "phokus.slideshowOrder";
const SLIDESHOW_TRANSITION_KEY = "phokus.slideshowTransition";

function initialSlideshowOrder(): SlideshowOrder {
  if (typeof window === "undefined") return "sequential";
  const stored = window.localStorage.getItem(SLIDESHOW_ORDER_KEY);
  return stored === "random" ? "random" : "sequential";
}

function initialSlideshowTransition(): SlideshowTransition {
  if (typeof window === "undefined") return "soft-fade";
  const stored = window.localStorage.getItem(SLIDESHOW_TRANSITION_KEY);
  return stored === "gentle-motion" ? "gentle-motion" : "soft-fade";
}

function initialTheme(): AppTheme {
  if (typeof window === "undefined") return "phokus";
  const saved = window.localStorage.getItem(THEME_KEY);
  const theme: AppTheme =
    saved === "subtle-light" || saved === "conventional-dark" ? saved : "phokus";
  document.documentElement.dataset.theme = theme;
  return theme;
}

export interface SettingsSlice {
  cacheDir: string;
  settingsOpen: boolean;
  folderPickerOpen: boolean;
  mutedFolderIds: number[];
  notificationsPaused: boolean;
  theme: AppTheme;
  lightboxAutoplay: boolean;
  lightboxAutoMute: boolean;
  slideshowIntervalSeconds: number;
  slideshowOrder: SlideshowOrder;
  slideshowTransition: SlideshowTransition;

  setCacheDir: (dir: string) => void;
  setSettingsOpen: (open: boolean) => void;
  setFolderPickerOpen: (open: boolean) => void;
  loadMutedFolderIds: () => Promise<void>;
  toggleMutedFolder: (folderId: number) => void;
  loadNotificationsPaused: () => Promise<void>;
  setNotificationsPaused: (paused: boolean) => void;
  setTheme: (theme: AppTheme) => void;
  setLightboxAutoplay: (enabled: boolean) => void;
  setLightboxAutoMute: (enabled: boolean) => void;
  setSlideshowIntervalSeconds: (seconds: number) => void;
  setSlideshowOrder: (order: SlideshowOrder) => void;
  setSlideshowTransition: (transition: SlideshowTransition) => void;
  openAppDataFolder: () => Promise<void>;
  getDatabaseInfo: () => Promise<DatabaseInfo>;
  vacuumDatabase: () => Promise<VacuumResult>;
  rebuildSemanticIndex: () => Promise<number>;
  getOrphanedThumbnailsInfo: () => Promise<OrphanedThumbnailsInfo>;
  cleanupOrphanedThumbnails: () => Promise<CleanupOrphanedThumbnailsResult>;
}

export const createSettingsSlice: StateCreator<GalleryStore, [], [], SettingsSlice> = (set) => ({
  cacheDir: "",
  settingsOpen: false,
  folderPickerOpen: false,
  mutedFolderIds: [],
  notificationsPaused: false,
  theme: initialTheme(),
  lightboxAutoplay: initialBoolSetting(LIGHTBOX_AUTOPLAY_KEY, true),
  lightboxAutoMute: initialBoolSetting(LIGHTBOX_AUTO_MUTE_KEY, false),
  slideshowIntervalSeconds: initialNumberSetting(SLIDESHOW_INTERVAL_KEY, 6, 3, 60),
  slideshowOrder: initialSlideshowOrder(),
  slideshowTransition: initialSlideshowTransition(),

  setCacheDir: (cacheDir) => set({ cacheDir }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setFolderPickerOpen: (folderPickerOpen) => set({ folderPickerOpen }),

  loadMutedFolderIds: async () => {
    try {
      const folderIds = await invoke<number[]>("get_muted_folder_ids");
      set({ mutedFolderIds: folderIds });
    } catch {
      // fall back to in-memory default
    }
  },

  toggleMutedFolder: (folderId) => {
    set((state) => {
      const next = state.mutedFolderIds.includes(folderId)
        ? state.mutedFolderIds.filter((id) => id !== folderId)
        : [...state.mutedFolderIds, folderId];
      void invoke("set_muted_folder_ids", { folder_ids: next }).catch(() => {});
      return { mutedFolderIds: next };
    });
  },

  loadNotificationsPaused: async () => {
    try {
      const paused = await invoke<boolean>("get_notifications_paused");
      set({ notificationsPaused: paused });
    } catch {
      // fall back to in-memory default
    }
  },

  setNotificationsPaused: (paused) => {
    set({ notificationsPaused: paused });
    void invoke("set_notifications_paused", { paused }).catch(() => {});
  },

  setTheme: (theme) => {
    window.localStorage.setItem(THEME_KEY, theme);
    document.documentElement.dataset.theme = theme;
    set({ theme });
  },

  setLightboxAutoplay: (enabled) => {
    window.localStorage.setItem(LIGHTBOX_AUTOPLAY_KEY, String(enabled));
    set({ lightboxAutoplay: enabled });
  },

  setLightboxAutoMute: (enabled) => {
    window.localStorage.setItem(LIGHTBOX_AUTO_MUTE_KEY, String(enabled));
    set({ lightboxAutoMute: enabled });
  },

  setSlideshowIntervalSeconds: (seconds) => {
    const next = Math.min(60, Math.max(3, Math.round(seconds)));
    window.localStorage.setItem(SLIDESHOW_INTERVAL_KEY, String(next));
    set({ slideshowIntervalSeconds: next });
  },

  setSlideshowOrder: (order) => {
    window.localStorage.setItem(SLIDESHOW_ORDER_KEY, order);
    set({ slideshowOrder: order });
  },

  setSlideshowTransition: (transition) => {
    window.localStorage.setItem(SLIDESHOW_TRANSITION_KEY, transition);
    set({ slideshowTransition: transition });
  },

  openAppDataFolder: async () => {
    await invoke("open_app_data_folder");
  },

  getDatabaseInfo: () => invoke<DatabaseInfo>("get_database_info"),

  vacuumDatabase: () => invoke<VacuumResult>("vacuum_database"),

  rebuildSemanticIndex: () => invoke<number>("rebuild_semantic_index"),

  getOrphanedThumbnailsInfo: () => invoke<OrphanedThumbnailsInfo>("get_orphaned_thumbnails_info"),

  cleanupOrphanedThumbnails: () => invoke<CleanupOrphanedThumbnailsResult>("cleanup_orphaned_thumbnails"),
});
