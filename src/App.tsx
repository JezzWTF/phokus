import { useEffect } from "react";
import { useGalleryStore } from "./store";
import { Sidebar } from "./components/Sidebar";
import { BackgroundTasks } from "./components/BackgroundTasks";
import { MenuBar } from "./components/MenuBar";
import { Toolbar } from "./components/Toolbar";
import { Gallery } from "./components/Gallery";
import { Lightbox } from "./components/Lightbox";

export default function App() {
  const loadFolders = useGalleryStore((state) => state.loadFolders);
  const loadBackgroundJobProgress = useGalleryStore((state) => state.loadBackgroundJobProgress);
  const loadImages = useGalleryStore((state) => state.loadImages);
  const subscribeToProgress = useGalleryStore((state) => state.subscribeToProgress);

  useEffect(() => {
    loadFolders().then(() => {
      void loadBackgroundJobProgress();
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
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden select-none">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0">
        <MenuBar />
        <Toolbar />
        <BackgroundTasks />
        <Gallery />
      </main>
      <Lightbox />
    </div>
  );
}
