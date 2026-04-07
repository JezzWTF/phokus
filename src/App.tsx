import { useEffect } from "react";
import { useGalleryStore } from "./store";
import { Sidebar } from "./components/Sidebar";
import { BackgroundTasks } from "./components/BackgroundTasks";
import { Toolbar } from "./components/Toolbar";
import { Gallery } from "./components/Gallery";
import { Lightbox } from "./components/Lightbox";
import { TagCloud } from "./components/TagCloud";
import { TitleBar } from "./components/TitleBar";
import { SettingsModal } from "./components/SettingsModal";

export default function App() {
  const loadFolders = useGalleryStore((state) => state.loadFolders);
  const loadBackgroundJobProgress = useGalleryStore((state) => state.loadBackgroundJobProgress);
  const loadImages = useGalleryStore((state) => state.loadImages);
  const loadCaptionModelStatus = useGalleryStore((state) => state.loadCaptionModelStatus);
  const subscribeToProgress = useGalleryStore((state) => state.subscribeToProgress);
  const activeView = useGalleryStore((state) => state.activeView);

  useEffect(() => {
    loadFolders().then(() => {
      void loadBackgroundJobProgress();
      void loadCaptionModelStatus();
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
          {activeView === "explore" ? (
            <>
              <BackgroundTasks />
              <TagCloud />
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
    </div>
  );
}
