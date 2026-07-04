import { ImageRecord } from '../../store'

export interface TimelineGroup {
  key: string
  label: string
  images: ImageRecord[]
}

export type TimelineRow =
  { type: 'header'; group: TimelineGroup } | { type: 'tiles'; images: ImageRecord[] }

export interface ScrubberMonth {
  monthNum: number
  label: string
  groupIndex: number
}

export interface ScrubberYear {
  year: string
  firstGroupIndex: number
  months: ScrubberMonth[]
}

export interface TimelineRows {
  rows: TimelineRow[]
  rowToGroupIndex: number[]
  groupFirstRow: number[]
}
