import { motion } from 'framer-motion'
import type { ExploreMode } from '../../store'

function Spinner() {
  return (
    <motion.div
      className="explore-spinner h-5 w-5 rounded-full border-2 border-white/15 border-t-white/50"
      animate={{ rotate: 360 }}
      transition={{ duration: 0.85, repeat: Infinity, ease: 'linear' }}
    />
  )
}

export function ExploreLoadingPanel({ mode }: { mode: ExploreMode }) {
  const title = mode === 'visual' ? 'Building visual clusters' : 'Reading tag frequencies'
  const subtitle =
    mode === 'visual'
      ? 'Grouping similar images into browsable clusters.'
      : 'Collecting tags from the current library scope.'

  return (
    <div className="flex flex-1 items-center justify-center px-8">
      <div className="flex max-w-sm flex-col items-center text-center">
        <div className="mb-4 flex items-center justify-center gap-3 text-white/65">
          <Spinner />
          <span className="text-sm font-medium">{title}</span>
        </div>
        <p className="text-sm leading-relaxed text-white/25">{subtitle}</p>
        <div className="mt-6 h-px w-40 overflow-hidden rounded-full bg-white/[0.06]">
          <motion.div
            className="h-full w-16 rounded-full bg-white/25"
            animate={{ x: [-72, 184] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
      </div>
    </div>
  )
}
