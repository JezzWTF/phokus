import type { ImageRecord, MediaFilter, ParsedSearch, SearchCommand, SortOrder, ZoomPreset } from "./types";

export const PAGE_SIZE = 200;
// Timeline loads its full filtered set in one indexed taken_at query so the
// scrubber can span the entire library and jump to any month. Rendering is
// virtualized, so the cost is one query + records in memory — fine at this scale.
export const TIMELINE_PAGE_SIZE = 100000;
export const SIMILAR_DISTANCE_THRESHOLD = 0.24;

export function parseSearchValue(search: string): ParsedSearch {
  if (!search.trim()) {
    return { mode: "filename", query: "", prefix: null };
  }

  const slashPrefix = search.match(/^\/([a-z])(?:\s|$)/i);
  if (slashPrefix) {
    const rawPrefix = slashPrefix[1].toLowerCase();
    const query = search.length > 3 ? search.slice(3) : "";
    if (rawPrefix === "s") {
      return { mode: "semantic", query, prefix: "/s" };
    }
    if (rawPrefix === "t") {
      return { mode: "tag", query, prefix: "/t" };
    }
    return { mode: "filename", query, prefix: rawPrefix === "f" ? "/f" : null };
  }

  const trimmed = search.trim();
  const match = trimmed.match(/^([a-z]):\s*(.*)$/i);
  if (!match) {
    return { mode: "filename", query: trimmed, prefix: null };
  }

  const rawPrefix = match[1].toLowerCase();
  const query = match[2].trim();
  if (rawPrefix === "s") {
    return { mode: "semantic", query, prefix: "s:" };
  }
  if (rawPrefix === "t") {
    return { mode: "tag", query, prefix: "t:" };
  }
  return { mode: "filename", query, prefix: rawPrefix === "f" ? "f:" : null };
}

export function searchModeLabel(mode: SearchCommand): string {
  switch (mode) {
    case "semantic":
      return "Semantic Search";
    case "tag":
      return "Tag Search";
    default:
      return "Filename Search";
  }
}

export function tileSizeForZoom(zoomPreset: ZoomPreset): number {
  switch (zoomPreset) {
    case "compact":
      return 160;
    case "detail":
      return 280;
    default:
      return 220;
  }
}

export function matchesSearch(image: ImageRecord, search: string): boolean {
  if (!search) return true;
  return image.filename.toLowerCase().includes(search.toLowerCase());
}

export function isDerivedCollectionTitle(collectionTitle: string | null): boolean {
  return collectionTitle !== null;
}

export function matchesFilters(
  image: ImageRecord,
  selectedFolderId: number | null,
  mediaFilter: MediaFilter,
  favoritesOnly: boolean,
  minimumRating: number,
  failedEmbeddingsOnly: boolean,
  failedTaggingOnly: boolean,
  search: string,
): boolean {
  const matchesFolder = selectedFolderId === null || image.folder_id === selectedFolderId;
  const matchesMedia = mediaFilter === "all" || image.media_kind === mediaFilter;
  const matchesFavorite = !favoritesOnly || image.favorite;
  const matchesRating = image.rating >= minimumRating;
  const matchesFailedEmbedding = !failedEmbeddingsOnly || image.embedding_status === "failed";
  const matchesFailedTagging = !failedTaggingOnly || image.ai_tagger_error !== null;
  return matchesFolder && matchesMedia && matchesFavorite && matchesRating && matchesFailedEmbedding && matchesFailedTagging && matchesSearch(image, search);
}

function compareNullableNumber(a: number | null, b: number | null): number {
  return (a ?? 0) - (b ?? 0);
}

function compareNullableDate(a: string | null, b: string | null): number {
  return (a ? Date.parse(a) : 0) - (b ? Date.parse(b) : 0);
}

function compareImages(a: ImageRecord, b: ImageRecord, sort: SortOrder): number {
  switch (sort) {
    case "name_asc":
      return a.filename.localeCompare(b.filename);
    case "name_desc":
      return b.filename.localeCompare(a.filename);
    case "date_asc":
      return compareNullableDate(a.modified_at, b.modified_at);
    case "date_desc":
      return compareNullableDate(b.modified_at, a.modified_at);
    case "size_asc":
      return compareNullableNumber(a.file_size, b.file_size);
    case "size_desc":
      return compareNullableNumber(b.file_size, a.file_size);
    case "rating_asc":
      return compareNullableNumber(a.rating, b.rating);
    case "rating_desc":
      return compareNullableNumber(b.rating, a.rating);
    case "duration_asc":
      return compareNullableNumber(a.duration_ms, b.duration_ms);
    case "duration_desc":
      return compareNullableNumber(b.duration_ms, a.duration_ms);
    case "taken_asc":
      return compareNullableDate(a.taken_at ?? a.modified_at, b.taken_at ?? b.modified_at);
    case "taken_desc":
      return compareNullableDate(b.taken_at ?? b.modified_at, a.taken_at ?? a.modified_at);
    default:
      return compareNullableDate(b.modified_at, a.modified_at);
  }
}

export function mergeImages(currentImages: ImageRecord[], newImages: ImageRecord[], sort: SortOrder): ImageRecord[] {
  const merged = new Map<string, ImageRecord>();

  for (const image of currentImages) {
    merged.set(image.path, image);
  }

  for (const image of newImages) {
    merged.set(image.path, image);
  }

  return Array.from(merged.values()).sort((a, b) => compareImages(a, b, sort));
}

export function mergeIntoVisibleWindow(
  currentImages: ImageRecord[],
  newImages: ImageRecord[],
  sort: SortOrder,
  windowSize: number,
): ImageRecord[] {
  const merged = mergeImages(currentImages, newImages, sort);
  return merged.slice(0, Math.max(windowSize, 0));
}

export function countNewImages(currentImages: ImageRecord[], newImages: ImageRecord[]): number {
  const existingPaths = new Set(currentImages.map((image) => image.path));
  let count = 0;

  for (const image of newImages) {
    if (!existingPaths.has(image.path)) {
      existingPaths.add(image.path);
      count += 1;
    }
  }

  return count;
}

export function replaceImage(images: ImageRecord[], updatedImage: ImageRecord, sort: SortOrder): ImageRecord[] {
  return mergeImages(images, [updatedImage], sort);
}

export function replaceExistingImages(
  currentImages: ImageRecord[],
  updatedImages: ImageRecord[],
): ImageRecord[] {
  // Replace matched records in place WITHOUT re-sorting. `media-updated` carries
  // thumbnail/metadata fills that don't move an item in the list (Timeline
  // re-buckets by taken_at separately), and it fires constantly while the
  // background workers run. Re-sorting here meant an O(n log n) pass on every
  // batch — fine for the ~200-item gallery window, but a UI-freezing churn in
  // Timeline view where `images` can hold the entire library (TIMELINE_PAGE_SIZE).
  // Returning the same array reference when nothing matched also avoids a wasted
  // re-render. Relative order for just-updated items is corrected on next load.
  const updatesByPath = new Map(updatedImages.map((image) => [image.path, image]));
  let changed = false;
  const nextImages = currentImages.map((image) => {
    const update = updatesByPath.get(image.path);
    if (!update) return image;
    changed = true;
    return update;
  });
  return changed ? nextImages : currentImages;
}

export function initialAiCaptionsEnabled(key: string): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(key) === "true";
}

export function initialBoolSetting(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  const stored = window.localStorage.getItem(key);
  return stored === null ? fallback : stored === "true";
}

export function initialNumberSetting(key: string, fallback: number, min: number, max: number): number {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw === null) return fallback;
  const stored = Number(raw);
  if (!Number.isFinite(stored)) return fallback;
  return Math.min(max, Math.max(min, stored));
}

// Single token shared by all gallery-producing requests (folder loads, searches,
// similarity, region search, album views, explore clusters). Any new request
// increments it so a stale response from a previous collection type cannot
// overwrite newer results.
let galleryRequestToken = 0;

export function nextGalleryRequestToken(): number {
  return ++galleryRequestToken;
}

export function isCurrentGalleryRequest(token: number): boolean {
  return token === galleryRequestToken;
}

export function scopeHasTaggingPending(
  progressByFolder: Record<number, import("./types").FolderJobProgress>,
  folderId: number | null,
): boolean {
  if (folderId === null) {
    return Object.values(progressByFolder).some((progress) => progress.tagging_pending > 0);
  }
  return (progressByFolder[folderId]?.tagging_pending ?? 0) > 0;
}

export function taggingProgressAffectsScope(progressFolderId: number, scopeFolderId: number | null): boolean {
  return scopeFolderId === null || scopeFolderId === progressFolderId;
}

export function imagesAffectScope(images: ImageRecord[], scopeFolderId: number | null): boolean {
  return scopeFolderId === null || images.some((image) => image.folder_id === scopeFolderId);
}
