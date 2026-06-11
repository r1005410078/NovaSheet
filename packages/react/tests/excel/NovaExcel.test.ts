import { describe, expect, it, mock } from 'bun:test'
import React, { act } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import type { Field } from '@novasheet/core'

import { NovaExcel, type NovaExcelRef } from '../../src'
import { unmountReactRoot } from '../helpers/dom'
import { createDenseData, mountNovaExcel, runGridUpdate, selectSingleCell } from './helpers'

describe('NovaExcel L3a shell', () => {
  it('excel.L3a.default-mount renders excel grid toolbar and canvas', async () => {
    const { container, unmount } = await mountNovaExcel({ data: createDenseData() })

    expect(container.querySelector('[data-novasheet-react-excel]')).not.toBeNull()
    expect(container.querySelector('[data-novasheet-react-grid]')).not.toBeNull()
    expect(container.querySelector('[role="toolbar"]')).not.toBeNull()
    expect(container.querySelector('canvas')).not.toBeNull()

    unmount()
  })

  it('excel.L3a.sparse-default mounts internal sparse workspace when data omitted', async () => {
    const ref = React.createRef<NovaExcelRef>()
    const { container, unmount } = await mountNovaExcel({ ref })

    expect(container.querySelector('[data-novasheet-react-excel]')).not.toBeNull()
    expect(container.querySelector('canvas')).not.toBeNull()

    const scrollHost = container.querySelector('[data-novasheet-scroll-host]') as HTMLElement
    expect(scrollHost.scrollLeft).toBe(0)
    ref.current!.scrollToCell(0, 'Z')
    expect(scrollHost.scrollLeft).toBeGreaterThan(0)

    unmount()
  })

  it('excel.L3a.no-toolbar hides toolbar but keeps grid', async () => {
    const { container, unmount } = await mountNovaExcel({
      data: createDenseData(),
      showToolbar: false,
    })

    expect(container.querySelector('[role="toolbar"]')).toBeNull()
    expect(container.querySelector('[data-novasheet-react-grid]')).not.toBeNull()

    unmount()
  })

  it('excel.L3a.ref-exposes-grid exposes grid and scrollToCell on ref', async () => {
    const ref = React.createRef<NovaExcelRef>()
    const { unmount } = await mountNovaExcel({ data: createDenseData(), ref })

    expect(ref.current?.grid).toBeDefined()
    expect(typeof ref.current?.scrollToCell).toBe('function')

    unmount()
  })

  it('excel.L3a.strict-mode-remount survives Strict Mode double mount', async () => {
    const ref = React.createRef<NovaExcelRef>()
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      flushSync(() => {
        root.render(
          React.createElement(
            React.StrictMode,
            null,
            React.createElement(NovaExcel, { data: createDenseData(), ref }),
          ),
        )
      })
      await Promise.resolve()
    })

    expect(ref.current?.grid).toBeDefined()
    expect(container.querySelectorAll('canvas').length).toBeGreaterThanOrEqual(1)

    unmountReactRoot(root)
    expect(container.querySelector('canvas')).toBeNull()
  })

  it('excel.L3a.props-callbacks forwards onSelectionChange from grid', async () => {
    const onSelectionChange = mock(() => {})
    const ref = React.createRef<NovaExcelRef>()
    const { unmount } = await mountNovaExcel({
      data: createDenseData(),
      ref,
      onSelectionChange,
    })

    selectSingleCell(ref.current!.grid, 1, 0)

    expect(onSelectionChange).toHaveBeenCalled()

    unmount()
  })

  it('excel.L3a.grid-structural-callbacks forwards row and column mutation callbacks', async () => {
    const onRowsInserted = mock(() => {})
    const onRowsDeleted = mock(() => {})
    const onColumnsInserted = mock(() => {})
    const onColumnsDeleted = mock(() => {})
    const ref = React.createRef<NovaExcelRef>()
    const { unmount } = await mountNovaExcel({
      data: createDenseData(),
      ref,
      onRowsInserted,
      onRowsDeleted,
      onColumnsInserted,
      onColumnsDeleted,
    })

    let newRowIds: readonly number[] = []
    runGridUpdate(() => {
      newRowIds = ref.current!.grid.insertRows(1, 1)
    })
    const newRowId = newRowIds[0]
    expect(newRowId).toBeDefined()
    expect(onRowsInserted).toHaveBeenCalledWith({ at: 1, count: 1, newIds: newRowIds })

    runGridUpdate(() => {
      ref.current!.grid.deleteRows([newRowId!])
    })
    expect(onRowsDeleted).toHaveBeenCalledWith({ removed: [newRowId] })

    let newFields: readonly Field[] = []
    runGridUpdate(() => {
      newFields = ref.current!.grid.insertCols(1, 1)
    })
    const newField = newFields[0]
    expect(newField).toBeDefined()
    expect(onColumnsInserted).toHaveBeenCalledWith({ at: 1, count: 1, newFields })

    runGridUpdate(() => {
      ref.current!.grid.deleteCols([newField!.id])
    })
    expect(onColumnsDeleted).toHaveBeenCalledWith({
      removed: [{ index: 0, fieldId: newField!.id }],
    })

    unmount()
  })

  it('excel.L3a.grid-hide-callbacks forwards hidden row and column state callbacks', async () => {
    const onHideChange = mock(() => {})
    const onHideColsChange = mock(() => {})
    const ref = React.createRef<NovaExcelRef>()
    const { unmount } = await mountNovaExcel({
      data: createDenseData(),
      ref,
      onHideChange,
      onHideColsChange,
    })

    runGridUpdate(() => {
      ref.current!.grid.hideRows([1])
    })
    expect(onHideChange).toHaveBeenCalledWith({ hidden: [1] })

    runGridUpdate(() => {
      ref.current!.grid.unhideRows([1])
    })
    expect(onHideChange).toHaveBeenLastCalledWith({ hidden: [] })

    runGridUpdate(() => {
      ref.current!.grid.hideCols(['score'])
    })
    expect(onHideColsChange).toHaveBeenCalledWith({ hidden: ['score'] })

    runGridUpdate(() => {
      ref.current!.grid.unhideCols(['score'])
    })
    expect(onHideColsChange).toHaveBeenLastCalledWith({ hidden: [] })

    unmount()
  })
})
