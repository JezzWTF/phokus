import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ExploreTagEntry,
  parseSearchValue,
  SearchCommand,
  useGalleryStore,
} from "../../store";
import { useDismissable } from "../menu";
import { commandPrefix, composeSearchValue } from "./searchValue";

export function useToolbarSearch() {
  const search = useGalleryStore((state) => state.search);
  const setSearch = useGalleryStore((state) => state.setSearch);
  const clearSearch = useGalleryStore((state) => state.clearSearch);
  const selectedFolderId = useGalleryStore((state) => state.selectedFolderId);

  const [searchCommand, setSearchCommand] = useState<SearchCommand | null>(null);
  const [searchQuery, setSearchQuery] = useState(search);
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  const [tagSuggestions, setTagSuggestions] = useState<ExploreTagEntry[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchShellRef = useRef<HTMLDivElement>(null);
  const userHasTyped = useRef(false);

  const hasActiveSearch = search.trim().length > 0;
  const parsedSearch = parseSearchValue(composeSearchValue(searchCommand, searchQuery));
  const showTagSuggestions = searchCommand === "tag" && searchPanelOpen;
  const showCommandHints = !searchCommand && searchPanelOpen;

  useEffect(() => {
    if (!userHasTyped.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(composeSearchValue(searchCommand, searchQuery));
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchCommand, searchQuery, setSearch]);

  useEffect(() => {
    const parsed = parseSearchValue(search);
    setSearchCommand(parsed.prefix && parsed.mode !== "filename" ? parsed.mode : null);
    setSearchQuery(parsed.prefix ? parsed.query : search);
  }, [search]);

  useEffect(() => {
    if (searchCommand !== "tag") {
      setTagSuggestions([]);
      return;
    }
    if (suggestDebounceRef.current) clearTimeout(suggestDebounceRef.current);
    suggestDebounceRef.current = setTimeout(async () => {
      try {
        const results = await invoke<ExploreTagEntry[]>("search_tags_autocomplete", {
          params: { query: searchQuery.trim(), folder_id: selectedFolderId ?? null, limit: 10 },
        });
        setTagSuggestions(Array.isArray(results) ? results : []);
      } catch {
        setTagSuggestions([]);
      }
    }, 120);
    return () => {
      if (suggestDebounceRef.current) clearTimeout(suggestDebounceRef.current);
    };
  }, [searchCommand, searchQuery, selectedFolderId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const searchFocused = activeElement === searchInputRef.current;
      if (event.key === "Escape" && (searchFocused || hasActiveSearch)) {
        event.preventDefault();
        setSearchCommand(null);
        setSearchQuery("");
        clearSearch();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [clearSearch, hasActiveSearch]);

  useDismissable(searchShellRef, () => setSearchPanelOpen(false));

  const handleSearchChange = (nextValue: string) => {
    userHasTyped.current = true;
    if (!searchCommand) {
      const parsed = parseSearchValue(nextValue);
      if (parsed.prefix) {
        setSearchCommand(parsed.mode === "filename" ? null : parsed.mode);
        setSearchQuery(parsed.query);
        return;
      }
    }
    setSearchQuery(nextValue);
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && searchQuery.length === 0 && searchCommand !== null) {
      event.preventDefault();
      setSearchCommand(null);
    }
  };

  const clearSearchInput = () => {
    setSearchCommand(null);
    setSearchQuery("");
    setTagSuggestions([]);
    clearSearch();
  };

  const removeSearchCommand = () => {
    setSearchCommand(null);
    setTagSuggestions([]);
  };

  const chooseTagSuggestion = (tag: string) => {
    userHasTyped.current = true;
    setSearchQuery(tag);
    setSearch(`/t ${tag}`);
    setSearchPanelOpen(false);
    searchInputRef.current?.blur();
  };

  const chooseCommandHint = (command: SearchCommand) => {
    userHasTyped.current = true;
    setSearchCommand(command);
    searchInputRef.current?.focus();
  };

  return {
    chooseCommandHint,
    chooseTagSuggestion,
    clearSearchInput,
    commandPrefix,
    handleSearchChange,
    handleSearchKeyDown,
    hasActiveSearch,
    parsedSearch,
    removeSearchCommand,
    searchCommand,
    searchInputRef,
    searchPanelOpen,
    searchQuery,
    searchShellRef,
    setSearchPanelOpen,
    showCommandHints,
    showTagSuggestions,
    tagSuggestions,
  };
}
