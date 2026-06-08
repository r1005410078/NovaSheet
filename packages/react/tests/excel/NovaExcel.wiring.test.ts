import { describe, expect, it, mock, spyOn } from 'bun:test'
import React from 'react'

import type { NovaExcelRef } from '../../src'
import type { ToolbarAction } from '../../src/features/toolbar'
import {
  clickAction,
  clickControl,
  createDenseData,
  mountNovaExcel,
  selectSingleCell,
  syncToolbarViaFill,
} from './helpers'

function mountWiringExcel(onToolbarAction = mock((_action: ToolbarAction) => {})) {
  const ref = React.createRef<NovaExcelRef>()
  const mounted = mountNovaExcel({
    data: createDenseData(),
    ref,
    onToolbarAction,
  })
  return { ...mounted, ref, onToolbarAction }
}

describe('NovaExcel L3b toolbar wiring', () => {
  it('excel.L3b.undo-redo dispatches grid.undo and grid.redo', async () => {
    const { container, ref, onToolbarAction, unmount } = mountWiringExcel()

    ref.current!.grid.insertRows(0, 1)
    ref.current!.grid.insertRows(0, 1)
    await syncToolbarViaFill(container)

    const undoSpy = spyOn(ref.current!.grid, 'undo')
    const redoSpy = spyOn(ref.current!.grid, 'redo')

    clickAction(container, 'undo')
    expect(undoSpy).toHaveBeenCalled()
    expect(onToolbarAction).toHaveBeenCalledWith({ id: 'undo' })

    await Promise.resolve()
    clickAction(container, 'redo')
    expect(redoSpy).toHaveBeenCalled()
    expect(onToolbarAction).toHaveBeenCalledWith({ id: 'redo' })

    unmount()
  })

  it('excel.L3b.clipboard dispatches grid.copy cut and paste', async () => {
    const { container, ref, unmount } = mountWiringExcel()

    const copySpy = spyOn(ref.current!.grid, 'copy').mockResolvedValue(true)
    const cutSpy = spyOn(ref.current!.grid, 'cut').mockResolvedValue(true)
    const pasteSpy = spyOn(ref.current!.grid, 'paste').mockResolvedValue(true)

    clickAction(container, 'copy')
    await Promise.resolve()
    clickAction(container, 'cut')
    await Promise.resolve()
    clickAction(container, 'paste')
    await Promise.resolve()

    expect(copySpy).toHaveBeenCalled()
    expect(cutSpy).toHaveBeenCalled()
    expect(pasteSpy).toHaveBeenCalled()

    unmount()
  })

  it('excel.L3b.fill-color dispatches grid.setFillColor', async () => {
    const { container, ref, onToolbarAction, unmount } = mountWiringExcel()

    const setFillColorSpy = spyOn(ref.current!.grid, 'setFillColor').mockReturnValue(true)

    clickAction(container, 'fill-color')
    await Promise.resolve()

    const redSwatch = document.body.querySelector<HTMLButtonElement>('[data-fill-color="#ea4335"]')
    expect(redSwatch).not.toBeNull()
    redSwatch!.click()
    await Promise.resolve()

    expect(setFillColorSpy).toHaveBeenCalled()
    expect(onToolbarAction).toHaveBeenCalledWith({ id: 'fill-color', color: '#ea4335' })

    unmount()
  })

  it('excel.L3b.borders dispatches grid.setBorders', async () => {
    const { container, ref, onToolbarAction, unmount } = mountWiringExcel()

    const setBordersSpy = spyOn(ref.current!.grid, 'setBorders').mockReturnValue(true)

    clickAction(container, 'borders')
    await Promise.resolve()

    const allPreset = document.body.querySelector<HTMLButtonElement>('[data-border-preset="all"]')
    expect(allPreset).not.toBeNull()
    allPreset!.click()
    await Promise.resolve()

    expect(setBordersSpy).toHaveBeenCalled()
    expect(onToolbarAction).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'borders', preset: 'all' }),
    )

    unmount()
  })

  it('excel.L3b.merge-cells dispatches grid.mergeCells', () => {
    const { container, ref, onToolbarAction, unmount } = mountWiringExcel()

    const mergeSpy = spyOn(ref.current!.grid, 'mergeCells').mockReturnValue(true)

    container
      .querySelector<HTMLButtonElement>('[data-action-id="merge-cells"][data-action-part="primary"]')!
      .click()

    expect(mergeSpy).toHaveBeenCalled()
    expect(onToolbarAction).toHaveBeenCalledWith({ id: 'merge-cells', mode: 'all' })

    unmount()
  })

  it('excel.L3b.unmerge-cells dispatches grid.unmergeCells', async () => {
    const { container, ref, onToolbarAction, unmount } = mountWiringExcel()

    const unmergeSpy = spyOn(ref.current!.grid, 'unmergeCells').mockReturnValue(true)

    container
      .querySelector<HTMLButtonElement>('[data-action-id="merge-cells"][data-action-part="menu"]')!
      .click()
    await Promise.resolve()

    document.body.querySelector<HTMLButtonElement>('[data-merge-mode="unmerge"]')!.click()
    await Promise.resolve()

    expect(unmergeSpy).toHaveBeenCalled()
    expect(onToolbarAction).toHaveBeenCalledWith({ id: 'unmerge-cells' })

    unmount()
  })

  it('excel.L3b.text-wrap dispatches grid.setTextWrap', () => {
    const { container, ref, onToolbarAction, unmount } = mountWiringExcel()

    const setTextWrapSpy = spyOn(ref.current!.grid, 'setTextWrap').mockReturnValue(true)

    clickControl(container, 'text-wrap')

    expect(setTextWrapSpy).toHaveBeenCalled()
    expect(onToolbarAction).toHaveBeenCalledWith({ id: 'text-wrap' })

    unmount()
  })

  it('excel.L3b.default-range-on-format applies format with default range', async () => {
    const { container, ref, unmount } = mountWiringExcel()

    const setFillColorSpy = spyOn(ref.current!.grid, 'setFillColor').mockReturnValue(true)

    clickAction(container, 'fill-color')
    await Promise.resolve()
    document.body.querySelector<HTMLButtonElement>('[data-fill-color="#ea4335"]')!.click()
    await Promise.resolve()

    expect(setFillColorSpy).toHaveBeenCalledWith(
      { startRow: 0, endRow: 1, startCol: 0, endCol: 1 },
      '#ea4335',
    )

    unmount()
  })

  it('excel.L3b.undo-disabled disables undo when canUndo is false', () => {
    const { container, ref, unmount } = mountWiringExcel()

    expect(ref.current!.grid.canUndo()).toBe(false)

    const undoButton = container.querySelector<HTMLButtonElement>('[data-action-id="undo"]')
    expect(undoButton?.disabled).toBe(true)

    unmount()
  })

  it('excel.L3b.selection-sync refreshes toolbar after selection change', async () => {
    const onSelectionChange = mock(() => {})
    const ref = React.createRef<NovaExcelRef>()
    const { container, unmount } = mountNovaExcel({
      data: createDenseData(),
      ref,
      onSelectionChange,
    })

    await syncToolbarViaFill(container)
    selectSingleCell(ref.current!.grid, 0, 0)

    expect(onSelectionChange).toHaveBeenCalled()

    const undoButton = container.querySelector<HTMLButtonElement>('[data-action-id="undo"]')
    expect(undoButton?.disabled).toBe(false)

    unmount()
  })
})
