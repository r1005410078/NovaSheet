import { describe, expect, it, mock } from 'bun:test'
import React, { act } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { InMemoryDataSource } from '@novasheet/core'
import type { Field } from '@novasheet/core'

import * as NovaSheetReact from '../../src'
import {
  createReactCellEditor,
  createReactCellFilterEditor,
  NovaExcel,
  type NovaExcelRef,
  type ReactCellEditorProps,
  type ReactCellFilterEditorProps,
} from '../../src'
import { unmountReactRoot } from '../helpers/dom'
import { createRecordingContext } from '../../../canvas2d/tests/helpers/recording-context'
import { createDenseData, mountNovaExcel, runGridUpdate, selectSingleCell } from './helpers'

describe('NovaExcel L3a shell', () => {
  it('excel.L3a.custom-row-header-field paints labels from row data without leaking the prop to DOM', async () => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame
    const rafQueue: FrameRequestCallback[] = []
    const recordings: Array<{
      readonly canvas: HTMLCanvasElement
      readonly recording: ReturnType<typeof createRecordingContext>
    }> = []

    const data = new InMemoryDataSource({
      schema: {
        fields: [{ id: 'name', name: '名称', type: 'text', width: 180 }],
      },
      rows: [
        { deviceCode: '设备-001', name: '电池组 A' },
        { deviceCode: '设备-002', name: '电池组 B' },
      ],
    })

    const container = document.createElement('div')
    const ref = React.createRef<NovaExcelRef>()
    let root: ReturnType<typeof createRoot> | undefined
    try {
      globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => {
        rafQueue.push(callback)
        return rafQueue.length
      }
      HTMLCanvasElement.prototype.getContext = function getContext(
        this: HTMLCanvasElement,
        type: string,
      ) {
        if (type !== '2d') return null
        const recording = createRecordingContext(this.width || 800, this.height || 600)
        recordings.push({ canvas: this, recording })
        return recording.ctx as never
      } as never

      const reactRoot = createRoot(container)
      root = reactRoot
      await act(async () => {
        flushSync(() => {
          reactRoot.render(
            React.createElement(NovaExcel, {
              data,
              excelWorkspace: false,
              ref,
              rowHeaderField: 'deviceCode',
              showToolbar: false,
            }),
          )
        })
        await Promise.resolve()
      })

      ref.current!.refresh()
      while (rafQueue.length > 0) {
        const callbacks = rafQueue.splice(0)
        for (const callback of callbacks) callback(performance.now())
      }

      const gridRoot = container.querySelector('[data-novasheet-react-grid]')!
      const canvas = gridRoot.querySelector<HTMLCanvasElement>('canvas')!
      const visibleRecording = recordings.find((entry) => entry.canvas === canvas)?.recording
      expect(visibleRecording).toBeDefined()

      const texts = visibleRecording!.ops
        .filter((op) => op.op === 'fillText')
        .map((op) => (op.op === 'fillText' ? op.args[0] : ''))
      expect(texts).toContain('设备-001')
      expect(texts).toContain('设备-002')

      expect(gridRoot.hasAttribute('rowHeaderField')).toBe(false)
    } finally {
      try {
        try {
          if (root) unmountReactRoot(root)
        } finally {
          HTMLCanvasElement.prototype.getContext = originalGetContext
        }
      } finally {
        globalThis.requestAnimationFrame = originalRequestAnimationFrame
      }
    }
  })

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

  it('excel.L3c.custom-react-editor-commit-cancel commits, cancels, and unmounts overlay', async () => {
    const ref = React.createRef<NovaExcelRef>()
    function AssigneePicker(props: ReactCellEditorProps) {
      return React.createElement(
        'div',
        { 'data-testid': 'assignee-picker' },
        React.createElement('button', { type: 'button', onClick: () => props.commit('Bob') }, 'Bob'),
        React.createElement('button', { type: 'button', onClick: () => props.cancel() }, 'Cancel'),
      )
    }

    const data = new InMemoryDataSource({
      schema: {
        fields: [{ id: 'owner', name: 'Owner', type: 'assignee', width: 160 }],
      },
      rows: [{ owner: 'Alice' }],
    })

    const mounted = await mountNovaExcel({
      data,
      ref,
      cellEditors: {
        assignee: createReactCellEditor(AssigneePicker, { kind: 'popover' }),
      },
    })
    const { container, unmount } = mounted

    await act(async () => {
      ref.current!.grid.openCellEditor(0, 'owner')
      await Promise.resolve()
    })
    const bobButton = container.querySelector<HTMLButtonElement>(
      '[data-novasheet-react-cell-editor] button',
    )
    expect(bobButton?.textContent).toBe('Bob')

    await act(async () => {
      bobButton!.click()
      await Promise.resolve()
    })

    expect(data.getCell(0, 'owner')).toBe('Bob')
    expect(container.querySelector('[data-testid="assignee-picker"]')).toBeNull()

    await act(async () => {
      ref.current!.grid.openCellEditor(0, 'owner')
      await Promise.resolve()
    })
    const cancelButton = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[data-novasheet-react-cell-editor] button'),
    ).find((button) => button.textContent === 'Cancel')
    expect(cancelButton).toBeDefined()

    await act(async () => {
      cancelButton!.click()
      await Promise.resolve()
    })

    expect(data.getCell(0, 'owner')).toBe('Bob')
    expect(container.querySelector('[data-testid="assignee-picker"]')).toBeNull()
    expect('createReactCellRenderer' in NovaSheetReact).toBe(false)

    unmount()
  })

  it('excel.L3c.custom-react-filter-editor-apply-cancel applies operator value without predicate logic', async () => {
    function AssigneeFilter(props: ReactCellFilterEditorProps) {
      return React.createElement(
        'div',
        { 'data-testid': 'assignee-filter' },
        React.createElement(
          'button',
          {
            type: 'button',
            onClick: () =>
              props.apply({ operatorId: 'assignee-is-any-of', value: ['Alice', 'Bob'] }),
          },
          'Apply',
        ),
        React.createElement('button', { type: 'button', onClick: () => props.cancel() }, 'Cancel'),
      )
    }

    const apply = mock(() => {})
    const cancel = mock(() => {})
    const filterEditor = createReactCellFilterEditor(AssigneeFilter)

    await act(async () => {
      filterEditor.open({
        field: { id: 'owner', name: 'Owner', type: 'assignee', width: 160 },
        operatorId: 'assignee-is-any-of',
        value: null,
        rect: { x: 0, y: 0, width: 160, height: 28 },
        apply,
        cancel,
      })
      await Promise.resolve()
    })

    const applyButton = document.body.querySelector<HTMLButtonElement>(
      '[data-novasheet-react-filter-editor] button',
    )
    expect(applyButton?.textContent).toBe('Apply')

    await act(async () => {
      applyButton!.click()
      await Promise.resolve()
    })

    expect(apply).toHaveBeenCalledWith({
      operatorId: 'assignee-is-any-of',
      value: ['Alice', 'Bob'],
    })
    expect(cancel).not.toHaveBeenCalled()
    expect(document.body.querySelector('[data-novasheet-react-filter-editor]')).toBeNull()
    expect('matches' in AssigneeFilter).toBe(false)

    await act(async () => {
      filterEditor.open({
        field: { id: 'owner', name: 'Owner', type: 'assignee', width: 160 },
        operatorId: 'assignee-is-any-of',
        value: ['Alice', 'Bob'],
        rect: { x: 0, y: 0, width: 160, height: 28 },
        apply,
        cancel,
      })
      await Promise.resolve()
    })

    const cancelButton = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>(
        '[data-novasheet-react-filter-editor] button',
      ),
    ).find((button) => button.textContent === 'Cancel')
    expect(cancelButton).toBeDefined()

    await act(async () => {
      cancelButton!.click()
      await Promise.resolve()
    })

    expect(apply).toHaveBeenCalledTimes(1)
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(document.body.querySelector('[data-novasheet-react-filter-editor]')).toBeNull()
  })
})
