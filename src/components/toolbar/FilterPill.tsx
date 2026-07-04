export function FilterPill({
  label,
  active,
  onClick,
  variant = "default",
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  variant?: "default" | "amber";
}) {
  const activeClass =
    variant === "amber"
      ? "bg-amber-500/15 text-amber-300 border border-amber-500/30 light-theme:bg-amber-100 light-theme:text-amber-700 light-theme:border-amber-500/50"
      : "bg-white/10 text-white light-theme:bg-gray-900 light-theme:text-white";
  return (
    <button
      className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150 ${
        active
          ? activeClass
          : "text-gray-500 hover:bg-white/5 hover:text-gray-200 light-theme:text-gray-600 light-theme:hover:bg-gray-900 light-theme:hover:text-white"
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
