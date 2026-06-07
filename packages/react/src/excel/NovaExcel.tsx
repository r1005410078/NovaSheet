import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react'
import type { ReactElement } from 'react'

import { NovaSheetGrid } from '../grid/NovaSheetGrid'
import type { NovaSheetGridRef } from '../grid/types'
import { cn } from '../lib/utils'
import { NovaSheetToolbar } from '../toolbar/NovaSheetToolbar'
import type { NovaExcelProps, NovaExcelRef } from './types'
import { useNovaExcelToolbar } from './useNovaExcelToolbar'

/**
 * Opinionated Excel-style spreadsheet: NovaSheetGrid + built-in toolbar wiring.
 * Use {@link NovaSheetGrid} when you need a plain grid without toolbar chrome.
 */
export const NovaExcel = forwardRef<NovaExcelRef, NovaExcelProps>(function NovaExcel(
  props,
  ref,
): ReactElement {
  const {
    className,
    gridClassName,
    toolbarClassName,
    excelHeaders = true,
    showToolbar = true,
    toolbarZoom = '100%',
    onToolbarAction,
    onSelectionChange,
    onUndo,
    onRedo,
    ...gridProps
  } = props

  const gridRef = useRef<NovaSheetGridRef>(null)

  const getGrid = useCallback(() => {
    try {
      return gridRef.current?.grid ?? null
    } catch {
      return null
    }
  }, [])

  const { toolbarState, disabledActionIds, syncToolbarState, handleToolbarAction } =
    useNovaExcelToolbar({
      getGrid,
      onToolbarAction,
    })

  useImperativeHandle(
    ref,
    () => ({
      get grid() {
        const grid = gridRef.current
        if (!grid) throw new Error('NovaExcel: Grid is not mounted')
        return grid.grid
      },
      refresh() {
        gridRef.current?.refresh()
      },
      destroy() {
        gridRef.current?.destroy()
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

  return (
    <div
      data-novasheet-react-excel=""
      className={cn('flex h-full min-h-0 flex-col bg-white', className)}
    >
      {showToolbar ? (
        <NovaSheetToolbar
          className={toolbarClassName}
          disabledActionIds={disabledActionIds}
          state={{ zoom: toolbarZoom, ...toolbarState }}
          onAction={handleToolbarAction}
        />
      ) : null}
      <div className="min-h-0 flex-1">
        <NovaSheetGrid
          {...gridProps}
          ref={gridRef}
          excelHeaders={excelHeaders}
          className={cn('h-full w-full', gridClassName)}
          onSelectionChange={(selection) => {
            onSelectionChange?.(selection)
            syncToolbarState()
          }}
          onUndo={(event) => {
            onUndo?.(event)
            syncToolbarState()
          }}
          onRedo={(event) => {
            onRedo?.(event)
            syncToolbarState()
          }}
        />
      </div>
    </div>
  )
})
