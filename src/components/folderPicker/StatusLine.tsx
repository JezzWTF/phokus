import { FolderAddResult } from '../../store'

export function StatusLine({ results }: { results: FolderAddResult[] | null }) {
  if (!results) return null
  const added = results.filter((result) => result.status === 'added').length
  const skipped = results.filter((result) => result.status === 'skipped').length
  const failed = results.filter((result) => result.status === 'error').length
  return (
    <p className="light-theme:text-gray-600 text-xs text-gray-500">
      Added {added}, skipped {skipped}, failed {failed}.
    </p>
  )
}
