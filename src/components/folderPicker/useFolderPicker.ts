import { useEffect, useMemo, useRef, useState } from 'react'
import { DirListing, FolderAddResult, useGalleryStore } from '../../store'
import {
  buildBreadcrumbs,
  cleanAddressInput,
  friendlyDirectoryError,
  normalizePath,
} from './pathUtils'

export function useFolderPicker() {
  const folderPickerOpen = useGalleryStore((state) => state.folderPickerOpen)
  const setFolderPickerOpen = useGalleryStore((state) => state.setFolderPickerOpen)
  const folders = useGalleryStore((state) => state.folders)
  const listDirectories = useGalleryStore((state) => state.listDirectories)
  const addFolders = useGalleryStore((state) => state.addFolders)

  const [listing, setListing] = useState<DirListing | null>(null)
  const [currentPath, setCurrentPath] = useState<string | null>(null)
  const [addressDraft, setAddressDraft] = useState('')
  const [addressEditing, setAddressEditing] = useState(false)
  const [stagedPaths, setStagedPaths] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<FolderAddResult[] | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const addressInputRef = useRef<HTMLInputElement>(null)

  const libraryPaths = useMemo(
    () => new Set(folders.map((folder) => normalizePath(folder.path))),
    [folders]
  )
  const stagedSet = useMemo(() => new Set(stagedPaths.map(normalizePath)), [stagedPaths])
  const breadcrumbs = useMemo(() => buildBreadcrumbs(listing?.current ?? null), [listing?.current])

  useEffect(() => {
    if (!folderPickerOpen) return
    let cancelled = false
    setLoading(true)
    setError(null)
    void listDirectories(currentPath)
      .then((nextListing) => {
        if (cancelled) return
        setListing(nextListing)
        setAddressDraft(nextListing.current ?? '')
        setAddressEditing(false)
        scrollRef.current?.scrollTo({ top: 0, left: 0 })
      })
      .catch((loadError) => {
        if (cancelled) return
        setListing({ current: currentPath, parent: null, entries: [] })
        setError(friendlyDirectoryError(loadError))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [currentPath, folderPickerOpen, listDirectories])

  useEffect(() => {
    if (!folderPickerOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (addressEditing) {
          setAddressDraft(listing?.current ?? '')
          setAddressEditing(false)
          return
        }
        setFolderPickerOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [addressEditing, folderPickerOpen, listing?.current, setFolderPickerOpen])

  useEffect(() => {
    if (!addressEditing) return
    requestAnimationFrame(() => {
      addressInputRef.current?.focus()
      addressInputRef.current?.select()
    })
  }, [addressEditing])

  useEffect(() => {
    if (folderPickerOpen) return
    setCurrentPath(null)
    setAddressDraft('')
    setAddressEditing(false)
    setListing(null)
    setStagedPaths([])
    setError(null)
    setResults(null)
    setAdding(false)
  }, [folderPickerOpen])

  const entries = listing?.entries ?? []
  const addressPath = cleanAddressInput(addressEditing ? addressDraft : (listing?.current ?? ''))
  const normalizedAddressPath = addressPath ? normalizePath(addressPath) : ''
  const addressAlreadyAdded = normalizedAddressPath
    ? libraryPaths.has(normalizedAddressPath)
    : false
  const addressAlreadyStaged = normalizedAddressPath ? stagedSet.has(normalizedAddressPath) : false

  const togglePath = (path: string) => {
    const normalized = normalizePath(path)
    if (libraryPaths.has(normalized)) return
    setResults(null)
    setStagedPaths((current) => {
      const exists = current.some((staged) => normalizePath(staged) === normalized)
      return exists
        ? current.filter((staged) => normalizePath(staged) !== normalized)
        : [...current, path]
    })
  }

  const stagePath = (path: string) => {
    const cleaned = cleanAddressInput(path)
    if (!cleaned) {
      setError('Enter a folder path first.')
      return
    }

    const normalized = normalizePath(cleaned)
    if (libraryPaths.has(normalized)) {
      setError('That folder is already in your library.')
      return
    }
    if (stagedSet.has(normalized)) {
      setError('That folder is already selected.')
      return
    }

    setError(null)
    setResults(null)
    setStagedPaths((current) => [...current, cleaned])
  }

  const navigateToAddress = () => {
    const cleaned = cleanAddressInput(addressDraft)
    setResults(null)
    setError(null)
    setCurrentPath(cleaned || null)
  }

  const updateAddressDraft = (nextDraft: string) => {
    setAddressDraft(nextDraft)
    setResults(null)
  }

  const beginAddressEdit = () => {
    setAddressDraft(listing?.current ?? '')
    setAddressEditing(true)
  }

  const removeStagedPath = (path: string) => {
    const normalized = normalizePath(path)
    setResults(null)
    setStagedPaths((current) => current.filter((staged) => normalizePath(staged) !== normalized))
  }

  const clearStagedPaths = () => {
    setResults(null)
    setStagedPaths([])
  }

  const confirmAdd = async () => {
    if (stagedPaths.length === 0 || adding) return
    setAdding(true)
    setError(null)
    try {
      const addResults = await addFolders(stagedPaths)
      const failed = addResults.filter((result) => result.status === 'error')
      setResults(addResults)
      if (failed.length > 0) {
        setStagedPaths(stagedPaths.filter((_, i) => addResults[i]?.status === 'error'))
        setError(failed.map((failure) => failure.data).join('; '))
        return
      }
      setFolderPickerOpen(false)
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : String(addError))
    } finally {
      setAdding(false)
    }
  }

  return {
    adding,
    addressAlreadyAdded,
    addressAlreadyStaged,
    addressDraft,
    addressEditing,
    addressInputRef,
    addressPath,
    beginAddressEdit,
    breadcrumbs,
    clearStagedPaths,
    confirmAdd,
    entries,
    error,
    folderPickerOpen,
    libraryPaths,
    listing,
    loading,
    navigateToAddress,
    removeStagedPath,
    results,
    scrollRef,
    setCurrentPath,
    setFolderPickerOpen,
    stagePath,
    stagedPaths,
    stagedSet,
    togglePath,
    updateAddressDraft,
  }
}
