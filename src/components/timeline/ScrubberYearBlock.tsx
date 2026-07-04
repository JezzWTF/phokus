import { Tooltip } from "../Tooltip";
import { ScrubberYear } from "./types";

interface ScrubberYearBlockProps {
  yearEntry: ScrubberYear;
  activeGroupIndex: number;
  onScrollTo: (index: number) => void;
}

export function ScrubberYearBlock({ yearEntry, activeGroupIndex, onScrollTo }: ScrubberYearBlockProps) {
  const isYearActive = yearEntry.months.some((month) => month.groupIndex === activeGroupIndex);

  return (
    <div className="flex w-full flex-col items-center">
      <Tooltip label={yearEntry.year} anchorToCursor>
        <button
          className={`w-full py-0.5 text-center text-[10px] font-semibold tracking-wide transition-colors ${
            isYearActive ? "text-white/80" : "text-white/30 hover:text-white/55"
          }`}
          onClick={() => onScrollTo(yearEntry.firstGroupIndex)}
        >
          {yearEntry.year}
        </button>
      </Tooltip>
      <div className="grid gap-[3px] pb-1.5" style={{ gridTemplateColumns: "repeat(3, 10px)" }}>
        {Array.from({ length: 12 }, (_, index) => {
          const monthNum = index + 1;
          const monthEntry = yearEntry.months.find((month) => month.monthNum === monthNum);
          const isActive = monthEntry !== undefined && monthEntry.groupIndex === activeGroupIndex;
          if (!monthEntry) {
            return <span key={monthNum} className="h-[10px] w-[10px]" />;
          }
          return (
            <Tooltip key={monthNum} label={`${monthEntry.label} ${yearEntry.year}`} anchorToCursor>
              <button
                onClick={() => onScrollTo(monthEntry.groupIndex)}
                className={`h-[10px] w-[10px] rounded-full transition-colors ${
                  isActive ? "bg-white/70" : "bg-white/15 hover:bg-white/40"
                }`}
              />
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
