import { useCallback, useEffect } from "react";
import { ImageRecord } from "../../store";
import { ViewTransform } from "./types";
import { zoomViewAt } from "./viewTransform";

interface UseLightboxNavigationParams {
  selectedImage: ImageRecord | null;
  images: ImageRecord[];
  currentIndex: number;
  slideshowActive: boolean;
  regionSelectMode: boolean;
  closeImage: () => void;
  exitRegionMode: () => void;
  exitSlideshow: () => void;
  goSlideshow: (direction: -1 | 1) => void;
  showSlideshowControls: () => void;
  setSlideshowPaused: React.Dispatch<React.SetStateAction<boolean>>;
  openImage: (image: ImageRecord) => void;
  setView: React.Dispatch<React.SetStateAction<ViewTransform>>;
  clampPan: (view: ViewTransform) => ViewTransform;
}

export function useLightboxNavigation({
  selectedImage,
  images,
  currentIndex,
  slideshowActive,
  regionSelectMode,
  closeImage,
  exitRegionMode,
  exitSlideshow,
  goSlideshow,
  showSlideshowControls,
  setSlideshowPaused,
  openImage,
  setView,
  clampPan,
}: UseLightboxNavigationParams) {
  const goPrev = useCallback(() => {
    if (currentIndex > 0) openImage(images[currentIndex - 1]);
  }, [currentIndex, images, openImage]);

  const goNext = useCallback(() => {
    if (currentIndex >= 0 && currentIndex < images.length - 1) openImage(images[currentIndex + 1]);
  }, [currentIndex, images, openImage]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!selectedImage) return;
      if (slideshowActive) {
        if (event.key === "Escape") {
          event.preventDefault();
          exitSlideshow();
          return;
        }
        if (event.key === " ") {
          event.preventDefault();
          setSlideshowPaused((paused) => !paused);
          showSlideshowControls();
          return;
        }
        if (event.key === "ArrowLeft" && !event.shiftKey) {
          event.preventDefault();
          goSlideshow(-1);
          return;
        }
        if (event.key === "ArrowRight" && !event.shiftKey) {
          event.preventDefault();
          goSlideshow(1);
          return;
        }
        return;
      }
      if (event.key === "Escape") {
        if (regionSelectMode) {
          exitRegionMode();
        } else {
          closeImage();
        }
      }
      if (regionSelectMode) return;
      if (event.key === "ArrowLeft" && !event.shiftKey) goPrev();
      if (event.key === "ArrowRight" && !event.shiftKey) goNext();
      if (event.key === "+" || event.key === "=")
        setView((view) => clampPan(zoomViewAt(view, Math.min(3, view.zoom + 0.25), 0, 0)));
      if (event.key === "-")
        setView((view) => clampPan(zoomViewAt(view, Math.max(0.75, view.zoom - 0.25), 0, 0)));
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    clampPan,
    closeImage,
    exitRegionMode,
    exitSlideshow,
    goNext,
    goPrev,
    goSlideshow,
    regionSelectMode,
    selectedImage,
    setSlideshowPaused,
    setView,
    showSlideshowControls,
    slideshowActive,
  ]);

  return { goPrev, goNext };
}
