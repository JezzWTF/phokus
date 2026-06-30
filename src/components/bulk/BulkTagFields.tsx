import { useBulkTagEditor } from "./useBulkTagEditor";
import { Tooltip } from "../Tooltip";

// Presentational tag-editing fields shared by the popover and modal surfaces.
export function BulkTagFields({ autoFocus = false }: { autoFocus?: boolean }) {
  const { selectedCount, input, setInput, suggestions, appliedTags, pending, addTag, removeTag } =
    useBulkTagEditor();

  return (
    <div className="space-y-2">
      <form
        className="flex gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          void addTag(input);
        }}
      >
        {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
        <input
          autoFocus={autoFocus}
          className="min-w-0 flex-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white placeholder-gray-600 focus:border-white/20 focus:outline-none"
          placeholder={`Add tag to ${selectedCount} item${selectedCount === 1 ? "" : "s"}…`}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          disabled={pending}
        />
        <button
          type="submit"
          className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-gray-300 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          disabled={pending || !input.trim()}
        >
          Add
        </button>
      </form>

      {suggestions.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {suggestions.map((suggestion) => (
            <Tooltip key={suggestion.tag} label={`${suggestion.count.toLocaleString()} tagged`} anchorToCursor>
              <button
                className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px] text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
                onClick={() => void addTag(suggestion.tag)}
              >
                {suggestion.tag}
              </button>
            </Tooltip>
          ))}
        </div>
      ) : null}

      {appliedTags.length > 0 ? (
        <div className="flex flex-wrap gap-1 border-t border-white/[0.06] pt-2">
          {appliedTags.map((tag) => (
            <span
              key={tag}
              className="group/chip flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-gray-300"
            >
              {tag}
              <Tooltip label="Remove from selected" followCursor>
                <button
                  className="text-gray-600 transition-colors hover:text-white"
                  onClick={() => void removeTag(tag)}
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </Tooltip>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
