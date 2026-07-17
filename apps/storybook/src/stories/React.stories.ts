import type { Meta, StoryObj } from '@storybook/html'
import { InMemoryDataSource } from '@zhiguang/novasheet-core'
import {
  NovaSheetGrid,
  NovaSheetToolbar,
  useNovaSheetToolbarState,
} from '@zhiguang/novasheet-react'
import React, { useCallback, useEffect, useRef } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import type { CellRange, TextWrapMode } from '@zhiguang/novasheet-core'
import type { NovaSheetGridRef, ToolbarAction } from '@zhiguang/novasheet-react'
import { basicTextSchema, generateRows } from '../mock-data'
import { docsMeta, docsStory } from '../story-docs'
import basicReactSrc from './snippets/react.basic.snippet.ts?raw'

const meta: Meta = {
  title: 'Table/React',
  parameters: { layout: 'fullscreen' },
  ...docsMeta(
    '`@zhiguang/novasheet-react` wraps the core Grid and Canvas2D backend into React components. React apps can render NovaSheetGrid directly without manually injecting a backend.',
  ),
}
export default meta

type Story = StoryObj

const INITIAL_RANGE: CellRange = { startRow: 0, endRow: 1, startCol: 0, endCol: 1 }

function ReactGridStoryApp({ data }: { readonly data: InMemoryDataSource }): React.ReactElement {
  const gridRef = useRef<NovaSheetGridRef>(null)
  const getGrid = useCallback(() => {
    try {
      return gridRef.current?.grid ?? null
    } catch {
      return null
    }
  }, [])

  const { toolbarState, canUndo, canRedo, syncToolbarState } = useNovaSheetToolbarState(getGrid)

  const getRange = useCallback((): CellRange | null => {
    const grid = getGrid()
    if (!grid) return null

    const selection = grid.getSelection()
    if (selection.selectedRange) return selection.selectedRange

    grid.setSelection({
      activeCell: { rowIndex: INITIAL_RANGE.startRow, colIndex: INITIAL_RANGE.startCol },
      anchorCell: { rowIndex: INITIAL_RANGE.startRow, colIndex: INITIAL_RANGE.startCol },
      extentCell: { rowIndex: INITIAL_RANGE.endRow, colIndex: INITIAL_RANGE.endCol },
      selectedRange: INITIAL_RANGE,
    })
    return INITIAL_RANGE
  }, [getGrid])

  useEffect(() => {
    getRange()
    syncToolbarState()
  }, [getRange, syncToolbarState])

  const applyRangeAction = useCallback(
    (action: (range: CellRange) => boolean) => {
      const range = getRange()
      if (!range) return
      action(range)
      syncToolbarState()
    },
    [getRange, syncToolbarState],
  )

  const handleAction = useCallback(
    (action: ToolbarAction) => {
      const grid = getGrid()
      if (!grid) return

      if (action.id === 'undo') {
        grid.undo()
        syncToolbarState()
        return
      }
      if (action.id === 'redo') {
        grid.redo()
        syncToolbarState()
        return
      }
      if (action.id === 'copy' || action.id === 'cut' || action.id === 'paste') {
        void grid[action.id]().then(() => syncToolbarState())
        return
      }
      if (action.id === 'fill-color') {
        applyRangeAction((range) => grid.setFillColor(range, action.color))
        return
      }
      if (action.id === 'borders') {
        applyRangeAction((range) => grid.setBorders(range, action.preset, action.border))
        return
      }
      if (action.id === 'merge-cells') {
        if (action.mode !== 'all') return
        applyRangeAction((range) => grid.mergeCells(range))
        return
      }
      if (action.id === 'unmerge-cells') {
        applyRangeAction((range) => grid.unmergeCells(range))
        return
      }
      if (action.id === 'text-wrap') {
        const currentLabel = toolbarState.textWrap ?? '溢出'
        const next: TextWrapMode =
          currentLabel === '溢出' ? 'wrap' : currentLabel === '换行' ? 'clip' : 'overflow'
        applyRangeAction((range) => grid.setTextWrap(range, next))
      }
    },
    [applyRangeAction, getGrid, syncToolbarState, toolbarState.textWrap],
  )

  const disabledActionIds = [
    ...(canUndo ? [] : (['undo'] as const)),
    ...(canRedo ? [] : (['redo'] as const)),
  ]

  return React.createElement(
    'div',
    { className: 'flex h-full min-h-0 flex-col bg-white' },
    React.createElement(NovaSheetToolbar, {
      disabledActionIds,
      state: { zoom: '100%', ...toolbarState },
      onAction: handleAction,
    }),
    React.createElement(
      'div',
      { className: 'min-h-0 flex-1' },
      React.createElement(NovaSheetGrid, {
        ref: gridRef,
        data,
        className: 'h-full w-full',
        onSelectionChange: () => syncToolbarState(),
        onUndo: () => syncToolbarState(),
        onRedo: () => syncToolbarState(),
      }),
    ),
  )
}

export const BasicReactGrid: Story = {
  name: 'React grid + toolbar',
  ...docsStory(
    basicReactSrc,
    'Rendered through the React adapter package. Toolbar actions are typed UI intents; the grid itself is mounted by NovaSheetGrid.',
  ),
  render: () => {
    const schema = basicTextSchema()
    const data = new InMemoryDataSource({ schema, rows: generateRows(schema, 100) })

    const host = document.createElement('div')
    host.style.width = '100%'
    host.style.height = '100vh'
    host.style.minHeight = '480px'

    const root = createRoot(host)
    ;(host as unknown as HTMLElement & { __reactRoot: typeof root }).__reactRoot = root
    flushSync(() => {
      root.render(React.createElement(ReactGridStoryApp, { data }))
    })

    return host
  },
}
