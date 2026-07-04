import { AnimatePresence, motion } from 'framer-motion'
import { useGalleryStore } from '../store'

// Shown once on the first launch after an update, inviting the user to read the
// changelog. Distinct from UpdateToast (which drives the download/install flow).
export function WhatsNewToast() {
  const whatsNewToast = useGalleryStore((s) => s.whatsNewToast)
  const whatsNewOpen = useGalleryStore((s) => s.whatsNewOpen)
  const openWhatsNew = useGalleryStore((s) => s.openWhatsNew)
  const dismissWhatsNewToast = useGalleryStore((s) => s.dismissWhatsNewToast)

  const visible = whatsNewToast !== null && !whatsNewOpen

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.18 }}
          className="fixed right-4 bottom-4 z-50 w-80 rounded-lg border border-emerald-400/20 bg-gray-900 p-4 shadow-xl"
        >
          <p className="text-sm font-medium text-white">What's new in Phokus v{whatsNewToast}</p>
          <p className="mt-1 text-xs text-gray-500">See what's changed in this version.</p>
          <div className="mt-3 flex items-center gap-2">
            <button
              className="rounded-md border border-emerald-400/35 bg-emerald-500/15 px-3 py-1.5 text-xs text-emerald-200 transition-colors hover:bg-emerald-500/25"
              onClick={openWhatsNew}
            >
              What's new
            </button>
            <button
              className="rounded-md border border-transparent px-3 py-1.5 text-xs text-gray-500 transition-colors hover:bg-white/[0.06] hover:text-gray-200"
              onClick={dismissWhatsNewToast}
            >
              Dismiss
            </button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
