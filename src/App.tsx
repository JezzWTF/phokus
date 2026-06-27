import { useEffect } from "react";
import { useGalleryStore } from "./store";
import { Sidebar } from "./components/Sidebar";
import { BackgroundTasks } from "./components/BackgroundTasks";
import { Toolbar } from "./components/Toolbar";
import { Gallery } from "./components/Gallery";
import { Lightbox } from "./components/Lightbox";
import { TagCloud } from "./components/TagCloud";
import { DuplicateFinder } from "./components/DuplicateFinder";
import { Timeline } from "./components/Timeline";
import { TitleBar } from "./components/TitleBar";
import { SettingsModal } from "./components/SettingsModal";
import { FolderPickerModal } from "./components/FolderPickerModal";
import { UpdateToast } from "./components/UpdateToast";
import { WhatsNewToast } from "./components/WhatsNewToast";
import { WhatsNewModal } from "./components/WhatsNewModal";
import { OnboardingOverlay } from "./components/onboarding/OnboardingOverlay";
import { DemoPanel } from "./components/DemoPanel";
import { initializeNotifications } from "./notifications";

export default function App() {
  const loadFolders = useGalleryStore((state) => state.loadFolders);
  const loadBackgroundJobProgress = useGalleryStore((state) => state.loadBackgroundJobProgress);
  const loadImages = useGalleryStore((state) => state.loadImages);
  const loadCaptionModelStatus = useGalleryStore((state) => state.loadCaptionModelStatus);
  const loadDuplicateScanCache = useGalleryStore((state) => state.loadDuplicateScanCache);
  const loadAlbums = useGalleryStore((state) => state.loadAlbums);
  const loadMutedFolderIds = useGalleryStore((state) => state.loadMutedFolderIds);
  const loadNotificationsPaused = useGalleryStore((state) => state.loadNotificationsPaused);
  const subscribeToProgress = useGalleryStore((state) => state.subscribeToProgress);
  const loadAppVersion = useGalleryStore((state) => state.loadAppVersion);
  const checkForUpdates = useGalleryStore((state) => state.checkForUpdates);
  const loadFfmpegStatus = useGalleryStore((state) => state.loadFfmpegStatus);
  const loadOnboardingCompleted = useGalleryStore((state) => state.loadOnboardingCompleted);
  const initWhatsNew = useGalleryStore((state) => state.initWhatsNew);
  const activeView = useGalleryStore((state) => state.activeView);

  useEffect(() => {
    void initializeNotifications();
    void loadMutedFolderIds();
    void loadNotificationsPaused();
    void loadFfmpegStatus();
    void loadOnboardingCompleted();
    // Load the app version first so the What's New toast/modal (which read
    // appVersion from the store) have it before the greeting can appear.
    void loadAppVersion().then(() => initWhatsNew());
    // Quiet launch check — dev builds have no signed artifacts to update to.
    if (import.meta.env.PROD) {
      void checkForUpdates({ quiet: true });
    }
    loadFolders().then(() => {
      void loadBackgroundJobProgress();
      void loadCaptionModelStatus();
      void loadDuplicateScanCache();
      void loadAlbums();
      return loadImages(true);
    });
    let unlisten: (() => void) | undefined;
    subscribeToProgress().then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  return (
    <div className="flex h-screen flex-col bg-gray-950 text-white overflow-hidden select-none">
      {/* Custom title bar — sits at the very top */}
      <TitleBar />

      {/* Main app content below the title bar */}
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main className="flex-1 flex flex-col min-w-0">
          {activeView === "timeline" ? (
            <>
              <Toolbar />
              <BackgroundTasks />
              <Timeline />
            </>
          ) : activeView === "explore" ? (
            <>
              <BackgroundTasks />
              <TagCloud />
            </>
          ) : activeView === "duplicates" ? (
            <>
              <BackgroundTasks />
              <DuplicateFinder />
            </>
          ) : (
            <>
              <Toolbar />
              <BackgroundTasks />
              <Gallery />
            </>
          )}
        </main>
      </div>

      <Lightbox />
      <SettingsModal />
      <FolderPickerModal />
      <UpdateToast />
      <WhatsNewToast />
      <WhatsNewModal />
      <OnboardingOverlay />
      {import.meta.env.DEV && <DemoPanel />}
    </div>
  );
}
