import { ParsedSearch } from '../../store'
import { PhotoIcon } from '../icons'

export function GalleryLoadingState({
  isSimilarResults,
  parsedSearch,
}: {
  isSimilarResults: boolean
  parsedSearch: ParsedSearch
}) {
  return (
    <div className="absolute inset-0 flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
      <div className="min-w-72 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8">
        <div className="mx-auto h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
        <p className="mt-4 text-sm font-medium text-white/40">
          {isSimilarResults
            ? 'Finding similar images'
            : parsedSearch.mode === 'semantic' && parsedSearch.query.length > 0
              ? `Searching for matches to "${parsedSearch.query}"`
              : parsedSearch.mode === 'tag' && parsedSearch.query.length > 0
                ? `Searching tags for "${parsedSearch.query}"`
                : 'Loading media'}
        </p>
        <p className="mt-1 text-xs text-white/20">
          {isSimilarResults
            ? 'Comparing visual embeddings'
            : parsedSearch.mode === 'semantic' && parsedSearch.query.length > 0
              ? 'Semantic search can take a little longer than filename search'
              : parsedSearch.mode === 'tag' && parsedSearch.query.length > 0
                ? 'Matching against AI and user tags'
                : 'Fetching results'}
        </p>
      </div>
    </div>
  )
}

export function GalleryEmptyState({
  imageLoadError,
  isSimilarResults,
  parsedSearch,
}: {
  imageLoadError: string | null
  isSimilarResults: boolean
  parsedSearch: ParsedSearch
}) {
  return (
    <div className="absolute inset-0 flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8">
        <PhotoIcon className="mx-auto mb-4 h-12 w-12 text-white/10" strokeWidth={0.75} />
        <p className="text-sm font-medium text-white/30">
          {imageLoadError
            ? 'Could not load results'
            : isSimilarResults
              ? 'No similar images found'
              : parsedSearch.mode === 'semantic' && parsedSearch.query.length > 0
                ? 'No semantic matches found'
                : parsedSearch.mode === 'tag' && parsedSearch.query.length > 0
                  ? 'No tag matches found'
                  : 'No media found'}
        </p>
        <p className="mt-1 text-xs text-white/15">
          {imageLoadError
            ? imageLoadError
            : isSimilarResults
              ? 'This item may be visually isolated, or more embeddings may need to finish processing'
              : parsedSearch.mode === 'semantic' && parsedSearch.query.length > 0
                ? 'Try a broader phrase, or wait for more embeddings to finish processing'
                : parsedSearch.mode === 'tag' && parsedSearch.query.length > 0
                  ? 'Try a shorter tag, or wait for more tagging jobs to finish'
                  : 'Try adjusting your filters or add a new folder'}
        </p>
      </div>
    </div>
  )
}
