import { describe, expect, it } from 'bun:test'
import { InMemoryDataSource } from '@novasheet/core'
import type { Grid } from '@novasheet/core'
import React from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'

import { NovaSheetGrid } from '../../../src'
import type { NovaSheetGridRef } from '../../../src'

function createData(): InMemoryDataSource {
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

describe('NovaSheetGrid', () => {
  it('mounts a core Grid with the default canvas2d backend', () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    flushSync(() => {
      root.render(React.createElement(NovaSheetGrid, { data: createData() }))
    })

    expect(container.querySelector('[data-novasheet-react-grid]')).not.toBeNull()
    expect(container.querySelector('canvas')).not.toBeNull()

    root.unmount()
  })

  it('destroys the Grid when the React component unmounts', () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    flushSync(() => {
      root.render(React.createElement(NovaSheetGrid, { data: createData() }))
    })
    expect(container.querySelector('canvas')).not.toBeNull()

    flushSync(() => {
      root.unmount()
    })

    expect(container.querySelector('canvas')).toBeNull()
  })

  it('exposes the core Grid facade through ref', () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    const ref = React.createRef<NovaSheetGridRef>()

    flushSync(() => {
      root.render(React.createElement(NovaSheetGrid, { data: createData(), ref }))
    })

    expect(ref.current?.grid).toBeDefined()
    expect(typeof ref.current?.refresh).toBe('function')

    const grid = ref.current!.grid as Grid
    expect(grid.canUndo()).toBe(false)

    ref.current!.setColumnWidth('name', 180)

    root.unmount()
  })

  it('updates data through the existing Grid instance', () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    const ref = React.createRef<NovaSheetGridRef>()
    const firstData = createData()
    const nextData = createData()

    flushSync(() => {
      root.render(React.createElement(NovaSheetGrid, { data: firstData, ref }))
    })
    const firstGrid = ref.current!.grid
    const firstCanvas = container.querySelector('canvas')

    flushSync(() => {
      root.render(React.createElement(NovaSheetGrid, { data: nextData, ref }))
    })

    expect(ref.current!.grid).toBe(firstGrid)
    expect(container.querySelector('canvas')).toBe(firstCanvas)

    root.unmount()
  })
})
