import { describe, expect, it } from 'bun:test'
import { InMemoryDataSource, SparseExcelDataSource } from '@novasheet/core'
import React from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'

import { NovaExcel } from '../../src'
import type { NovaExcelRef } from '../../src'

function createDenseData(): InMemoryDataSource {
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

function createSparseData(): SparseExcelDataSource {
  const data = new SparseExcelDataSource()
  data.updateCell(0, 'A', 'hello')
  return data
}

describe('NovaExcel', () => {
  it('renders toolbar and grid shell', () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    flushSync(() => {
      root.render(React.createElement(NovaExcel, { data: createDenseData() }))
    })

    expect(container.querySelector('[data-novasheet-react-excel]')).not.toBeNull()
    expect(container.querySelector('[data-novasheet-react-grid]')).not.toBeNull()
    expect(container.querySelector('[role="toolbar"]')).not.toBeNull()
    expect(container.querySelector('canvas')).not.toBeNull()

    root.unmount()
  })

  it('mounts with internal sparse workspace when data is omitted', () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    flushSync(() => {
      root.render(React.createElement(NovaExcel, {}))
    })

    expect(container.querySelector('[data-novasheet-react-excel]')).not.toBeNull()
    expect(container.querySelector('canvas')).not.toBeNull()

    root.unmount()
  })

  it('accepts SparseExcelDataSource with excel workspace', () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    const data = createSparseData()

    flushSync(() => {
      root.render(React.createElement(NovaExcel, { data }))
    })

    expect(data.getRowCount()).toBe(1_000)
    expect(data.getCell(0, 'A')).toBe('hello')

    root.unmount()
  })

  it('hides toolbar when showToolbar is false', () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    flushSync(() => {
      root.render(React.createElement(NovaExcel, { data: createDenseData(), showToolbar: false }))
    })

    expect(container.querySelector('[role="toolbar"]')).toBeNull()
    expect(container.querySelector('[data-novasheet-react-grid]')).not.toBeNull()

    root.unmount()
  })

  it('exposes the core Grid facade through ref', () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    const ref = React.createRef<NovaExcelRef>()

    flushSync(() => {
      root.render(React.createElement(NovaExcel, { data: createDenseData(), ref }))
    })

    expect(ref.current?.grid).toBeDefined()
    expect(typeof ref.current?.scrollToCell).toBe('function')

    root.unmount()
  })
})
