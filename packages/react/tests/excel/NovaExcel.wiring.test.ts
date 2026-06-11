import { describe, expect, it, mock, spyOn } from 'bun:test'
import React from 'react'

import type { NovaExcelRef } from '../../src'
import type { ToolbarAction } from '../../src/features/toolbar'
import {
  clickAction,
  clickBody,
  clickControl,
  clickElement,
  createDenseData,
  flushGridSelectionEffects,
  flushReactEffects,
  setInputValue,
  isToolbarFillDefault,
  runGridUpdate,
  isToolbarFillRed,
  mountNovaExcel,
  selectSingleCell,
  toolbarFillSwatchBackground,
} from './helpers'

async function mountWiringExcel(onToolbarAction = mock((_action: ToolbarAction) => {})) {
  const ref = React.createRef<NovaExcelRef>()
  const mounted = await mountNovaExcel({
    data: createDenseData(),
    ref,
    onToolbarAction,
  })
  return { ...mounted, ref, onToolbarAction }
}

describe('NovaExcel L3b toolbar wiring', () => {
  it('excel.L3b.undo-redo dispatches grid.undo and grid.redo', async () => {
    const { container, ref, onToolbarAction, unmount } = await mountWiringExcel()

    runGridUpdate(() => {
      ref.current!.grid.insertRows(0, 1)
      ref.current!.grid.insertRows(0, 1)
    })
    await flushGridSelectionEffects()

    const undoSpy = spyOn(ref.current!.grid, 'undo')
    const redoSpy = spyOn(ref.current!.grid, 'redo')

    clickAction(container, 'undo')
    expect(undoSpy).toHaveBeenCalled()
    expect(onToolbarAction).toHaveBeenCalledWith({ id: 'undo' })

    await Promise.resolve()
    clickAction(container, 'redo')
    await flushReactEffects()
    expect(redoSpy).toHaveBeenCalled()
    expect(onToolbarAction).toHaveBeenCalledWith({ id: 'redo' })

    unmount()
  })

  it('excel.L3b.clipboard dispatches grid.copy cut and paste', async () => {
    const { container, ref, unmount } = await mountWiringExcel()

    const copySpy = spyOn(ref.current!.grid, 'copy').mockResolvedValue(true)
    const cutSpy = spyOn(ref.current!.grid, 'cut').mockResolvedValue(true)
    const pasteSpy = spyOn(ref.current!.grid, 'paste').mockResolvedValue(true)

    clickAction(container, 'copy')
    await flushReactEffects()
    clickAction(container, 'cut')
    await flushReactEffects()
    clickAction(container, 'paste')
    await flushReactEffects()

    expect(copySpy).toHaveBeenCalled()
    expect(cutSpy).toHaveBeenCalled()
    expect(pasteSpy).toHaveBeenCalled()

    unmount()
  })

  it('excel.L3b.fill-color dispatches grid.setFillColor', async () => {
    const { container, ref, onToolbarAction, unmount } = await mountWiringExcel()

    const setFillColorSpy = spyOn(ref.current!.grid, 'setFillColor').mockReturnValue(true)

    clickAction(container, 'fill-color')
    await flushReactEffects()

    expect(document.body.querySelector('[data-fill-color="#ea4335"]')).not.toBeNull()
    clickBody('[data-fill-color="#ea4335"]')
    await flushReactEffects()

    expect(setFillColorSpy).toHaveBeenCalled()
    expect(onToolbarAction).toHaveBeenCalledWith({ id: 'fill-color', color: '#ea4335' })

    unmount()
  })

  it('excel.L3b.borders dispatches grid.setBorders', async () => {
    const { container, ref, onToolbarAction, unmount } = await mountWiringExcel()

    const setBordersSpy = spyOn(ref.current!.grid, 'setBorders').mockReturnValue(true)

    clickAction(container, 'borders')
    await flushReactEffects()

    expect(document.body.querySelector('[data-border-preset="all"]')).not.toBeNull()
    clickBody('[data-border-preset="all"]')
    await flushReactEffects()

    expect(setBordersSpy).toHaveBeenCalled()
    expect(onToolbarAction).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'borders', preset: 'all' }),
    )

    unmount()
  })

  it('excel.L3b.value-format dispatches grid.setValueFormat', async () => {
    const { container, ref, onToolbarAction, unmount } = await mountWiringExcel()

    const setValueFormatSpy = spyOn(ref.current!.grid, 'setValueFormat').mockReturnValue(true)

    clickAction(container, 'value-format')
    await flushReactEffects()

    expect(document.body.querySelector('[data-value-format="currency"]')).not.toBeNull()
    clickBody('[data-value-format="currency"]')
    await flushReactEffects()

    expect(setValueFormatSpy).toHaveBeenCalled()
    expect(onToolbarAction).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'value-format',
        format: expect.objectContaining({ kind: 'currency' }),
      }),
    )

    unmount()
  })

  it('excel.L3b.merge-cells dispatches grid.mergeCells', async () => {
    const { container, ref, onToolbarAction, unmount } = await mountWiringExcel()

    const mergeSpy = spyOn(ref.current!.grid, 'mergeCells').mockReturnValue(true)

    clickElement(
      container.querySelector<HTMLButtonElement>(
        '[data-action-id="merge-cells"][data-action-part="primary"]',
      )!,
    )

    expect(mergeSpy).toHaveBeenCalled()
    expect(onToolbarAction).toHaveBeenCalledWith({ id: 'merge-cells', mode: 'all' })

    unmount()
  })

  it('excel.L3b.unmerge-cells dispatches grid.unmergeCells', async () => {
    const { container, ref, onToolbarAction, unmount } = await mountWiringExcel()

    const unmergeSpy = spyOn(ref.current!.grid, 'unmergeCells').mockReturnValue(true)

    clickElement(
      container.querySelector<HTMLButtonElement>(
        '[data-action-id="merge-cells"][data-action-part="menu"]',
      )!,
    )
    await flushReactEffects()

    clickBody('[data-merge-mode="unmerge"]')
    await flushReactEffects()

    expect(unmergeSpy).toHaveBeenCalled()
    expect(onToolbarAction).toHaveBeenCalledWith({ id: 'unmerge-cells' })

    unmount()
  })

  it('excel.L3b.text-wrap dispatches grid.setTextWrap', async () => {
    const { container, ref, onToolbarAction, unmount } = await mountWiringExcel()

    const setTextWrapSpy = spyOn(ref.current!.grid, 'setTextWrap').mockReturnValue(true)

    clickControl(container, 'text-wrap')

    expect(setTextWrapSpy).toHaveBeenCalled()
    expect(onToolbarAction).toHaveBeenCalledWith({ id: 'text-wrap' })

    unmount()
  })

  it('excel.L3b.default-range-on-format applies format with default range', async () => {
    const { container, ref, unmount } = await mountWiringExcel()

    const setFillColorSpy = spyOn(ref.current!.grid, 'setFillColor').mockReturnValue(true)

    clickAction(container, 'fill-color')
    await flushReactEffects()
    clickBody('[data-fill-color="#ea4335"]')
    await flushReactEffects()

    expect(setFillColorSpy).toHaveBeenCalledWith(
      { startRow: 0, endRow: 1, startCol: 0, endCol: 1 },
      '#ea4335',
    )

    unmount()
  })

  it('excel.L3b.undo-disabled disables undo when canUndo is false', async () => {
    const { container, ref, unmount } = await mountWiringExcel()

    expect(ref.current!.grid.canUndo()).toBe(false)

    const undoButton = container.querySelector<HTMLButtonElement>('[data-action-id="undo"]')
    expect(undoButton?.disabled).toBe(true)

    unmount()
  })

  it('excel.L3b.selection-sync refreshes toolbar after selection change', async () => {
    const onSelectionChange = mock(() => {})
    const ref = React.createRef<NovaExcelRef>()
    const { container, unmount } = await mountNovaExcel({
      data: createDenseData(),
      ref,
      onSelectionChange,
    })

    selectSingleCell(ref.current!.grid, 0, 0)
    await flushGridSelectionEffects()
    clickAction(container, 'fill-color')
    await flushReactEffects()
    clickBody('[data-fill-color="#ea4335"]')
    await flushReactEffects()
    expect(isToolbarFillRed(toolbarFillSwatchBackground(container))).toBe(true)

    selectSingleCell(ref.current!.grid, 1, 1)
    await flushGridSelectionEffects()

    expect(onSelectionChange).toHaveBeenCalled()
    expect(isToolbarFillDefault(toolbarFillSwatchBackground(container))).toBe(true)
    expect(container.querySelector('[data-action-id="text-wrap"]')?.textContent).toContain('溢出')

    const undoButton = container.querySelector<HTMLButtonElement>('[data-action-id="undo"]')
    expect(undoButton?.disabled).toBe(false)

    unmount()
  })

  it.todo('excel.L3b.custom-fill-color applies translucent color from custom picker', async () => {
    const { container, onToolbarAction, unmount } = await mountWiringExcel()
    clickAction(container, 'fill-color')
    await flushReactEffects()
    clickBody('[data-custom-color-add]')
    await flushReactEffects()

    const hexInput = document.body.querySelector<HTMLInputElement>(
      '[data-novasheet-color-picker] input[aria-label="十六进制颜色"]',
    )
    expect(hexInput).not.toBeNull()
    setInputValue(hexInput!, '#ff000080')
    await flushReactEffects()
    clickBody('[data-novasheet-color-picker-confirm]')
    await flushReactEffects()

    expect(onToolbarAction).toHaveBeenCalledWith({ id: 'fill-color', color: '#ff000080' })
    expect(document.body.querySelector('[data-novasheet-fill-palette]')).toBeNull()
    unmount()
  })
})
