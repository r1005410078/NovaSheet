import { describe, expect, it, mock } from 'bun:test'
import React from 'react'
import { InMemoryDataSource } from '@novasheet/core'

import type { NovaExcelRef } from '../../src'
import {
  clickAction,
  clickBody,
  clickElement,
  createDenseData,
  flushGridSelectionEffects,
  flushReactEffects,
  setInputValue,
  isToolbarFillRed,
  runGridUpdate,
  mountNovaExcel,
  toolbarFillSwatchBackground,
} from './helpers'

describe('NovaExcel L3c user journeys', () => {
  it('excel.L3c.fill-reflects-toolbar updates toolbar after fill color', async () => {
    const onToolbarAction = mock(() => {})
    const ref = React.createRef<NovaExcelRef>()
    const { container, unmount } = await mountNovaExcel({
      data: createDenseData(),
      ref,
      onToolbarAction,
    })

    expect(isToolbarFillRed(toolbarFillSwatchBackground(container))).toBe(false)

    clickAction(container, 'fill-color')
    await flushReactEffects()
    clickBody('[data-fill-color="#ea4335"]')
    await flushReactEffects()

    expect(onToolbarAction).toHaveBeenCalledWith({ id: 'fill-color', color: '#ea4335' })
    expect(isToolbarFillRed(toolbarFillSwatchBackground(container))).toBe(true)

    unmount()
  })

  it('excel.L3c.undo-button-state toggles undo disabled after undo stack changes', async () => {
    const ref = React.createRef<NovaExcelRef>()
    const { container, unmount } = await mountNovaExcel({ data: createDenseData(), ref })

    const undoButton = () =>
      container.querySelector<HTMLButtonElement>('[data-action-id="undo"]')

    expect(undoButton()?.disabled).toBe(true)

    runGridUpdate(() => {
      ref.current!.grid.insertRows(0, 1)
    })
    await flushGridSelectionEffects()
    await flushReactEffects()
    expect(undoButton()?.disabled).toBe(false)

    clickElement(undoButton()!)
    await flushGridSelectionEffects()
    expect(undoButton()?.disabled).toBe(true)

    unmount()
  })

  it('excel.L3c.no-toolbar-grid-ref keeps ref usable without toolbar', async () => {
    const ref = React.createRef<NovaExcelRef>()
    const { unmount } = await mountNovaExcel({ data: createDenseData(), showToolbar: false, ref })

    expect(() => ref.current!.scrollToCell(0, 'name')).not.toThrow()
    expect(ref.current!.grid).toBeDefined()

    unmount()
  })

  it('excel.L3c.sparse-ref-grid exposes grid on sparse default mount', async () => {
    const ref = React.createRef<NovaExcelRef>()
    const { unmount } = await mountNovaExcel({ ref })

    expect(ref.current?.grid).toBeDefined()

    unmount()
  })

  it('excel.L3c.currency-display mounts with currency field format and setValueFormat succeeds', async () => {
    const data = new InMemoryDataSource({
      schema: {
        fields: [
          { id: 'name', name: 'Name', type: 'text', width: 120 },
          {
            id: 'amount',
            name: 'Amount',
            type: 'number',
            width: 100,
            format: { kind: 'currency', currency: 'CNY' },
          },
        ],
      },
      rows: [
        { name: 'Alice', amount: 1234.5 },
        { name: 'Bob', amount: 9876 },
      ],
    })
    const ref = React.createRef<NovaExcelRef>()

    const { unmount } = await mountNovaExcel({ data, locale: 'zh-CN', ref })

    expect(ref.current?.grid).toBeDefined()

    const result = ref.current!.grid.setValueFormat(
      { startRow: 0, endRow: 0, startCol: 1, endCol: 1 },
      { kind: 'currency', currency: 'CNY', decimals: 2 },
    )
    expect(result).toBe(true)

    unmount()
  })

  it('excel.L3c.external-on-undo-on-redo fires onUndo and onRedo from toolbar', async () => {
    const onUndo = mock(() => {})
    const onRedo = mock(() => {})
    const onToolbarAction = mock(() => {})
    const ref = React.createRef<NovaExcelRef>()
    const { container, unmount } = await mountNovaExcel({
      data: createDenseData(),
      ref,
      onUndo,
      onRedo,
      onToolbarAction,
    })

    runGridUpdate(() => {
      ref.current!.grid.insertRows(0, 1)
      ref.current!.grid.insertRows(0, 1)
    })
    await flushGridSelectionEffects()
    await flushReactEffects()
    onToolbarAction.mockClear()

    clickAction(container, 'undo')
    await flushReactEffects()
    clickAction(container, 'redo')

    expect(onToolbarAction).toHaveBeenCalledWith({ id: 'undo' })
    expect(onToolbarAction).toHaveBeenCalledWith({ id: 'redo' })
    expect(onUndo).toHaveBeenCalled()
    expect(onRedo).toHaveBeenCalled()

    unmount()
  })

  it.todo('excel.L3c.custom-color-persist keeps custom swatch across remount', async () => {
    localStorage.clear()
    const first = await mountNovaExcel({ data: createDenseData() })
    clickAction(first.container, 'fill-color')
    await flushReactEffects()
    clickBody('[data-custom-color-add]')
    await flushReactEffects()
    const hexInput = document.body.querySelector<HTMLInputElement>(
      '[data-novasheet-color-picker] input[aria-label="十六进制颜色"]',
    )
    setInputValue(hexInput!, '#00ff0080')
    await flushReactEffects()
    clickBody('[data-novasheet-color-picker-confirm]')
    await flushReactEffects()
    first.unmount()

    const second = await mountNovaExcel({ data: createDenseData() })
    clickAction(second.container, 'fill-color')
    await flushReactEffects()
    expect(
      document.body.querySelector('[data-novasheet-fill-palette] [data-fill-color="#00ff0080"]'),
    ).not.toBeNull()
    second.unmount()
  })

  it.todo('excel.L3c.eyedropper-feature-detect hides eyedropper without EyeDropper API', async () => {
    delete (globalThis as { EyeDropper?: unknown }).EyeDropper
    const { container, unmount } = await mountNovaExcel({ data: createDenseData() })
    clickAction(container, 'fill-color')
    await flushReactEffects()
    expect(document.body.querySelector('[data-custom-color-eyedropper]')).toBeNull()
    unmount()
  })
})
