import { useState } from "react";
import { Album } from "../../store";

interface LightboxAlbumMenuProps {
  imageId: number;
  albums: Album[];
  addToAlbum: (albumId: number, imageIds: number[]) => Promise<number>;
  createAlbum: (name: string) => Promise<Album>;
}

export function LightboxAlbumMenu({ imageId, albums, addToAlbum, createAlbum }: LightboxAlbumMenuProps) {
  const [albumMenuOpen, setAlbumMenuOpen] = useState(false);
  const [albumAddedTo, setAlbumAddedTo] = useState<number | null>(null);
  const [newAlbumName, setNewAlbumName] = useState("");
  const [albumAdding, setAlbumAdding] = useState(false);

  return (
    <div className="relative">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider text-gray-500">Albums</p>
        <button
          className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
          onClick={() => { setAlbumMenuOpen((open) => !open); setAlbumAddedTo(null); }}
        >
          Add to album
        </button>
      </div>
      {albumMenuOpen ? (
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-1.5">
          <div className="max-h-40 overflow-y-auto">
            {albums.length === 0 ? (
              <p className="px-2 py-1.5 text-[11px] text-gray-600">No albums yet — create one below.</p>
            ) : (
              albums.map((album) => (
                <button
                  key={album.id}
                  className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-xs text-gray-300 transition-colors hover:bg-white/5 hover:text-white"
                  onClick={() => {
                    if (albumAdding) return;
                    setAlbumAdding(true);
                    void addToAlbum(album.id, [imageId])
                      .then(() => setAlbumAddedTo(album.id))
                      .catch(() => undefined)
                      .finally(() => setAlbumAdding(false));
                  }}
                  disabled={albumAdding}
                >
                  <span className="truncate">{album.name}</span>
                  {albumAddedTo === album.id ? (
                    <span className="shrink-0 text-[10px] text-emerald-400">Added</span>
                  ) : (
                    <span className="shrink-0 text-[10px] text-gray-600">{album.image_count}</span>
                  )}
                </button>
              ))
            )}
          </div>
          <form
            className="mt-1 flex gap-1 border-t border-white/[0.06] pt-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              const name = newAlbumName.trim();
              if (!name || albumAdding) return;
              setAlbumAdding(true);
              void createAlbum(name)
                .then(async (album) => {
                  await addToAlbum(album.id, [imageId]);
                  setAlbumAddedTo(album.id);
                  setNewAlbumName("");
                })
                .catch(() => undefined)
                .finally(() => setAlbumAdding(false));
            }}
          >
            <input
              className="min-w-0 flex-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white placeholder-gray-600 focus:border-white/20 focus:outline-none"
              placeholder="New album…"
              value={newAlbumName}
              onChange={(event) => setNewAlbumName(event.target.value)}
              disabled={albumAdding}
            />
            <button
              type="submit"
              className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-gray-300 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
              disabled={albumAdding || !newAlbumName.trim()}
            >
              Add
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
