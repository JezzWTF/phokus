import { Dropdown } from '../menu'
import { useGalleryStore } from '../../store'
import { SettingsGroup, SettingsItem } from './shared'

export function GeneralSettingsSection() {
  const theme = useGalleryStore((state) => state.theme)
  const setTheme = useGalleryStore((state) => state.setTheme)
  const notificationsPaused = useGalleryStore((state) => state.notificationsPaused)
  const setNotificationsPaused = useGalleryStore((state) => state.setNotificationsPaused)
  const workerPausesPersist = useGalleryStore((state) => state.workerPausesPersist)
  const setWorkerPausesPersist = useGalleryStore((state) => state.setWorkerPausesPersist)

  return (
    <div className="mt-8 space-y-9">
      <SettingsGroup title="Appearance">
        <SettingsItem
          label="Theme"
          description="Choose the app palette. Subtle Light uses a warm, low-glare background."
        >
          <Dropdown
            value={theme}
            onChange={setTheme}
            ariaLabel="App theme"
            options={[
              { value: 'phokus', label: 'Phokus' },
              { value: 'subtle-light', label: 'Subtle Light' },
              { value: 'conventional-dark', label: 'Conventional Dark' },
            ]}
          />
        </SettingsItem>
      </SettingsGroup>

      <SettingsGroup title="Notifications">
        <SettingsItem
          label="Pause all notifications"
          description="Notifications are batched per folder — a single alert fires once activity settles. Mute individual folders from their right-click menu."
        >
          <button
            role="switch"
            aria-checked={notificationsPaused}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${notificationsPaused ? 'bg-sky-500' : 'bg-white/15'}`}
            onClick={() => setNotificationsPaused(!notificationsPaused)}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${notificationsPaused ? 'translate-x-4' : 'translate-x-0'}`}
            />
          </button>
        </SettingsItem>
        <SettingsItem
          label="Keep background pauses after restart"
          description="When enabled, folders you pause from the sidebar or background bar stay paused the next time Phokus opens."
        >
          <button
            role="switch"
            aria-checked={workerPausesPersist}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${workerPausesPersist ? 'bg-sky-500' : 'bg-white/15'}`}
            onClick={() => setWorkerPausesPersist(!workerPausesPersist)}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${workerPausesPersist ? 'translate-x-4' : 'translate-x-0'}`}
            />
          </button>
        </SettingsItem>
      </SettingsGroup>
    </div>
  )
}
