import type { Grid } from '@novasheet/core'
import { InMemoryDataSource } from '@novasheet/core'
import type { NovaExcelProps, NovaExcelRef } from '../../src'
import { NovaExcel } from '../../src'
import React from 'react'
import { act } from 'react'
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'

export function createDenseData(): InMemoryDataSource {
  return new InMemoryDataSource({
    schema: {
      fields: [
        { id: 'name', name: 'Name', type: 'text', width: 120 },
        { id: 'score', name: 'Score', type: 'number', width: 80 },
      ],
    },
    rows: [
      { name: 'Ada', score: 10 },
      { name: 'Grace', score: 20 },
    ],
  })
}

export interface MountedNovaExcel {
  readonly container: HTMLDivElement
  readonly root: Root
  readonly ref: React.RefObject<NovaExcelRef>
}

/** Mount NovaExcel in a detached container; caller must call `unmount()`. */
export function mountNovaExcel(
  props: Omit<NovaExcelProps, 'ref'> & { ref?: React.RefObject<NovaExcelRef> } = {},
): MountedNovaExcel & { unmount: () => void } {
  const container = document.createElement('div')
  const root = createRoot(container)
  const ref = props.ref ?? React.createRef<NovaExcelRef>()

  flushSync(() => {
    root.render(React.createElement(NovaExcel, { ...props, ref }))
  })

  return {
    container,
    root,
    ref,
    unmount: () => {
      flushSync(() => root.unmount())
    },
  }
}

export function clickAction(container: ParentNode, actionId: string): void {
  const button = container.querySelector<HTMLButtonElement>(`[data-action-id="${actionId}"]`)
  if (!button) throw new Error(`action button not found: ${actionId}`)
  button.click()
}

/** Set a single-cell selection; range end indices are inclusive (core convention). */
export function selectSingleCell(grid: Grid, rowIndex: number, colIndex: number): void {
  act(() => {
    grid.setSelection({
      activeCell: { rowIndex, colIndex },
      anchorCell: { rowIndex, colIndex },
      extentCell: { rowIndex, colIndex },
      selectedRange: {
        startRow: rowIndex,
        endRow: rowIndex,
        startCol: colIndex,
        endCol: colIndex,
      },
    })
  })
}

/** Toolbar actions call syncToolbarState; use after programmatic grid mutations in tests. */
export async function syncToolbarViaFill(container: ParentNode): Promise<void> {
  clickAction(container, 'fill-color')
  await Promise.resolve()
  document.body.querySelector<HTMLButtonElement>('[data-fill-color="#ea4335"]')!.click()
  await Promise.resolve()
}

export function clickControl(container: ParentNode, controlId: string): void {
  const control = container.querySelector<HTMLElement>(`[data-control-id="${controlId}"]`)
  if (!control) throw new Error(`toolbar control not found: ${controlId}`)
  control.click()
}
