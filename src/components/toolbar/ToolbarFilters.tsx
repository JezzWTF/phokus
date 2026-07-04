import { useGalleryStore } from '../../store'
import { ColorFilter } from '../ColorFilter'
import { FilterPill } from './FilterPill'

export function ToolbarFilters() {
  const collectionTitle = useGalleryStore((state) => state.collectionTitle)
  const mediaFilter = useGalleryStore((state) => state.mediaFilter)
  const setMediaFilter = useGalleryStore((state) => state.setMediaFilter)
  const favoritesOnly = useGalleryStore((state) => state.favoritesOnly)
  const setFavoritesOnly = useGalleryStore((state) => state.setFavoritesOnly)
  const minimumRating = useGalleryStore((state) => state.minimumRating)
  const setMinimumRating = useGalleryStore((state) => state.setMinimumRating)
  const failedEmbeddingsOnly = useGalleryStore((state) => state.failedEmbeddingsOnly)
  const setFailedEmbeddingsOnly = useGalleryStore((state) => state.setFailedEmbeddingsOnly)
  const failedTaggingOnly = useGalleryStore((state) => state.failedTaggingOnly)
  const setFailedTaggingOnly = useGalleryStore((state) => state.setFailedTaggingOnly)
  const colorFilter = useGalleryStore((state) => state.colorFilter)
  const setColorFilter = useGalleryStore((state) => state.setColorFilter)
  const similarScope = useGalleryStore((state) => state.similarScope)
  const setSimilarScope = useGalleryStore((state) => state.setSimilarScope)
  const similarSourceAlbumId = useGalleryStore((state) => state.similarSourceAlbumId)
  const mediaJobProgress = useGalleryStore((state) => state.mediaJobProgress)
  const activeView = useGalleryStore((state) => state.activeView)

  const hasAnyFailedEmbeddings = Object.values(mediaJobProgress).some(
    (progress) => progress.embedding_failed > 0
  )
  const hasAnyFailedTagging = Object.values(mediaJobProgress).some(
    (progress) => progress.tagging_failed > 0
  )
  const isSimilarResults = collectionTitle === 'Similar Images'
  const showAlbumScope =
    activeView === 'album' ||
    (similarSourceAlbumId !== null &&
      (collectionTitle === 'Similar Images' || collectionTitle === 'Region Search Results'))

  const clearFailedFilters = () => {
    setFailedEmbeddingsOnly(false)
    setFailedTaggingOnly(false)
  }

  return (
    <div className="flex items-center gap-1 px-4 pb-1.5">
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <FilterPill
          label="All"
          active={
            mediaFilter === 'all' &&
            !favoritesOnly &&
            !failedEmbeddingsOnly &&
            !failedTaggingOnly &&
            minimumRating === 0 &&
            colorFilter === null
          }
          onClick={() => {
            setMediaFilter('all')
            setFavoritesOnly(false)
            setMinimumRating(0)
            setFailedEmbeddingsOnly(false)
            setFailedTaggingOnly(false)
            setColorFilter(null)
          }}
        />
        <FilterPill
          label="Images"
          active={
            mediaFilter === 'image' && !favoritesOnly && !failedEmbeddingsOnly && !failedTaggingOnly
          }
          onClick={() => {
            setMediaFilter('image')
            setFavoritesOnly(false)
            clearFailedFilters()
          }}
        />
        <FilterPill
          label="Videos"
          active={
            mediaFilter === 'video' && !favoritesOnly && !failedEmbeddingsOnly && !failedTaggingOnly
          }
          onClick={() => {
            setMediaFilter('video')
            setFavoritesOnly(false)
            clearFailedFilters()
          }}
        />
        <FilterPill
          label="Favorites"
          active={favoritesOnly}
          onClick={() => {
            setFavoritesOnly(!favoritesOnly)
            clearFailedFilters()
          }}
        />
        <FilterPill
          label="Rated"
          active={minimumRating === 1}
          onClick={() => {
            setMinimumRating(minimumRating === 1 ? 0 : 1)
            clearFailedFilters()
          }}
        />
        <FilterPill
          label="4★+"
          active={minimumRating === 4}
          onClick={() => {
            setMinimumRating(minimumRating === 4 ? 0 : 4)
            clearFailedFilters()
          }}
        />
        {showAlbumScope ? (
          <FilterPill
            label="Similar: Album"
            active={similarScope === 'current_album'}
            onClick={() => setSimilarScope('current_album')}
          />
        ) : null}
        <FilterPill
          label="Similar: Folder"
          active={similarScope === 'current_folder'}
          onClick={() => setSimilarScope('current_folder')}
        />
        <FilterPill
          label="Similar: All"
          active={similarScope === 'all_media'}
          onClick={() => setSimilarScope('all_media')}
        />
        {hasAnyFailedEmbeddings ? (
          <FilterPill
            label="Failed Embeddings"
            active={failedEmbeddingsOnly}
            variant="amber"
            onClick={() => setFailedEmbeddingsOnly(!failedEmbeddingsOnly)}
          />
        ) : null}
        {hasAnyFailedTagging ? (
          <FilterPill
            label="Failed Tags"
            active={failedTaggingOnly}
            variant="amber"
            onClick={() => setFailedTaggingOnly(!failedTaggingOnly)}
          />
        ) : null}
        {isSimilarResults ? (
          <span className="ml-2 shrink-0 text-[11px] whitespace-nowrap text-gray-500">
            Current similar scope:{' '}
            {similarScope === 'current_album'
              ? 'this album'
              : similarScope === 'current_folder'
                ? 'current folder'
                : 'all media'}
          </span>
        ) : null}
      </div>
      <ColorFilter />
    </div>
  )
}
