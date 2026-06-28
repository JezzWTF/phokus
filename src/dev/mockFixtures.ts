import type {
  Album,
  AiRating,
  DuplicateGroup,
  ExploreTagEntry,
  Folder,
  FolderJobProgress,
  ImageExif,
  ImageRecord,
  ImageTag,
  SortOrder,
  TagCloudEntry,
} from "../store";
import type { MockScenario } from "./mockScenarios";
import { fixtureMediaPath } from "./mockMedia";

export interface MockDb {
  scenario: MockScenario;
  folders: Folder[];
  images: ImageRecord[];
  albums: Album[];
  albumImageIds: Record<number, number[]>;
  tagsByImageId: Record<number, ImageTag[]>;
  tagCloud: TagCloudEntry[];
  exploreTags: ExploreTagEntry[];
  backgroundJobs: FolderJobProgress[];
  duplicateGroups: DuplicateGroup[];
  duplicateScannedAt: number | null;
}

const folderNames = ["Camera Roll", "Client Selects", "Video Archive"];
const mediaNames = [
  "alpine-lake",
  "city-after-rain",
  "coastal-walk",
  "studio-portrait",
  "market-neon",
  "forest-floor",
  "product-macro",
  "golden-hour",
  "night-drive",
  "desk-flatlay",
  "museum-hall",
  "wildflower",
];
const tags = [
  "landscape",
  "portrait",
  "street",
  "travel",
  "night",
  "product",
  "editorial",
  "architecture",
  "nature",
  "warm light",
  "blue hour",
  "select",
];
const aiRatings: AiRating[] = ["general", "sensitive", "questionable"];

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function mockPath(folder: number, name: string, index: number, ext: string): string {
  return `mock://full/${folder}-${name}-${index}.${ext}`;
}

function mockThumb(index: number): string {
  return fixtureMediaPath(index);
}

function makeImage(index: number, folderId: number, scenario: MockScenario): ImageRecord {
  const name = mediaNames[index % mediaNames.length];
  const isVideo = index % 11 === 6;
  const failedEmbedding = scenario === "errors" && index % 9 === 0;
  const failedTagging = scenario === "errors" && index % 7 === 0;
  const ext = isVideo ? "mp4" : "jpg";
  return {
    id: index + 1,
    folder_id: folderId,
    path: isVideo ? mockPath(folderId, name, index + 1, ext) : mockThumb(index),
    filename: `${name}-${String(index + 1).padStart(3, "0")}.${ext}`,
    thumbnail_path: scenario === "errors" && index % 10 === 3 ? "mock://missing-thumb.svg" : mockThumb(index),
    width: isVideo ? 3840 : 3000 + (index % 5) * 180,
    height: isVideo ? 2160 : 2000 + (index % 4) * 160,
    file_size: 480_000 + index * 73_000,
    created_at: daysAgo(index + 3),
    modified_at: daysAgo(index + 1),
    taken_at: daysAgo(index + 10),
    mime_type: isVideo ? "video/mp4" : "image/jpeg",
    media_kind: isVideo ? "video" : "image",
    duration_ms: isVideo ? 42_000 + index * 1300 : null,
    video_codec: isVideo ? "h264" : null,
    audio_codec: isVideo ? "aac" : null,
    metadata_updated_at: daysAgo(index),
    metadata_error: scenario === "errors" && index % 8 === 2 ? "EXIF parse failed in UI fixture" : null,
    favorite: index % 5 === 0,
    rating: index % 6,
    embedding_status: failedEmbedding ? "failed" : index % 13 === 0 ? "processing" : "ready",
    embedding_model: failedEmbedding ? null : "clip-vit-b-32",
    embedding_updated_at: failedEmbedding ? null : daysAgo(index),
    embedding_error: failedEmbedding ? "Fixture embedding failure" : null,
    generated_caption: `Fixture caption for ${name.replace(/-/g, " ")}.`,
    caption_model: "blip-base",
    caption_updated_at: daysAgo(index),
    caption_error: null,
    ai_rating: aiRatings[index % aiRatings.length],
    ai_tagger_model: failedTagging ? null : "wd-vit-tagger-v3",
    ai_tagged_at: failedTagging ? null : daysAgo(index),
    ai_tagger_error: failedTagging ? "Fixture tagger failure" : null,
  };
}

function makeFolders(scenario: MockScenario): Folder[] {
  if (scenario === "empty") return [];
  return folderNames.map((name, index) => ({
    id: index + 1,
    path: `C:\\Users\\phokus\\Pictures\\${name.replace(/ /g, "")}`,
    name,
    image_count: 0,
    indexed_at: daysAgo(index + 1),
    scan_error: scenario === "errors" && index === 1 ? "Folder moved or permission denied" : null,
    sort_order: index + 1,
  }));
}

function makeImages(scenario: MockScenario, folders: Folder[]): ImageRecord[] {
  if (scenario === "empty") return [];
  const count = scenario === "huge" ? 720 : scenario === "errors" ? 54 : 72;
  const images = Array.from({ length: count }, (_, index) => makeImage(index, folders[index % folders.length].id, scenario));
  for (const folder of folders) {
    folder.image_count = images.filter((image) => image.folder_id === folder.id).length;
  }
  return images;
}

function makeTags(images: ImageRecord[]): Record<number, ImageTag[]> {
  return Object.fromEntries(
    images.map((image, index) => [
      image.id,
      [0, 1, 2].map((offset) => ({
        id: image.id * 10 + offset,
        image_id: image.id,
        tag: tags[(index + offset) % tags.length],
        source: offset === 0 ? "user" : "ai",
        ai_model: offset === 0 ? null : "wd-vit-tagger-v3",
        confidence: offset === 0 ? null : 0.72 + offset * 0.07,
        created_at: daysAgo(index + offset),
      })),
    ]),
  );
}

function makeAlbums(images: ImageRecord[], scenario: MockScenario): { albums: Album[]; albumImageIds: Record<number, number[]> } {
  if (scenario === "empty") return { albums: [], albumImageIds: {} };
  const selects = images.filter((image) => image.rating >= 4).slice(0, 36).map((image) => image.id);
  const motion = images.filter((image) => image.media_kind === "video").map((image) => image.id);
  const favorites = images.filter((image) => image.favorite).slice(0, 40).map((image) => image.id);
  const albumImageIds = { 1: selects, 2: motion, 3: favorites };
  const albums: Album[] = [
    { id: 1, name: "Portfolio Shortlist", cover_image_id: selects[0] ?? null, cover_thumbnail_path: images.find((image) => image.id === selects[0])?.thumbnail_path ?? null, image_count: selects.length, sort_order: 1, created_at: daysAgo(40), updated_at: daysAgo(2) },
    { id: 2, name: "Motion Tests", cover_image_id: motion[0] ?? null, cover_thumbnail_path: images.find((image) => image.id === motion[0])?.thumbnail_path ?? null, image_count: motion.length, sort_order: 2, created_at: daysAgo(38), updated_at: daysAgo(3) },
    { id: 3, name: "Favorites", cover_image_id: favorites[0] ?? null, cover_thumbnail_path: images.find((image) => image.id === favorites[0])?.thumbnail_path ?? null, image_count: favorites.length, sort_order: 3, created_at: daysAgo(20), updated_at: daysAgo(1) },
  ];
  return { albums, albumImageIds };
}

function makeProgress(folders: Folder[], scenario: MockScenario): FolderJobProgress[] {
  return folders.map((folder, index) => ({
    folder_id: folder.id,
    thumbnail_pending: scenario === "busy" ? 18 - index * 3 : 0,
    metadata_pending: scenario === "busy" ? 12 - index * 2 : 0,
    embedding_pending: scenario === "busy" ? 36 - index * 4 : scenario === "errors" ? 4 : 0,
    embedding_ready: Math.max(0, folder.image_count - (scenario === "busy" ? 20 : 2)),
    embedding_failed: scenario === "errors" ? 3 + index : 0,
    caption_pending: scenario === "busy" ? 24 - index * 2 : 0,
    caption_ready: Math.max(0, Math.floor(folder.image_count * 0.5)),
    caption_failed: scenario === "errors" ? 2 : 0,
    tagging_pending: scenario === "busy" ? 30 - index * 5 : 0,
    tagging_ready: Math.max(0, Math.floor(folder.image_count * 0.65)),
    tagging_failed: scenario === "errors" ? 4 : 0,
  }));
}

function makeTagCloud(images: ImageRecord[]): TagCloudEntry[] {
  return tags.slice(0, 10).map((_, index) => {
    const group = images.filter((image) => image.id % (index + 2) === 0).slice(0, 28);
    const representative = group[0] ?? images[index];
    return {
      count: Math.max(group.length, 1),
      representative_image_id: representative?.id ?? index + 1,
      thumbnail_path: representative?.thumbnail_path ?? null,
      image_ids: group.length ? group.map((image) => image.id) : [representative?.id ?? 1],
    };
  });
}

function makeExploreTags(images: ImageRecord[]): ExploreTagEntry[] {
  return tags.map((tag, index) => {
    const representative = images[index % Math.max(images.length, 1)];
    return {
      tag,
      count: Math.max(3, Math.round(images.length / (index + 3))),
      representative_image_id: representative?.id ?? index + 1,
      thumbnail_path: representative?.thumbnail_path ?? null,
    };
  });
}

function makeDuplicateGroups(images: ImageRecord[], scenario: MockScenario): DuplicateGroup[] {
  if (scenario === "empty") return [];
  const candidates = images.filter((image) => image.media_kind === "image");
  const groups = [0, 1, 2, 3].map((groupIndex) => ({
    file_hash: `fixture-hash-${groupIndex}`,
    file_size: candidates[groupIndex]?.file_size ?? 1_200_000,
    images: candidates.slice(groupIndex * 4, groupIndex * 4 + (groupIndex === 1 ? 3 : 2)),
  })).filter((group) => group.images.length > 1);
  return scenario === "duplicates" ? groups.concat(groups.map((group, index) => ({
    ...group,
    file_hash: `${group.file_hash}-extra`,
    images: candidates.slice(20 + index * 3, 23 + index * 3),
  })).filter((group) => group.images.length > 1)) : groups;
}

export function createMockDb(scenario: MockScenario): MockDb {
  const folders = makeFolders(scenario);
  const images = makeImages(scenario, folders);
  const { albums, albumImageIds } = makeAlbums(images, scenario);
  return {
    scenario,
    folders,
    images,
    albums,
    albumImageIds,
    tagsByImageId: makeTags(images),
    tagCloud: makeTagCloud(images),
    exploreTags: makeExploreTags(images),
    backgroundJobs: makeProgress(folders, scenario),
    duplicateGroups: makeDuplicateGroups(images, scenario),
    duplicateScannedAt: scenario === "duplicates" ? Math.floor(Date.now() / 1000) - 420 : null,
  };
}

export function compareImages(sort: SortOrder): (left: ImageRecord, right: ImageRecord) => number {
  return (left, right) => {
    switch (sort) {
      case "name_asc":
        return left.filename.localeCompare(right.filename);
      case "name_desc":
        return right.filename.localeCompare(left.filename);
      case "size_asc":
        return left.file_size - right.file_size;
      case "size_desc":
        return right.file_size - left.file_size;
      case "rating_asc":
        return left.rating - right.rating;
      case "rating_desc":
        return right.rating - left.rating;
      case "duration_asc":
        return (left.duration_ms ?? 0) - (right.duration_ms ?? 0);
      case "duration_desc":
        return (right.duration_ms ?? 0) - (left.duration_ms ?? 0);
      case "date_asc":
      case "taken_asc":
        return Date.parse(left.taken_at ?? left.created_at ?? "") - Date.parse(right.taken_at ?? right.created_at ?? "");
      case "date_desc":
      case "taken_desc":
      default:
        return Date.parse(right.taken_at ?? right.created_at ?? "") - Date.parse(left.taken_at ?? left.created_at ?? "");
    }
  };
}

export function mockExif(imageId: number): ImageExif {
  return {
    make: "Phokus Fixture Co.",
    model: `MockCam ${100 + imageId}`,
    lens: "35mm f/1.8",
    iso: String(100 + (imageId % 8) * 100),
    f_number: "f/4",
    exposure_time: "1/250",
    focal_length: "35mm",
    datetime_original: daysAgo(imageId),
    gps_lat: imageId % 2 === 0 ? 51.5072 : null,
    gps_lon: imageId % 2 === 0 ? -0.1276 : null,
  };
}
