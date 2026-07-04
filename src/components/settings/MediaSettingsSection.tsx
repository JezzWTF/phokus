import { Dropdown } from '../menu'
import { useGalleryStore } from '../../store'
import { SettingsGroup, SettingsItem } from './shared'

export function MediaSettingsSection() {
  const lightboxAutoplay = useGalleryStore((state) => state.lightboxAutoplay)
  const setLightboxAutoplay = useGalleryStore((state) => state.setLightboxAutoplay)
  const lightboxAutoMute = useGalleryStore((state) => state.lightboxAutoMute)
  const setLightboxAutoMute = useGalleryStore((state) => state.setLightboxAutoMute)
  const slideshowIntervalSeconds = useGalleryStore((state) => state.slideshowIntervalSeconds)
  const setSlideshowIntervalSeconds = useGalleryStore((state) => state.setSlideshowIntervalSeconds)
  const slideshowOrder = useGalleryStore((state) => state.slideshowOrder)
  const setSlideshowOrder = useGalleryStore((state) => state.setSlideshowOrder)
  const slideshowTransition = useGalleryStore((state) => state.slideshowTransition)
  const setSlideshowTransition = useGalleryStore((state) => state.setSlideshowTransition)

  return (
    <div className="mt-8 space-y-9">
      <SettingsGroup title="Video playback">
        <SettingsItem
          label="Autoplay in lightbox"
          description="Start playing videos automatically when opened in the lightbox."
        >
          <button
            role="switch"
            aria-checked={lightboxAutoplay}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${lightboxAutoplay ? 'bg-sky-500' : 'bg-white/15'}`}
            onClick={() => setLightboxAutoplay(!lightboxAutoplay)}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${lightboxAutoplay ? 'translate-x-4' : 'translate-x-0'}`}
            />
          </button>
        </SettingsItem>
        <SettingsItem
          label="Start muted"
          description="Open videos with their audio muted — unmute from the player controls."
        >
          <button
            role="switch"
            aria-checked={lightboxAutoMute}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${lightboxAutoMute ? 'bg-sky-500' : 'bg-white/15'}`}
            onClick={() => setLightboxAutoMute(!lightboxAutoMute)}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${lightboxAutoMute ? 'translate-x-4' : 'translate-x-0'}`}
            />
          </button>
        </SettingsItem>
      </SettingsGroup>

      <SettingsGroup title="Slideshow">
        <SettingsItem
          label="Slide duration"
          description="How long each image stays on screen before the slideshow advances."
        >
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={3}
              max={60}
              step={1}
              value={slideshowIntervalSeconds}
              aria-label="Slide duration"
              className="w-32 accent-sky-500"
              onChange={(event) => setSlideshowIntervalSeconds(Number(event.currentTarget.value))}
            />
            <span className="min-w-10 text-right text-xs text-gray-400 tabular-nums">
              {slideshowIntervalSeconds}s
            </span>
          </div>
        </SettingsItem>
        <SettingsItem
          label="Playback order"
          description="Sequential follows the current lightbox order. Random picks another image from the same collection."
        >
          <Dropdown
            value={slideshowOrder}
            onChange={setSlideshowOrder}
            ariaLabel="Slideshow order"
            options={[
              { value: 'sequential', label: 'Sequential' },
              { value: 'random', label: 'Random' },
            ]}
          />
        </SettingsItem>
        <SettingsItem
          label="Transition"
          description="Soft fade keeps images still. Gentle motion adds a slow, subtle drift while the next image settles in."
        >
          <Dropdown
            value={slideshowTransition}
            onChange={setSlideshowTransition}
            ariaLabel="Slideshow transition"
            options={[
              { value: 'soft-fade', label: 'Soft fade' },
              { value: 'gentle-motion', label: 'Gentle motion' },
            ]}
          />
        </SettingsItem>
      </SettingsGroup>
    </div>
  )
}
