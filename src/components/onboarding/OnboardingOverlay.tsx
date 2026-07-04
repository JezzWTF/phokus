import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useGalleryStore } from '../../store'
import { StepWelcome } from './StepWelcome'
import { StepAddLibrary } from './StepAddLibrary'
import { StepPipeline } from './StepPipeline'
import { StepGalleryPreview } from './StepGalleryPreview'
import { StepSearchDemo } from './StepSearchDemo'
import { StepViews } from './StepViews'
import { StepAiFeatures } from './StepAiFeatures'
import { StepUpdates } from './StepUpdates'

const STEPS: { id: string; title: string; component: () => React.ReactNode }[] = [
  { id: 'welcome', title: 'Welcome', component: () => <StepWelcome /> },
  { id: 'library', title: 'Your library', component: () => <StepAddLibrary /> },
  { id: 'pipeline', title: 'Background work', component: () => <StepPipeline /> },
  { id: 'gallery', title: 'The gallery', component: () => <StepGalleryPreview /> },
  { id: 'search', title: 'Search', component: () => <StepSearchDemo /> },
  { id: 'views', title: 'Views', component: () => <StepViews /> },
  { id: 'ai', title: 'AI features', component: () => <StepAiFeatures /> },
  { id: 'updates', title: 'Staying current', component: () => <StepUpdates /> },
]

export function OnboardingOverlay() {
  const onboardingOpen = useGalleryStore((s) => s.onboardingOpen)
  const onboardingStep = useGalleryStore((s) => s.onboardingStep)
  const setOnboardingStep = useGalleryStore((s) => s.setOnboardingStep)
  const completeOnboarding = useGalleryStore((s) => s.completeOnboarding)

  useEffect(() => {
    if (!onboardingOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') completeOnboarding()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onboardingOpen, completeOnboarding])

  if (!onboardingOpen) return null

  const step = STEPS[Math.min(onboardingStep, STEPS.length - 1)]
  const isFirst = onboardingStep === 0
  const isLast = onboardingStep >= STEPS.length - 1

  return (
    <div className="light-theme:bg-black/40 fixed inset-0 z-[70] flex items-center justify-center bg-black/65 backdrop-blur-sm">
      <div className="light-theme:border-gray-300/70 flex max-h-[min(85vh,760px)] w-[min(90vw,720px)] flex-col rounded-lg border border-white/10 bg-gray-950 shadow-2xl shadow-black/60">
        {/* Header */}
        <div className="light-theme:border-gray-300/70 flex items-center justify-between border-b border-white/[0.07] px-7 py-4">
          <div>
            <p className="text-[11px] tracking-[0.14em] text-gray-600 uppercase">
              Step {onboardingStep + 1} of {STEPS.length}
            </p>
            <h2 className="mt-0.5 text-base font-semibold text-white">{step.title}</h2>
          </div>
          <div className="flex items-center gap-1.5">
            {STEPS.map((s, i) => (
              <button
                key={s.id}
                aria-label={s.title}
                className={`h-1.5 rounded-full transition-all ${
                  i === onboardingStep
                    ? 'light-theme:bg-gray-700 w-5 bg-white/70'
                    : i < onboardingStep
                      ? 'light-theme:bg-gray-400 w-1.5 bg-white/35'
                      : 'light-theme:bg-gray-300 w-1.5 bg-white/15'
                }`}
                onClick={() => setOnboardingStep(i)}
              />
            ))}
          </div>
        </div>

        {/* Step body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-7 py-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={step.id}
              initial={{ opacity: 0, x: 14 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -14 }}
              transition={{ duration: 0.16 }}
            >
              {step.component()}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="light-theme:border-gray-300/70 flex items-center justify-between border-t border-white/[0.07] px-7 py-4">
          <button
            className="light-theme:border-gray-700/50 light-theme:bg-gray-900 light-theme:text-white light-theme:hover:bg-gray-800 light-theme:hover:text-white rounded-md border border-transparent px-3 py-1.5 text-xs text-gray-500 transition-colors hover:bg-white/[0.06] hover:text-gray-200"
            onClick={completeOnboarding}
          >
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            <button
              className="light-theme:border-gray-700/50 light-theme:bg-gray-900 light-theme:text-white light-theme:hover:bg-gray-800 light-theme:hover:text-white rounded-md border border-white/10 bg-white/[0.055] px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
              onClick={() => setOnboardingStep(onboardingStep - 1)}
              disabled={isFirst}
            >
              Back
            </button>
            <button
              className="rounded-md border border-emerald-400/35 bg-emerald-500/15 px-4 py-1.5 text-xs text-emerald-200 transition-colors hover:bg-emerald-500/25"
              onClick={() =>
                isLast ? completeOnboarding() : setOnboardingStep(onboardingStep + 1)
              }
            >
              {isLast ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
