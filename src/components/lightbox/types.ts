export interface DragRect {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export interface ViewTransform {
  zoom: number;
  panX: number;
  panY: number;
}

export interface NormalizedCrop {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SelectionOverlay {
  left: number;
  top: number;
  width: number;
  height: number;
}
