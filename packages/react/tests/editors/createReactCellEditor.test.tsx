import { describe, expect, it } from 'bun:test'
import React, { act } from 'react'
import { createReactCellEditor } from '../../src'
import type { CellEditorOpenContext } from '@novasheet/core'

describe('createReactCellEditor', () => {
  it('mounts overlay inside the grid container coordinate space', async () => {
    function Picker() {
      return React.createElement('button', { type: 'button' }, 'Pick')
    }

    const container = document.createElement('div')
    document.body.appendChild(container)
    const editor = createReactCellEditor(Picker, { kind: 'popover' })

    await act(async () => {
      editor.open({
        cell: { rowIndex: 0, colIndex: 0 },
        field: { id: 'owner', name: 'Owner', type: 'assignee', width: 120 },
        value: 'Alice',
        rect: { x: 11, y: 17, width: 80, height: 24 },
        trigger: 'api',
        container,
        commit: () => {},
        cancel: () => {},
      } satisfies CellEditorOpenContext)
      await Promise.resolve()
    })

    const host = container.querySelector<HTMLElement>('[data-novasheet-react-cell-editor]')
    expect(host).not.toBeNull()
    expect(host?.parentElement).toBe(container)
    expect(host?.style.left).toBe('11px')
    expect(host?.style.top).toBe('41px')
    expect(document.body.querySelector('[data-novasheet-react-cell-editor]')).toBe(host)

    act(() => {
      editor.destroy?.()
    })
    container.remove()
  })
})
