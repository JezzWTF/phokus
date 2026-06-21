import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useGalleryStore } from "../store";

const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
const CONTROLS_HIDE_DELAY_MS = 2500;
const SEEK_STEP_SECONDS = 5;
const VOLUME_STEP = 0.1;

// Session-wide playback preferences shared across player instances.
let persistedVolume = 1;
let persistedMuted = false;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface BufferedRange {
  start: number;
  end: number;
}

function ControlButton({ onClick, title, active = false, children }: {
  onClick: () => void;
  title: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      className={`rounded-md p-1.5 transition-colors ${active ? "text-white" : "text-gray-300 hover:text-white"} hover:bg-white/10`}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      title={title}
    >
      {children}
    </button>
  );
}

export function VideoPlayer({ src }: { src: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrubbingRef = useRef(false);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState<BufferedRange[]>([]);
  const [volume, setVolume] = useState(persistedVolume);
  const [muted, setMuted] = useState(
    () => useGalleryStore.getState().lightboxAutoMute || persistedMuted,
  );
  const [playbackRate, setPlaybackRate] = useState(1);
  const [loop, setLoop] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);

  const speedMenuOpenRef = useRef(speedMenuOpen);
  speedMenuOpenRef.current = speedMenuOpen;

  // ── Controls visibility ────────────────────────────────────────────────────
  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      const video = videoRef.current;
      if (video && !video.paused && !scrubbingRef.current && !speedMenuOpenRef.current) {
        setControlsVisible(false);
      }
    }, CONTROLS_HIDE_DELAY_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  // ── Video element wiring ───────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    // Read playback prefs fresh for each opened video — not reactive, so a
    // settings change applies to the next video rather than the current one.
    const { lightboxAutoplay, lightboxAutoMute } = useGalleryStore.getState();
    const startMuted = lightboxAutoMute || persistedMuted;
    video.volume = persistedVolume;
    video.muted = startMuted;
    setMuted(startMuted);
    // Autoplay when enabled; if the webview blocks it the catch leaves us paused
    // with controls visible, which is a fine fallback.
    if (lightboxAutoplay) video.play().catch(() => {});
  }, [src]);

  const readBuffered = useCallback(() => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return;
    const ranges: BufferedRange[] = [];
    for (let i = 0; i < video.buffered.length; i++) {
      ranges.push({
        start: video.buffered.start(i) / video.duration,
        end: video.buffered.end(i) / video.duration,
      });
    }
    setBuffered(ranges);
  }, []);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play().catch(() => {});
    } else {
      video.pause();
    }
    showControls();
  }, [showControls]);

  const seekBy = useCallback(
    (deltaSeconds: number) => {
      const video = videoRef.current;
      if (!video || !Number.isFinite(video.duration)) return;
      video.currentTime = Math.min(video.duration, Math.max(0, video.currentTime + deltaSeconds));
      showControls();
    },
    [showControls],
  );

  const applyVolume = useCallback(
    (nextVolume: number, nextMuted?: boolean) => {
      const video = videoRef.current;
      const clamped = Math.min(1, Math.max(0, nextVolume));
      setVolume(clamped);
      persistedVolume = clamped;
      if (nextMuted !== undefined) {
        setMuted(nextMuted);
        persistedMuted = nextMuted;
        if (video) video.muted = nextMuted;
      }
      if (video) video.volume = clamped;
      showControls();
    },
    [showControls],
  );

  const toggleMute = useCallback(() => {
    const next = !muted;
    setMuted(next);
    persistedMuted = next;
    const video = videoRef.current;
    if (video) video.muted = next;
    showControls();
  }, [muted, showControls]);

  const toggleLoop = useCallback(() => {
    setLoop((value) => {
      const video = videoRef.current;
      if (video) video.loop = !value;
      return !value;
    });
    showControls();
  }, [showControls]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else {
      void containerRef.current?.requestFullscreen().catch(() => {});
    }
    showControls();
  }, [showControls]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const setSpeed = useCallback(
    (rate: number) => {
      setPlaybackRate(rate);
      const video = videoRef.current;
      if (video) video.playbackRate = rate;
      setSpeedMenuOpen(false);
      showControls();
    },
    [showControls],
  );

  // ── Scrubber ───────────────────────────────────────────────────────────────
  const seekToPointer = useCallback((clientX: number) => {
    const video = videoRef.current;
    const track = trackRef.current;
    if (!video || !track || !Number.isFinite(video.duration) || video.duration <= 0) return;
    const bounds = track.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width));
    video.currentTime = fraction * video.duration;
    setCurrentTime(video.currentTime);
  }, []);

  const handleTrackPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      scrubbingRef.current = true;
      seekToPointer(event.clientX);
    },
    [seekToPointer],
  );

  const handleTrackPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!scrubbingRef.current) return;
      seekToPointer(event.clientX);
    },
    [seekToPointer],
  );

  const handleTrackPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.releasePointerCapture(event.pointerId);
    scrubbingRef.current = false;
  }, []);

  // ── Keyboard ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      switch (event.key) {
        case " ":
          event.preventDefault();
          togglePlay();
          break;
        case "m":
        case "M":
          toggleMute();
          break;
        case "f":
        case "F":
          toggleFullscreen();
          break;
        case "l":
        case "L":
          toggleLoop();
          break;
        case "ArrowLeft":
          if (event.shiftKey) {
            event.preventDefault();
            seekBy(-SEEK_STEP_SECONDS);
          }
          break;
        case "ArrowRight":
          if (event.shiftKey) {
            event.preventDefault();
            seekBy(SEEK_STEP_SECONDS);
          }
          break;
        case "ArrowUp":
          event.preventDefault();
          // Adjusting volume always unmutes, matching the slider behavior.
          applyVolume(persistedVolume + VOLUME_STEP, false);
          break;
        case "ArrowDown":
          event.preventDefault();
          applyVolume(persistedVolume - VOLUME_STEP, false);
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [togglePlay, toggleMute, toggleFullscreen, toggleLoop, seekBy, applyVolume]);

  const playedFraction = duration > 0 ? currentTime / duration : 0;
  const effectiveVolume = muted ? 0 : volume;

  return (
    <div
      ref={containerRef}
      className={`media-dark-surface relative flex h-full w-full items-center justify-center bg-black ${controlsVisible ? "" : "cursor-none"}`}
      onPointerMove={showControls}
      onClick={(event) => event.stopPropagation()}
    >
      <video
        ref={videoRef}
        src={src}
        className="h-full w-full object-contain"
        onClick={togglePlay}
        onDoubleClick={toggleFullscreen}
        onPlay={() => {
          setPlaying(true);
          showControls();
        }}
        onPause={() => {
          setPlaying(false);
          setControlsVisible(true);
        }}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => {
          setDuration(event.currentTarget.duration);
          readBuffered();
        }}
        onDurationChange={(event) => setDuration(event.currentTarget.duration)}
        onProgress={readBuffered}
      />

      <AnimatePresence>
        {controlsVisible ? (
          <motion.div
            className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-4 pb-2.5 pt-12"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {/* Scrubber */}
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
                    style={{ left: `${range.start * 100}%`, width: `${(range.end - range.start) * 100}%` }}
                  />
                ))}
                <div className="absolute inset-y-0 left-0 bg-white/90" style={{ width: `${playedFraction * 100}%` }} />
              </div>
              <div
                className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 rounded-full bg-white opacity-0 shadow transition-opacity group-hover/track:opacity-100"
                style={{ left: `${playedFraction * 100}%` }}
              />
            </div>

            {/* Control row */}
            <div className="mt-1 flex items-center gap-1.5">
              <ControlButton onClick={togglePlay} title={playing ? "Pause (Space)" : "Play (Space)"}>
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

              <span className="ml-1 text-xs tabular-nums text-gray-300">
                {formatTime(currentTime)} <span className="text-gray-500">/ {formatTime(duration)}</span>
              </span>

              <div className="flex-1" />

              {/* Volume */}
              <ControlButton onClick={toggleMute} title={muted ? "Unmute (M)" : "Mute (M)"}>
                {effectiveVolume === 0 ? (
                  <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 9l4 6m0-6l-4 6" />
                  </svg>
                ) : (
                  <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728" />
                  </svg>
                )}
              </ControlButton>
              <input
                type="range"
                min={0}
                max={1}
                step={0.02}
                value={effectiveVolume}
                className="h-1 w-20 cursor-pointer accent-white"
                onChange={(event) => applyVolume(parseFloat(event.target.value), false)}
                onClick={(event) => event.stopPropagation()}
                title="Volume (↑/↓)"
              />

              {/* Playback speed */}
              <div className="relative">
                <button
                  className={`min-w-12 rounded-md px-2 py-1.5 text-xs tabular-nums transition-colors hover:bg-white/10 ${playbackRate !== 1 ? "text-white" : "text-gray-300 hover:text-white"}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSpeedMenuOpen((value) => !value);
                  }}
                  title="Playback speed"
                >
                  {playbackRate}×
                </button>
                {speedMenuOpen ? (
                  <div className="absolute bottom-full right-0 z-20 mb-2 min-w-20 rounded-lg border border-white/10 bg-gray-950/95 p-1 shadow-2xl backdrop-blur">
                    {SPEED_OPTIONS.map((rate) => (
                      <button
                        key={rate}
                        className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-xs tabular-nums transition-colors ${
                          rate === playbackRate ? "bg-white/10 text-white" : "text-gray-400 hover:bg-white/5 hover:text-white"
                        }`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSpeed(rate);
                        }}
                      >
                        {rate}×
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              {/* Loop */}
              <ControlButton onClick={toggleLoop} title={loop ? "Loop on (L)" : "Loop off (L)"} active={loop}>
                <svg className={`h-4.5 w-4.5 ${loop ? "text-emerald-300" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M4 9a8 8 0 0114-3M20 15a8 8 0 01-14 3" />
                </svg>
              </ControlButton>

              {/* Fullscreen */}
              <ControlButton onClick={toggleFullscreen} title={fullscreen ? "Exit fullscreen (F)" : "Fullscreen (F)"}>
                {fullscreen ? (
                  <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 9H4m5 0V4m6 5h5m-5 0V4M9 15H4m5 0v5m6-5h5m-5 0v5" />
                  </svg>
                ) : (
                  <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4" />
                  </svg>
                )}
              </ControlButton>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
