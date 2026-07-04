import { useEffect, useRef, useState } from "react";

/**
 * In-place rename input for sidebar rows (folders, albums). Mount it in
 * place of the row label while renaming: commits on Enter or blur (only when
 * the trimmed name is non-empty and actually changed), cancels on Escape.
 */
export function InlineRename({
  name,
  onRename,
  onClose,
}: {
  name: string;
  onRename: (next: string) => Promise<void> | void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const commit = async () => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== name) {
      await onRename(trimmed);
    }
    onClose();
  };

  return (
    <input
      ref={inputRef}
      className="w-full bg-white/10 text-white text-[13px] font-medium rounded px-1 py-0 outline-none ring-1 ring-blue-500/60 leading-tight"
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void commit();
        }
        if (event.key === "Escape") onClose();
      }}
      onBlur={() => void commit()}
      onClick={(event) => event.stopPropagation()}
    />
  );
}
