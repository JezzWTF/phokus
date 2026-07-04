import { useCallback, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useGalleryStore } from '../store'
import { LightboxDetailsPanel } from './lightbox/LightboxDetailsPanel'
import { LightboxNavButton } from './lightbox/LightboxNavButton'
import { LightboxViewport } from './lightbox/LightboxViewport'
import { SlideshowView } from './lightbox/SlideshowView'
import { useLightboxMediaDetails } from './lightbox/useLightboxMediaDetails'
import { useLightboxNavigation } from './lightbox/useLightboxNavigation'
import { useRegionSelection } from './lightbox/useRegionSelection'
import { useSlideshow } from './lightbox/useSlideshow'
import { ViewTransform } from './lightbox/types'
import { IDENTITY_VIEW } from './lightbox/viewTransform'

export function Lightbox() {
  const selectedImage = useGalleryStore((state) => state.selectedImage)
  const closeImage = useGalleryStore((state) => state.closeImage)
  const images = useGalleryStore((state) => state.images)
  const openImage = useGalleryStore((state) => state.openImage)
  const findSimilar = useGalleryStore((state) => state.findSimilar)
  const findSimilarByRegion = useGalleryStore((state) => state.findSimilarByRegion)
  const updateImageDetails = useGalleryStore((state) => state.updateImageDetails)
  const getImageTags = useGalleryStore((state) => state.getImageTags)
  const addUserTag = useGalleryStore((state) => state.addUserTag)
  const removeTag = useGalleryStore((state) => state.removeTag)
  const taggerModelStatus = useGalleryStore((state) => state.taggerModelStatus)
  const loadTaggerModelStatus = useGalleryStore((state) => state.loadTaggerModelStatus)
  const queueTaggingForImage = useGalleryStore((state) => state.queueTaggingForImage)
  const albums = useGalleryStore((state) => state.albums)
  const addToAlbum = useGalleryStore((state) => state.addToAlbum)
  const createAlbum = useGalleryStore((state) => state.createAlbum)
  const getImageExif = useGalleryStore((state) => state.getImageExif)
  const loadMoreImages = useGalleryStore((state) => state.loadMoreImages)
  const loadedCount = useGalleryStore((state) => state.loadedCount)
  const totalImages = useGalleryStore((state) => state.totalImages)
  const slideshowIntervalSeconds = useGalleryStore((state) => state.slideshowIntervalSeconds)
  const slideshowOrder = useGalleryStore((state) => state.slideshowOrder)
  const slideshowTransition = useGalleryStore((state) => state.slideshowTransition)

  const lightboxRootRef = useRef<HTMLDivElement>(null)
  const imageViewportRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [view, setView] = useState<ViewTransform>(IDENTITY_VIEW)

  const currentIndex = selectedImage
    ? images.findIndex((image) => image.id === selectedImage.id)
    : -1
  const canFindSimilar = selectedImage?.embedding_status === 'ready'
  const canSearchRegion = canFindSimilar && selectedImage?.media_kind === 'image'
  const taggerReady = taggerModelStatus?.ready ?? false
  const taggerStatusKnown = taggerModelStatus !== null
  const taggerButtonTooltip = !taggerStatusKnown
    ? 'Checking AI tagger model...'
    : taggerReady
      ? 'Queue AI tagging for this image'
      : 'AI tagger model not installed'

  const region = useRegionSelection({
    selectedImage,
    slideshowActive: false,
    imageViewportRef,
    imgRef,
    view,
    setView,
    findSimilarByRegion,
  })

  const slideshow = useSlideshow({
    rootRef: lightboxRootRef,
    selectedImage,
    images,
    currentIndex,
    loadedCount,
    totalImages,
    intervalSeconds: slideshowIntervalSeconds,
    order: slideshowOrder,
    transition: slideshowTransition,
    openImage,
    loadMoreImages,
    exitRegionMode: region.exitRegionMode,
    setView,
  })

  const resetForSelectedImage = useCallback(() => {
    setView(IDENTITY_VIEW)
    region.exitRegionMode()
    region.setRegionSearching(false)
  }, [region.exitRegionMode, region.setRegionSearching])

  const details = useLightboxMediaDetails({
    selectedImage,
    taggerModelStatus,
    getImageTags,
    getImageExif,
    loadTaggerModelStatus,
    onSelectedImageReset: resetForSelectedImage,
  })

  const { goPrev, goNext } = useLightboxNavigation({
    selectedImage,
    images,
    currentIndex,
    slideshowActive: slideshow.active,
    regionSelectMode: region.regionSelectMode,
    closeImage,
    exitRegionMode: region.exitRegionMode,
    exitSlideshow: slideshow.exit,
    goSlideshow: slideshow.go,
    showSlideshowControls: slideshow.showControls,
    setSlideshowPaused: slideshow.setPaused,
    openImage,
    setView,
    clampPan: region.clampPan,
  })

  const toggleRegionMode = useCallback(() => {
    if (region.regionSelectMode) {
      region.exitRegionMode()
    } else {
      region.setRegionSelectMode(true)
    }
  }, [region.exitRegionMode, region.regionSelectMode, region.setRegionSelectMode])

  return (
    <AnimatePresence>
      {selectedImage ? (
        <motion.div
          ref={lightboxRootRef}
          key="lightbox"
          className={`media-dark-surface fixed inset-0 z-50 flex ${
            slideshow.active ? 'bg-black' : 'bg-black/90 backdrop-blur-sm'
          }`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={
            slideshow.active
              ? slideshow.showControls
              : region.regionSelectMode
                ? undefined
                : closeImage
          }
        >
          {slideshow.active ? (
            <SlideshowView
              selectedImage={selectedImage}
              imageCount={slideshow.images.length}
              position={slideshow.position}
              controlsShown={slideshow.controlsShown}
              paused={slideshow.paused}
              loadingMore={slideshow.loadingMore}
              motionConfig={slideshow.motionConfig}
              onPointerMove={slideshow.handlePointerMove}
              onShowControls={slideshow.showControls}
              onExit={slideshow.exit}
              onGo={slideshow.go}
              onTogglePaused={() => slideshow.setPaused((paused) => !paused)}
            />
          ) : (
            <>
              <LightboxNavButton
                direction="previous"
                disabled={currentIndex <= 0 || region.regionSelectMode}
                onClick={goPrev}
              />

              <div className="flex flex-1 flex-col" onClick={(event) => event.stopPropagation()}>
                <div className="flex flex-1 overflow-hidden">
                  <LightboxViewport
                    selectedImage={selectedImage}
                    imageViewportRef={imageViewportRef}
                    imgRef={imgRef}
                    view={view}
                    zoom={view.zoom}
                    regionSelectMode={region.regionSelectMode}
                    isPanning={region.isPanning}
                    selectionOverlay={region.selectionOverlay}
                    canStartSlideshow={slideshow.canStart}
                    onStartSlideshow={slideshow.start}
                    onPointerDown={region.handlePointerDown}
                    onPointerMove={region.handlePointerMove}
                    onPointerUp={region.handlePointerUp}
                    setView={setView}
                    clampPan={region.clampPan}
                  />

                  <LightboxDetailsPanel
                    selectedImage={selectedImage}
                    currentIndex={currentIndex}
                    imageCount={images.length}
                    imageTags={details.imageTags}
                    setImageTags={details.setImageTags}
                    imageExif={details.imageExif}
                    tagInput={details.tagInput}
                    setTagInput={details.setTagInput}
                    tagAdding={details.tagAdding}
                    setTagAdding={details.setTagAdding}
                    tagsExpanded={details.tagsExpanded}
                    setTagsExpanded={details.setTagsExpanded}
                    taggingQueued={details.taggingQueued}
                    setTaggingQueued={details.setTaggingQueued}
                    currentImageIdRef={details.currentImageIdRef}
                    albums={albums}
                    canFindSimilar={canFindSimilar}
                    canSearchRegion={canSearchRegion}
                    regionSelectMode={region.regionSelectMode}
                    regionSearching={region.regionSearching}
                    taggerReady={taggerReady}
                    taggerButtonTooltip={taggerButtonTooltip}
                    closeImage={closeImage}
                    findSimilar={findSimilar}
                    updateImageDetails={updateImageDetails}
                    addUserTag={addUserTag}
                    removeTag={removeTag}
                    queueTaggingForImage={queueTaggingForImage}
                    addToAlbum={addToAlbum}
                    createAlbum={createAlbum}
                    onToggleRegionMode={toggleRegionMode}
                  />
                </div>
              </div>

              <LightboxNavButton
                direction="next"
                disabled={currentIndex >= images.length - 1 || region.regionSelectMode}
                onClick={goNext}
              />
            </>
          )}
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
