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

export function getChangelogForVersion(version: string | null | undefined): ChangelogEntry | null {
  if (!version) return null
  // Strip leading "v" and any build suffix (e.g. "-ui", "-dev", "-beta.1") so
  // dev/UI-lab builds still resolve to the correct changelog entry.
  const normalized = version.replace(/^v/, '').replace(/-[a-z].*/i, '')
  // Never surface the in-progress [Unreleased] section to users.
  if (normalized.toLowerCase() === 'unreleased') return null
  return ENTRIES.find((e) => e.version.replace(/^v/, '') === normalized) ?? null
}
