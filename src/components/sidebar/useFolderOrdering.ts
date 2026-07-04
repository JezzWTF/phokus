import { useEffect, useMemo, useRef, useState } from 'react'
import { type Folder } from '../../store'
import { LIBRARY_SORT_KEY, type LibrarySort } from './types'

export function useFolderOrdering(
  folders: Folder[],
  reorderFolders: (ids: number[]) => Promise<void>
) {
  const [librarySort, setLibrarySortState] = useState<LibrarySort>(() => {
    const saved = window.localStorage.getItem(LIBRARY_SORT_KEY)
    return saved === 'za' || saved === 'custom' ? saved : 'az'
  })
  const [customFolders, setCustomFolders] = useState(folders)
  const [draggedFolderId, setDraggedFolderId] = useState<number | null>(null)
  const folderListRef = useRef<HTMLDivElement>(null)
  const customFoldersRef = useRef(folders)
  const pointerYRef = useRef(0)
  const autoScrollFrameRef = useRef<number | null>(null)
  const keyboardPersistRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (keyboardPersistRef.current) clearTimeout(keyboardPersistRef.current)
    },
    []
  )

  useEffect(() => {
    if (draggedFolderId !== null) return
    setCustomFolders(folders)
    customFoldersRef.current = folders
  }, [folders, draggedFolderId])

  useEffect(() => {
    if (draggedFolderId === null) return

    const handlePointerMove = (event: PointerEvent) => {
      pointerYRef.current = event.clientY
    }

    const autoScroll = () => {
      const list = folderListRef.current
      if (list) {
        const rect = list.getBoundingClientRect()
        const edgeSize = Math.min(64, rect.height * 0.2)
        const topDistance = pointerYRef.current - rect.top
        const bottomDistance = rect.bottom - pointerYRef.current
        let velocity = 0

        if (topDistance < edgeSize) {
          velocity = -Math.pow((edgeSize - Math.max(0, topDistance)) / edgeSize, 1.6) * 14
        } else if (bottomDistance < edgeSize) {
          velocity = Math.pow((edgeSize - Math.max(0, bottomDistance)) / edgeSize, 1.6) * 14
        }

        if (velocity !== 0) list.scrollTop += velocity
      }
      autoScrollFrameRef.current = requestAnimationFrame(autoScroll)
    }

    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    autoScrollFrameRef.current = requestAnimationFrame(autoScroll)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      if (autoScrollFrameRef.current !== null) cancelAnimationFrame(autoScrollFrameRef.current)
      autoScrollFrameRef.current = null
    }
  }, [draggedFolderId])

  const displayedFolders = useMemo(() => {
    if (librarySort === 'custom') return customFolders
    return [...folders].sort((a, b) => {
      const result = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
      return librarySort === 'az' ? result : -result
    })
  }, [customFolders, folders, librarySort])

  const setLibrarySort = (sort: LibrarySort) => {
    window.localStorage.setItem(LIBRARY_SORT_KEY, sort)
    setLibrarySortState(sort)
  }

  const handleReorder = (orderedIds: number[]) => {
    const byId = new Map(customFoldersRef.current.map((folder) => [folder.id, folder]))
    const next = orderedIds
      .map((id) => byId.get(id))
      .filter((folder): folder is Folder => folder !== undefined)
    customFoldersRef.current = next
    setCustomFolders(next)
  }

  const finishReorder = () => {
    const nextIds = customFoldersRef.current.map((folder) => folder.id)
    setDraggedFolderId(null)
    const currentIds = folders.map((folder) => folder.id)
    if (nextIds.some((id, index) => id !== currentIds[index])) {
      void reorderFolders(nextIds)
    }
  }

  const moveFolderByKeyboard = (folderId: number, direction: -1 | 1) => {
    const current = customFoldersRef.current
    const currentIndex = current.findIndex((folder) => folder.id === folderId)
    const nextIndex = currentIndex + direction
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= current.length) return

    const next = [...current]
    ;[next[currentIndex], next[nextIndex]] = [next[nextIndex], next[currentIndex]]
    customFoldersRef.current = next
    setCustomFolders(next)
    // Debounce the DB write so a held arrow key doesn't fire one per keystroke;
    // the local order updates immediately, only the persist waits to settle.
    if (keyboardPersistRef.current) clearTimeout(keyboardPersistRef.current)
    keyboardPersistRef.current = setTimeout(() => {
      keyboardPersistRef.current = null
      void reorderFolders(customFoldersRef.current.map((folder) => folder.id))
    }, 400)
  }

  return {
    customOrdering: librarySort === 'custom',
    displayedFolders,
    draggedFolderId,
    finishReorder,
    folderListRef,
    handleReorder,
    librarySort,
    moveFolderByKeyboard,
    pointerYRef,
    setDraggedFolderId,
    setLibrarySort,
  }
}
