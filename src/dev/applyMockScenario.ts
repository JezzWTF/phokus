import { useGalleryStore } from "../store";
import { getMockScenario } from "./mockScenarios";

export function applyMockScenario() {
  const scenario = getMockScenario();
  const store = useGalleryStore.getState();

  if (scenario === "album") {
    const albumId = store.albums[0]?.id;
    if (albumId !== undefined) store.viewAlbum(albumId);
    return;
  }

  if (scenario === "duplicates") {
    store.setView("duplicates");
  }
}
