import { MutableRefObject } from "react";
import { invoke } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { Album, ImageExif, ImageRecord, ImageTag } from "../../store";
import { Tooltip } from "../Tooltip";
import { CloseIcon, StarIcon } from "../icons";
import { embeddingLabel, formatBytes, formatDate, formatDuration, ratingPill } from "./format";
import { LightboxAlbumMenu } from "./LightboxAlbumMenu";

interface LightboxDetailsPanelProps {
  selectedImage: ImageRecord;
  currentIndex: number;
  imageCount: number;
  imageTags: ImageTag[];
  setImageTags: React.Dispatch<React.SetStateAction<ImageTag[]>>;
  imageExif: ImageExif | null;
  tagInput: string;
  setTagInput: React.Dispatch<React.SetStateAction<string>>;
  tagAdding: boolean;
  setTagAdding: React.Dispatch<React.SetStateAction<boolean>>;
  tagsExpanded: boolean;
  setTagsExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  taggingQueued: boolean;
  setTaggingQueued: React.Dispatch<React.SetStateAction<boolean>>;
  currentImageIdRef: MutableRefObject<number | null>;
  albums: Album[];
  canFindSimilar: boolean;
  canSearchRegion: boolean;
  regionSelectMode: boolean;
  regionSearching: boolean;
  taggerReady: boolean;
  taggerButtonTooltip: string;
  closeImage: () => void;
  findSimilar: (imageId: number, sourceFolderId: number | null) => Promise<void>;
  updateImageDetails: (imageId: number, updates: { favorite?: boolean; rating?: number }) => Promise<void>;
  addUserTag: (imageId: number, tag: string) => Promise<ImageTag>;
  removeTag: (tagId: number) => Promise<void>;
  queueTaggingForImage: (imageId: number) => Promise<number>;
  addToAlbum: (albumId: number, imageIds: number[]) => Promise<number>;
  createAlbum: (name: string) => Promise<Album>;
  onToggleRegionMode: () => void;
}

export function LightboxDetailsPanel({
  selectedImage,
  currentIndex,
  imageCount,
  imageTags,
  setImageTags,
  imageExif,
  tagInput,
  setTagInput,
  tagAdding,
  setTagAdding,
  tagsExpanded,
  setTagsExpanded,
  taggingQueued,
  setTaggingQueued,
  currentImageIdRef,
  albums,
  canFindSimilar,
  canSearchRegion,
  regionSelectMode,
  regionSearching,
  taggerReady,
  taggerButtonTooltip,
  closeImage,
  findSimilar,
  updateImageDetails,
  addUserTag,
  removeTag,
  queueTaggingForImage,
  addToAlbum,
  createAlbum,
  onToggleRegionMode,
}: LightboxDetailsPanelProps) {
  const aiRating = selectedImage.ai_rating ? ratingPill(selectedImage.ai_rating) : null;
  const hasCameraInfo =
    imageExif &&
    (imageExif.make ||
      imageExif.model ||
      imageExif.lens ||
      imageExif.f_number ||
      imageExif.exposure_time ||
      imageExif.iso ||
      imageExif.focal_length ||
      (imageExif.gps_lat != null && imageExif.gps_lon != null));

  return (
    <div className="lightbox-panel flex w-64 shrink-0 flex-col border-l border-white/5 bg-gray-900/95 lg:w-72">
      <div className="flex shrink-0 items-center justify-between px-5 pt-5 pb-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white">{selectedImage.filename}</p>
          <p className="text-xs text-gray-500">Details</p>
        </div>
        <div className="flex items-center gap-2">
          <Tooltip label={selectedImage.favorite ? "Remove favorite" : "Add favorite"} followCursor>
            <button
              className={`rounded-full border p-2 ${selectedImage.favorite ? "border-rose-400/40 bg-rose-500/10 text-rose-300" : "border-white/10 bg-white/5 text-gray-400 hover:text-white"}`}
              onClick={() => void updateImageDetails(selectedImage.id, { favorite: !selectedImage.favorite })}
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" />
              </svg>
            </button>
          </Tooltip>
          <Tooltip label={canFindSimilar ? "Find similar images" : "Embeddings not ready"} followCursor>
            <button
              className={`flex items-center gap-1.5 rounded-full border px-2 py-1.5 text-xs lg:px-3 ${
                canFindSimilar
                  ? "border-white/10 bg-white/5 text-gray-300 hover:text-white"
                  : "border-white/5 bg-white/[0.03] text-gray-600 cursor-not-allowed"
              }`}
              onClick={() => {
                if (!canFindSimilar) return;
                void findSimilar(selectedImage.id, selectedImage.folder_id);
              }}
              disabled={!canFindSimilar}
            >
              <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M13 3l1.55 4.65L19 9.2l-4.45 1.55L13 15.4l-1.55-4.65L7 9.2l4.45-1.55L13 3z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M5.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2L2.5 17.5l2.2-.8.8-2.2z" />
              </svg>
              <span className="hidden lg:inline">{canFindSimilar ? "Similar" : "Embeddings not ready"}</span>
            </button>
          </Tooltip>
        </div>
        <button className="rounded p-1 text-gray-400 hover:text-white" onClick={closeImage}>
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>

      {canSearchRegion && (
        <div className="shrink-0 px-5 pb-3">
          <Tooltip label={regionSelectMode ? "Cancel region selection" : "Draw a region on the image to search for similar content"} followCursor>
            <button
              className={`w-full rounded-lg border px-3 py-2 text-xs transition-colors ${
                regionSelectMode
                  ? "border-violet-400/40 bg-violet-500/15 text-violet-300 hover:bg-violet-500/20"
                  : regionSearching
                  ? "border-white/5 bg-white/[0.03] text-gray-500 cursor-not-allowed"
                  : "border-white/10 bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white"
              }`}
              onClick={() => {
                if (regionSearching) return;
                onToggleRegionMode();
              }}
              disabled={regionSearching}
            >
              {regionSearching ? (
                <span className="flex items-center justify-center gap-1.5">
                  <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Searching region…
                </span>
              ) : regionSelectMode ? (
                <span className="flex items-center justify-center gap-1.5">
                  <CloseIcon className="h-3 w-3" />
                  Cancel selection
                </span>
              ) : (
                <span className="flex items-center justify-center gap-1.5">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  </svg>
                  Search within image
                </span>
              )}
            </button>
          </Tooltip>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
          <div className="col-span-2">
            <p className="mb-1 text-xs uppercase tracking-wider text-gray-500">Rating</p>
            <div className="flex items-center gap-1">
              {Array.from({ length: 5 }, (_, index) => {
                const rating = index + 1;
                return (
                  <Tooltip key={rating} label={`Set ${rating} star rating`} followCursor delay={750}>
                    <button
                      className="rounded-md p-1"
                      onClick={() => void updateImageDetails(selectedImage.id, { rating })}
                    >
                      <StarIcon className={`h-5 w-5 ${rating <= selectedImage.rating ? "text-amber-300" : "text-white/20 hover:text-white/50"}`} />
                    </button>
                  </Tooltip>
                );
              })}
              {selectedImage.rating > 0 ? (
                <Tooltip label="Remove rating" followCursor>
                  <button
                    className="ml-2 rounded-md border border-white/10 p-1.5 text-gray-400 hover:bg-white/5 hover:text-white"
                    onClick={() => void updateImageDetails(selectedImage.id, { rating: 0 })}
                  >
                    <CloseIcon className="h-3.5 w-3.5" />
                  </button>
                </Tooltip>
              ) : null}
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs uppercase tracking-wider text-gray-500">Dimensions</p>
            <p className="text-white">
              {selectedImage.width && selectedImage.height
                ? `${selectedImage.width} x ${selectedImage.height}px`
                : "Pending / unavailable"}
            </p>
          </div>

          {selectedImage.media_kind === "video" ? (
            <>
              <div>
                <p className="mb-1 text-xs uppercase tracking-wider text-gray-500">Duration</p>
                <p className="text-white">{formatDuration(selectedImage.duration_ms)}</p>
              </div>
              <div>
                <p className="mb-1 text-xs uppercase tracking-wider text-gray-500">Video codec</p>
                <p className="text-white">{selectedImage.video_codec ?? "Pending / unavailable"}</p>
              </div>
              <div>
                <p className="mb-1 text-xs uppercase tracking-wider text-gray-500">Audio codec</p>
                <p className="text-white">{selectedImage.audio_codec ?? "None / unavailable"}</p>
              </div>
              {selectedImage.metadata_error ? (
                <div className="col-span-2">
                  <p className="mb-1 text-xs uppercase tracking-wider text-gray-500">Metadata</p>
                  <p className="text-amber-300">{selectedImage.metadata_error}</p>
                </div>
              ) : null}
            </>
          ) : null}

          <div>
            <p className="mb-1 text-xs uppercase tracking-wider text-gray-500">Type</p>
            <p className="text-white">{selectedImage.mime_type}</p>
          </div>
          <div>
            <p className="mb-1 text-xs uppercase tracking-wider text-gray-500">File size</p>
            <p className="text-white">{formatBytes(selectedImage.file_size)}</p>
          </div>
          <div className="col-span-2">
            <p className="mb-1 text-xs uppercase tracking-wider text-gray-500">Modified</p>
            <p className="text-white">{formatDate(selectedImage.modified_at)}</p>
          </div>
          <div className="col-span-2">
            <p className="mb-1 text-xs uppercase tracking-wider text-gray-500">Embedding</p>
            <p className="text-white">{embeddingLabel(selectedImage.embedding_status, selectedImage.embedding_model)}</p>
            {selectedImage.embedding_error ? (
              <p className="mt-1 text-xs text-amber-300">{selectedImage.embedding_error}</p>
            ) : null}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs uppercase tracking-wider text-gray-500">Tags</p>
            <div className="flex items-center gap-1.5">
              {aiRating ? (
                <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${aiRating.className}`}>
                  {aiRating.label}
                </span>
              ) : null}
              {selectedImage.media_kind === "image" ? (
                <Tooltip label={taggerButtonTooltip} followCursor>
                  <button
                    className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-gray-400 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={!taggerReady || taggingQueued}
                    onClick={() => {
                      setTaggingQueued(true);
                      void queueTaggingForImage(selectedImage.id).catch(() => undefined);
                    }}
                  >
                    {taggingQueued ? "Queued" : "AI tags"}
                  </button>
                </Tooltip>
              ) : null}
            </div>
          </div>

          {imageTags.length > 0 ? (
            <>
              <div className="flex flex-wrap gap-1.5">
                {(tagsExpanded ? imageTags : imageTags.slice(0, 8)).map((tag) => (
                  <Tooltip
                    key={tag.id}
                    label={tag.source === "ai" && tag.confidence !== null ? `AI confidence: ${(tag.confidence * 100).toFixed(0)}%` : ""}
                    followCursor
                    disabled={tag.source !== "ai" || tag.confidence === null}
                  >
                    <span
                      className={`group flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs ${
                        tag.source === "ai"
                          ? "border-sky-400/20 bg-sky-500/8 text-sky-300"
                          : "border-white/10 bg-white/5 text-gray-300"
                      }`}
                    >
                      {tag.tag}
                      <Tooltip label="Remove tag" followCursor>
                        <button
                          className="text-gray-600 opacity-0 transition-opacity hover:text-white group-hover:opacity-100"
                          onClick={() => {
                            void removeTag(tag.id).then(() =>
                              setImageTags((prev) => prev.filter((item) => item.id !== tag.id)),
                            );
                          }}
                        >
                          <CloseIcon className="h-3 w-3" />
                        </button>
                      </Tooltip>
                    </span>
                  </Tooltip>
                ))}
              </div>
              {imageTags.length > 8 && (
                <button
                  className="mt-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                  onClick={() => setTagsExpanded((expanded) => !expanded)}
                >
                  {tagsExpanded ? "Show less" : `+${imageTags.length - 8} more`}
                </button>
              )}
            </>
          ) : (
            <p className="text-xs text-gray-600">No tags yet</p>
          )}

          <form
            className="mt-2 flex gap-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              const raw = tagInput.trim();
              if (!raw || tagAdding) return;
              setTagAdding(true);
              const taggedImageId = selectedImage.id;
              void addUserTag(taggedImageId, raw)
                .then((newTag) => {
                  if (currentImageIdRef.current !== taggedImageId) return;
                  setImageTags((prev) => [...prev, newTag]);
                  setTagInput("");
                })
                .catch(() => undefined)
                .finally(() => setTagAdding(false));
            }}
          >
            <input
              className="min-w-0 flex-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white placeholder-gray-600 focus:border-white/20 focus:outline-none"
              placeholder="Add tag…"
              value={tagInput}
              onChange={(event) => setTagInput(event.target.value)}
              disabled={tagAdding}
            />
            <button
              type="submit"
              className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-gray-300 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              disabled={tagAdding || !tagInput.trim()}
            >
              Add
            </button>
          </form>
        </div>

        <LightboxAlbumMenu
          imageId={selectedImage.id}
          albums={albums}
          addToAlbum={addToAlbum}
          createAlbum={createAlbum}
        />

        {hasCameraInfo ? (
          <div>
            <p className="mb-2 text-xs uppercase tracking-wider text-gray-500">Camera</p>
            <div className="space-y-1.5">
              {imageExif.make || imageExif.model ? (
                <p className="text-sm text-white">
                  {[imageExif.make, imageExif.model].filter(Boolean).join(" ")}
                </p>
              ) : null}
              {imageExif.lens ? <p className="text-xs text-gray-400">{imageExif.lens}</p> : null}
              {imageExif.f_number || imageExif.exposure_time || imageExif.iso || imageExif.focal_length ? (
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-400">
                  {imageExif.f_number ? <span>{imageExif.f_number}</span> : null}
                  {imageExif.exposure_time ? <span>{imageExif.exposure_time}</span> : null}
                  {imageExif.iso ? <span>ISO {imageExif.iso}</span> : null}
                  {imageExif.focal_length ? <span>{imageExif.focal_length}</span> : null}
                </div>
              ) : null}
              {imageExif.gps_lat != null && imageExif.gps_lon != null ? (
                <Tooltip label="Open location in your browser" anchorToCursor>
                  <button
                    className="inline-flex items-center gap-1 text-xs text-sky-400 transition-colors hover:text-sky-300"
                    onClick={() =>
                      void invoke("open_map_location", {
                        params: { lat: imageExif.gps_lat, lon: imageExif.gps_lon },
                      })
                    }
                  >
                    {imageExif.gps_lat.toFixed(5)}, {imageExif.gps_lon.toFixed(5)}
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </button>
                </Tooltip>
              ) : null}
            </div>
          </div>
        ) : null}

        <div>
          <div className="mb-1 flex items-center justify-between">
            <p className="text-xs uppercase tracking-wider text-gray-500">Path</p>
            <Tooltip label="Reveal in Explorer" anchorToCursor>
              <button
                className="rounded p-0.5 text-gray-600 transition-colors hover:text-gray-300"
                onClick={() => void revealItemInDir(selectedImage.path)}
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                </svg>
              </button>
            </Tooltip>
          </div>
          <p className="break-all text-xs text-gray-400">{selectedImage.path}</p>
        </div>
      </div>

      <div className="shrink-0 mt-auto px-5 pb-4 pt-2 text-center text-xs text-gray-600">
        {currentIndex + 1} / {imageCount}
      </div>
    </div>
  );
}
