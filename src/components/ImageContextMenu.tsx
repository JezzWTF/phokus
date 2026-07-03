import { ImageRecord, useGalleryStore } from "../store";
import { ContextMenu, MenuItem, MenuLabel, MenuSeparator } from "./menu";
import { Tooltip } from "./Tooltip";

/** Right-click menu for an image tile. Shared by the Gallery grid and the Timeline. */
export function ImageContextMenu({
  x,
  y,
  image,
  onClose,
}: {
  x: number;
  y: number;
  image: ImageRecord;
  onClose: () => void;
}) {
  const openImage = useGalleryStore((state) => state.openImage);
  const updateImageDetails = useGalleryStore((state) => state.updateImageDetails);
  const findSimilar = useGalleryStore((state) => state.findSimilar);
  const canFindSimilar = image.embedding_status === "ready";

  return (
    <ContextMenu x={x} y={y} onClose={onClose}>
      <MenuItem label="Open Preview" onSelect={() => openImage(image)} />
      <MenuItem
        label={image.favorite ? "Remove Favorite" : "Add to Favorites"}
        onSelect={() => void updateImageDetails(image.id, { favorite: !image.favorite })}
      />
      <MenuItem
        label={canFindSimilar ? "Find Similar" : "Embeddings not ready"}
        disabled={!canFindSimilar}
        onSelect={() => findSimilar(image.id, image.folder_id)}
      />
      <MenuSeparator />
      <MenuLabel>Rating</MenuLabel>
      <div className="flex items-center gap-0.5 px-2 pb-1.5">
        {Array.from({ length: 5 }, (_, index) => {
          const rating = index + 1;
          return (
            <Tooltip key={rating} label={`Set ${rating} star rating`} followCursor>
              <button
                className="rounded-md p-1 transition-colors hover:bg-white/5"
                onClick={async () => { await updateImageDetails(image.id, { rating }); onClose(); }}
              >
                <svg
                  className={`h-4 w-4 ${rating <= image.rating ? "text-amber-300" : "text-white/20 hover:text-white/40"}`}
                  fill="currentColor" viewBox="0 0 20 20"
                >
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.176 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81H7.03a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              </button>
            </Tooltip>
          );
        })}
        {image.rating > 0 ? (
          <Tooltip label="Remove rating" followCursor>
            <button
              className="ml-1 rounded-md p-1 text-gray-600 hover:bg-white/5 hover:text-gray-300 transition-colors"
              onClick={async () => { await updateImageDetails(image.id, { rating: 0 }); onClose(); }}
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </Tooltip>
        ) : null}
      </div>
    </ContextMenu>
  );
}
