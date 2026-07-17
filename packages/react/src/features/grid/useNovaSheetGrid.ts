import { canvas2dBackend } from '@zhiguang/novasheet-canvas2d'
import { Grid } from '@zhiguang/novasheet-core'
import { useCallback, useEffect, useRef } from 'react'
import type { MutableRefObject, RefObject } from 'react'

import type { NovaSheetGridProps } from './types'

export interface UseNovaSheetGridResult {
  readonly containerRef: RefObject<HTMLDivElement>
  readonly gridRef: MutableRefObject<Grid | null>
}

export function useNovaSheetGrid(options: Omit<NovaSheetGridProps, 'className'>): UseNovaSheetGridResult {
  const {
    data,
    theme,
    frozen,
    selectionBehavior,
    defaultRowHeight,
    excelHeaders,
    rowHeaderField,
    excelWorkspace,
    locale,
    formatters,
    cellEditors,
    onContextMenuAction,
    onCopy,
    onCut,
    onPaste,
    onPasteSkipped,
    onUndo,
    onRedo,
    onFill,
    onRowsInserted,
    onRowsDeleted,
    onHideChange,
    onColumnsInserted,
    onColumnsDeleted,
    onHideColsChange,
    onColumnsMoved,
    onSelectionChange,
  } = options

  const containerRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<Grid | null>(null)
  const latestDataRef = useRef(data)
  const latestThemeRef = useRef(theme)
  const latestFrozenRef = useRef(frozen)
  const onContextMenuActionRef = useRef(onContextMenuAction)
  const onCopyRef = useRef(onCopy)
  const onCutRef = useRef(onCut)
  const onPasteRef = useRef(onPaste)
  const onPasteSkippedRef = useRef(onPasteSkipped)
  const onUndoRef = useRef(onUndo)
  const onRedoRef = useRef(onRedo)
  const onFillRef = useRef(onFill)
  const onRowsInsertedRef = useRef(onRowsInserted)
  const onRowsDeletedRef = useRef(onRowsDeleted)
  const onHideChangeRef = useRef(onHideChange)
  const onColumnsInsertedRef = useRef(onColumnsInserted)
  const onColumnsDeletedRef = useRef(onColumnsDeleted)
  const onHideColsChangeRef = useRef(onHideColsChange)
  const onColumnsMovedRef = useRef(onColumnsMoved)
  const onSelectionChangeRef = useRef(onSelectionChange)

  onContextMenuActionRef.current = onContextMenuAction
  onCopyRef.current = onCopy
  onCutRef.current = onCut
  onPasteRef.current = onPaste
  onPasteSkippedRef.current = onPasteSkipped
  onUndoRef.current = onUndo
  onRedoRef.current = onRedo
  onFillRef.current = onFill
  onRowsInsertedRef.current = onRowsInserted
  onRowsDeletedRef.current = onRowsDeleted
  onHideChangeRef.current = onHideChange
  onColumnsInsertedRef.current = onColumnsInserted
  onColumnsDeletedRef.current = onColumnsDeleted
  onHideColsChangeRef.current = onHideColsChange
  onColumnsMovedRef.current = onColumnsMoved
  onSelectionChangeRef.current = onSelectionChange

  // 扩展注册表是构造期选项；需要变更时应 remount grid。
  const createGrid = useCallback(
    (container: HTMLElement): Grid =>
      new Grid(container, {
        data,
        theme,
        frozen,
        selectionBehavior,
        defaultRowHeight,
        excelHeaders,
        rowHeaderField,
        excelWorkspace,
        locale,
        formatters,
        cellEditors,
        onContextMenuAction: (action, ctx) => onContextMenuActionRef.current?.(action, ctx),
        onCopy: (range) => onCopyRef.current?.(range),
        onCut: (range) => onCutRef.current?.(range),
        onPaste: (target) => onPasteRef.current?.(target),
        onPasteSkipped: (cells) => onPasteSkippedRef.current?.(cells),
        onUndo: (event) => onUndoRef.current?.(event),
        onRedo: (event) => onRedoRef.current?.(event),
        onFill: (event) => onFillRef.current?.(event),
        onRowsInserted: (event) => onRowsInsertedRef.current?.(event),
        onRowsDeleted: (event) => onRowsDeletedRef.current?.(event),
        onHideChange: (event) => onHideChangeRef.current?.(event),
        onColumnsInserted: (event) => onColumnsInsertedRef.current?.(event),
        onColumnsDeleted: (event) => onColumnsDeletedRef.current?.(event),
        onHideColsChange: (event) => onHideColsChangeRef.current?.(event),
        onColumnsMoved: (event) => onColumnsMovedRef.current?.(event),
        onSelectionChange: (selection) => onSelectionChangeRef.current?.(selection),
        backend: canvas2dBackend(),
      }),
    [],
  )

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const grid = createGrid(container)
    gridRef.current = grid
    latestDataRef.current = data
    latestThemeRef.current = theme
    latestFrozenRef.current = frozen

    return () => {
      grid.destroy()
      if (gridRef.current === grid) gridRef.current = null
    }
  }, [createGrid])

  useEffect(() => {
    const grid = gridRef.current
    if (!grid) return
    if (latestDataRef.current !== data) {
      grid.setData(data)
      latestDataRef.current = data
    }
  }, [data])

  useEffect(() => {
    const grid = gridRef.current
    if (!grid || theme === undefined) return
    if (latestThemeRef.current !== theme) {
      grid.setTheme(theme)
      latestThemeRef.current = theme
    }
  }, [theme])

  useEffect(() => {
    const grid = gridRef.current
    if (!grid || frozen === undefined) return
    if (latestFrozenRef.current !== frozen) {
      grid.setFrozen(frozen)
      latestFrozenRef.current = frozen
    }
  }, [frozen])

  return { containerRef, gridRef }
}
