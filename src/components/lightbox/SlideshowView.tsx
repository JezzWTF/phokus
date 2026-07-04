import { AnimatePresence, motion } from 'framer-motion'
import { ImageRecord } from '../../store'
import { mediaSrc } from '../../lib/mediaSrc'
import { Tooltip } from '../Tooltip'
import { ChevronRightIcon, CloseIcon } from '../icons'
import { SlideshowMotion } from './useSlideshow'

interface SlideshowViewProps {
  selectedImage: ImageRecord
  imageCount: number
  position: number
  controlsShown: boolean
  paused: boolean
  loadingMore: boolean
  motionConfig: SlideshowMotion
  onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void
  onShowControls: () => void
  onExit: () => void
  onGo: (direction: -1 | 1) => void
  onTogglePaused: () => void
}

export function SlideshowView({
  selectedImage,
  imageCount,
  position,
  controlsShown,
  paused,
  loadingMore,
  motionConfig,
  onPointerMove,
  onShowControls,
  onExit,
  onGo,
  onTogglePaused,
}: SlideshowViewProps) {
  return (
    <div
      className={`relative flex h-full w-full items-center justify-center overflow-hidden bg-black ${
        controlsShown ? '' : 'cursor-none'
      }`}
      onClick={(event) => {
        event.stopPropagation()
        onShowControls()
      }}
      onPointerMove={onPointerMove}
    >
      <AnimatePresence initial={false}>
        {selectedImage.media_kind === 'image' ? (
          <motion.div
            key={selectedImage.id}
            className="absolute inset-0 flex items-center justify-center"
            initial={motionConfig.imageInitial}
            animate={motionConfig.imageAnimate}
            exit={motionConfig.imageExit}
            transition={motionConfig.imageTransition}
          >
            <motion.img
              src={mediaSrc(selectedImage.path) ?? ''}
              alt={selectedImage.filename}
              className="max-h-full max-w-full object-contain"
              draggable={false}
              initial={motionConfig.contentInitial}
              animate={motionConfig.contentAnimate}
              transition={motionConfig.contentTransition}
            />
          </motion.div>
        ) : (
          <motion.div
            key="slideshow-waiting"
            className="text-sm text-gray-500"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            Finding next image…
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-5"
        initial={false}
        animate={{ opacity: controlsShown ? 1 : 0, y: controlsShown ? 0 : -6 }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="max-w-[60vw] rounded-full border border-white/10 bg-black/45 px-3 py-1.5 text-xs whitespace-nowrap text-gray-300 shadow-2xl shadow-black/30 backdrop-blur-md">
          <span className="font-medium text-white">{position}</span>
          <span className="mx-1 text-gray-600">/</span>
          <span>{imageCount}</span>
          <span className="mx-2 text-gray-700">•</span>
          <span className="inline-block max-w-[42vw] truncate align-bottom text-gray-400">
            {selectedImage.filename}
          </span>
        </div>
        <Tooltip label="Exit slideshow" followCursor>
          <button
            aria-label="Exit slideshow"
            className="pointer-events-auto rounded-full border border-white/10 bg-black/45 p-2 text-gray-300 shadow-2xl shadow-black/30 backdrop-blur-md transition-colors hover:bg-white/10 hover:text-white"
            onClick={(event) => {
              event.stopPropagation()
              onExit()
            }}
          >
            <CloseIcon className="h-4 w-4" strokeWidth={1.8} />
          </button>
        </Tooltip>
      </motion.div>

      <motion.div
        className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-center p-6"
        initial={false}
        animate={{ opacity: controlsShown ? 1 : 0, y: controlsShown ? 0 : 8 }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-white/10 bg-black/50 p-1.5 shadow-2xl shadow-black/30 backdrop-blur-md">
          <Tooltip label="Previous image" followCursor>
            <button
              aria-label="Previous image"
              className="rounded-full p-2 text-gray-300 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
              disabled={imageCount <= 1}
              onClick={(event) => {
                event.stopPropagation()
                onGo(-1)
              }}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.8}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
          </Tooltip>
          <Tooltip label={paused ? 'Resume slideshow' : 'Pause slideshow'} followCursor>
            <button
              aria-label={paused ? 'Resume slideshow' : 'Pause slideshow'}
              className="rounded-full border border-white/10 bg-white/10 p-2.5 text-white transition-colors hover:bg-white/15"
              onClick={(event) => {
                event.stopPropagation()
                onTogglePaused()
                onShowControls()
              }}
            >
              {paused ? (
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5.14v13.72a1 1 0 001.52.86l10.55-6.86a1 1 0 000-1.72L9.52 4.28A1 1 0 008 5.14z" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M7 5a1 1 0 00-1 1v12a1 1 0 001 1h2a1 1 0 001-1V6a1 1 0 00-1-1H7zM15 5a1 1 0 00-1 1v12a1 1 0 001 1h2a1 1 0 001-1V6a1 1 0 00-1-1h-2z" />
                </svg>
              )}
            </button>
          </Tooltip>
          <Tooltip label="Next image" followCursor>
            <button
              aria-label="Next image"
              className="rounded-full p-2 text-gray-300 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
              disabled={imageCount <= 1}
              onClick={(event) => {
                event.stopPropagation()
                onGo(1)
              }}
            >
              <ChevronRightIcon className="h-5 w-5" strokeWidth={1.8} />
            </button>
          </Tooltip>
        </div>
      </motion.div>

      {loadingMore ? (
        <div className="pointer-events-none absolute right-6 bottom-6 rounded-full border border-white/10 bg-black/45 px-3 py-1.5 text-xs text-gray-500 backdrop-blur-md">
          Loading more…
        </div>
      ) : null}
    </div>
  )
}
