import React, {
  forwardRef,
  useImperativeHandle,
} from 'react'
import type { ReactElement } from 'react'

import { cn } from '../lib/utils'
import type { NovaSheetGridProps, NovaSheetGridRef } from './types'
import { useNovaSheetGrid } from './useNovaSheetGrid'

export const NovaSheetGrid = forwardRef<NovaSheetGridRef, NovaSheetGridProps>(
  function NovaSheetGrid(props, ref): ReactElement {
    const {
      className,
      data,
      theme,
      frozen,
      defaultRowHeight,
      excelHeaders,
      excelWorkspace,
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
      ...domProps
    } = props

    const { containerRef, gridRef } = useNovaSheetGrid({
      data,
      theme,
      frozen,
      defaultRowHeight,
      excelHeaders,
      excelWorkspace,
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
    })

    useImperativeHandle(
      ref,
      () => ({
        get grid() {
          const grid = gridRef.current
          if (!grid) throw new Error('NovaSheetGrid: Grid is not mounted')
          return grid
        },
        refresh() {
          gridRef.current?.refresh()
        },
        destroy() {
          gridRef.current?.destroy()
          gridRef.current = null
        },
        scrollToRow(rowIndex, align) {
          gridRef.current?.scrollToRow(rowIndex, align)
        },
        scrollToCell(rowIndex, fieldId) {
          gridRef.current?.scrollToCell(rowIndex, fieldId)
        },
        setColumnWidth(fieldId, width) {
          gridRef.current?.setColumnWidth(fieldId, width)
        },
        setFrozen(config) {
          gridRef.current?.setFrozen(config)
        },
      }),
      [],
    )

    return React.createElement('div', {
      ...domProps,
      ref: containerRef,
      'data-novasheet-react-grid': '',
      className: cn('relative h-full min-h-0 w-full', className),
    })
  },
)
