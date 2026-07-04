export function NavItem({
  label,
  iconPath,
  active,
  onClick,
}: {
  label: string;
  iconPath: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-all duration-150 ${
        active ? "bg-white/8 text-white" : "text-gray-500 hover:text-gray-200 hover:bg-white/5"
      }`}
      onClick={onClick}
    >
      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={iconPath} />
      </svg>
      <span className={`text-[13px] font-medium ${active ? "text-white" : ""}`}>{label}</span>
    </div>
  );
}


