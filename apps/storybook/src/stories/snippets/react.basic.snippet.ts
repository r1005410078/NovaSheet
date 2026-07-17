// @ts-nocheck
import { InMemoryDataSource } from '@zhiguang/core'
import { NovaSheetGrid, NovaSheetToolbar } from '@zhiguang/react'
import React, { useRef, useState } from 'react'

const data = new InMemoryDataSource({
  schema: {
    fields: [
      { id: 'name', name: 'Name', type: 'text', width: 200 },
      { id: 'role', name: 'Role', type: 'text', width: 180 },
      { id: 'team', name: 'Team', type: 'text', width: 160 },
    ],
  },
  rows: [
    { name: 'Ada 001', role: 'Engineer', team: 'Platform' },
    { name: 'Grace 002', role: 'Researcher', team: 'Data' },
  ],
})

export function Sheet() {
  const gridRef = useRef(null)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [fillColor, setFillColor] = useState('#fff2cc')

  function syncUndoState() {
    const grid = gridRef.current?.grid
    setCanUndo(grid?.canUndo() ?? false)
    setCanRedo(grid?.canRedo() ?? false)
  }

  function currentRange() {
    const grid = gridRef.current?.grid
    return grid?.getSelection().selectedRange ?? { startRow: 0, endRow: 1, startCol: 0, endCol: 1 }
  }

  return React.createElement(
    'div',
    { className: 'flex h-[480px] min-h-0 flex-col bg-white' },
    React.createElement(NovaSheetToolbar, {
      disabledActionIds: [
        ...(canUndo ? [] : ['undo']),
        ...(canRedo ? [] : ['redo']),
      ],
      state: { zoom: '100%', fillColor, textWrap: '溢出' },
      onAction(action) {
        const grid = gridRef.current?.grid
        if (!grid) return

        if (action.id === 'undo') grid.undo()
        if (action.id === 'redo') grid.redo()
        if (action.id === 'copy') void grid.copy()
        if (action.id === 'cut') void grid.cut()
        if (action.id === 'paste') void grid.paste()
        if (action.id === 'fill-color') {
          setFillColor(action.color)
          grid.setFillColor(currentRange(), action.color)
        }
        if (action.id === 'borders') {
          grid.setBorders(currentRange(), 'all', {
            color: '#1a73e8',
            width: 'thin',
            lineStyle: 'solid',
          })
        }
        if (action.id === 'merge-cells') grid.mergeCells(currentRange())
        if (action.id === 'unmerge-cells') grid.unmergeCells(currentRange())
        if (action.id === 'text-wrap') grid.setTextWrap(currentRange(), 'wrap')

        syncUndoState()
      },
    }),
    React.createElement(
      'div',
      { className: 'min-h-0 flex-1' },
      React.createElement(NovaSheetGrid, {
        ref: gridRef,
        data,
        className: 'h-full w-full',
        onUndo: syncUndoState,
        onRedo: syncUndoState,
      }),
    ),
  )
}
