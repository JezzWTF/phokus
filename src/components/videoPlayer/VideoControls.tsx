import { AnimatePresence, motion } from 'framer-motion'
import { Tooltip } from '../Tooltip'
import { SPEED_OPTIONS } from './constants'
import { ControlButton } from './ControlButton'
import { formatTime } from './format'
import { BufferedRange } from './types'

export function VideoControls({
  applyVolume,
  buffered,
  controlsVisible,
  currentTime,
  duration,
  effectiveVolume,
  fullscreen,
  handleTrackPointerDown,
  handleTrackPointerMove,
  handleTrackPointerUp,
  loop,
  muted,
  playbackRate,
  playedFraction,
  playing,
  setSpeed,
  setSpeedMenuOpen,
  speedMenuOpen,
  toggleFullscreen,
  toggleLoop,
  toggleMute,
  togglePlay,
  trackRef,
}: {
  applyVolume: (nextVolume: number, nextMuted?: boolean) => void
  buffered: BufferedRange[]
  controlsVisible: boolean
  currentTime: number
  duration: number
  effectiveVolume: number
  fullscreen: boolean
  handleTrackPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void
  handleTrackPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void
  handleTrackPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void
  loop: boolean
  muted: boolean
  playbackRate: number
  playedFraction: number
  playing: boolean
  setSpeed: (rate: number) => void
  setSpeedMenuOpen: (value: boolean | ((current: boolean) => boolean)) => void
  speedMenuOpen: boolean
  toggleFullscreen: () => void
  toggleLoop: () => void
  toggleMute: () => void
  togglePlay: () => void
  trackRef: React.RefObject<HTMLDivElement | null>
}) {
  return (
    <AnimatePresence>
      {controlsVisible ? (
        <motion.div
          className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-4 pt-12 pb-2.5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <div
            ref={trackRef}
            className="group/track relative flex h-4 cursor-pointer items-center"
            onPointerDown={handleTrackPointerDown}
            onPointerMove={handleTrackPointerMove}
            onPointerUp={handleTrackPointerUp}
          >
            <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/15 transition-[height] group-hover/track:h-1.5">
              {buffered.map((range, index) => (
                <div
                  key={index}
                  className="absolute inset-y-0 bg-white/20"
                  style={{
                    left: `${range.start * 100}%`,
                    width: `${(range.end - range.start) * 100}%`,
                  }}
                />
              ))}
              <div
                className="absolute inset-y-0 left-0 bg-white/90"
                style={{ width: `${playedFraction * 100}%` }}
              />
            </div>
            <div
              className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 rounded-full bg-white opacity-0 shadow transition-opacity group-hover/track:opacity-100"
              style={{ left: `${playedFraction * 100}%` }}
            />
          </div>

          <div className="mt-1 flex items-center gap-1.5">
            <ControlButton onClick={togglePlay} label={playing ? 'Pause (Space)' : 'Play (Space)'}>
              {playing ? (
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5.14v13.72L19 12 8 5.14z" />
                </svg>
              )}
            </ControlButton>

            <span className="ml-1 text-xs text-gray-300 tabular-nums">
              {formatTime(currentTime)}{' '}
              <span className="text-gray-500">/ {formatTime(duration)}</span>
            </span>

            <div className="flex-1" />

            <ControlButton onClick={toggleMute} label={muted ? 'Unmute (M)' : 'Mute (M)'}>
              {effectiveVolume === 0 ? (
                <svg
                  className="h-4.5 w-4.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                  />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 9l4 6m0-6l-4 6" />
                </svg>
              ) : (
                <svg
                  className="h-4.5 w-4.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728"
                  />
                </svg>
              )}
            </ControlButton>
            <Tooltip label="Volume (↑/↓)" anchorToCursor>
              <input
                type="range"
                min={0}
                max={1}
                step={0.02}
                value={effectiveVolume}
                className="h-1 w-20 cursor-pointer accent-white"
                onChange={(event) => applyVolume(parseFloat(event.target.value), false)}
                onClick={(event) => event.stopPropagation()}
              />
            </Tooltip>

            <div className="relative">
              <Tooltip label="Playback speed" anchorToCursor>
                <button
                  className={`min-w-12 rounded-md px-2 py-1.5 text-xs tabular-nums transition-colors hover:bg-white/10 ${playbackRate !== 1 ? 'text-white' : 'text-gray-300 hover:text-white'}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    setSpeedMenuOpen((value) => !value)
                  }}
                >
                  {playbackRate}×
                </button>
              </Tooltip>
              {speedMenuOpen ? (
                <div className="absolute right-0 bottom-full z-20 mb-2 min-w-20 rounded-lg border border-white/10 bg-gray-950/95 p-1 shadow-2xl backdrop-blur">
                  {SPEED_OPTIONS.map((rate) => (
                    <button
                      key={rate}
                      className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-xs tabular-nums transition-colors ${
                        rate === playbackRate
                          ? 'bg-white/10 text-white'
                          : 'text-gray-400 hover:bg-white/5 hover:text-white'
                      }`}
                      onClick={(event) => {
                        event.stopPropagation()
                        setSpeed(rate)
                      }}
                    >
                      {rate}×
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <ControlButton
              onClick={toggleLoop}
              label={loop ? 'Loop on (L)' : 'Loop off (L)'}
              active={loop}
            >
              <svg
                className={`h-4.5 w-4.5 ${loop ? 'text-emerald-300' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 4v5h5M20 20v-5h-5M4 9a8 8 0 0114-3M20 15a8 8 0 01-14 3"
                />
              </svg>
            </ControlButton>

            <ControlButton
              onClick={toggleFullscreen}
              label={fullscreen ? 'Exit fullscreen (F)' : 'Fullscreen (F)'}
            >
              {fullscreen ? (
                <svg
                  className="h-4.5 w-4.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 9H4m5 0V4m6 5h5m-5 0V4M9 15H4m5 0v5m6-5h5m-5 0v5"
                  />
                </svg>
              ) : (
                <svg
                  className="h-4.5 w-4.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4"
                  />
                </svg>
              )}
            </ControlButton>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
