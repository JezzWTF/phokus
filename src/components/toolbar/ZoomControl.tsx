import { tileSizeForZoom, useGalleryStore } from "../../store";
import { Tooltip } from "../Tooltip";

export function ZoomControl() {
  const zoomPreset = useGalleryStore((state) => state.zoomPreset);
  const setZoomPreset = useGalleryStore((state) => state.setZoomPreset);

  return (
    <div className="flex items-center overflow-hidden rounded-lg border border-white/8 light-theme:border-gray-700/40">
      {(["compact", "comfortable", "detail"] as const).map((preset, index) => {
        const presetSize = tileSizeForZoom(preset);
        const presetLabel = preset === "compact" ? "" : preset === "comfortable" ? "" : "";
        return (
          <Tooltip key={preset} label={`${presetLabel} (${presetSize}px tiles)`} followCursor>
            <button
              aria-label={`${presetLabel} (${presetSize}px tiles)`}
              className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                index > 0 ? "border-l border-white/8" : ""
              } ${
                zoomPreset === preset
                  ? "bg-white/10 text-white light-theme:bg-gray-900 light-theme:text-white"
                  : "text-gray-500 hover:bg-white/5 hover:text-gray-200 light-theme:text-gray-600 light-theme:hover:bg-gray-900 light-theme:hover:text-white"
              }`}
              onClick={() => setZoomPreset(preset)}
            >
              {preset === "compact" ? "S" : preset === "comfortable" ? "M" : "L"}
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
