// Parses the project CHANGELOG.md (imported raw at build time) into structured
// data so the "What's New" UI can render it nicely instead of dumping markdown.
// Keeping the changelog as the single source of truth means there's no separate
// per-release copy to maintain — whatever ships in CHANGELOG.md is what users see.
import changelogRaw from '../CHANGELOG.md?raw'

export interface ChangelogItem {
  /** The bold lead-in at the start of a bullet (e.g. "Custom multi-folder picker"), if any. */
  lead: string | null
  /** The remaining descriptive text. May still contain inline `code` / **bold** markers. */
  body: string
}

export interface ChangelogSection {
  /** "Added" | "Changed" | "Fixed" | "Removed" | "Deprecated" | "Security" */
  title: string
  items: ChangelogItem[]
}

export interface ChangelogEntry {
  version: string
  date: string | null
  sections: ChangelogSection[]
}

// "## [0.1.1] — 2026-06-23" / "## [Unreleased]"
const VERSION_HEADING = /^##\s+\[([^\]]+)\]\s*(?:[—–-]\s*(.+?)\s*)?$/
// "### Added"
const SECTION_HEADING = /^###\s+(.+?)\s*$/
// "- bullet text"
const BULLET = /^[-*]\s+(.*)$/
// Leading "**Title**" optionally followed by an em dash, used as the item's lead-in.
// (Item text is whitespace-collapsed before matching, so no dotAll flag needed.)
const LEAD = /^\*\*(.+?)\*\*\s*(?:[—–-]\s*)?(.*)$/

function toItem(text: string): ChangelogItem {
  const collapsed = text.replace(/\s+/g, ' ').trim()
  const match = collapsed.match(LEAD)
  if (match) {
    return { lead: match[1].trim(), body: match[2].trim() }
  }
  return { lead: null, body: collapsed }
}

function parseChangelog(raw: string): ChangelogEntry[] {
  const lines = raw.split(/\r?\n/)
  const entries: ChangelogEntry[] = []

  let entry: ChangelogEntry | null = null
  let section: ChangelogSection | null = null
  let buffer: string[] = []

  const flushItem = () => {
    if (section && buffer.length > 0) {
      section.items.push(toItem(buffer.join(' ')))
    }
    buffer = []
  }

  for (const line of lines) {
    const versionMatch = line.match(VERSION_HEADING)
    if (versionMatch) {
      flushItem()
      section = null
      entry = {
        version: versionMatch[1].trim(),
        date: versionMatch[2]?.trim() ?? null,
        sections: [],
      }
      entries.push(entry)
      continue
    }

    // Stop collecting once we leave the changelog body (e.g. link-reference defs at EOF).
    if (!entry) continue

    const sectionMatch = line.match(SECTION_HEADING)
    if (sectionMatch) {
      flushItem()
      section = { title: sectionMatch[1].trim(), items: [] }
      entry.sections.push(section)
      continue
    }

    const bulletMatch = line.match(BULLET)
    if (bulletMatch) {
      flushItem()
      buffer.push(bulletMatch[1])
      continue
    }

    if (line.trim() === '') {
      // A blank line ends a (possibly wrapped) multi-line bullet.
      flushItem()
      continue
    }

    // Indented continuation of the current wrapped bullet.
    if (buffer.length > 0) {
      buffer.push(line.trim())
    }
  }

  flushItem()
  return entries.map((e) => ({ ...e, sections: e.sections.filter((s) => s.items.length > 0) }))
}

const ENTRIES = parseChangelog(changelogRaw)

// Synthetic small release for UI Lab (`?changelog=small`). The What's New modal
// switches layout by release size, and every real entry in CHANGELOG.md is
// large — so the compact single-column layout can't be exercised from real
// data. This stays below the modal's rail threshold on purpose.
const SMALL_PREVIEW_ENTRY: ChangelogEntry = {
  version: '0.0.0-preview',
  date: '2026-01-01',
  sections: [
    {
      title: 'Added',
      items: [
        {
          lead: 'Sample setting',
          body: 'a small toggle that exists purely so this preview has an Added section.',
        },
      ],
    },
    {
      title: 'Changed',
      items: [
        {
          lead: 'Snappier previews',
          body: 'the preview fixture now loads instantly, because it is made up.',
        },
        { lead: null, body: 'A plain full-sentence bullet without a bold lead, for coverage.' },
      ],
    },
    {
      title: 'Fixed',
      items: [
        {
          lead: 'Hotfix-sized fix',
          body: 'a believable one-liner about a bug that never shipped.',
        },
        {
          lead: 'Another small fix',
          body: 'keeps the total item count comfortably under the rail threshold.',
        },
      ],
    },
  ],
}

// UI Lab affordance (browser-only `ui` mode): `?changelog=` previews an entry
// other than the running version's, mirroring the `?scenario=` pattern.
//   ?changelog=unreleased — the in-progress [Unreleased] notes (large release)
//   ?changelog=small      — synthetic hotfix-sized entry (compact layout)
//   ?changelog=0.1.1      — any specific released version
function previewOverride(): ChangelogEntry | null {
  if (import.meta.env.MODE !== 'ui') return null
  const preview = new URLSearchParams(window.location.search).get('changelog')
  if (!preview) return null
  if (preview === 'small') return SMALL_PREVIEW_ENTRY
  return ENTRIES.find((e) => e.version.toLowerCase() === preview.toLowerCase()) ?? null
}

export function getChangelogForVersion(version: string | null | undefined): ChangelogEntry | null {
  const override = previewOverride()
  if (override) return override
  if (!version) return null
  // Strip leading "v" and any build suffix (e.g. "-ui", "-dev", "-beta.1") so
  // dev/UI-lab builds still resolve to the correct changelog entry.
  const normalized = version.replace(/^v/, '').replace(/-[a-z].*/i, '')
  // Never surface the in-progress [Unreleased] section to users.
  if (normalized.toLowerCase() === 'unreleased') return null
  return ENTRIES.find((e) => e.version.replace(/^v/, '') === normalized) ?? null
}
