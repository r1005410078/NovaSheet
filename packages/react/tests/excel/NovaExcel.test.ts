import { describe, expect, it, mock } from 'bun:test'
import React from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'

import { NovaExcel, type NovaExcelRef } from '../../src'
import { createDenseData, mountNovaExcel, selectSingleCell } from './helpers'

describe('NovaExcel L3a shell', () => {
  it('excel.L3a.default-mount renders excel grid toolbar and canvas', () => {
    const { container, unmount } = mountNovaExcel({ data: createDenseData() })

    expect(container.querySelector('[data-novasheet-react-excel]')).not.toBeNull()
    expect(container.querySelector('[data-novasheet-react-grid]')).not.toBeNull()
    expect(container.querySelector('[role="toolbar"]')).not.toBeNull()
    expect(container.querySelector('canvas')).not.toBeNull()

    unmount()
  })

  it('excel.L3a.sparse-default mounts internal sparse workspace when data omitted', () => {
    const ref = React.createRef<NovaExcelRef>()
    const { container, unmount } = mountNovaExcel({ ref })

    expect(container.querySelector('[data-novasheet-react-excel]')).not.toBeNull()
    expect(container.querySelector('canvas')).not.toBeNull()

    const scrollHost = container.querySelector('[data-novasheet-scroll-host]') as HTMLElement
    expect(scrollHost.scrollLeft).toBe(0)
    ref.current!.scrollToCell(0, 'Z')
    expect(scrollHost.scrollLeft).toBeGreaterThan(0)

    unmount()
  })

  it('excel.L3a.no-toolbar hides toolbar but keeps grid', () => {
    const { container, unmount } = mountNovaExcel({
      data: createDenseData(),
      showToolbar: false,
    })

    expect(container.querySelector('[role="toolbar"]')).toBeNull()
    expect(container.querySelector('[data-novasheet-react-grid]')).not.toBeNull()

    unmount()
  })

  it('excel.L3a.ref-exposes-grid exposes grid and scrollToCell on ref', () => {
    const ref = React.createRef<NovaExcelRef>()
    const { unmount } = mountNovaExcel({ data: createDenseData(), ref })

    expect(ref.current?.grid).toBeDefined()
    expect(typeof ref.current?.scrollToCell).toBe('function')

    unmount()
  })

  it('excel.L3a.strict-mode-remount survives Strict Mode double mount', () => {
    const ref = React.createRef<NovaExcelRef>()
    const container = document.createElement('div')
    const root = createRoot(container)

    flushSync(() => {
      root.render(
        React.createElement(
          React.StrictMode,
          null,
          React.createElement(NovaExcel, { data: createDenseData(), ref }),
        ),
      )
    })

    expect(ref.current?.grid).toBeDefined()
    expect(container.querySelectorAll('canvas').length).toBeGreaterThanOrEqual(1)

    flushSync(() => root.unmount())
    expect(container.querySelector('canvas')).toBeNull()
  })

  it('excel.L3a.props-callbacks forwards onSelectionChange from grid', () => {
    const onSelectionChange = mock(() => {})
    const ref = React.createRef<NovaExcelRef>()
    const { unmount } = mountNovaExcel({
      data: createDenseData(),
      ref,
      onSelectionChange,
    })

    selectSingleCell(ref.current!.grid, 1, 0)

    expect(onSelectionChange).toHaveBeenCalled()

    unmount()
  })
})
