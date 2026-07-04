import { useEffect } from 'react'
import { useGalleryStore } from '../../store'
import { Dropdown } from '../menu'
import { getSortOptions } from './sortOptions'

export function SortControl() {
  const sort = useGalleryStore((state) => state.sort)
  const setSort = useGalleryStore((state) => state.setSort)
  const mediaFilter = useGalleryStore((state) => state.mediaFilter)

  useEffect(() => {
    if (mediaFilter !== 'video' && (sort === 'duration_asc' || sort === 'duration_desc')) {
      setSort('date_desc')
    }
  }, [mediaFilter, sort, setSort])

  return (
    <Dropdown
      value={sort}
      onChange={setSort}
      options={getSortOptions(mediaFilter)}
      ariaLabel="Sort order"
      trigger="ghost"
      size="md"
      panelClassName="min-w-44"
    />
  )
}
