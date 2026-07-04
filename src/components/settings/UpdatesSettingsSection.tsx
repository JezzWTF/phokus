import { getChangelogForVersion } from "../../changelog";
import { useGalleryStore } from "../../store";
import { FfmpegStatusRow } from "../onboarding/StepWelcome";
import { SettingsGroup, SettingsItem, settingsButtonClass, StatusPill } from "./shared";

export function UpdatesSettingsSection() {
  const appVersion = useGalleryStore((state) => state.appVersion);
  const buildVariant = useGalleryStore((state) => state.buildVariant);
  const updateStatus = useGalleryStore((state) => state.updateStatus);
  const updateVersion = useGalleryStore((state) => state.updateVersion);
  const updateProgress = useGalleryStore((state) => state.updateProgress);
  const updateError = useGalleryStore((state) => state.updateError);
  const checkForUpdates = useGalleryStore((state) => state.checkForUpdates);
  const installUpdate = useGalleryStore((state) => state.installUpdate);
  const openWhatsNew = useGalleryStore((state) => state.openWhatsNew);
  const openOnboarding = useGalleryStore((state) => state.openOnboarding);
  const setSettingsOpen = useGalleryStore((state) => state.setSettingsOpen);

  return (
    <div className="mt-8 space-y-9">
      <SettingsGroup title="Updates">
        <SettingsItem
          label={
            <span className="inline-flex items-center gap-2.5">
              <span>Phokus {appVersion ? `v${appVersion}` : "—"}</span>
              {buildVariant ? (
                <StatusPill tone={buildVariant === "cuda" ? "ready" : "muted"}>
                  {buildVariant === "cuda" ? "CUDA" : "CPU"}
                </StatusPill>
              ) : null}
              {updateStatus === "available" || updateStatus === "downloading" || updateStatus === "installing" ? (
                <StatusPill tone="busy">v{updateVersion} available</StatusPill>
              ) : updateStatus === "upToDate" ? (
                <StatusPill tone="ready">Up to date</StatusPill>
              ) : null}
            </span>
          }
          description={
            updateStatus === "error" ? (
              <span className="text-amber-300/90">Update check failed: {updateError}</span>
            ) : updateStatus === "downloading" || updateStatus === "installing" ? (
              <span className="block">
                <span className="text-gray-400">
                  {updateStatus === "installing"
                    ? "Installing update…"
                    : updateProgress !== null
                      ? `Downloading update — ${Math.round(updateProgress * 100)}%`
                      : "Downloading update…"}
                </span>
                <span className="mt-2 block h-1 overflow-hidden rounded-full bg-white/10">
                  <span
                    className={`block h-full rounded-full bg-emerald-400/80 transition-[width] duration-200 ${
                      updateProgress === null ? "w-full animate-pulse" : ""
                    }`}
                    style={updateProgress !== null ? { width: `${Math.round(updateProgress * 100)}%` } : undefined}
                  />
                </span>
                <span className="mt-1 block text-gray-600">The app will restart when it finishes.</span>
              </span>
            ) : (
              "Updates are checked quietly at launch and installed only when you choose."
            )
          }
        >
          {updateStatus === "available" ? (
            <button
              className="rounded-md border border-emerald-400/35 bg-emerald-500/15 px-3 py-1.5 text-xs text-emerald-200 transition-colors hover:bg-emerald-500/25"
              onClick={() => void installUpdate()}
            >
              Install &amp; restart
            </button>
          ) : (
            <button
              className={settingsButtonClass}
              onClick={() => void checkForUpdates()}
              disabled={updateStatus === "checking" || updateStatus === "downloading" || updateStatus === "installing"}
            >
              {updateStatus === "checking" ? "Checking..." : "Check for updates"}
            </button>
          )}
        </SettingsItem>
        {getChangelogForVersion(appVersion) ? (
          <SettingsItem
            label="What's new"
            description={`See what changed in Phokus v${appVersion}.`}
          >
            <button className={settingsButtonClass} onClick={openWhatsNew}>
              View changes
            </button>
          </SettingsItem>
        ) : null}
      </SettingsGroup>

      <SettingsGroup title="Setup">
        <FfmpegStatusRow />
        <SettingsItem
          label="Welcome tour"
          description="Replay the guided first-run tour — library setup, the background pipeline, search modes, and AI features."
        >
          <button
            className={settingsButtonClass}
            onClick={() => {
              setSettingsOpen(false);
              openOnboarding();
            }}
          >
            Show welcome tour
          </button>
        </SettingsItem>
      </SettingsGroup>
    </div>
  );
}
