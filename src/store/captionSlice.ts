import { invoke } from "@tauri-apps/api/core";
import type { StateCreator } from "zustand";
import { initialAiCaptionsEnabled, replaceImage } from "./helpers";
import type { GalleryStore } from "./index";
import type {
  CaptionAcceleration,
  CaptionDetail,
  CaptionModelProgress,
  CaptionModelStatus,
  CaptionRuntimeProbe,
  CaptionVisionProbe,
  ImageRecord,
} from "./types";

const AI_CAPTIONS_ENABLED_KEY = "phokus.aiCaptionsEnabled";

export interface CaptionSlice {
  captionModelStatus: CaptionModelStatus | null;
  captionModelPreparing: boolean;
  captionModelError: string | null;
  captionModelProgress: CaptionModelProgress | null;
  captionRuntimeProbe: CaptionRuntimeProbe | null;
  captionRuntimeChecking: boolean;
  captionAcceleration: CaptionAcceleration;
  captionDetail: CaptionDetail;
  aiCaptionsEnabled: boolean;

  loadCaptionModelStatus: () => Promise<void>;
  prepareCaptionModel: () => Promise<void>;
  deleteCaptionModel: () => Promise<void>;
  probeCaptionRuntime: () => Promise<void>;
  probeCaptionImage: (imageId: number) => Promise<CaptionVisionProbe>;
  generateCaptionForImage: (imageId: number) => Promise<ImageRecord>;
  queueCaptionJobs: (folderId?: number | null) => Promise<number>;
  queueCaptionForImage: (imageId: number) => Promise<number>;
  clearCaptionJobs: (folderId?: number | null) => Promise<number>;
  resetGeneratedCaptions: (folderId?: number | null) => Promise<number>;
  loadCaptionAcceleration: () => Promise<void>;
  setCaptionAcceleration: (acceleration: CaptionAcceleration) => Promise<void>;
  loadCaptionDetail: () => Promise<void>;
  setCaptionDetail: (detail: CaptionDetail) => Promise<void>;
  setAiCaptionsEnabled: (enabled: boolean) => void;
}

export const createCaptionSlice: StateCreator<GalleryStore, [], [], CaptionSlice> = (set, get) => ({
  captionModelStatus: null,
  captionModelPreparing: false,
  captionModelError: null,
  captionModelProgress: null,
  captionRuntimeProbe: null,
  captionRuntimeChecking: false,
  captionAcceleration: "auto",
  captionDetail: "paragraph",
  aiCaptionsEnabled: initialAiCaptionsEnabled(AI_CAPTIONS_ENABLED_KEY),

  loadCaptionModelStatus: async () => {
    try {
      const captionModelStatus = await invoke<CaptionModelStatus>("get_caption_model_status");
      set({ captionModelStatus, captionModelError: null });
    } catch (error) {
      set({ captionModelError: String(error) });
    }
  },

  loadCaptionAcceleration: async () => {
    try {
      const captionAcceleration = await invoke<CaptionAcceleration>("get_caption_acceleration");
      set({ captionAcceleration });
    } catch (error) {
      set({ captionModelError: String(error) });
    }
  },

  setCaptionAcceleration: async (acceleration) => {
    const captionAcceleration = await invoke<CaptionAcceleration>("set_caption_acceleration", {
      params: { acceleration },
    });
    set({ captionAcceleration, captionRuntimeProbe: null });
  },

  loadCaptionDetail: async () => {
    try {
      const captionDetail = await invoke<CaptionDetail>("get_caption_detail");
      set({ captionDetail });
    } catch (error) {
      set({ captionModelError: String(error) });
    }
  },

  setCaptionDetail: async (detail) => {
    const captionDetail = await invoke<CaptionDetail>("set_caption_detail", {
      params: { detail },
    });
    set({ captionDetail, captionRuntimeProbe: null });
  },

  prepareCaptionModel: async () => {
    set({ captionModelPreparing: true, captionModelError: null, captionModelProgress: null });
    try {
      const captionModelStatus = await invoke<CaptionModelStatus>("prepare_caption_model");
      window.localStorage.setItem(AI_CAPTIONS_ENABLED_KEY, String(captionModelStatus.ready));
      set({ captionModelStatus, captionModelPreparing: false, captionModelError: null, captionModelProgress: null, aiCaptionsEnabled: captionModelStatus.ready });
    } catch (error) {
      set({ captionModelPreparing: false, captionModelError: String(error), captionModelProgress: null });
    }
  },

  deleteCaptionModel: async () => {
    set({ captionModelPreparing: true, captionModelError: null, captionModelProgress: null });
    try {
      const captionModelStatus = await invoke<CaptionModelStatus>("delete_caption_model");
      window.localStorage.setItem(AI_CAPTIONS_ENABLED_KEY, "false");
      set({ captionModelStatus, captionModelPreparing: false, captionModelError: null, captionModelProgress: null, captionRuntimeProbe: null, aiCaptionsEnabled: false });
    } catch (error) {
      set({ captionModelPreparing: false, captionModelError: String(error), captionModelProgress: null });
    }
  },

  probeCaptionRuntime: async () => {
    set({ captionRuntimeChecking: true, captionModelError: null });
    try {
      const captionRuntimeProbe = await invoke<CaptionRuntimeProbe>("probe_caption_runtime");
      set({ captionRuntimeProbe, captionRuntimeChecking: false, captionModelError: null });
    } catch (error) {
      set({ captionRuntimeChecking: false, captionModelError: String(error), captionRuntimeProbe: null });
    }
  },

  probeCaptionImage: async (imageId) => {
    return invoke<CaptionVisionProbe>("probe_caption_image", {
      params: { image_id: imageId },
    });
  },

  generateCaptionForImage: async (imageId) => {
    const updatedImage = await invoke<ImageRecord>("generate_caption_for_image", {
      params: { image_id: imageId },
    });

    set((state) => ({
      images: replaceImage(state.images, updatedImage, state.sort),
      selectedImage: state.selectedImage?.id === updatedImage.id ? updatedImage : state.selectedImage,
    }));

    return updatedImage;
  },

  queueCaptionJobs: async (folderId = get().selectedFolderId) => {
    const queued = await invoke<number>("queue_caption_jobs", {
      params: { folder_id: folderId ?? null, image_id: null },
    });
    await get().loadBackgroundJobProgress();
    return queued;
  },

  queueCaptionForImage: async (imageId) => {
    const queued = await invoke<number>("queue_caption_jobs", {
      params: { folder_id: null, image_id: imageId },
    });
    await get().loadBackgroundJobProgress();
    return queued;
  },

  clearCaptionJobs: async (folderId = get().selectedFolderId) => {
    const cleared = await invoke<number>("clear_caption_jobs", {
      params: { folder_id: folderId ?? null },
    });
    await get().loadBackgroundJobProgress();
    return cleared;
  },

  resetGeneratedCaptions: async (folderId = get().selectedFolderId) => {
    const reset = await invoke<number>("reset_generated_captions", {
      params: { folder_id: folderId ?? null },
    });
    await get().loadBackgroundJobProgress();
    await get().loadImages(true);
    return reset;
  },

  setAiCaptionsEnabled: (aiCaptionsEnabled) => {
    window.localStorage.setItem(AI_CAPTIONS_ENABLED_KEY, String(aiCaptionsEnabled));
    set({ aiCaptionsEnabled });
  },
});
