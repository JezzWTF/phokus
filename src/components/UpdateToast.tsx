import { AnimatePresence, motion } from "framer-motion";
import { useGalleryStore } from "../store";

export function UpdateToast() {
  const updateStatus = useGalleryStore((s) => s.updateStatus);
  const updateVersion = useGalleryStore((s) => s.updateVersion);
  const updateProgress = useGalleryStore((s) => s.updateProgress);
  const updateDismissed = useGalleryStore((s) => s.updateDismissed);
  const installUpdate = useGalleryStore((s) => s.installUpdate);
  const dismissUpdate = useGalleryStore((s) => s.dismissUpdate);

  const visible =
    !updateDismissed &&
    (updateStatus === "available" || updateStatus === "downloading" || updateStatus === "installing");

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.18 }}
          className="fixed bottom-4 right-4 z-50 w-80 rounded-lg border border-white/10 bg-gray-900 p-4 shadow-xl"
        >
          {updateStatus === "available" ? (
            <>
              <p className="text-sm font-medium text-white">Update available</p>
              <p className="mt-1 text-xs text-gray-500">
                Phokus v{updateVersion} is ready to download and install.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <button
                  className="rounded-md border border-emerald-400/35 bg-emerald-500/15 px-3 py-1.5 text-xs text-emerald-200 transition-colors hover:bg-emerald-500/25 light-theme:border-emerald-600/50 light-theme:bg-emerald-100 light-theme:text-emerald-700 light-theme:hover:bg-emerald-200"
                  onClick={() => void installUpdate()}
                >
                  Install &amp; restart
                </button>
                <button
                  className="rounded-md border border-transparent px-3 py-1.5 text-xs text-gray-500 transition-colors hover:bg-white/[0.06] hover:text-gray-200"
                  onClick={dismissUpdate}
                >
                  Later
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-white">
                {updateStatus === "installing" ? "Installing update..." : "Downloading update..."}
              </p>
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full rounded-full bg-emerald-400/80 transition-[width] duration-200 ${
                    updateProgress === null ? "w-full animate-pulse" : ""
                  }`}
                  style={updateProgress !== null ? { width: `${Math.round(updateProgress * 100)}%` } : undefined}
                />
              </div>
              <p className="mt-2 text-xs text-gray-600">The app will restart when it finishes.</p>
            </>
          )}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
