import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { Transition } from "framer-motion";
import { ImageRecord, SlideshowOrder, SlideshowTransition } from "../../store";
import { IDENTITY_VIEW } from "./viewTransform";
import { ViewTransform } from "./types";

const SLIDESHOW_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const SLIDESHOW_CONTROLS_IDLE_MS = 5000;
const SLIDESHOW_LOAD_MORE_THRESHOLD = 3;

export interface SlideshowMotion {
  imageInitial: { opacity: number; filter: string };
  imageAnimate: { opacity: number; filter: string };
  imageExit: { opacity: number; filter: string };
  imageTransition: Transition;
  contentInitial: { scale: number; x?: number; y?: number };
  contentAnimate: { scale: number; x?: number; y?: number };
  contentTransition: Transition;
}

interface UseSlideshowParams {
  rootRef: RefObject<HTMLDivElement | null>;
  selectedImage: ImageRecord | null;
  images: ImageRecord[];
  currentIndex: number;
  loadedCount: number;
  totalImages: number;
  intervalSeconds: number;
  order: SlideshowOrder;
  transition: SlideshowTransition;
  openImage: (image: ImageRecord) => void;
  loadMoreImages: () => Promise<void>;
  exitRegionMode: () => void;
  setView: Dispatch<SetStateAction<ViewTransform>>;
}

export function useSlideshow({
  rootRef,
  selectedImage,
  images,
  currentIndex,
  loadedCount,
  totalImages,
  intervalSeconds,
  order,
  transition,
  openImage,
  loadMoreImages,
  exitRegionMode,
  setView,
}: UseSlideshowParams) {
  const [active, setActive] = useState(false);
  const [paused, setPaused] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [motionStep, setMotionStep] = useState(0);

  const controlsIdleTimeoutRef = useRef<number | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const randomSeenRef = useRef<Set<number>>(new Set());

  const slideshowImages = useMemo(
    () => images.filter((image) => image.media_kind === "image"),
    [images],
  );
  const slideshowIndex = selectedImage
    ? slideshowImages.findIndex((image) => image.id === selectedImage.id)
    : -1;
  const position = slideshowIndex >= 0 ? slideshowIndex + 1 : Math.min(slideshowImages.length, 1);
  const canStart = slideshowImages.length > 0;

  const directions = [
    { x: -1, y: 0.45 },
    { x: 1, y: -0.45 },
    { x: -0.7, y: -0.55 },
    { x: 0.7, y: 0.55 },
  ];
  const direction = directions[motionStep % directions.length];
  const motionConfig: SlideshowMotion = {
    imageInitial: { opacity: 0, filter: "blur(8px)" },
    imageAnimate: { opacity: 1, filter: "blur(0px)" },
    imageExit: { opacity: 0, filter: "blur(4px)" },
    imageTransition: { duration: 0.72, ease: SLIDESHOW_EASE },
    contentInitial:
      transition === "gentle-motion"
        ? { scale: 1.012, x: -8 * direction.x, y: 8 * direction.y }
        : { scale: 1.012 },
    contentAnimate:
      transition === "gentle-motion"
        ? { scale: 1.026, x: 8 * direction.x, y: -8 * direction.y }
        : { scale: 1 },
    contentTransition:
      transition === "gentle-motion"
        ? { duration: intervalSeconds + 0.75, ease: "linear" }
        : { duration: 0.72, ease: SLIDESHOW_EASE },
  };

  const showControls = useCallback(() => {
    if (controlsIdleTimeoutRef.current !== null) {
      window.clearTimeout(controlsIdleTimeoutRef.current);
      controlsIdleTimeoutRef.current = null;
    }
    setControlsVisible(true);
    if (active) {
      controlsIdleTimeoutRef.current = window.setTimeout(() => {
        setControlsVisible(false);
        controlsIdleTimeoutRef.current = null;
      }, SLIDESHOW_CONTROLS_IDLE_MS);
    }
  }, [active]);

  const exit = useCallback(() => {
    setActive(false);
    setPaused(false);
    setControlsVisible(true);
    if (document.fullscreenElement === rootRef.current) {
      void document.exitFullscreen().catch(() => undefined);
    }
  }, [rootRef]);

  const go = useCallback(
    (direction: -1 | 1, revealControls = true) => {
      if (slideshowImages.length === 0) return;
      if (slideshowImages.length === 1) {
        openImage(slideshowImages[0]);
        return;
      }

      const currentSlideshowIndex = slideshowIndex >= 0 ? slideshowIndex : 0;
      let nextIndex =
        (currentSlideshowIndex + direction + slideshowImages.length) % slideshowImages.length;
      if (order === "random") {
        const currentId = slideshowImages[currentSlideshowIndex]?.id;
        let candidates = slideshowImages.filter(
          (image) => image.id !== currentId && !randomSeenRef.current.has(image.id),
        );
        if (candidates.length === 0) {
          randomSeenRef.current = new Set(currentId == null ? [] : [currentId]);
          candidates = slideshowImages.filter((image) => image.id !== currentId);
        }
        const nextImage = candidates[Math.floor(Math.random() * candidates.length)];
        nextIndex = slideshowImages.findIndex((image) => image.id === nextImage.id);
        randomSeenRef.current.add(nextImage.id);
      }
      setMotionStep((step) => step + 1);
      openImage(slideshowImages[nextIndex]);
      if (revealControls) {
        showControls();
      }
    },
    [openImage, order, showControls, slideshowImages, slideshowIndex],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const previous = pointerRef.current;
      const next = { x: event.clientX, y: event.clientY };
      pointerRef.current = next;

      if (!previous) {
        if (!controlsVisible) {
          showControls();
        }
        return;
      }

      if (Math.abs(previous.x - next.x) > 2 || Math.abs(previous.y - next.y) > 2) {
        showControls();
      }
    },
    [controlsVisible, showControls],
  );

  const start = useCallback(() => {
    if (!selectedImage || slideshowImages.length === 0) return;

    const nextImage =
      selectedImage.media_kind === "image"
        ? selectedImage
        : images.slice(Math.max(0, currentIndex + 1)).find((image) => image.media_kind === "image") ??
          slideshowImages[0];

    if (nextImage.id !== selectedImage.id) {
      openImage(nextImage);
    }

    randomSeenRef.current = new Set([nextImage.id]);
    setMotionStep(0);
    exitRegionMode();
    setView(IDENTITY_VIEW);
    setPaused(false);
    setControlsVisible(true);
    pointerRef.current = null;
    setActive(true);
    void rootRef.current?.requestFullscreen().catch(() => undefined);
  }, [currentIndex, exitRegionMode, images, openImage, rootRef, selectedImage, setView, slideshowImages]);

  useEffect(() => {
    if (selectedImage) return;
    setActive(false);
    setPaused(false);
    setControlsVisible(true);
  }, [selectedImage]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!active) return;
      if (document.fullscreenElement !== rootRef.current) {
        setActive(false);
        setPaused(false);
        setControlsVisible(true);
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, [active, rootRef]);

  useEffect(() => {
    showControls();
    return () => {
      if (controlsIdleTimeoutRef.current !== null) {
        window.clearTimeout(controlsIdleTimeoutRef.current);
        controlsIdleTimeoutRef.current = null;
      }
    };
  }, [active, paused, showControls]);

  useEffect(() => {
    if (!active || paused || slideshowImages.length <= 1) return;
    const timeout = window.setTimeout(() => {
      go(1, false);
    }, intervalSeconds * 1000);
    return () => window.clearTimeout(timeout);
  }, [active, go, intervalSeconds, paused, selectedImage?.id, slideshowImages.length]);

  useEffect(() => {
    if (
      !active ||
      loadingMore ||
      loadedCount >= totalImages ||
      slideshowImages.length === 0 ||
      slideshowIndex < slideshowImages.length - SLIDESHOW_LOAD_MORE_THRESHOLD
    ) {
      return;
    }

    setLoadingMore(true);
    void loadMoreImages().finally(() => setLoadingMore(false));
  }, [
    active,
    loadedCount,
    loadMoreImages,
    loadingMore,
    slideshowImages.length,
    slideshowIndex,
    totalImages,
  ]);

  return {
    active,
    paused,
    setPaused,
    controlsShown: controlsVisible,
    loadingMore,
    images: slideshowImages,
    position,
    canStart,
    motionConfig,
    start,
    exit,
    go,
    showControls,
    handlePointerMove,
  };
}
