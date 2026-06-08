import { describe, expect, it, mock } from 'bun:test'
import React from 'react'

import type { NovaExcelRef } from '../../src'
import {
  clickAction,
  createDenseData,
  flushGridSelectionEffects,
  isToolbarFillRed,
  mountNovaExcel,
  toolbarFillSwatchBackground,
} from './helpers'

describe('NovaExcel L3c user journeys', () => {
  it('excel.L3c.fill-reflects-toolbar updates toolbar after fill color', async () => {
    const onToolbarAction = mock(() => {})
    const ref = React.createRef<NovaExcelRef>()
    const { container, unmount } = mountNovaExcel({
      data: createDenseData(),
      ref,
      onToolbarAction,
    })

    expect(isToolbarFillRed(toolbarFillSwatchBackground(container))).toBe(false)

    clickAction(container, 'fill-color')
    await Promise.resolve()
    document.body.querySelector<HTMLButtonElement>('[data-fill-color="#ea4335"]')!.click()
    await Promise.resolve()

    expect(onToolbarAction).toHaveBeenCalledWith({ id: 'fill-color', color: '#ea4335' })
    expect(isToolbarFillRed(toolbarFillSwatchBackground(container))).toBe(true)

    unmount()
  })

  it('excel.L3c.undo-button-state toggles undo disabled after undo stack changes', async () => {
    const ref = React.createRef<NovaExcelRef>()
    const { container, unmount } = mountNovaExcel({ data: createDenseData(), ref })

    const undoButton = () =>
      container.querySelector<HTMLButtonElement>('[data-action-id="undo"]')

    expect(undoButton()?.disabled).toBe(true)

    ref.current!.grid.insertRows(0, 1)
    await flushGridSelectionEffects()
    expect(undoButton()?.disabled).toBe(false)

    undoButton()!.click()
    await flushGridSelectionEffects()
    expect(undoButton()?.disabled).toBe(true)

    unmount()
  })

  it('excel.L3c.no-toolbar-grid-ref keeps ref usable without toolbar', () => {
    const ref = React.createRef<NovaExcelRef>()
    const { unmount } = mountNovaExcel({ data: createDenseData(), showToolbar: false, ref })

    expect(() => ref.current!.scrollToCell(0, 'name')).not.toThrow()
    expect(ref.current!.grid).toBeDefined()

    unmount()
  })

  it('excel.L3c.sparse-ref-grid exposes grid on sparse default mount', () => {
    const ref = React.createRef<NovaExcelRef>()
    const { unmount } = mountNovaExcel({ ref })

    expect(ref.current?.grid).toBeDefined()

    unmount()
  })

  it('excel.L3c.external-on-undo-on-redo fires onUndo and onRedo from toolbar', async () => {
    const onUndo = mock(() => {})
    const onRedo = mock(() => {})
    const onToolbarAction = mock(() => {})
    const ref = React.createRef<NovaExcelRef>()
    const { container, unmount } = mountNovaExcel({
      data: createDenseData(),
      ref,
      onUndo,
      onRedo,
      onToolbarAction,
    })

    ref.current!.grid.insertRows(0, 1)
    ref.current!.grid.insertRows(0, 1)
    await flushGridSelectionEffects()
    onToolbarAction.mockClear()

    clickAction(container, 'undo')
    await Promise.resolve()
    clickAction(container, 'redo')

    expect(onToolbarAction).toHaveBeenCalledWith({ id: 'undo' })
    expect(onToolbarAction).toHaveBeenCalledWith({ id: 'redo' })
    expect(onUndo).toHaveBeenCalled()
    expect(onRedo).toHaveBeenCalled()

    unmount()
  })
})
