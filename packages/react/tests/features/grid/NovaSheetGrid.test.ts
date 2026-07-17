import { describe, expect, it } from 'bun:test'
import { InMemoryDataSource } from '@zhiguang/novasheet-core'
import type { Grid } from '@zhiguang/novasheet-core'
import React from 'react'
import { createRoot } from 'react-dom/client'

import { NovaSheetGrid } from '../../../src'
import type { NovaSheetGridRef } from '../../../src'
import { mountReactRoot, unmountReactRoot } from '../../helpers/dom'

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
  it('mounts a core Grid with the default canvas2d backend', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    await mountReactRoot(root, React.createElement(NovaSheetGrid, { data: createData() }))

    expect(container.querySelector('[data-novasheet-react-grid]')).not.toBeNull()
    expect(container.querySelector('canvas')).not.toBeNull()

    unmountReactRoot(root)
  })

  it('destroys the Grid when the React component unmounts', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    await mountReactRoot(root, React.createElement(NovaSheetGrid, { data: createData() }))
    expect(container.querySelector('canvas')).not.toBeNull()

    unmountReactRoot(root)

    expect(container.querySelector('canvas')).toBeNull()
  })

  it('exposes the core Grid facade through ref', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    const ref = React.createRef<NovaSheetGridRef>()

    await mountReactRoot(
      root,
      React.createElement(NovaSheetGrid, { data: createData(), ref }),
    )

    expect(ref.current?.grid).toBeDefined()
    expect(typeof ref.current?.refresh).toBe('function')

    const grid = ref.current!.grid as Grid
    expect(grid.canUndo()).toBe(false)

    ref.current!.setColumnWidth('name', 180)

    unmountReactRoot(root)
  })

  it('updates data through the existing Grid instance', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    const ref = React.createRef<NovaSheetGridRef>()
    const firstData = createData()
    const nextData = createData()

    await mountReactRoot(
      root,
      React.createElement(NovaSheetGrid, { data: firstData, ref }),
    )
    const firstGrid = ref.current!.grid
    const firstCanvas = container.querySelector('canvas')

    await mountReactRoot(
      root,
      React.createElement(NovaSheetGrid, { data: nextData, ref }),
    )

    expect(ref.current!.grid).toBe(firstGrid)
    expect(container.querySelector('canvas')).toBe(firstCanvas)

    unmountReactRoot(root)
  })
})
