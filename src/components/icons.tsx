/**
 * Shared icons for paths that repeat across the app. One-off icons stay
 * inline at their call site — only extract here once a shape shows up in
 * three or more places. Stroke icons take a per-site strokeWidth because
 * weights legitimately differ by context (menus vs badges vs empty states).
 */

export interface IconProps {
  className?: string;
  strokeWidth?: number;
}

function strokeIcon(d: string, defaultStrokeWidth: number, displayName: string) {
  function Icon({ className = "", strokeWidth = defaultStrokeWidth }: IconProps) {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d={d} />
      </svg>
    );
  }
  Icon.displayName = displayName;
  return Icon;
}

export const CheckIcon = strokeIcon("M5 13l4 4L19 7", 2.5, "CheckIcon");
export const CloseIcon = strokeIcon("M6 18L18 6M6 6l12 12", 2, "CloseIcon");
export const ChevronDownIcon = strokeIcon("M19 9l-7 7-7-7", 2, "ChevronDownIcon");
export const ChevronRightIcon = strokeIcon("M9 5l7 7-7 7", 2, "ChevronRightIcon");
export const PlusIcon = strokeIcon("M12 4v16m8-8H4", 1.75, "PlusIcon");
export const PhotoIcon = strokeIcon(
  "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z",
  1.5,
  "PhotoIcon",
);
export const FolderIcon = strokeIcon(
  "M3 7a2 2 0 012-2h3.586a1 1 0 01.707.293l1.414 1.414A1 1 0 0011.414 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z",
  1.5,
  "FolderIcon",
);
export const WarningIcon = strokeIcon(
  "M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z",
  2,
  "WarningIcon",
);

export function StarIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.176 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81H7.03a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  );
}

export function PlayIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
