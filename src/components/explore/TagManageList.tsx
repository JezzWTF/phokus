import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ExploreTagEntry } from "../../store";
import { Dropdown } from "../menu";
import { Tooltip } from "../Tooltip";

type TagManageSort = "count_desc" | "count_asc" | "az" | "za";

const TAG_MANAGE_SORTS: { value: TagManageSort; label: string }[] = [
  { value: "count_desc", label: "Most used" },
  { value: "count_asc", label: "Least used" },
  { value: "az", label: "A-Z" },
  { value: "za", label: "Z-A" },
];

function AiSourceGlyph({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 2.75l.82 2.42a2.1 2.1 0 0 0 1.32 1.32l2.41.81-2.41.82a2.1 2.1 0 0 0-1.32 1.32L8 11.85l-.82-2.41a2.1 2.1 0 0 0-1.32-1.32L3.45 7.3l2.41-.81a2.1 2.1 0 0 0 1.32-1.32L8 2.75Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.35"
      />
      <path d="M12.25 11.15l.25.74.75.26-.75.25-.25.75-.26-.75-.74-.25.74-.26.26-.74Z" fill="currentColor" />
    </svg>
  );
}

function RenameGlyph({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3.25 11.85l.45-2.14 5.95-5.95a1.33 1.33 0 0 1 1.88 0l.71.71a1.33 1.33 0 0 1 0 1.88L6.29 12.3l-2.14.45a.76.76 0 0 1-.9-.9Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.35"
      />
      <path d="M8.75 4.65l2.6 2.6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.35" />
    </svg>
  );
}

function DeleteGlyph({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3.25 4.65h9.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.35" />
      <path d="M6.35 4.55V3.7c0-.55.45-1 1-1h1.3c.55 0 1 .45 1 1v.85" stroke="currentColor" strokeLinecap="round" strokeWidth="1.35" />
      <path
        d="M5.1 6.2l.35 5.65c.04.63.56 1.12 1.19 1.12h2.72c.63 0 1.15-.49 1.19-1.12l.35-5.65"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.35"
      />
    </svg>
  );
}

// Compact management tile for a single tag. Rename doubles as merge when the new
// name already exists, and delete applies across the scoped tag set.
function TagManageTile({
  entry,
  onSearch,
  onRename,
  onDelete,
}: {
  entry: ExploreTagEntry;
  onSearch: (tag: string) => void;
  onRename: (from: string, to: string) => Promise<void>;
  onDelete: (tag: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(entry.tag);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setValue(entry.tag);
      setTimeout(() => inputRef.current?.select(), 0);
    }
  }, [editing, entry.tag]);

  const commitRename = async () => {
    const next = value.trim();
    if (!next || next === entry.tag) {
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      await onRename(entry.tag, next);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  const sourceLabel = entry.has_ai_source
    ? entry.has_user_source
      ? "Used by AI tags and user tags"
      : "AI-generated tag"
    : "User tag";

  return (
    <div
      data-tag-manager-tile
      className={`tag-manager-tile ${entry.has_ai_source ? "tag-manager-tile-ai" : ""} group relative min-w-0 rounded-lg border bg-white/[0.018] px-3 py-2 transition-[background-color,border-color,transform] duration-150 focus-within:bg-white/[0.045] hover:bg-white/[0.04] ${
        entry.has_ai_source
          ? "border-white/[0.08] shadow-[inset_0_1px_0_rgba(125,211,252,0.055)] focus-within:border-white/[0.15] hover:border-white/[0.13]"
          : "border-white/[0.06] focus-within:border-white/[0.14] hover:border-white/[0.12]"
      } ${editing || confirming ? "min-h-[82px]" : "min-h-[46px]"}`}
    >
      <div className="flex min-w-0 items-start gap-2">
        {editing ? (
          <input
            ref={inputRef}
            className="tag-manager-edit-input min-w-0 flex-1 rounded-md border border-blue-400/35 bg-black/25 px-2 py-1 text-sm text-white outline-none ring-1 ring-blue-500/30"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); void commitRename(); }
              if (e.key === "Escape") setEditing(false);
            }}
            disabled={busy}
          />
        ) : (
          <Tooltip label="Search this tag" delay={500} anchorToCursor className="min-w-0 flex-1">
            <button
              className="tag-manager-name block w-full truncate pr-36 text-left text-sm font-medium text-white/85 transition-colors hover:text-white"
              onClick={() => onSearch(entry.tag)}
            >
              {entry.tag}
            </button>
          </Tooltip>
        )}
        <div className="absolute right-2.5 top-2 shrink-0">
          {entry.has_ai_source ? (
            <Tooltip label={sourceLabel} delay={400} anchorToCursor>
              <span className="tag-manager-count tag-manager-count-ai inline-flex h-5 items-center gap-1 rounded-full border border-sky-300/10 bg-sky-300/[0.075] px-1.5 text-[10px] tabular-nums text-sky-200/75">
                <AiSourceGlyph className="tag-manager-ai-glyph h-3 w-3" />
                {entry.count.toLocaleString()}
              </span>
            </Tooltip>
          ) : (
            <span className="tag-manager-count rounded-full bg-white/[0.055] px-2 py-0.5 text-[10px] tabular-nums text-white/38">
              {entry.count.toLocaleString()}
            </span>
          )}
        </div>
      </div>

      {editing ? (
        <div className="mt-2 flex items-center gap-1">
          <button
            className="tag-manager-save rounded-md bg-blue-500/20 px-2 py-1 text-[11px] text-blue-200 transition-colors hover:bg-blue-500/30 disabled:opacity-50"
            onClick={() => void commitRename()}
            disabled={busy || !value.trim()}
          >
            Save
          </button>
          <button
            className="tag-manager-secondary rounded-md border border-white/10 px-2 py-1 text-[11px] text-white/50 transition-colors hover:bg-white/5 hover:text-white/80"
            onClick={() => setEditing(false)}
            disabled={busy}
          >
            Cancel
          </button>
        </div>
      ) : confirming ? (
        <div className="mt-2 flex items-center gap-1">
          <button
            className="tag-manager-danger rounded-md bg-red-500/20 px-2 py-1 text-[11px] text-red-300 transition-colors hover:bg-red-500/30 disabled:opacity-50"
            onClick={async () => { setBusy(true); try { await onDelete(entry.tag); setConfirming(false); } finally { setBusy(false); } }}
            disabled={busy}
          >
            Delete
          </button>
          <button
            className="tag-manager-secondary rounded-md border border-white/10 px-2 py-1 text-[11px] text-white/50 transition-colors hover:bg-white/5 hover:text-white/80"
            onClick={() => setConfirming(false)}
            disabled={busy}
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="pointer-events-none absolute right-[5rem] top-1/2 flex -translate-y-1/2 items-center gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
          <Tooltip label="Rename or merge into another tag" delay={400} anchorToCursor>
            <button
              className="tag-manager-action inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/10 bg-gray-950/80 text-white/55 transition-colors hover:bg-white/8 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80"
              onClick={() => setEditing(true)}
              aria-label={`Rename ${entry.tag}`}
            >
              <RenameGlyph className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
          <Tooltip label="Delete this tag in the current scope" delay={400} anchorToCursor>
            <button
              className="tag-manager-action tag-manager-action-danger inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/10 bg-gray-950/80 text-white/55 transition-colors hover:bg-red-500/10 hover:text-red-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/80"
              onClick={() => setConfirming(true)}
              aria-label={`Delete ${entry.tag}`}
            >
              <DeleteGlyph className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
        </div>
      )}
    </div>
  );
}

export function TagManageList({
  entries,
  onSearch,
  onRename,
  onDelete,
  onResetAiTags,
  scopeLabel,
}: {
  entries: ExploreTagEntry[];
  onSearch: (tag: string) => void;
  onRename: (from: string, to: string) => Promise<void>;
  onDelete: (tag: string) => Promise<void>;
  onResetAiTags: () => Promise<number>;
  scopeLabel: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<TagManageSort>("count_desc");
  const [columns, setColumns] = useState(3);
  const [resetConfirming, setResetConfirming] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetStatus, setResetStatus] = useState<string | null>(null);

  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const update = () => {
      const width = el.getBoundingClientRect().width;
      setColumns(width >= 1160 ? 4 : width >= 780 ? 3 : width >= 520 ? 2 : 1);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const filteredEntries = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? entries.filter((entry) => entry.tag.toLowerCase().includes(needle))
      : entries;
    return [...filtered].sort((left, right) => {
      switch (sort) {
        case "count_asc":
          return left.count - right.count || left.tag.localeCompare(right.tag);
        case "az":
          return left.tag.localeCompare(right.tag);
        case "za":
          return right.tag.localeCompare(left.tag);
        case "count_desc":
        default:
          return right.count - left.count || left.tag.localeCompare(right.tag);
      }
    });
  }, [entries, query, sort]);

  const rowCount = Math.ceil(filteredEntries.length / columns);
  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 54,
    overscan: 7,
  });
  const visibleItems = rowVirtualizer.getVirtualItems();
  const totalUses = useMemo(() => entries.reduce((sum, entry) => sum + entry.count, 0), [entries]);

  const runResetAiTags = async () => {
    if (!resetConfirming) {
      setResetConfirming(true);
      setResetStatus(`Reset AI tags for ${scopeLabel}? User tags are preserved, and retagging is not queued automatically.`);
      return;
    }

    setResetting(true);
    setResetStatus(null);
    try {
      const count = await onResetAiTags();
      setResetStatus(
        count === 0
          ? "No AI tag data found for this scope."
          : `Reset AI tags for ${count.toLocaleString()} image${count === 1 ? "" : "s"}. Queue tagging when you're ready to retag.`,
      );
    } catch (error) {
      setResetStatus(String(error));
    } finally {
      setResetting(false);
      setResetConfirming(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="tag-manager-header shrink-0 border-b border-white/[0.05] bg-black/[0.08] px-6 py-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/32">
              <span className="tag-manager-stat rounded-full bg-white/[0.045] px-2 py-1 tabular-nums">{entries.length.toLocaleString()} tags</span>
              <span className="tag-manager-stat rounded-full bg-white/[0.045] px-2 py-1 tabular-nums">{totalUses.toLocaleString()} uses</span>
              {query.trim() ? (
                <span className="tag-manager-match rounded-full bg-blue-500/10 px-2 py-1 text-blue-200/70 tabular-nums">
                  {filteredEntries.length.toLocaleString()} matches
                </span>
              ) : null}
            </div>
            <p className="tag-manager-help mt-2 max-w-2xl text-[11px] leading-relaxed text-white/28">
              Rename tags to clean them up, rename into an existing tag to merge, or delete a tag everywhere in the current scope.
            </p>
            {resetStatus ? <p className="mt-2 text-[11px] leading-relaxed text-amber-200/80">{resetStatus}</p> : null}
          </div>

          <div className="flex min-w-[320px] flex-1 flex-wrap justify-end gap-2">
            <button
              className={`tag-manager-reset-button h-9 rounded-lg border px-3 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                resetConfirming
                  ? "tag-manager-reset-button-confirm border-red-400/30 bg-red-500/15 text-red-200 hover:bg-red-500/25"
                  : "border-white/8 bg-black/20 text-white/50 hover:bg-white/[0.06] hover:text-white/80"
              }`}
              onClick={() => void runResetAiTags()}
              disabled={resetting}
            >
              {resetting ? "Resetting..." : resetConfirming ? "Confirm reset" : "Reset AI tags"}
            </button>
            {resetConfirming ? (
              <button
                className="tag-manager-reset-cancel h-9 rounded-lg border border-white/8 bg-black/20 px-3 text-xs text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white/75 disabled:opacity-50"
                onClick={() => {
                  setResetConfirming(false);
                  setResetStatus(null);
                }}
                disabled={resetting}
              >
                Cancel
              </button>
            ) : null}
            <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
              <input
                className="tag-manager-filter h-9 w-full rounded-lg border border-white/8 bg-black/20 px-3 pr-8 text-sm text-white/85 outline-none transition-colors placeholder:text-white/22 focus:border-blue-400/35 focus:bg-black/28"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter tags"
              />
              {query ? (
                <span className="absolute right-2 top-2 z-10">
                  <Tooltip label="Clear filter" delay={400} anchorToCursor>
                    <button
                      className="tag-manager-clear inline-flex h-5 w-5 items-center justify-center rounded-md text-white/35 transition-colors hover:bg-white/8 hover:text-white/75 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
                      onClick={() => setQuery("")}
                      aria-label="Clear tag filter"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M6 6l12 12M18 6L6 18" />
                      </svg>
                    </button>
                  </Tooltip>
                </span>
              ) : null}
            </div>
            <Dropdown
              value={sort}
              onChange={setSort}
              options={TAG_MANAGE_SORTS}
              ariaLabel="Sort managed tags"
              align="right"
            />
          </div>
        </div>
      </div>

      <div ref={scrollRef} data-tag-manager-scroll className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div ref={measureRef} className="mx-auto w-full max-w-7xl">
          {filteredEntries.length === 0 ? (
            <div className="tag-manager-empty flex h-48 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.02] text-sm text-white/30">
              No tags match that filter.
            </div>
          ) : (
            <div
              className="relative w-full"
              style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
            >
              {visibleItems.map((virtualRow) => {
                const start = virtualRow.index * columns;
                const rowEntries = filteredEntries.slice(start, start + columns);
                return (
                  <div
                    key={virtualRow.key}
                    data-index={virtualRow.index}
                    ref={rowVirtualizer.measureElement}
                    className="absolute left-0 top-0 grid w-full gap-x-2 pb-2"
                    style={{
                      gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    {rowEntries.map((entry) => (
                      <TagManageTile
                        key={entry.tag}
                        entry={entry}
                        onSearch={onSearch}
                        onRename={onRename}
                        onDelete={onDelete}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


