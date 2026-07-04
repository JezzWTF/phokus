import { useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { invoke } from '@tauri-apps/api/core'
import { useGalleryStore } from '../store'
import {
  getChangelogForVersion,
  type ChangelogEntry,
  type ChangelogItem,
  type ChangelogSection,
} from '../changelog'
import { Tooltip } from './Tooltip'
import { ChevronRightIcon, CloseIcon } from './icons'

// The modal adapts its layout to the size of the release: small releases keep
// the compact single-column list, while big ones switch to a two-pane layout
// with a section nav rail so no one pane is a marathon scroll. Preview both in
// UI Lab via `?changelog=unreleased` + the demo panel's "Open What's new modal".
type WhatsNewLayout = 'single' | 'rail'

// Above this many total bullets, the single column gets unpleasantly long.
const RAIL_THRESHOLD = 20

function chooseLayout(entry: ChangelogEntry | null): WhatsNewLayout {
  if (!entry || entry.sections.length < 2) return 'single'
  const total = entry.sections.reduce((sum, section) => sum + section.items.length, 0)
  return total > RAIL_THRESHOLD ? 'rail' : 'single'
}

// Shown in the tooltip so the user can see the link's destination before
// clicking. The actual navigation is handled by the open_changelog_url command.
const CHANGELOG_URL = 'https://github.com/JezzWTF/phokus/blob/main/CHANGELOG.md'

// Per-section accent. These all use the standard colour scale, which the
// subtle-light theme re-maps to readable dark shades via CSS variables — so no
// `light-theme:` overrides are needed (or wanted) here. See the theme note in
// index.css: `bg-white`/`text-white` deliberately become *dark* in light mode,
// so neutral surfaces must use the gray scale and trust the remap.
const SECTION_STYLES: Record<string, { label: string; dot: string }> = {
  Added: { label: 'text-emerald-300', dot: 'bg-emerald-400/80' },
  Changed: { label: 'text-sky-300', dot: 'bg-sky-300/80' },
  Fixed: { label: 'text-amber-300', dot: 'bg-amber-400/80' },
  Removed: { label: 'text-rose-300', dot: 'bg-rose-400/80' },
  Security: { label: 'text-violet-300', dot: 'bg-violet-400/80' },
}

const NEUTRAL_STYLE = { label: 'text-gray-300', dot: 'bg-gray-400/70' }

function sectionStyle(title: string) {
  return SECTION_STYLES[title] ?? NEUTRAL_STYLE
}

// Render the small amount of inline markdown the changelog uses: **bold** and
// `code`. Anything else passes through as plain text.
function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const regex = /\*\*(.+?)\*\*|`([^`]+)`/g
  let lastIndex = 0
  let key = 0
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }
    if (match[1] !== undefined) {
      nodes.push(
        <strong key={key++} className="font-semibold text-white">
          {match[1]}
        </strong>
      )
    } else if (match[2] !== undefined) {
      nodes.push(
        <code key={key++} className="rounded bg-white/10 px-1 py-0.5 text-[12px] text-gray-200">
          {match[2]}
        </code>
      )
    }
    lastIndex = regex.lastIndex
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }
  return nodes
}

function Item({ item, dot }: { item: ChangelogItem; dot: string }) {
  return (
    <li className="flex gap-3">
      <span className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
      <p className="text-[13px] leading-relaxed text-gray-400">
        {item.lead ? (
          <>
            <span className="font-semibold text-gray-100">{item.lead}</span>
            {item.body ? <span> — {renderInline(item.body)}</span> : null}
          </>
        ) : (
          renderInline(item.body)
        )}
      </p>
    </li>
  )
}

function ItemList({
  items,
  dot,
  className = '',
}: {
  items: ChangelogItem[]
  dot: string
  className?: string
}) {
  return (
    <ul className={`space-y-2.5 ${className}`}>
      {items.map((item, index) => (
        <Item key={index} item={item} dot={dot} />
      ))}
    </ul>
  )
}

function CollapsibleSection({ section }: { section: ChangelogSection }) {
  const style = sectionStyle(section.title)
  const [open, setOpen] = useState(true)

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 text-left"
        aria-expanded={open}
      >
        <ChevronRightIcon
          className={`h-3 w-3 shrink-0 text-gray-600 transition-transform ${open ? 'rotate-90' : ''}`}
          strokeWidth={2.5}
        />
        <span className={`text-[11px] font-semibold tracking-[0.1em] uppercase ${style.label}`}>
          {section.title}
        </span>
        <span className="text-[11px] font-medium text-gray-600">{section.items.length}</span>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <ItemList items={section.items} dot={style.dot} className="mt-2.5 pl-5" />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  )
}

// 'rail' layout — a section nav rail on the left, the selected section's items
// on the right.
function RailSections({ sections }: { sections: ChangelogSection[] }) {
  const [active, setActive] = useState(0)
  const section = sections[Math.min(active, sections.length - 1)]
  const style = sectionStyle(section.title)

  return (
    <div className="flex min-h-0 flex-1">
      <nav className="flex w-44 shrink-0 flex-col gap-1 border-r border-white/[0.07] px-3 py-4">
        {sections.map((s, index) => {
          const navStyle = sectionStyle(s.title)
          const isActive = index === active
          return (
            <button
              key={s.title}
              type="button"
              onClick={() => setActive(index)}
              className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-left text-[12px] font-medium transition-colors ${
                isActive
                  ? 'bg-white/[0.07] text-white'
                  : 'text-gray-500 hover:bg-white/[0.04] hover:text-gray-300'
              }`}
            >
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${navStyle.dot}`} />
              <span className="flex-1">{s.title}</span>
              <span className="text-[11px] font-medium text-gray-600">{s.items.length}</span>
            </button>
          )
        })}
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <p
          className={`mb-3 text-[11px] font-semibold tracking-[0.1em] uppercase ${style.label}`}
        >
          {section.title}
        </p>
        <ItemList items={section.items} dot={style.dot} />
      </div>
    </div>
  )
}

const MODAL_WIDTHS: Record<WhatsNewLayout, string> = {
  single: 'w-[min(88vw,560px)]',
  rail: 'w-[min(90vw,780px)]',
}

export function WhatsNewModal() {
  const whatsNewOpen = useGalleryStore((s) => s.whatsNewOpen)
  const closeWhatsNew = useGalleryStore((s) => s.closeWhatsNew)
  const appVersion = useGalleryStore((s) => s.appVersion)

  const entry = getChangelogForVersion(appVersion)
  const layout = chooseLayout(entry)

  useEffect(() => {
    if (!whatsNewOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeWhatsNew()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [whatsNewOpen, closeWhatsNew])

  const hasSections = entry !== null && entry.sections.length > 0

  return (
    <AnimatePresence>
      {whatsNewOpen ? (
        <motion.div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/65 px-6 backdrop-blur-sm"
          onClick={closeWhatsNew}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            className={`relative flex max-h-[min(82vh,760px)] ${MODAL_WIDTHS[layout]} flex-col overflow-hidden rounded-lg border border-white/10 bg-gray-950 shadow-2xl shadow-black/60`}
            onClick={(event) => event.stopPropagation()}
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 6 }}
            transition={{ duration: 0.16 }}
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/[0.07] px-6 py-5">
              <div>
                <p className="text-[11px] font-semibold tracking-[0.12em] text-emerald-300 uppercase">
                  What's new
                </p>
                <h3 className="mt-1 text-lg font-semibold text-white">
                  Phokus v{entry?.version ?? appVersion ?? '—'}
                </h3>
                {entry?.date ? (
                  <p className="mt-0.5 text-xs text-gray-600">Released {entry.date}</p>
                ) : null}
              </div>
              <Tooltip label="Close" anchorToCursor>
                <button
                  className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-white/[0.06] hover:text-white"
                  onClick={closeWhatsNew}
                >
                  <CloseIcon className="h-4 w-4" />
                </button>
              </Tooltip>
            </div>

            {hasSections && layout === 'rail' ? (
              <RailSections sections={entry.sections} />
            ) : (
              <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
                {hasSections ? (
                  entry.sections.map((section) => (
                    <CollapsibleSection key={section.title} section={section} />
                  ))
                ) : (
                  <p className="text-sm text-gray-500">
                    Release notes for this version aren't available in-app. See the full changelog
                    on GitHub.
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center justify-between gap-4 border-t border-white/[0.07] px-6 py-4">
              <Tooltip label={CHANGELOG_URL} side="top" align="start">
                <button
                  type="button"
                  onClick={() => void invoke('open_changelog_url')}
                  className="text-xs text-gray-500 transition-colors hover:text-gray-300"
                >
                  Full changelog ↗
                </button>
              </Tooltip>
              <button
                className="rounded-md border border-emerald-400/35 bg-emerald-500/15 px-3.5 py-1.5 text-xs text-emerald-200 transition-colors hover:bg-emerald-500/25"
                onClick={closeWhatsNew}
              >
                Got it
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
