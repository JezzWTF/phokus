import { ReactNode } from 'react'
import { Tooltip } from '../Tooltip'

export function ControlButton({
  onClick,
  label,
  active = false,
  children,
}: {
  onClick: () => void
  label: string
  active?: boolean
  children: ReactNode
}) {
  return (
    <Tooltip label={label} anchorToCursor>
      <button
        className={`rounded-md p-1.5 transition-colors ${active ? 'text-white' : 'text-gray-300 hover:text-white'} hover:bg-white/10`}
        onClick={(event) => {
          event.stopPropagation()
          onClick()
        }}
      >
        {children}
      </button>
    </Tooltip>
  )
}
