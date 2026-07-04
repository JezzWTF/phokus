import { DragRect, NormalizedCrop, SelectionOverlay, ViewTransform } from "./types";

export const MIN_SELECTION_FRACTION = 0.02;
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 4;
export const IDENTITY_VIEW: ViewTransform = { zoom: 1, panX: 0, panY: 0 };

export function normaliseRect(r: DragRect): SelectionOverlay {
  return {
    left: Math.min(r.startX, r.endX),
    top: Math.min(r.startY, r.endY),
    width: Math.abs(r.endX - r.startX),
    height: Math.abs(r.endY - r.startY),
  };
}

export function rectToNormalisedCrop(rect: DragRect, imgEl: HTMLImageElement): NormalizedCrop | null {
  const imgBounds = imgEl.getBoundingClientRect();
  if (imgBounds.width === 0 || imgBounds.height === 0) return null;

  const rawX = Math.min(rect.startX, rect.endX);
  const rawY = Math.min(rect.startY, rect.endY);
  const rawW = Math.abs(rect.endX - rect.startX);
  const rawH = Math.abs(rect.endY - rect.startY);

  const clampedX = Math.max(rawX, imgBounds.left);
  const clampedY = Math.max(rawY, imgBounds.top);
  const clampedRight = Math.min(rawX + rawW, imgBounds.right);
  const clampedBottom = Math.min(rawY + rawH, imgBounds.bottom);

  const croppedW = clampedRight - clampedX;
  const croppedH = clampedBottom - clampedY;

  if (croppedW <= 0 || croppedH <= 0) return null;

  return {
    x: (clampedX - imgBounds.left) / imgBounds.width,
    y: (clampedY - imgBounds.top) / imgBounds.height,
    w: croppedW / imgBounds.width,
    h: croppedH / imgBounds.height,
  };
}

export function zoomViewAt(view: ViewTransform, newZoom: number, anchorX: number, anchorY: number): ViewTransform {
  if (newZoom <= 1) return { ...IDENTITY_VIEW, zoom: newZoom };
  const ratio = newZoom / view.zoom;
  return {
    zoom: newZoom,
    panX: anchorX - (anchorX - view.panX) * ratio,
    panY: anchorY - (anchorY - view.panY) * ratio,
  };
}

export function clampPanToViewport(
  view: ViewTransform,
  img: HTMLImageElement | null,
  viewport: HTMLDivElement | null,
): ViewTransform {
  if (!img || !viewport) return view;
  const maxX = Math.max(0, (img.offsetWidth * view.zoom - viewport.clientWidth) / 2);
  const maxY = Math.max(0, (img.offsetHeight * view.zoom - viewport.clientHeight) / 2);
  return {
    ...view,
    panX: Math.min(maxX, Math.max(-maxX, view.panX)),
    panY: Math.min(maxY, Math.max(-maxY, view.panY)),
  };
}
