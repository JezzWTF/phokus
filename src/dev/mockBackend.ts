import { emit } from "@tauri-apps/api/event";
import type { Album, ExploreTagEntry, Folder, ImageRecord, ImageTag, SortOrder } from "../store";
import { compareImages, createMockDb, mockExif } from "./mockFixtures";
import { getMockScenario } from "./mockScenarios";

const db = createMockDb(getMockScenario());
let nextFolderId = 100;
let nextAlbumId = 100;
let nextTagId = 10_000;

type AnyPayload = Record<string, any> | undefined;
type Rgb = [number, number, number];

const mockPalette: Rgb[] = [
  [59, 125, 216],
  [31, 182, 166],
  [76, 175, 80],
  [242, 207, 46],
  [232, 134, 46],
  [226, 59, 59],
  [139, 92, 246],
  [236, 72, 153],
  [139, 90, 43],
  [26, 26, 26],
  [245, 245, 245],
  [154, 160, 166],
];

function isRgb(value: unknown): value is Rgb {
  return Array.isArray(value) && value.length === 3 && value.every((entry) => typeof entry === "number");
}

function colorDistanceSq(left: Rgb, right: Rgb): number {
  return (left[0] - right[0]) ** 2 + (left[1] - right[1]) ** 2 + (left[2] - right[2]) ** 2;
}

function matchesMockColor(image: ImageRecord, color: Rgb): boolean {
  const primary = mockPalette[(image.id - 1) % mockPalette.length];
  const secondary = mockPalette[(image.folder_id + image.rating) % mockPalette.length];
  return colorDistanceSq(primary, color) <= 4_900 || colorDistanceSq(secondary, color) <= 4_900;
}

function params(payload: unknown): Record<string, any> {
  if (!payload || typeof payload !== "object") return {};
  const record = payload as Record<string, any>;
  return record.params && typeof record.params === "object" ? record.params : record;
}

function page<T>(items: T[], offset = 0, limit = 200) {
  return {
    images: items.slice(offset, offset + limit),
    total: items.length,
    offset,
    limit,
  };
}

function filterImages(input: ImageRecord[], payload: unknown): ImageRecord[] {
  const p = params(payload);
  const query = String(p.search ?? p.query ?? "").trim().toLowerCase();
  const color = isRgb(p.color) ? p.color : null;
  return input.filter((image) => {
    if (p.folder_id !== undefined && p.folder_id !== null && image.folder_id !== p.folder_id) return false;
    if (p.media_kind && image.media_kind !== p.media_kind) return false;
    if (p.favorites_only && !image.favorite) return false;
    if (p.rating_min !== undefined && p.rating_min !== null && image.rating < p.rating_min) return false;
    if (p.embedding_failed_only && image.embedding_status !== "failed") return false;
    if (p.tagging_failed_only && !image.ai_tagger_error) return false;
    if (query && !image.filename.toLowerCase().includes(query)) return false;
    if (color && !matchesMockColor(image, color)) return false;
    return true;
  });
}

function getImages(payload: unknown) {
  const p = params(payload);
  const sort = (p.sort ?? "date_desc") as SortOrder;
  return page(
    filterImages(db.images, payload).sort(compareImages(sort)),
    Number(p.offset ?? 0),
    Number(p.limit ?? 200),
  );
}

function searchTags(payload: unknown) {
  const p = params(payload);
  const query = String(p.query ?? "").trim().toLowerCase();
  const matchingIds = new Set(
    Object.entries(db.tagsByImageId)
      .filter(([, tags]) => tags.some((tag) => tag.tag.toLowerCase().includes(query)))
      .map(([imageId]) => Number(imageId)),
  );
  const images = filterImages(db.images, { params: { ...p, query: "", search: "" } })
    .filter((image) => matchingIds.has(image.id))
    .sort(compareImages((p.sort ?? "date_desc") as SortOrder));
  return page(images, Number(p.offset ?? 0), Number(p.limit ?? 200));
}

function searchTagsAutocomplete(payload: unknown): ExploreTagEntry[] {
  const p = params(payload);
  const query = String(p.query ?? "").trim().toLowerCase();
  const limit = Number(p.limit ?? 10);
  return db.exploreTags
    .filter((entry) => !query || entry.tag.toLowerCase().includes(query))
    .sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag))
    .slice(0, limit);
}

function rebuildExploreTags(): ExploreTagEntry[] {
  const entries = new Map<
    string,
    { imageIds: Set<number>; representativeImageId: number; hasAiSource: boolean; hasUserSource: boolean }
  >();
  for (const [imageIdString, imageTags] of Object.entries(db.tagsByImageId)) {
    const imageId = Number(imageIdString);
    for (const imageTag of imageTags) {
      const entry =
        entries.get(imageTag.tag) ??
        { imageIds: new Set<number>(), representativeImageId: imageId, hasAiSource: false, hasUserSource: false };
      entry.imageIds.add(imageId);
      if (imageTag.source === "ai") entry.hasAiSource = true;
      if (imageTag.source === "user") entry.hasUserSource = true;
      entries.set(imageTag.tag, entry);
    }
  }
  return [...entries.entries()]
    .map(([tag, entry]) => {
      const representative = db.images.find((image) => image.id === entry.representativeImageId);
      return {
        tag,
        count: entry.imageIds.size,
        representative_image_id: entry.representativeImageId,
        thumbnail_path: representative?.thumbnail_path ?? null,
        has_ai_source: entry.hasAiSource,
        has_user_source: entry.hasUserSource,
      };
    })
    .sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag));
}

function semanticSearch(payload: unknown): ImageRecord[] {
  const p = params(payload);
  const query = String(p.query ?? "").toLowerCase();
  const scored = filterImages(db.images, payload)
    .map((image, index) => ({
      image,
      score:
        (image.generated_caption?.toLowerCase().includes(query) ? 0 : 20) +
        (image.filename.toLowerCase().includes(query) ? 0 : 10) +
        (index % 9),
    }))
    .sort((left, right) => left.score - right.score)
    .slice(0, Number(p.limit ?? 200))
    .map((entry) => entry.image);
  return scored.length ? scored : filterImages(db.images, payload).slice(0, Number(p.limit ?? 200));
}

function albumImages(payload: unknown) {
  const p = params(payload);
  const albumId = Number(p.album_id);
  const ids = new Set(db.albumImageIds[albumId] ?? []);
  const sort = (p.sort ?? "date_desc") as SortOrder;
  return page(
    db.images.filter((image) => ids.has(image.id)).sort(compareImages(sort)),
    Number(p.offset ?? 0),
    Number(p.limit ?? 200),
  );
}

function similarImages(payload: unknown) {
  const p = params(payload);
  const source = db.images.find((image) => image.id === p.image_id);
  let images = db.images.filter((image) => image.id !== p.image_id && image.embedding_status === "ready");
  if (p.album_id !== undefined && p.album_id !== null) {
    const ids = new Set(db.albumImageIds[Number(p.album_id)] ?? []);
    images = images.filter((image) => ids.has(image.id));
  } else if (p.folder_id !== undefined && p.folder_id !== null) {
    images = images.filter((image) => image.folder_id === p.folder_id);
  }
  const ordered = images.sort((left, right) => {
    const leftScore = Math.abs(left.rating - (source?.rating ?? 0)) + (left.folder_id === source?.folder_id ? 0 : 2);
    const rightScore = Math.abs(right.rating - (source?.rating ?? 0)) + (right.folder_id === source?.folder_id ? 0 : 2);
    return leftScore - rightScore;
  });
  const offset = Number(p.offset ?? 0);
  const limit = Number(p.limit ?? 200);
  return {
    images: ordered.slice(offset, offset + limit),
    offset,
    limit,
    has_more: offset + limit < ordered.length,
  };
}

function updateImages(ids: number[], updates: { favorite?: boolean | null; rating?: number | null }) {
  const changed: ImageRecord[] = [];
  for (const image of db.images) {
    if (!ids.includes(image.id)) continue;
    if (updates.favorite !== null && updates.favorite !== undefined) image.favorite = updates.favorite;
    if (updates.rating !== null && updates.rating !== undefined) image.rating = updates.rating;
    changed.push({ ...image });
  }
  return changed;
}

function refreshAlbumCounts() {
  for (const album of db.albums) {
    const ids = db.albumImageIds[album.id] ?? [];
    if (db.scenario !== "extreme") album.image_count = ids.length;
    album.cover_image_id = ids[0] ?? null;
    album.cover_thumbnail_path = db.images.find((image) => image.id === ids[0])?.thumbnail_path ?? null;
    album.updated_at = new Date().toISOString();
  }
}

function createAlbum(name: string): Album {
  const album: Album = {
    id: nextAlbumId++,
    name,
    cover_image_id: null,
    cover_thumbnail_path: null,
    image_count: 0,
    sort_order: db.albums.length + 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  db.albums.push(album);
  db.albumImageIds[album.id] = [];
  return album;
}

function addFolder(path: string): Folder {
  const parts = path.split(/[\\/]/).filter(Boolean);
  const name = parts[parts.length - 1] ?? "New Folder";
  const folder: Folder = {
    id: nextFolderId++,
    path,
    name,
    image_count: 0,
    indexed_at: new Date().toISOString(),
    scan_error: null,
    sort_order: db.folders.length + 1,
  };
  db.folders.push(folder);
  return folder;
}

function safeFallback(cmd: string, payload: AnyPayload): unknown {
  if (cmd.includes("app|version")) return "0.1.1-ui";
  if (cmd.includes("path|resolve_directory")) return "C:\\Users\\phokus\\AppData\\Roaming\\Phokus";
  if (cmd.includes("path|join")) {
    const paths = payload?.paths ?? payload?.args ?? [];
    return Array.isArray(paths) ? paths.join("\\") : "C:\\Users\\phokus\\AppData\\Roaming\\Phokus";
  }
  if (cmd.includes("notification|is_permission_granted")) return false;
  if (cmd.includes("notification|request_permission")) return "denied";
  if (cmd.includes("dialog|open")) return null;
  if (cmd.includes("window|is_maximized")) return false;
  if (cmd.includes("window|minimize")) return null;
  if (cmd.includes("window|toggle_maximize")) return null;
  if (cmd.includes("window|close")) return null;
  if (cmd.includes("opener|reveal_item_in_dir")) return null;
  if (cmd.includes("opener|open")) return null;
  if (cmd.includes("process|relaunch")) return null;
  console.warn("[Phokus UI Lab] Unmocked command:", cmd, payload);
  return null;
}

export async function handleMockCommand(cmd: string, payload?: unknown): Promise<unknown> {
  const p = params(payload);

  switch (cmd) {
    case "get_folders":
      return db.folders;
    case "add_folder":
      addFolder(String(p.path ?? "C:\\Users\\phokus\\Pictures\\NewFolder"));
      return null;
    case "add_folders":
      return (p.paths ?? []).map((path: string) => ({ status: "added", data: addFolder(path) }));
    case "remove_folder":
      db.folders = db.folders.filter((folder) => folder.id !== p.folderId);
      return null;
    case "rename_folder": {
      const folder = db.folders.find((entry) => entry.id === p.folderId);
      if (folder) folder.name = String(p.newName ?? folder.name);
      return null;
    }
    case "update_folder_path": {
      const folder = db.folders.find((entry) => entry.id === p.folderId);
      if (folder) folder.path = String(p.newPath ?? folder.path);
      return null;
    }
    case "reindex_folder":
    case "reorder_folders":
      return null;
    case "list_directories":
      return {
        current: p.path ?? null,
        parent: p.path ? "C:\\Users\\phokus" : null,
        entries: db.folders.map((folder) => ({ name: folder.name, path: folder.path, has_children: false })),
      };
    case "get_background_job_progress":
      return db.backgroundJobs;
    case "get_images":
      return getImages(payload);
    case "semantic_search_images":
      return semanticSearch(payload);
    case "search_images_by_tag":
      return searchTags(payload);
    case "search_tags_autocomplete":
      return searchTagsAutocomplete(payload);
    case "get_images_by_ids":
      return (p.image_ids ?? []).map((id: number) => db.images.find((image) => image.id === id)).filter(Boolean);
    case "find_similar_images":
    case "find_similar_by_region":
      return similarImages(payload);
    case "get_visual_clusters":
      return db.scenario === "empty" ? [] : db.visualClusters;
    case "get_explore_tags":
      return db.scenario === "empty"
        ? []
        : db.scenario === "extreme"
          ? db.exploreTags
          : db.exploreTags.slice(0, Number(p.limit ?? 180));
    case "get_related_tags": {
      const relatedCounts = new Map<string, number>();
      for (const imageTags of Object.values(db.tagsByImageId)) {
        if (!imageTags.some((tag) => tag.tag === p.tag)) continue;
        for (const tag of imageTags) {
          if (tag.tag === p.tag) continue;
          relatedCounts.set(tag.tag, (relatedCounts.get(tag.tag) ?? 0) + 1);
        }
      }
      return Array.from(relatedCounts.entries())
        .map(([tag, shared_count]) => ({ tag, shared_count }))
        .sort((left, right) => right.shared_count - left.shared_count || left.tag.localeCompare(right.tag))
        .slice(0, Number(p.limit ?? 18));
    }
    case "suggest_image_tags":
      return ["select", "warm light"];
    case "rename_tag":
    case "delete_tag":
      return cmd === "delete_tag" ? 6 : null;
    case "get_image_tags":
      return db.tagsByImageId[p.image_id] ?? [];
    case "add_user_tag": {
      const tag: ImageTag = { id: nextTagId++, image_id: p.image_id, tag: p.tag, source: "user", ai_model: null, confidence: null, created_at: new Date().toISOString() };
      db.tagsByImageId[p.image_id] = [...(db.tagsByImageId[p.image_id] ?? []), tag];
      return tag;
    }
    case "remove_tag":
      for (const [imageId, imageTags] of Object.entries(db.tagsByImageId)) {
        db.tagsByImageId[Number(imageId)] = imageTags.filter((tag) => tag.id !== p.tag_id);
      }
      return null;
    case "get_image_exif":
      return mockExif(Number(p.image_id));
    case "update_image_details":
      return updateImages([Number(p.image_id)], { favorite: p.favorite, rating: p.rating })[0];
    case "bulk_update_details":
      return updateImages(p.image_ids ?? [], { favorite: p.favorite, rating: p.rating });
    case "bulk_add_tags":
    case "bulk_remove_tag":
      return null;
    case "delete_images_from_disk":
      return p.image_ids ?? [];
    case "list_albums":
      refreshAlbumCounts();
      return db.albums;
    case "create_album":
      return createAlbum(String(p.name ?? "Untitled Album"));
    case "rename_album": {
      const album = db.albums.find((entry) => entry.id === p.album_id);
      if (album) album.name = String(p.new_name ?? album.name);
      return null;
    }
    case "delete_album":
      db.albums = db.albums.filter((album) => album.id !== p.album_id);
      delete db.albumImageIds[p.album_id];
      return null;
    case "delete_albums":
      db.albums = db.albums.filter((album) => !(p.album_ids ?? []).includes(album.id));
      for (const id of p.album_ids ?? []) delete db.albumImageIds[id];
      return null;
    case "reorder_albums":
      return null;
    case "add_images_to_album": {
      const existing = new Set(db.albumImageIds[p.album_id] ?? []);
      for (const id of p.image_ids ?? []) existing.add(id);
      db.albumImageIds[p.album_id] = [...existing];
      refreshAlbumCounts();
      return p.image_ids?.length ?? 0;
    }
    case "remove_images_from_album":
      db.albumImageIds[p.album_id] = (db.albumImageIds[p.album_id] ?? []).filter((id) => !(p.image_ids ?? []).includes(id));
      refreshAlbumCounts();
      return null;
    case "get_album_images":
      return albumImages(payload);
    case "load_duplicate_scan_cache":
      return db.duplicateScannedAt ? { groups: db.duplicateGroups, scanned_at: db.duplicateScannedAt } : null;
    case "find_duplicates":
      await emit("duplicate_scan_progress", { phase: "hashing", processed: Math.floor(db.images.length * 0.6), total: db.images.length, skipped: db.scenario === "errors" ? 3 : 0 });
      db.duplicateScannedAt = Math.floor(Date.now() / 1000);
      return {
        groups: db.duplicateGroups,
        scanned_files: db.images.length,
        candidate_files: db.duplicateGroups.flatMap((group) => group.images).length,
        skipped_files: db.scenario === "errors" ? 3 : 0,
      };
    case "invalidate_duplicate_scan_cache":
      return null;
    case "get_caption_model_status":
      return { model_id: "Salesforce/blip-image-captioning-base", model_name: "BLIP Base", local_dir: "mock://models/caption", ready: true, missing_files: [] };
    case "get_caption_acceleration":
    case "set_caption_acceleration":
      return p.acceleration ?? "auto";
    case "get_caption_detail":
    case "set_caption_detail":
      return p.detail ?? "paragraph";
    case "prepare_caption_model":
    case "delete_caption_model":
      return { model_id: "Salesforce/blip-image-captioning-base", model_name: "BLIP Base", local_dir: "mock://models/caption", ready: true, missing_files: [] };
    case "probe_caption_runtime":
      return { ready: true, acceleration: "auto", detail: "paragraph", tokenizer_vocab_size: 30522, sessions: [] };
    case "probe_caption_image":
      return { input_shape: [1, 3, 384, 384], output_shape: [1, 768], output_values: 768, acceleration: "auto" };
    case "generate_caption_for_image": {
      const image = db.images.find((entry) => entry.id === p.image_id);
      if (image) image.generated_caption = `Generated in UI Lab for ${image.filename}.`;
      return image;
    }
    case "queue_caption_jobs":
    case "clear_caption_jobs":
    case "reset_generated_captions":
    case "queue_tagging_jobs":
    case "clear_tagging_jobs":
      return 12;
    case "reset_ai_tags": {
      const folderIds = p.folder_ids as number[] | undefined;
      const folderId = p.folder_id as number | null | undefined;
      const scopedImages = db.images.filter((image) =>
        folderIds && folderIds.length > 0
          ? folderIds.includes(image.folder_id)
          : folderId != null
            ? image.folder_id === folderId
            : true,
      );
      let reset = 0;
      for (const image of scopedImages) {
        const tags = db.tagsByImageId[image.id] ?? [];
        const aiTags = tags.filter((tag) => tag.source === "ai");
        if (aiTags.length > 0 || image.ai_tagged_at || image.ai_tagger_error || image.ai_tagger_model || image.ai_rating) {
          reset += 1;
        }
        db.tagsByImageId[image.id] = tags.filter((tag) => tag.source !== "ai");
        image.ai_rating = null;
        image.ai_tagger_model = null;
        image.ai_tagged_at = null;
        image.ai_tagger_error = null;
      }
      db.exploreTags = rebuildExploreTags();
      return reset;
    }
    case "get_tagger_model_status":
      return { model_id: "SmilingWolf/wd-vit-tagger-v3", model_name: "WD ViT Tagger", local_dir: "mock://models/tagger", ready: true, missing_files: [] };
    case "get_tagger_model":
    case "set_tagger_model":
      return p.model ?? "wd";
    case "get_tagger_acceleration":
    case "set_tagger_acceleration":
      return p.acceleration ?? "auto";
    case "get_tagger_threshold":
    case "set_tagger_threshold":
      return p.threshold ?? 0.35;
    case "get_tagger_batch_size":
    case "set_tagger_batch_size":
      return p.batch_size ?? 8;
    case "probe_tagger_runtime":
      return { ready: true, acceleration: "auto", session: { file: "model.onnx", inputs: ["input"], outputs: ["tags"] } };
    case "get_tagging_queue_scope":
      return "all";
    case "get_tagging_queue_folder_ids":
    case "get_muted_folder_ids":
      return [];
    case "set_tagging_queue_scope":
    case "set_tagging_queue_folder_ids":
    case "set_muted_folder_ids":
    case "set_notifications_paused":
    case "set_worker_pauses_persist":
    case "set_worker_paused":
      return null;
    case "get_notifications_paused":
    case "get_worker_pauses_persist":
    case "get_onboarding_completed":
      return db.scenario !== "empty";
    case "set_onboarding_completed":
    case "set_last_seen_version":
      return null;
    case "get_worker_states":
      return (p.folderIds ?? []).map((folder_id: number) => ({ folder_id, thumbnail_paused: false, metadata_paused: false, embedding_paused: false, tagging_paused: false }));
    case "get_build_variant":
      return "cpu";
    case "get_last_seen_version":
      return "0.1.1-ui";
    case "get_ffmpeg_status":
      return { installed: true, downloading: false, failed: false };
    case "retry_ffmpeg_download":
    case "open_app_data_folder":
    case "open_map_location":
    case "open_changelog_url":
      return null;
    case "get_database_info":
      return { size_mb: 14.2, reclaimable_mb: 1.8 };
    case "vacuum_database":
      return { before_mb: 14.2, after_mb: 12.4, freed_mb: 1.8 };
    case "rebuild_semantic_index":
      return db.images.length;
    case "get_orphaned_thumbnails_info":
      return { count: 9, size_mb: 3.4 };
    case "cleanup_orphaned_thumbnails":
      return { deleted_count: 9, freed_mb: 3.4 };
    case "retry_failed_embeddings":
      return null;
    default:
      return safeFallback(cmd, payload as AnyPayload);
  }
}
