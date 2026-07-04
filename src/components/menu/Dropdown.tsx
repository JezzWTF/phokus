import { ReactNode, useRef, useState } from 'react'
import { MenuCloseContext, MenuItem, MenuPanel, MenuSize } from './Menu'
import { useDismissable } from './useDismissable'
import { Tooltip } from '../Tooltip'
import { ChevronDownIcon } from '../icons'

export interface DropdownOption<T> {
  value: T
  label: string
  /** Trailing detail on the option row (e.g. an item count). */
  hint?: ReactNode
}

const TRIGGER_STYLES = {
  // Filled, bordered select — settings forms and panel headers.
  solid: {
    base: 'min-w-40 gap-2 rounded-md border px-3 py-1.5 text-xs border-white/10 bg-white/[0.055] light-theme:border-gray-700/50 light-theme:bg-gray-900',
    open: 'border-white/20 text-white light-theme:border-gray-700 light-theme:text-white',
    closed:
      'text-gray-400 hover:border-white/15 hover:text-gray-200 light-theme:text-white light-theme:hover:border-gray-700 light-theme:hover:bg-gray-800 light-theme:hover:text-white',
  },
  // Transparent until engaged — toolbar controls (sort, folder scope).
  ghost: {
    base: 'gap-1.5 rounded-lg border px-3 py-1.5 text-xs',
    open: 'border-white/15 bg-white/8 text-white light-theme:border-gray-700/50 light-theme:bg-gray-900 light-theme:text-white',
    closed:
      'border-white/8 bg-transparent text-gray-400 hover:border-white/15 hover:text-gray-200 light-theme:border-gray-700/40 light-theme:text-gray-600 light-theme:hover:border-gray-700 light-theme:hover:bg-gray-900 light-theme:hover:text-white',
  },
  // Tiny inline picker — sidebar section headers.
  compact: {
    base: 'gap-2 rounded-md border px-1.5 py-0.5 text-[10px] font-medium border-white/10 bg-white/[0.04] light-theme:border-gray-700/50 light-theme:bg-gray-900',
    open: 'border-white/20 text-white light-theme:border-gray-700 light-theme:text-white',
    closed:
      'text-gray-400 hover:border-white/15 hover:text-gray-200 light-theme:text-white light-theme:hover:border-gray-700 light-theme:hover:bg-gray-800 light-theme:hover:text-white',
  },
} as const

/**
 * The app-wide select control: a trigger button plus a MenuPanel of options.
 * Replaces the former ThemedDropdown / SortDropdown / FolderScopeDropdown
 * trio. Options are compared to `value` with Object.is, so number and
 * null values (folder scopes) work as well as string unions.
 */
export function Dropdown<T extends string | number | null>({
  value,
  options,
  onChange,
  ariaLabel,
  align = 'right',
  trigger = 'solid',
  size = 'sm',
  triggerIcon,
  triggerTooltip,
  triggerClassName = '',
  panelClassName = '',
}: {
  value: T
  options: DropdownOption<T>[]
  onChange: (value: T) => void
  ariaLabel: string
  align?: 'left' | 'right'
  trigger?: keyof typeof TRIGGER_STYLES
  size?: MenuSize
  triggerIcon?: ReactNode
  triggerTooltip?: string
  triggerClassName?: string
  panelClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = options.find((option) => Object.is(option.value, value)) ?? options[0]
  const style = TRIGGER_STYLES[trigger]

  useDismissable(ref, () => setOpen(false), open)

  const button = (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-haspopup="listbox"
      aria-expanded={open}
      onClick={() => setOpen((currentOpen) => !currentOpen)}
      className={`dropdown-trigger flex items-center justify-between transition-colors ${style.base} ${
        open ? style.open : style.closed
      } ${triggerClassName}`}
    >
      {triggerIcon}
      <span className="min-w-0 truncate">{current?.label}</span>
      <ChevronDownIcon
        className={`h-3 w-3 shrink-0 text-gray-500 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
      />
    </button>
  )

  return (
    <div ref={ref} className="relative">
      {triggerTooltip ? (
        <Tooltip label={triggerTooltip} anchorToCursor>
          {button}
        </Tooltip>
      ) : (
        button
      )}
      {open ? (
        <div
          role="listbox"
          aria-label={ariaLabel}
          className={`absolute top-full z-50 mt-1.5 min-w-full ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          <MenuCloseContext.Provider value={() => setOpen(false)}>
            <MenuPanel size={size} className={panelClassName}>
              {options.map((option) => {
                const selected = Object.is(option.value, value)
                return (
                  <MenuItem
                    key={String(option.value)}
                    role="option"
                    label={option.label}
                    hint={option.hint}
                    active={selected}
                    checked={selected}
                    onSelect={() => onChange(option.value)}
                  />
                )
              })}
            </MenuPanel>
          </MenuCloseContext.Provider>
        </div>
      ) : null}
    </div>
  )
}
