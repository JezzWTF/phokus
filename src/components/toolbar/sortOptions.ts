import { MediaFilter, SortOrder } from '../../store'

const BASE_SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: 'date_desc', label: 'Newest first' },
  { value: 'date_asc', label: 'Oldest first' },
  { value: 'taken_desc', label: 'Taken: newest' },
  { value: 'taken_asc', label: 'Taken: oldest' },
  { value: 'name_asc', label: 'Name A–Z' },
  { value: 'name_desc', label: 'Name Z–A' },
  { value: 'rating_desc', label: 'Highest rated' },
  { value: 'rating_asc', label: 'Lowest rated' },
  { value: 'size_desc', label: 'Largest first' },
  { value: 'size_asc', label: 'Smallest first' },
]

const VIDEO_SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: 'duration_desc', label: 'Longest first' },
  { value: 'duration_asc', label: 'Shortest first' },
]

export function getSortOptions(mediaFilter: MediaFilter) {
  if (mediaFilter === 'video') {
    return [...BASE_SORT_OPTIONS, ...VIDEO_SORT_OPTIONS]
  }
  return BASE_SORT_OPTIONS
}
