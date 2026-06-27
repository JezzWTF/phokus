import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ExploreTagEntry, useGalleryStore } from "../../store";

// Shared logic for the bulk tag editor, consumed by both the inline popover and
// the modal surface so they stay behaviorally identical.
export function useBulkTagEditor() {
  const selectedCount = useGalleryStore((state) => state.gallerySelectedIds.size);
  const selectedFolderId = useGalleryStore((state) => state.selectedFolderId);
  const bulkAddTags = useGalleryStore((state) => state.bulkAddTags);
  const bulkRemoveTag = useGalleryStore((state) => state.bulkRemoveTag);

  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<ExploreTagEntry[]>([]);
  const [appliedTags, setAppliedTags] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const query = input.trim();
    if (!query) {
      setSuggestions([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await invoke<ExploreTagEntry[]>("search_tags_autocomplete", {
          params: { query, folder_id: selectedFolderId ?? null, limit: 8 },
        });
        setSuggestions(results);
      } catch {
        setSuggestions([]);
      }
    }, 120);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [input, selectedFolderId]);

  const addTag = useCallback(
    async (raw: string) => {
      const tag = raw.trim();
      if (!tag || pending) return;
      setPending(true);
      try {
        await bulkAddTags([tag]);
        setAppliedTags((prev) => (prev.includes(tag) ? prev : [...prev, tag]));
        setInput("");
        setSuggestions([]);
      } finally {
        setPending(false);
      }
    },
    [bulkAddTags, pending],
  );

  const removeTag = useCallback(
    async (tag: string) => {
      await bulkRemoveTag(tag);
      setAppliedTags((prev) => prev.filter((entry) => entry !== tag));
    },
    [bulkRemoveTag],
  );

  return { selectedCount, input, setInput, suggestions, appliedTags, pending, addTag, removeTag };
}
