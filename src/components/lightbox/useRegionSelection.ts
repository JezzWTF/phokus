import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react'
import { ImageRecord } from '../../store'
import { DragRect, ViewTransform } from './types'
import {
  clampPanToViewport,
  MIN_SELECTION_FRACTION,
  normaliseRect,
  rectToNormalisedCrop,
  zoomViewAt,
} from './viewTransform'

interface UseRegionSelectionParams {
  selectedImage: ImageRecord | null
  slideshowActive: boolean
  imageViewportRef: RefObject<HTMLDivElement | null>
  imgRef: RefObject<HTMLImageElement | null>
  view: ViewTransform
  setView: Dispatch<SetStateAction<ViewTransform>>
  findSimilarByRegion: (
    imageId: number,
    crop: { x: number; y: number; w: number; h: number },
    sourceFolderId: number | null
  ) => Promise<void>
}

export function useRegionSelection({
  selectedImage,
  slideshowActive,
  imageViewportRef,
  imgRef,
  view,
  setView,
  findSimilarByRegion,
}: UseRegionSelectionParams) {
  const [regionSelectMode, setRegionSelectMode] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [dragRect, setDragRect] = useState<DragRect | null>(null)
  const [regionSearching, setRegionSearching] = useState(false)
  const lastPanPointRef = useRef({ x: 0, y: 0 })

  const clampPan = useCallback(
    (nextView: ViewTransform): ViewTransform =>
      clampPanToViewport(nextView, imgRef.current, imageViewportRef.current),
    [imageViewportRef, imgRef]
  )

  const exitRegionMode = useCallback(() => {
    setRegionSelectMode(false)
    setIsDragging(false)
    setDragRect(null)
  }, [])

  useEffect(() => {
    const viewport = imageViewportRef.current
    if (!viewport || !selectedImage || selectedImage.media_kind !== 'image' || slideshowActive)
      return

    const handleWheel = (event: WheelEvent) => {
      if (regionSelectMode) return
      if (!event.ctrlKey && Math.abs(event.deltaY) < Math.abs(event.deltaX)) return
      event.preventDefault()
      const bounds = viewport.getBoundingClientRect()
      const anchorX = event.clientX - (bounds.left + bounds.width / 2)
      const anchorY = event.clientY - (bounds.top + bounds.height / 2)
      setView((currentView) => {
        const delta = event.deltaY < 0 ? 0.15 : -0.15
        const next = Math.min(4, Math.max(0.5, currentView.zoom + delta))
        return clampPan(zoomViewAt(currentView, next, anchorX, anchorY))
      })
    }

    viewport.addEventListener('wheel', handleWheel, { passive: false })
    return () => viewport.removeEventListener('wheel', handleWheel)
  }, [clampPan, imageViewportRef, regionSelectMode, selectedImage, setView, slideshowActive])

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!regionSelectMode) {
        if (view.zoom > 1 && event.button === 0 && selectedImage?.media_kind === 'image') {
          event.preventDefault()
          event.currentTarget.setPointerCapture(event.pointerId)
          lastPanPointRef.current = { x: event.clientX, y: event.clientY }
          setIsPanning(true)
        }
        return
      }
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      setIsDragging(true)
      setDragRect({
        startX: event.clientX,
        startY: event.clientY,
        endX: event.clientX,
        endY: event.clientY,
      })
    },
    [regionSelectMode, selectedImage?.media_kind, view.zoom]
  )

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (isPanning) {
        const dx = event.clientX - lastPanPointRef.current.x
        const dy = event.clientY - lastPanPointRef.current.y
        lastPanPointRef.current = { x: event.clientX, y: event.clientY }
        setView((currentView) =>
          clampPan({ ...currentView, panX: currentView.panX + dx, panY: currentView.panY + dy })
        )
        return
      }
      if (!isDragging) return
      setDragRect((prev) => (prev ? { ...prev, endX: event.clientX, endY: event.clientY } : null))
    },
    [clampPan, isDragging, isPanning, setView]
  )

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (isPanning) {
        event.currentTarget.releasePointerCapture(event.pointerId)
        setIsPanning(false)
        return
      }
      if (!isDragging || !dragRect || !selectedImage || !imgRef.current) {
        setIsDragging(false)
        return
      }
      event.currentTarget.releasePointerCapture(event.pointerId)

      const finalRect: DragRect = { ...dragRect, endX: event.clientX, endY: event.clientY }
      const crop = rectToNormalisedCrop(finalRect, imgRef.current)

      setIsDragging(false)
      setDragRect(null)

      const containerBounds = imageViewportRef.current?.getBoundingClientRect()
      const containerSize = containerBounds
        ? Math.min(containerBounds.width, containerBounds.height)
        : 500
      const selW = Math.abs(finalRect.endX - finalRect.startX)
      const selH = Math.abs(finalRect.endY - finalRect.startY)
      if (
        !crop ||
        selW < containerSize * MIN_SELECTION_FRACTION ||
        selH < containerSize * MIN_SELECTION_FRACTION
      ) {
        exitRegionMode()
        return
      }

      exitRegionMode()
      setRegionSearching(true)

      void findSimilarByRegion(selectedImage.id, crop, selectedImage.folder_id).finally(() =>
        setRegionSearching(false)
      )
    },
    [
      dragRect,
      exitRegionMode,
      findSimilarByRegion,
      imageViewportRef,
      imgRef,
      isDragging,
      isPanning,
      selectedImage,
    ]
  )

  return {
    regionSelectMode,
    setRegionSelectMode,
    isPanning,
    regionSearching,
    setRegionSearching,
    exitRegionMode,
    clampPan,
    selectionOverlay: isDragging && dragRect ? normaliseRect(dragRect) : null,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  }
}
