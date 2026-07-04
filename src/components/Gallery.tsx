import { useEffect, useLayoutEffect, useRef, useCallback, useMemo, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ImageRecord, parseSearchValue, tileSizeForZoom, useGalleryStore } from '../store'
import { BulkActionBar } from './BulkActionBar'
import { ImageContextMenu } from './ImageContextMenu'
import { GalleryEmptyState, GalleryLoadingState } from './gallery/GalleryEmptyState'
import { ImageTile } from './gallery/ImageTile'

const GAP = 6

export function Gallery() {
  const images = useGalleryStore((state) => state.images)
  const loadMoreImages = useGalleryStore((state) => state.loadMoreImages)
  const openImage = useGalleryStore((state) => state.openImage)
  const totalImages = useGalleryStore((state) => state.totalImages)
  const loadingImages = useGalleryStore((state) => state.loadingImages)
  const zoomPreset = useGalleryStore((state) => state.zoomPreset)
  const search = useGalleryStore((state) => state.search)
  const collectionTitle = useGalleryStore((state) => state.collectionTitle)
  const imageLoadError = useGalleryStore((state) => state.imageLoadError)
  const galleryScrollResetKey = useGalleryStore((state) => state.galleryScrollResetKey)
  const isSimilarResults = collectionTitle === 'Similar Images'
  const parsedSearch = parseSearchValue(search)

  const parentRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    image: ImageRecord
  } | null>(null)

  useLayoutEffect(() => {
    const el = parentRef.current
    if (!el) return
    setContainerWidth(el.clientWidth)
    const ro = new ResizeObserver((entries) => {
      setContainerWidth(entries[0].contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const tileSize = tileSizeForZoom(zoomPreset)
  const cols = useMemo(
    () => Math.max(1, Math.floor((containerWidth - GAP) / (tileSize + GAP))),
    [containerWidth, tileSize]
  )
  const rowCount = Math.ceil(images.length / cols)

  const estimateSize = useCallback(() => tileSize + GAP, [tileSize])

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize,
    overscan: 3,
    paddingStart: GAP,
  })

  useEffect(() => {
    virtualizer.measure()
  }, [cols, virtualizer])

  useEffect(() => {
    parentRef.current?.scrollTo({ top: 0, left: 0 })
  }, [galleryScrollResetKey])

  const handleScroll = useCallback(() => {
    const el = parentRef.current
    if (!el) return
    if (el.scrollTop < 24) return
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 600
    if (nearBottom && !loadingImages && images.length < totalImages) {
      void loadMoreImages()
    }
  }, [images.length, loadMoreImages, loadingImages, totalImages])

  useEffect(() => {
    const el = parentRef.current
    if (!el) return
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={parentRef}
        className="absolute inset-0 overflow-x-hidden overflow-y-auto bg-gray-950"
      >
        {images.length === 0 && loadingImages ? (
          <GalleryLoadingState isSimilarResults={isSimilarResults} parsedSearch={parsedSearch} />
        ) : images.length === 0 && !loadingImages ? (
          <GalleryEmptyState
            imageLoadError={imageLoadError}
            isSimilarResults={isSimilarResults}
            parsedSearch={parsedSearch}
          />
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const startIndex = virtualRow.index * cols
              const rowImages = images.slice(startIndex, startIndex + cols)
              return (
                <div
                  key={virtualRow.key}
                  style={{
                    position: 'absolute',
                    top: virtualRow.start,
                    width: '100%',
                    height: virtualRow.size,
                    display: 'grid',
                    gridTemplateColumns: `repeat(${cols}, ${tileSize}px)`,
                    gap: GAP,
                    paddingLeft: GAP,
                    paddingRight: GAP,
                    paddingBottom: GAP,
                    boxSizing: 'border-box',
                  }}
                >
                  {rowImages.map((image) => (
                    <ImageTile
                      key={image.id}
                      image={image}
                      onClick={() => openImage(image)}
                      onContextMenu={(event) => {
                        event.preventDefault()
                        setContextMenu({ x: event.clientX, y: event.clientY, image })
                      }}
                    />
                  ))}
                </div>
              )
            })}
          </div>
        )}

        {images.length > 0 && loadingImages ? (
          <div className="flex justify-center py-8">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
          </div>
        ) : null}

        {contextMenu ? (
          <ImageContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            image={contextMenu.image}
            onClose={() => setContextMenu(null)}
          />
        ) : null}
      </div>

      {/* Pinned to the bottom of the gallery viewport — outside the scroll
          container so it stays put while the grid scrolls. */}
      <BulkActionBar />
    </div>
  )
}
