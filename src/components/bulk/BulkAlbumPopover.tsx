import { AlbumPicker } from '../AlbumPicker'

interface BulkAlbumPopoverProps {
  onPick: (albumId: number) => Promise<void>
}

export function BulkAlbumPopover({ onPick }: BulkAlbumPopoverProps) {
  return (
    <div
      data-bulk-popover
      className="absolute bottom-full left-1/2 mb-2 w-60 -translate-x-1/2 rounded-xl border border-white/10 bg-gray-950/98 p-2 shadow-2xl backdrop-blur"
    >
      <AlbumPicker onPick={(albumId) => void onPick(albumId)} />
    </div>
  )
}
