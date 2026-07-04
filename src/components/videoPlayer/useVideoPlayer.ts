import { useCallback, useEffect, useRef, useState } from 'react'
import { useGalleryStore } from '../../store'
import { CONTROLS_HIDE_DELAY_MS, SEEK_STEP_SECONDS, VOLUME_STEP } from './constants'
import {
  getPersistedMuted,
  getPersistedVolume,
  setPersistedMuted,
  setPersistedVolume,
} from './playbackPrefs'
import { BufferedRange } from './types'

export function useVideoPlayer(src: string) {
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scrubbingRef = useRef(false)

  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [buffered, setBuffered] = useState<BufferedRange[]>([])
  const [volume, setVolume] = useState(getPersistedVolume)
  const [muted, setMuted] = useState(
    () => useGalleryStore.getState().lightboxAutoMute || getPersistedMuted()
  )
  const [playbackRate, setPlaybackRate] = useState(1)
  const [loop, setLoop] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false)

  const speedMenuOpenRef = useRef(speedMenuOpen)
  speedMenuOpenRef.current = speedMenuOpen

  const showControls = useCallback(() => {
    setControlsVisible(true)
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => {
      const video = videoRef.current
      if (video && !video.paused && !scrubbingRef.current && !speedMenuOpenRef.current) {
        setControlsVisible(false)
      }
    }, CONTROLS_HIDE_DELAY_MS)
  }, [])

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const { lightboxAutoplay, lightboxAutoMute } = useGalleryStore.getState()
    const startMuted = lightboxAutoMute || getPersistedMuted()
    video.volume = getPersistedVolume()
    video.muted = startMuted
    setMuted(startMuted)
    if (lightboxAutoplay) video.play().catch(() => {})
  }, [src])

  const readBuffered = useCallback(() => {
    const video = videoRef.current
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return
    const ranges: BufferedRange[] = []
    for (let i = 0; i < video.buffered.length; i++) {
      ranges.push({
        start: video.buffered.start(i) / video.duration,
        end: video.buffered.end(i) / video.duration,
      })
    }
    setBuffered(ranges)
  }, [])

  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      void video.play().catch(() => {})
    } else {
      video.pause()
    }
    showControls()
  }, [showControls])

  const seekBy = useCallback(
    (deltaSeconds: number) => {
      const video = videoRef.current
      if (!video || !Number.isFinite(video.duration)) return
      video.currentTime = Math.min(video.duration, Math.max(0, video.currentTime + deltaSeconds))
      showControls()
    },
    [showControls]
  )

  const applyVolume = useCallback(
    (nextVolume: number, nextMuted?: boolean) => {
      const video = videoRef.current
      const clamped = Math.min(1, Math.max(0, nextVolume))
      setVolume(clamped)
      setPersistedVolume(clamped)
      if (nextMuted !== undefined) {
        setMuted(nextMuted)
        setPersistedMuted(nextMuted)
        if (video) video.muted = nextMuted
      }
      if (video) video.volume = clamped
      showControls()
    },
    [showControls]
  )

  const toggleMute = useCallback(() => {
    const next = !muted
    setMuted(next)
    setPersistedMuted(next)
    const video = videoRef.current
    if (video) video.muted = next
    showControls()
  }, [muted, showControls])

  const toggleLoop = useCallback(() => {
    setLoop((value) => {
      const video = videoRef.current
      if (video) video.loop = !value
      return !value
    })
    showControls()
  }, [showControls])

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {})
    } else {
      void containerRef.current?.requestFullscreen().catch(() => {})
    }
    showControls()
  }, [showControls])

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement !== null)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const setSpeed = useCallback(
    (rate: number) => {
      setPlaybackRate(rate)
      const video = videoRef.current
      if (video) video.playbackRate = rate
      setSpeedMenuOpen(false)
      showControls()
    },
    [showControls]
  )

  const seekToPointer = useCallback((clientX: number) => {
    const video = videoRef.current
    const track = trackRef.current
    if (!video || !track || !Number.isFinite(video.duration) || video.duration <= 0) return
    const bounds = track.getBoundingClientRect()
    const fraction = Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width))
    video.currentTime = fraction * video.duration
    setCurrentTime(video.currentTime)
  }, [])

  const handleTrackPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.stopPropagation()
      event.currentTarget.setPointerCapture(event.pointerId)
      scrubbingRef.current = true
      seekToPointer(event.clientX)
    },
    [seekToPointer]
  )

  const handleTrackPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!scrubbingRef.current) return
      seekToPointer(event.clientX)
    },
    [seekToPointer]
  )

  const handleTrackPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.releasePointerCapture(event.pointerId)
    scrubbingRef.current = false
  }, [])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return
      }
      switch (event.key) {
        case ' ':
          event.preventDefault()
          togglePlay()
          break
        case 'm':
        case 'M':
          toggleMute()
          break
        case 'f':
        case 'F':
          toggleFullscreen()
          break
        case 'l':
        case 'L':
          toggleLoop()
          break
        case 'ArrowLeft':
          if (event.shiftKey) {
            event.preventDefault()
            seekBy(-SEEK_STEP_SECONDS)
          }
          break
        case 'ArrowRight':
          if (event.shiftKey) {
            event.preventDefault()
            seekBy(SEEK_STEP_SECONDS)
          }
          break
        case 'ArrowUp':
          event.preventDefault()
          applyVolume(getPersistedVolume() + VOLUME_STEP, false)
          break
        case 'ArrowDown':
          event.preventDefault()
          applyVolume(getPersistedVolume() - VOLUME_STEP, false)
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [togglePlay, toggleMute, toggleFullscreen, toggleLoop, seekBy, applyVolume])

  const playedFraction = duration > 0 ? currentTime / duration : 0
  const effectiveVolume = muted ? 0 : volume

  return {
    applyVolume,
    buffered,
    containerRef,
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
    readBuffered,
    setControlsVisible,
    setCurrentTime,
    setDuration,
    setPlaying,
    setSpeed,
    setSpeedMenuOpen,
    showControls,
    speedMenuOpen,
    toggleFullscreen,
    toggleLoop,
    toggleMute,
    togglePlay,
    trackRef,
    videoRef,
  }
}
