import { useLayoutEffect, useRef, useState } from "react";
import { Tooltip } from "../Tooltip";

export function TruncatedFilename({ filename }: { filename: string }) {
  const textRef = useRef<HTMLParagraphElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useLayoutEffect(() => {
    const text = textRef.current;
    if (!text) return;

    const update = () => {
      setIsTruncated(text.scrollWidth > text.clientWidth);
    };

    update();

    const observer = new ResizeObserver(update);
    observer.observe(text);
    return () => observer.disconnect();
  }, [filename]);

  const label = (
    <p ref={textRef} className="truncate text-[12px] font-medium leading-tight text-white">
      {filename}
    </p>
  );

  return (
    <Tooltip label={filename} delay={500} block followCursor disabled={!isTruncated}>
      {label}
    </Tooltip>
  );
}
