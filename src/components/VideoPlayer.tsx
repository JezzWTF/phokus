import { VideoControls } from "./videoPlayer/VideoControls";
import { useVideoPlayer } from "./videoPlayer/useVideoPlayer";

export function VideoPlayer({ src }: { src: string }) {
  const player = useVideoPlayer(src);

  return (
    <div
      ref={player.containerRef}
      className={`media-dark-surface relative flex h-full w-full items-center justify-center bg-black ${player.controlsVisible ? "" : "cursor-none"}`}
      onPointerMove={player.showControls}
      onClick={(event) => event.stopPropagation()}
    >
      <video
        ref={player.videoRef}
        src={src}
        className="h-full w-full object-contain"
        onClick={player.togglePlay}
        onDoubleClick={player.toggleFullscreen}
        onPlay={() => {
          player.setPlaying(true);
          player.showControls();
        }}
        onPause={() => {
          player.setPlaying(false);
          player.setControlsVisible(true);
        }}
        onTimeUpdate={(event) => player.setCurrentTime(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => {
          player.setDuration(event.currentTarget.duration);
          player.readBuffered();
        }}
        onDurationChange={(event) => player.setDuration(event.currentTarget.duration)}
        onProgress={player.readBuffered}
      />

      <VideoControls
        applyVolume={player.applyVolume}
        buffered={player.buffered}
        controlsVisible={player.controlsVisible}
        currentTime={player.currentTime}
        duration={player.duration}
        effectiveVolume={player.effectiveVolume}
        fullscreen={player.fullscreen}
        handleTrackPointerDown={player.handleTrackPointerDown}
        handleTrackPointerMove={player.handleTrackPointerMove}
        handleTrackPointerUp={player.handleTrackPointerUp}
        loop={player.loop}
        muted={player.muted}
        playbackRate={player.playbackRate}
        playedFraction={player.playedFraction}
        playing={player.playing}
        setSpeed={player.setSpeed}
        setSpeedMenuOpen={player.setSpeedMenuOpen}
        speedMenuOpen={player.speedMenuOpen}
        toggleFullscreen={player.toggleFullscreen}
        toggleLoop={player.toggleLoop}
        toggleMute={player.toggleMute}
        togglePlay={player.togglePlay}
        trackRef={player.trackRef}
      />
    </div>
  );
}
