import { SparseExcelDataSource } from '@zhiguang/novasheet-core'
import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react'
import type { ReactElement } from 'react'

import { NovaSheetGrid, type NovaSheetGridRef } from '@/features/grid'
import { NovaSheetToolbar } from '@/features/toolbar'
import { cn } from '@/lib/utils'
import { composeGridCallback } from './composeGridCallback'
import type { NovaExcelProps, NovaExcelRef } from './types'
import { useNovaExcelToolbar } from './useNovaExcelToolbar'

/**
 * Opinionated Excel-style spreadsheet: NovaSheetGrid + built-in toolbar wiring.
 * Defaults to `SparseExcelDataSource` + `excelWorkspace: true` (infinite sparse cells).
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
    excelWorkspace = true,
    showToolbar = true,
    toolbarZoom = '100%',
    onToolbarAction,
    onSelectionChange,
    onUndo,
    onRedo,
    onCopy,
    onCut,
    onPaste,
    onFill,
    onRowsInserted,
    onRowsDeleted,
    onColumnsInserted,
    onColumnsDeleted,
    data,
    ...gridProps
  } = props

  const defaultDataRef = useRef<SparseExcelDataSource | null>(null)
  if (data === undefined && defaultDataRef.current === null) {
    defaultDataRef.current = new SparseExcelDataSource()
  }
  const resolvedData = data ?? defaultDataRef.current!

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
  const syncIfToolbar = showToolbar ? syncToolbarState : () => {}

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
          data={resolvedData}
          excelHeaders={excelHeaders}
          excelWorkspace={excelWorkspace}
          className={cn('h-full w-full', gridClassName)}
          onCopy={onCopy}
          onCut={composeGridCallback(onCut, syncIfToolbar)}
          onPaste={composeGridCallback(onPaste, syncIfToolbar)}
          onFill={composeGridCallback(onFill, syncIfToolbar)}
          onRowsInserted={composeGridCallback(onRowsInserted, syncIfToolbar)}
          onRowsDeleted={composeGridCallback(onRowsDeleted, syncIfToolbar)}
          onColumnsInserted={composeGridCallback(onColumnsInserted, syncIfToolbar)}
          onColumnsDeleted={composeGridCallback(onColumnsDeleted, syncIfToolbar)}
          onSelectionChange={(selection) => {
            onSelectionChange?.(selection)
            syncIfToolbar()
          }}
          onUndo={(event) => {
            onUndo?.(event)
            syncIfToolbar()
          }}
          onRedo={(event) => {
            onRedo?.(event)
            syncIfToolbar()
          }}
        />
      </div>
    </div>
  )
})
