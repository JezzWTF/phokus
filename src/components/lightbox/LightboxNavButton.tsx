import { ChevronRightIcon } from "../icons";

interface LightboxNavButtonProps {
  direction: "previous" | "next";
  disabled: boolean;
  onClick: () => void;
}

export function LightboxNavButton({ direction, disabled, onClick }: LightboxNavButtonProps) {
  const isNext = direction === "next";

  return (
    <button
      className={`absolute top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white transition-colors hover:bg-white/20 disabled:opacity-20 ${
        isNext ? "right-72 lg:right-80" : "left-4"
      }`}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      aria-label={isNext ? "Next image" : "Previous image"}
    >
      {isNext ? (
        <ChevronRightIcon className="h-5 w-5" />
      ) : (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      )}
    </button>
  );
}
