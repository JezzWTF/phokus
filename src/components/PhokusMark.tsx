// Phokus brand mark — a camera iris, rendered inline so it inherits `currentColor`
// and scales to any size. Drive color + dimensions from the className, e.g.
//   <PhokusMark className="h-4 w-4 text-gray-300" />
// The full app-icon tile (filled iris on a dark rounded square) lives in
// branding/phokus-aperture.svg and feeds `pnpm tauri icon`.
const BLADE = "M0,-4.18 A10,10 0 0 1 6.43,-7.66";

export function PhokusMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
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
    </svg>
  );
}
