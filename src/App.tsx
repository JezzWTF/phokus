import { useEffect } from "react";
import { useGalleryStore } from "./store";
import { Sidebar } from "./components/Sidebar";
import { MenuBar } from "./components/MenuBar";
import { Toolbar } from "./components/Toolbar";
import { Gallery } from "./components/Gallery";
import { Lightbox } from "./components/Lightbox";

export default function App() {
  const { loadFolders, loadImages, subscribeToProgress } = useGalleryStore();

  useEffect(() => {
    loadFolders().then(() => loadImages(true));
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
        <Gallery />
      </main>
      <Lightbox />
    </div>
  );
}
