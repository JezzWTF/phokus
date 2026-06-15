// Phokus aperture mark — copied (not imported) from the desktop app so the
// website stays decoupled from the Tauri renderer. Inherits currentColor.
const BLADE = "M0,-4.18 A10,10 0 0 1 6.43,-7.66";

export function PhokusMark({
  className,
  dotClassName,
}: {
  className?: string;
  dotClassName?: string;
}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <g
        transform="translate(12 12)"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle r="10" />
        <path d="M0,-4.18 A4.73,4.73 0 0 0 3.62,-2.09 A4.73,4.73 0 0 0 3.62,2.09 A4.73,4.73 0 0 0 0,4.18 A4.73,4.73 0 0 0 -3.62,2.09 A4.73,4.73 0 0 0 -3.62,-2.09 A4.73,4.73 0 0 0 0,-4.18 Z" />
        <path d={BLADE} />
        <path d={BLADE} transform="rotate(60)" />
        <path d={BLADE} transform="rotate(120)" />
        <path d={BLADE} transform="rotate(180)" />
        <path d={BLADE} transform="rotate(240)" />
        <path d={BLADE} transform="rotate(300)" />
      </g>
      {dotClassName ? <circle cx="12" cy="12" r="2.6" stroke="none" className={dotClassName} /> : null}
    </svg>
  );
}
