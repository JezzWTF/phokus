import { ImageRecord, useGalleryStore } from "../store";
import { ContextMenu, MenuItem, MenuLabel, MenuSeparator, SubMenu } from "./menu";
import { Tooltip } from "./Tooltip";
import { CloseIcon, StarIcon } from "./icons";

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
  const albums = useGalleryStore((state) => state.albums);
  const addToAlbum = useGalleryStore((state) => state.addToAlbum);
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
      <SubMenu label="Add to Album" panelClassName="max-h-64 overflow-y-auto">
        {albums.length === 0 ? (
          <MenuItem label="No albums yet" disabled />
        ) : (
          albums.map((album) => (
            <MenuItem
              key={album.id}
              label={album.name}
              hint={album.image_count.toLocaleString()}
              onSelect={() => void addToAlbum(album.id, [image.id])}
            />
          ))
        )}
      </SubMenu>
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
                <StarIcon className={`h-4 w-4 ${rating <= image.rating ? "text-amber-300" : "text-white/20 hover:text-white/40"}`} />
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
              <CloseIcon className="h-3 w-3" />
            </button>
          </Tooltip>
        ) : null}
      </div>
    </ContextMenu>
  );
}
