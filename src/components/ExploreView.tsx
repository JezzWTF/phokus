import { useEffect } from 'react'
import { useGalleryStore } from '../store'
import { FolderScopeDropdown } from './FolderScopeDropdown'
import { ClusterCloud } from './explore/ClusterCloud'
import { ExploreLoadingPanel } from './explore/ExploreLoadingPanel'
import { TagAtlas, TAG_ATLAS_MAX_VISIBLE } from './explore/TagAtlas'
import { TagManageList } from './explore/TagManageList'

export function ExploreView() {
  const exploreMode = useGalleryStore((state) => state.exploreMode)
  const setExploreMode = useGalleryStore((state) => state.setExploreMode)
  const visualClusterEntries = useGalleryStore((state) => state.visualClusterEntries)
  const visualClusterLoading = useGalleryStore((state) => state.visualClusterLoading)
  const loadVisualClusters = useGalleryStore((state) => state.loadVisualClusters)
  const exploreTagEntries = useGalleryStore((state) => state.exploreTagEntries)
  const exploreTagLoading = useGalleryStore((state) => state.exploreTagLoading)
  const loadExploreTags = useGalleryStore((state) => state.loadExploreTags)
  const loadRelatedTags = useGalleryStore((state) => state.loadRelatedTags)
  const showVisualCluster = useGalleryStore((state) => state.showVisualCluster)
  const searchForTag = useGalleryStore((state) => state.searchForTag)
  const renameTag = useGalleryStore((state) => state.renameTag)
  const deleteTag = useGalleryStore((state) => state.deleteTag)
  const resetAiTags = useGalleryStore((state) => state.resetAiTags)
  const folders = useGalleryStore((state) => state.folders)
  const selectedFolderId = useGalleryStore((state) => state.selectedFolderId)
  // Manage mode lives in the store so it can be opened from elsewhere (Settings).
  const manageTags = useGalleryStore((state) => state.tagManagerOpen)
  const setManageTags = useGalleryStore((state) => state.setTagManagerOpen)
  const handleDeleteTag = async (tag: string) => {
    await deleteTag(tag)
  }
  const tagManagerScopeLabel =
    selectedFolderId === null
      ? 'all media'
      : (folders.find((folder) => folder.id === selectedFolderId)?.name ?? 'the current folder')
  const handleResetAiTags = async () => {
    const count = await resetAiTags(selectedFolderId)
    await loadExploreTags({ force: true })
    return count
  }

  useEffect(() => {
    if (exploreMode === 'visual') void loadVisualClusters()
    else void loadExploreTags()
  }, [exploreMode, selectedFolderId, loadVisualClusters, loadExploreTags])

  const loading = exploreMode === 'visual' ? visualClusterLoading : exploreTagLoading
  const hasEntries =
    exploreMode === 'visual' ? visualClusterEntries.length > 0 : exploreTagEntries.length > 0
  const entryCount =
    exploreMode === 'visual' ? visualClusterEntries.length : exploreTagEntries.length
  const visibleTagCount = Math.min(exploreTagEntries.length, TAG_ATLAS_MAX_VISIBLE)

  return (
    <div className="explore-view flex min-h-0 flex-1 flex-col overflow-hidden bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.08),transparent_50%),radial-gradient(ellipse_at_80%_75%,rgba(168,85,247,0.07),transparent_40%),#07080f]">
      {/* Header — `relative z-10` keeps the folder-scope dropdown above the
          cluster canvas, whose cards use a high z-index of their own. */}
      <div className="explore-header relative z-10 shrink-0 border-b border-white/[0.05] px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="explore-title text-[15px] font-semibold text-white">Explore</h2>
            <p className="explore-subtitle mt-0.5 truncate text-[11px] text-white/30">
              {loading
                ? exploreMode === 'visual'
                  ? 'Computing visual clusters…'
                  : 'Loading tags…'
                : hasEntries
                  ? exploreMode === 'visual'
                    ? `${entryCount} cluster${entryCount !== 1 ? 's' : ''} — click any to open`
                    : manageTags
                      ? `${entryCount} tag${entryCount !== 1 ? 's' : ''} available to manage`
                      : visibleTagCount < entryCount
                        ? `${visibleTagCount} of ${entryCount} tags shown — click any to search`
                        : `${entryCount} tag${entryCount !== 1 ? 's' : ''} — click any to search`
                  : exploreMode === 'visual'
                    ? 'No clusters — images need embeddings first'
                    : 'No tags — run the AI tagger or add tags manually'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {exploreMode === 'tags' && hasEntries ? (
              <button
                className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                  manageTags
                    ? 'border-white/15 bg-white/10 text-white'
                    : 'border-white/8 bg-white/[0.03] text-gray-500 hover:text-gray-300'
                }`}
                onClick={() => setManageTags(!manageTags)}
              >
                {manageTags ? 'Done' : 'Manage'}
              </button>
            ) : null}
            <FolderScopeDropdown />
            <div className="explore-mode-toggle flex rounded-lg border border-white/8 bg-white/[0.03] p-0.5">
              <button
                className={`explore-mode-button rounded-md px-3 py-1.5 text-xs transition-colors ${
                  exploreMode === 'visual'
                    ? 'bg-white/10 text-white'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
                onClick={() => setExploreMode('visual')}
              >
                Clusters
              </button>
              <button
                className={`explore-mode-button rounded-md px-3 py-1.5 text-xs transition-colors ${
                  exploreMode === 'tags'
                    ? 'bg-white/10 text-white'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
                onClick={() => setExploreMode('tags')}
              >
                Tag Cloud
              </button>
            </div>
          </div>
        </div>
      </div>

      {loading && !hasEntries ? (
        <ExploreLoadingPanel mode={exploreMode} />
      ) : !hasEntries ? (
        <div className="flex flex-1 items-center justify-center px-8">
          <p className="explore-empty max-w-xs text-center text-sm leading-relaxed text-white/25">
            {exploreMode === 'visual'
              ? 'No visual clusters yet. Images need embeddings before they can be grouped. Check indexing progress in the sidebar.'
              : 'No tags yet. Run the AI tagger from Settings, or add tags manually in the image preview.'}
          </p>
        </div>
      ) : exploreMode === 'visual' ? (
        <div className="relative flex min-h-0 flex-1 flex-col">
          <ClusterCloud entries={visualClusterEntries} onOpen={showVisualCluster} />
        </div>
      ) : manageTags ? (
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <TagManageList
            entries={exploreTagEntries}
            onSearch={searchForTag}
            onRename={renameTag}
            onDelete={handleDeleteTag}
            onResetAiTags={handleResetAiTags}
            scopeLabel={tagManagerScopeLabel}
          />
        </div>
      ) : (
        <TagAtlas
          entries={exploreTagEntries}
          onSearch={searchForTag}
          loadRelatedTags={loadRelatedTags}
        />
      )}
    </div>
  )
}
