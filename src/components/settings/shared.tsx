import { ReactNode } from 'react'
import { TaggerAcceleration, TaggerModel, TaggingQueueScope } from '../../store'

export type SettingsSection = 'general' | 'media' | 'updates' | 'storage' | 'workspace'

export const SETTINGS_SECTIONS: { id: SettingsSection; label: string; detail: string }[] = [
  { id: 'general', label: 'General', detail: 'Theme and notifications' },
  { id: 'media', label: 'Media', detail: 'Playback and slideshow' },
  { id: 'updates', label: 'Updates & Setup', detail: 'Versions, setup, and tour' },
  { id: 'storage', label: 'Storage', detail: 'App data and maintenance' },
  { id: 'workspace', label: 'AI Workspace', detail: 'Tagging models and queue targets' },
]

export function formatBytesShort(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

export function StatusPill({
  children,
  tone,
}: {
  children: ReactNode
  tone: 'ready' | 'muted' | 'busy'
}) {
  const className =
    tone === 'ready'
      ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-300 light-theme:border-emerald-600/40 light-theme:bg-emerald-100 light-theme:text-emerald-700'
      : tone === 'busy'
        ? 'border-sky-400/25 bg-sky-500/10 text-sky-300 light-theme:border-sky-600/40 light-theme:bg-sky-100 light-theme:text-sky-700'
        : 'border-white/10 bg-white/[0.04] text-gray-500'

  return (
    <span
      className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${className}`}
    >
      {children}
    </span>
  )
}

export function SettingsGroup({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section>
      <h4 className="text-[12px] font-semibold tracking-[0.08em] text-gray-400 uppercase">
        {title}
      </h4>
      {description ? (
        <p className="mt-1 text-xs leading-relaxed text-gray-600">{description}</p>
      ) : null}
      <div className="mt-1 divide-y divide-white/[0.05]">{children}</div>
    </section>
  )
}

export function SettingsItem({
  label,
  description,
  children,
  vertical = false,
}: {
  label: ReactNode
  description?: ReactNode
  children?: ReactNode
  vertical?: boolean
}) {
  if (vertical) {
    return (
      <div className="py-4">
        <p className="text-sm text-white">{label}</p>
        {description ? (
          <div className="mt-1 text-xs leading-relaxed text-gray-500">{description}</div>
        ) : null}
        {children ? <div className="mt-3">{children}</div> : null}
      </div>
    )
  }

  return (
    <div className="flex items-start justify-between gap-6 py-4">
      <div className="min-w-0">
        <p className="text-sm text-white">{label}</p>
        {description ? (
          <div className="mt-1 max-w-xl text-xs leading-relaxed text-gray-500">{description}</div>
        ) : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

export function StatPair({
  label,
  value,
  accent = false,
}: {
  label: string
  value: string
  accent?: boolean
}) {
  return (
    <span className="inline-flex items-baseline gap-2">
      <span className="text-[10px] tracking-[0.14em] text-gray-600 uppercase">{label}</span>
      <span
        className={`text-sm font-semibold tabular-nums ${accent ? 'text-emerald-300' : 'text-white'}`}
      >
        {value}
      </span>
    </span>
  )
}

export function ScopeButton({
  scope,
  current,
  onSelect,
  children,
}: {
  scope: TaggingQueueScope
  current: TaggingQueueScope
  onSelect: (scope: TaggingQueueScope) => void
  children: ReactNode
}) {
  const active = scope === current
  return (
    <button
      type="button"
      className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
        active
          ? 'light-theme:border-emerald-600/50 light-theme:bg-emerald-100 light-theme:text-emerald-700 border-emerald-400/35 bg-emerald-500/15 text-emerald-200'
          : 'light-theme:text-gray-600 light-theme:hover:bg-gray-900 light-theme:hover:text-white border-transparent text-gray-500 hover:bg-white/[0.06] hover:text-gray-200'
      }`}
      onClick={() => onSelect(scope)}
    >
      {children}
    </button>
  )
}

export function TaggerModelButton({
  model,
  current,
  onSelect,
  children,
}: {
  model: TaggerModel
  current: TaggerModel
  onSelect: (model: TaggerModel) => void
  children: ReactNode
}) {
  const active = model === current
  return (
    <button
      type="button"
      className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
        active
          ? 'light-theme:border-emerald-600/50 light-theme:bg-emerald-100 light-theme:text-emerald-700 border-emerald-400/35 bg-emerald-500/15 text-emerald-200'
          : 'light-theme:text-gray-600 light-theme:hover:bg-gray-900 light-theme:hover:text-white border-transparent text-gray-500 hover:bg-white/[0.06] hover:text-gray-200'
      }`}
      onClick={() => onSelect(model)}
    >
      {children}
    </button>
  )
}

export function TaggerAccelerationButton({
  acceleration,
  current,
  onSelect,
  children,
}: {
  acceleration: TaggerAcceleration
  current: TaggerAcceleration
  onSelect: (acceleration: TaggerAcceleration) => void
  children: ReactNode
}) {
  const active = acceleration === current
  return (
    <button
      type="button"
      className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
        active
          ? 'light-theme:border-emerald-600/50 light-theme:bg-emerald-100 light-theme:text-emerald-700 border-emerald-400/35 bg-emerald-500/15 text-emerald-200'
          : 'light-theme:text-gray-600 light-theme:hover:bg-gray-900 light-theme:hover:text-white border-transparent text-gray-500 hover:bg-white/[0.06] hover:text-gray-200'
      }`}
      onClick={() => onSelect(acceleration)}
    >
      {children}
    </button>
  )
}

export const settingsButtonClass =
  'rounded-md border border-white/10 bg-white/[0.055] px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-45 light-theme:border-gray-700/50 light-theme:bg-gray-900 light-theme:text-white light-theme:hover:bg-gray-800 light-theme:hover:text-white'
