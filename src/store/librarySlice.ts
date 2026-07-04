import { invoke } from "@tauri-apps/api/core";
import type { StateCreator } from "zustand";
import type { GalleryStore } from "./index";
import type { Folder, FolderAddResult, FolderJobProgress, IndexProgress } from "./types";

export interface LibrarySlice {
  folders: Folder[];
  selectedFolderId: number | null;
  indexingProgress: Record<number, IndexProgress>;
  mediaJobProgress: Record<number, FolderJobProgress>;

  loadFolders: () => Promise<void>;
  loadBackgroundJobProgress: () => Promise<void>;
  addFolder: (path: string) => Promise<void>;
  addFolders: (paths: string[]) => Promise<FolderAddResult[]>;
  listDirectories: (path: string | null) => Promise<import("./types").DirListing>;
  removeFolder: (folderId: number) => Promise<void>;
  reindexFolder: (folderId: number) => Promise<void>;
  renameFolder: (folderId: number, newName: string) => Promise<void>;
  updateFolderPath: (folderId: number, newPath: string) => Promise<void>;
  reorderFolders: (folderIds: number[]) => Promise<void>;
  selectFolder: (folderId: number | null) => void;
  setViewFolderScope: (folderId: number | null) => void;
  retryFailedEmbeddings: (folderId: number) => Promise<void>;
}

export const createLibrarySlice: StateCreator<GalleryStore, [], [], LibrarySlice> = (set, get) => ({
  folders: [],
  selectedFolderId: null,
  indexingProgress: {},
  mediaJobProgress: {},

  loadFolders: async () => {
    const folders = await invoke<Folder[]>("get_folders");
    set((state) => {
      const folderIds = new Set(folders.map((folder) => folder.id));
      const nextSelected = state.taggingQueueFolderIds.filter((folderId) => folderIds.has(folderId));
      return {
        folders,
        taggingQueueFolderIds: nextSelected,
      };
    });
  },

  loadBackgroundJobProgress: async () => {
    const progress = await invoke<FolderJobProgress[]>("get_background_job_progress");
    set(() => ({
      mediaJobProgress: Object.fromEntries(progress.map((entry) => [entry.folder_id, entry])),
    }));
  },

  addFolder: async (path) => {
    const { loadFolders, loadBackgroundJobProgress } = get();
    await invoke("add_folder", { path });
    await loadFolders();
    await loadBackgroundJobProgress();
  },

  addFolders: async (paths) => {
    const { loadFolders, loadBackgroundJobProgress } = get();
    const results = await invoke<FolderAddResult[]>("add_folders", { paths });
    await loadFolders();
    await loadBackgroundJobProgress();
    return results;
  },

  listDirectories: (path) => invoke("list_directories", { path }),

  removeFolder: async (folderId) => {
    const { selectedFolderId, loadFolders, loadImages, loadBackgroundJobProgress } = get();
    // Optimistically drop it from the sidebar for instant feedback (the backend
    // delete of its images/thumbnails can take a moment), clearing the active
    // selection if it was this folder.
    set((state) => {
      const folders = state.folders.filter((folder) => folder.id !== folderId);
      return selectedFolderId === folderId ? { folders, selectedFolderId: null } : { folders };
    });
    try {
      await invoke("remove_folder", { folderId });
    } catch (error) {
      // Removal failed — resync the authoritative list and surface the error.
      await loadFolders();
      throw error;
    }
    await loadFolders();
    await loadBackgroundJobProgress();
    // Invalidate tag cloud and explore-tags cache since library content changed.
    set({ visualClusterFolderId: undefined, visualClusterEntries: [], exploreTagsFolderId: undefined });
    // Always refresh the gallery: the removed folder's images may be on screen
    // (e.g. in All Media), not only when that folder was the active selection.
    await loadImages(true);
  },

  reindexFolder: async (folderId) => {
    const { loadFolders, loadBackgroundJobProgress } = get();
    await invoke("reindex_folder", { folderId });
    await loadFolders();
    // Invalidate tag cloud cache since embeddings will be regenerated
    set({ visualClusterFolderId: undefined, visualClusterEntries: [] });
    await loadBackgroundJobProgress();
  },

  renameFolder: async (folderId, newName) => {
    await invoke("rename_folder", { folderId, newName });
    await get().loadFolders();
  },

  updateFolderPath: async (folderId, newPath) => {
    const { loadFolders, loadBackgroundJobProgress } = get();
    await invoke("update_folder_path", { folderId, newPath });
    await loadFolders();
    await loadBackgroundJobProgress();
  },

  reorderFolders: async (folderIds) => {
    const previous = get().folders;
    const byId = new Map(previous.map((folder) => [folder.id, folder]));
    const folders = folderIds
      .map((id, index) => {
        const folder = byId.get(id);
        return folder ? { ...folder, sort_order: index + 1 } : null;
      })
      .filter((folder): folder is Folder => folder !== null);
    set({ folders });
    try {
      await invoke("reorder_folders", { params: { folder_ids: folderIds } });
    } catch (error) {
      set({ folders: previous });
      throw error;
    }
  },

  selectFolder: (folderId) => {
    // Leaving any album: drop the album-origin scope so the Folder/All pills
    // highlight correctly again.
    const similarScope = get().similarScope === "current_album" ? "all_media" : get().similarScope;
    set({ selectedFolderId: folderId, selectedAlbumId: null, similarSourceAlbumId: null, similarScope, images: [], loadedCount: 0, collectionTitle: null, similarSourceImageId: null, similarHasMore: false, activeView: "gallery", failedEmbeddingsOnly: false, failedTaggingOnly: false, imageLoadError: null });
    void get().loadImages(true);
  },

  // Change folder scope from inside a feature view (Timeline/Explore/Duplicates)
  // without leaving it — unlike selectFolder, activeView is preserved.
  setViewFolderScope: (folderId) => {
    const { activeView, selectedFolderId } = get();
    if (folderId === selectedFolderId) return;

    set({ selectedFolderId: folderId, images: [], loadedCount: 0, collectionTitle: null, similarSourceImageId: null, similarHasMore: false, imageLoadError: null });

    if (activeView === "duplicates") {
      const { duplicateScanFolderId } = get();
      if (duplicateScanFolderId !== folderId) {
        set({
          duplicateGroups: [],
          duplicateLastScanned: null,
          duplicateScanFolderId: undefined,
          duplicateScanWarning: null,
        });
        void get().loadDuplicateScanCache(folderId);
      }
      return;
    }

    // Explore reloads itself via ExploreView's useEffect on selectedFolderId.
    if (activeView === "explore") return;

    void get().loadImages(true);
  },

  retryFailedEmbeddings: async (folderId) => {
    await invoke("retry_failed_embeddings", { params: { folder_id: folderId } });
    await get().loadBackgroundJobProgress();
  },
});
