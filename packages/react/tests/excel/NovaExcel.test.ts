import { describe, expect, it } from 'bun:test'
import { InMemoryDataSource } from '@novasheet/core'
import React from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'

import { NovaExcel } from '../../src'
import type { NovaExcelRef } from '../../src'

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

describe('NovaExcel', () => {
  it('renders toolbar and grid shell', () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    flushSync(() => {
      root.render(React.createElement(NovaExcel, { data: createData() }))
    })

    expect(container.querySelector('[data-novasheet-react-excel]')).not.toBeNull()
    expect(container.querySelector('[data-novasheet-react-grid]')).not.toBeNull()
    expect(container.querySelector('[role="toolbar"]')).not.toBeNull()
    expect(container.querySelector('canvas')).not.toBeNull()

    root.unmount()
  })

  it('hides toolbar when showToolbar is false', () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    flushSync(() => {
      root.render(React.createElement(NovaExcel, { data: createData(), showToolbar: false }))
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
      root.render(React.createElement(NovaExcel, { data: createData(), ref }))
    })

    expect(ref.current?.grid).toBeDefined()
    expect(typeof ref.current?.scrollToCell).toBe('function')

    root.unmount()
  })
})
