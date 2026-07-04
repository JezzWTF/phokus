import { useEffect, useState } from 'react'
import {
  CleanupOrphanedThumbnailsResult,
  DatabaseInfo,
  OrphanedThumbnailsInfo,
  VacuumResult,
  useGalleryStore,
} from '../../store'
import { SettingsGroup, SettingsItem, settingsButtonClass, StatPair } from './shared'

export function StorageSettingsSection() {
  const openAppDataFolder = useGalleryStore((state) => state.openAppDataFolder)
  const getDatabaseInfo = useGalleryStore((state) => state.getDatabaseInfo)
  const vacuumDatabase = useGalleryStore((state) => state.vacuumDatabase)
  const rebuildSemanticIndex = useGalleryStore((state) => state.rebuildSemanticIndex)
  const getOrphanedThumbnailsInfo = useGalleryStore((state) => state.getOrphanedThumbnailsInfo)
  const cleanupOrphanedThumbnails = useGalleryStore((state) => state.cleanupOrphanedThumbnails)

  const [openingDataFolder, setOpeningDataFolder] = useState(false)
  const [dbInfo, setDbInfo] = useState<DatabaseInfo | null>(null)
  const [vacuuming, setVacuuming] = useState(false)
  const [vacuumResult, setVacuumResult] = useState<VacuumResult | null>(null)
  const [rebuildingIndex, setRebuildingIndex] = useState(false)
  const [rebuildIndexResult, setRebuildIndexResult] = useState<string | null>(null)
  const [thumbnailInfo, setThumbnailInfo] = useState<OrphanedThumbnailsInfo | null>(null)
  const [cleaningThumbnails, setCleaningThumbnails] = useState(false)
  const [thumbnailCleanupResult, setThumbnailCleanupResult] =
    useState<CleanupOrphanedThumbnailsResult | null>(null)

  useEffect(() => {
    setVacuumResult(null)
    setThumbnailCleanupResult(null)
    void getDatabaseInfo()
      .then(setDbInfo)
      .catch(() => {})
    void getOrphanedThumbnailsInfo()
      .then(setThumbnailInfo)
      .catch(() => {})
  }, [getDatabaseInfo, getOrphanedThumbnailsInfo])

  return (
    <div className="mt-8 space-y-9">
      <SettingsGroup title="App data">
        <SettingsItem
          label="App data folder"
          description="Open the folder in Explorer to inspect or back up the database, thumbnails, and models."
        >
          <button
            className={settingsButtonClass}
            onClick={() => {
              setOpeningDataFolder(true)
              void openAppDataFolder().finally(() => setOpeningDataFolder(false))
            }}
            disabled={openingDataFolder}
          >
            {openingDataFolder ? 'Opening...' : 'Open data folder'}
          </button>
        </SettingsItem>
      </SettingsGroup>

      <SettingsGroup title="Maintenance">
        <SettingsItem
          label="Compact database"
          description={
            <>
              <span>
                Reclaims wasted space left behind when images or tags are deleted. Safe to run at
                any time.
              </span>
              <span className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1">
                <StatPair
                  label="Size"
                  value={
                    vacuumResult
                      ? `${vacuumResult.after_mb.toFixed(1)} MB`
                      : dbInfo
                        ? `${dbInfo.size_mb.toFixed(1)} MB`
                        : '—'
                  }
                />
                <StatPair
                  label="Reclaimable"
                  accent={vacuumResult !== null}
                  value={
                    vacuumResult
                      ? `${vacuumResult.freed_mb.toFixed(1)} MB freed`
                      : dbInfo
                        ? `${dbInfo.reclaimable_mb.toFixed(1)} MB`
                        : '—'
                  }
                />
              </span>
              <span className="mt-2 block text-gray-600">
                {vacuumResult
                  ? `Compacted from ${vacuumResult.before_mb.toFixed(1)} MB to ${vacuumResult.after_mb.toFixed(1)} MB.`
                  : dbInfo && dbInfo.reclaimable_mb < 0.5
                    ? 'Database is already compact.'
                    : 'Run this after removing folders or bulk-deleting images.'}
              </span>
            </>
          }
        >
          <button
            className={settingsButtonClass}
            onClick={() => {
              setVacuuming(true)
              setVacuumResult(null)
              void vacuumDatabase()
                .then((result) => {
                  setVacuumResult(result)
                  setDbInfo({ size_mb: result.after_mb, reclaimable_mb: 0 })
                })
                .catch(() => {})
                .finally(() => setVacuuming(false))
            }}
            disabled={vacuuming || (dbInfo !== null && dbInfo.reclaimable_mb < 0.5)}
          >
            {vacuuming ? 'Compacting...' : 'Compact now'}
          </button>
        </SettingsItem>

        <SettingsItem
          label="Rebuild semantic index"
          description={
            <>
              <span>
                Recreates the visual-embedding index and re-embeds every image in the background.
                Use this if semantic or similar-image search reports a dimension-mismatch error (for
                example after experimenting with a different embedding model).
              </span>
              {rebuildIndexResult !== null ? (
                <span className="mt-2 block text-gray-600">{rebuildIndexResult}</span>
              ) : null}
            </>
          }
        >
          <button
            className={settingsButtonClass}
            onClick={() => {
              setRebuildingIndex(true)
              setRebuildIndexResult(null)
              void rebuildSemanticIndex()
                .then((count) =>
                  setRebuildIndexResult(
                    `Re-queued ${count.toLocaleString()} image${count === 1 ? '' : 's'} for embedding.`
                  )
                )
                .catch((error) => setRebuildIndexResult(String(error)))
                .finally(() => setRebuildingIndex(false))
            }}
            disabled={rebuildingIndex}
          >
            {rebuildingIndex ? 'Rebuilding…' : 'Rebuild index'}
          </button>
        </SettingsItem>

        <SettingsItem
          label="Thumbnail cache"
          description={
            <>
              <span>
                Thumbnails left behind when folders or images are removed. Safe to delete — they are
                regenerated if the originals are re-indexed.
              </span>
              <span className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1">
                <StatPair
                  label="Orphaned files"
                  value={
                    thumbnailCleanupResult
                      ? '0'
                      : thumbnailInfo
                        ? thumbnailInfo.count.toLocaleString()
                        : '—'
                  }
                />
                <StatPair
                  label="Reclaimable"
                  accent={thumbnailCleanupResult !== null}
                  value={
                    thumbnailCleanupResult
                      ? `${thumbnailCleanupResult.freed_mb.toFixed(1)} MB freed`
                      : thumbnailInfo
                        ? `${thumbnailInfo.size_mb.toFixed(1)} MB`
                        : '—'
                  }
                />
              </span>
              <span className="mt-2 block text-gray-600">
                {cleaningThumbnails
                  ? 'Scanning and removing orphaned thumbnails…'
                  : thumbnailCleanupResult
                    ? `Removed ${thumbnailCleanupResult.deleted_count.toLocaleString()} file${thumbnailCleanupResult.deleted_count === 1 ? '' : 's'}, freed ${thumbnailCleanupResult.freed_mb.toFixed(1)} MB.`
                    : thumbnailInfo && thumbnailInfo.count === 0
                      ? 'No orphaned thumbnails found.'
                      : thumbnailInfo && thumbnailInfo.count > 1000
                        ? 'May take a few minutes for large collections.'
                        : 'Remove thumbnails no longer associated with any indexed image.'}
              </span>
            </>
          }
        >
          <button
            className={settingsButtonClass}
            onClick={() => {
              setCleaningThumbnails(true)
              cleanupOrphanedThumbnails()
                .then((result) => {
                  setThumbnailCleanupResult(result)
                  setThumbnailInfo(null)
                })
                .catch(() => {})
                .finally(() => setCleaningThumbnails(false))
            }}
            disabled={
              cleaningThumbnails ||
              thumbnailCleanupResult !== null ||
              (thumbnailInfo !== null && thumbnailInfo.count === 0)
            }
          >
            {cleaningThumbnails ? 'Cleaning…' : 'Clean up'}
          </button>
        </SettingsItem>
      </SettingsGroup>
    </div>
  )
}
