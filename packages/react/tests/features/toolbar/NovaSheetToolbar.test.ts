import { describe, expect, it } from 'bun:test'
import React from 'react'
import { createRoot } from 'react-dom/client'

import { NovaSheetToolbar, defaultToolbarItems } from '../../../src'
import type { ToolbarAction, ToolbarItem } from '../../../src'
import {
  clickBody,
  clickElement,
  flushReactEffects,
  mountReactRoot,
  unmountReactRoot,
} from '../../helpers/dom'

const validToolbarSearchItem: ToolbarItem = {
  id: 'menu-search',
  kind: 'search',
  label: '菜单搜索',
}

const validToolbarActionItem: ToolbarItem = {
  id: 'copy',
  kind: 'button',
  label: '复制',
}

// @ts-expect-error menu-search is not a dispatchable toolbar action item.
const invalidToolbarActionItem: ToolbarItem = {
  id: 'menu-search',
  kind: 'button',
  label: '菜单搜索',
}

void [validToolbarSearchItem, validToolbarActionItem, invalidToolbarActionItem]

describe('NovaSheetToolbar', () => {
  it('renders the default compact spreadsheet toolbar controls', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    await mountReactRoot(root, React.createElement(NovaSheetToolbar))

    const toolbar = container.querySelector('[role="toolbar"]')
    expect(toolbar).not.toBeNull()
    expect(toolbar?.getAttribute('aria-label')).toBe('NovaSheet toolbar')

    const menuSearch = container.querySelector('input[aria-label="菜单搜索"]')
    expect(menuSearch).not.toBeNull()
    expect(menuSearch?.getAttribute('placeholder')).toBe('菜单')

    for (const actionId of ['undo', 'redo', 'copy', 'cut', 'paste', 'fill-color', 'borders', 'merge-cells']) {
      expect(container.querySelector(`[data-action-id="${actionId}"]`)).not.toBeNull()
    }

    expect(container.querySelector('[data-action-id="unmerge-cells"]')).toBeNull()

    expect(container.querySelector('[data-control-id="zoom"]')?.textContent).toContain('100%')
    expect(container.querySelector('[data-control-id="text-wrap"]')?.textContent).toContain('溢出')

    unmountReactRoot(root)
  })

  it('shows Chinese native hover hints for toolbar controls', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    await mountReactRoot(root, React.createElement(NovaSheetToolbar))

    const menuSearch = container.querySelector<HTMLInputElement>('input[aria-label="菜单搜索"]')
    const fillButton = container.querySelector<HTMLButtonElement>('[data-action-id="fill-color"]')
    const bordersButton = container.querySelector<HTMLButtonElement>('[data-action-id="borders"]')
    const textWrapButton = container.querySelector<HTMLButtonElement>('[data-action-id="text-wrap"]')

    expect(menuSearch?.getAttribute('title')).toBe('菜单搜索')
    expect(fillButton?.getAttribute('title')).toBe('填充颜色')
    expect(bordersButton?.getAttribute('title')).toBe('边框')
    expect(textWrapButton?.getAttribute('title')).toBe('文本换行')

    unmountReactRoot(root)
  })

  it('dispatches typed toolbar actions from command buttons', async () => {
    const actions: ToolbarAction[] = []
    const container = document.createElement('div')
    const root = createRoot(container)

    await mountReactRoot(
      root,
      React.createElement(NovaSheetToolbar, { onAction: (action) => actions.push(action) }),
    )

    const copyButton = container.querySelector<HTMLButtonElement>('[data-action-id="copy"]')
    expect(copyButton).not.toBeNull()

    clickElement(copyButton!)

    expect(actions).toEqual([{ id: 'copy' }])

    unmountReactRoot(root)
  })

  it('opens a fill color palette and dispatches the selected swatch', async () => {
    const actions: ToolbarAction[] = []
    const container = document.createElement('div')
    const root = createRoot(container)

    await mountReactRoot(
      root,
      React.createElement(NovaSheetToolbar, { onAction: (action) => actions.push(action) }),
    )

    const fillButton = container.querySelector<HTMLButtonElement>('[data-action-id="fill-color"]')
    expect(fillButton).not.toBeNull()
    expect(container.querySelector('[data-novasheet-fill-palette]')).toBeNull()

    clickElement(fillButton!)
    await flushReactEffects()

    expect(document.body.querySelector('[data-novasheet-fill-palette]')).not.toBeNull()
    expect(document.body.querySelector('[data-novasheet-fill-palette]')?.textContent).toContain('重置')
    expect(document.body.querySelector('[data-novasheet-fill-palette]')?.textContent).toContain('标准')
    expect(document.body.querySelector('[data-novasheet-fill-palette]')?.textContent).toContain('自定义')

    const redSwatch = document.body.querySelector<HTMLButtonElement>(
      '[data-fill-color="#ea4335"]',
    )
    expect(redSwatch).not.toBeNull()

    clickElement(redSwatch!)
    await flushReactEffects()

    expect(actions).toEqual([{ id: 'fill-color', color: '#ea4335' }])
    expect(document.body.querySelector('[data-novasheet-fill-palette]')).toBeNull()

    unmountReactRoot(root)
  })

  it('opens a border palette and dispatches the selected preset', async () => {
    const actions: ToolbarAction[] = []
    const container = document.createElement('div')
    const root = createRoot(container)

    await mountReactRoot(
      root,
      React.createElement(NovaSheetToolbar, { onAction: (action) => actions.push(action) }),
    )

    const bordersButton = container.querySelector<HTMLButtonElement>('[data-action-id="borders"]')
    expect(bordersButton).not.toBeNull()
    expect(document.body.querySelector('[data-novasheet-border-palette]')).toBeNull()

    clickElement(bordersButton!)
    await flushReactEffects()

    expect(document.body.querySelector('[data-novasheet-border-palette]')).not.toBeNull()

    expect(document.body.querySelector('[data-border-preset="all"]')).not.toBeNull()
    clickBody('[data-border-preset="all"]')
    await flushReactEffects()

    expect(actions).toEqual([
      {
        id: 'borders',
        preset: 'all',
        border: { color: '#000000', width: 'thin', lineStyle: 'solid' },
      },
    ])
    expect(document.body.querySelector('[data-novasheet-border-palette]')).toBeNull()

    unmountReactRoot(root)
  })

  it('reapplies the last border preset when only the color changes', async () => {
    const actions: ToolbarAction[] = []
    const container = document.createElement('div')
    const root = createRoot(container)

    await mountReactRoot(
      root,
      React.createElement(NovaSheetToolbar, {
        state: {
          borderStyle: { color: '#000000', width: 'thin', lineStyle: 'solid' },
          lastBorderPreset: 'all',
        },
        onAction: (action) => actions.push(action),
      }),
    )

    const bordersButton = container.querySelector<HTMLButtonElement>('[data-action-id="borders"]')
    clickElement(bordersButton!)
    await flushReactEffects()

    const colorToggle = document.body.querySelector<HTMLButtonElement>(
      '[data-novasheet-border-palette] button[title="边框颜色"]',
    )
    expect(colorToggle).not.toBeNull()
    clickElement(colorToggle!)
    await flushReactEffects()

    const redSwatch = document.body.querySelector<HTMLButtonElement>('[data-fill-color="#ea4335"]')
    expect(redSwatch).not.toBeNull()
    clickElement(redSwatch!)
    await flushReactEffects()

    expect(actions).toEqual([
      {
        id: 'borders',
        preset: 'all',
        border: { color: '#ea4335', width: 'thin', lineStyle: 'solid' },
      },
    ])
    expect(document.body.querySelector('[data-novasheet-border-palette]')).not.toBeNull()

    unmountReactRoot(root)
  })

  it('opens a merge menu and dispatches merge all or unmerge', async () => {
    const actions: ToolbarAction[] = []
    const container = document.createElement('div')
    const root = createRoot(container)

    await mountReactRoot(
      root,
      React.createElement(NovaSheetToolbar, { onAction: (action) => actions.push(action) }),
    )

    const mergeMenuButton = container.querySelector<HTMLButtonElement>(
      '[data-action-id="merge-cells"][data-action-part="menu"]',
    )
    expect(mergeMenuButton).not.toBeNull()
    expect(mergeMenuButton?.getAttribute('title')).toBe('合并单元格 菜单')
    expect(document.body.querySelector('[data-novasheet-merge-menu]')).toBeNull()

    clickElement(mergeMenuButton!)
    await flushReactEffects()

    expect(document.body.querySelector('[data-novasheet-merge-menu]')).not.toBeNull()

    clickBody('[data-merge-mode="all"]')
    await flushReactEffects()

    expect(actions).toEqual([{ id: 'merge-cells', mode: 'all' }])
    expect(document.body.querySelector('[data-novasheet-merge-menu]')).toBeNull()

    clickElement(mergeMenuButton!)
    await flushReactEffects()

    clickBody('[data-merge-mode="unmerge"]')
    await flushReactEffects()

    expect(actions).toEqual([
      { id: 'merge-cells', mode: 'all' },
      { id: 'unmerge-cells' },
    ])

    unmountReactRoot(root)
  })

  it('dispatches merge-all from split-button primary click only', async () => {
    const actions: ToolbarAction[] = []
    const container = document.createElement('div')
    const root = createRoot(container)

    await mountReactRoot(
      root,
      React.createElement(NovaSheetToolbar, { onAction: (action) => actions.push(action) }),
    )

    clickElement(
      container.querySelector<HTMLButtonElement>(
        '[data-action-id="merge-cells"][data-action-part="primary"]',
      )!,
    )

    expect(actions).toEqual([{ id: 'merge-cells', mode: 'all' }])
    expect(
      container.querySelector('[data-action-id="fill-color"][data-action-part="primary"]'),
    ).toBeNull()
    expect(container.querySelector('[data-action-id="borders"][data-action-part="primary"]')).toBeNull()

    unmountReactRoot(root)
  })

  it('renders controlled state and suppresses disabled actions', async () => {
    const actions: ToolbarAction[] = []
    const container = document.createElement('div')
    const root = createRoot(container)

    await mountReactRoot(
      root,
      React.createElement(NovaSheetToolbar, {
        state: { zoom: '125%', textWrap: '换行' },
        disabledActionIds: ['undo'],
        onAction: (action) => actions.push(action),
      }),
    )

    expect(container.querySelector('[data-control-id="zoom"]')?.textContent).toContain('125%')
    expect(container.querySelector('[data-control-id="text-wrap"]')?.textContent).toContain('换行')

    const undoButton = container.querySelector<HTMLButtonElement>('[data-action-id="undo"]')
    expect(undoButton?.disabled).toBe(true)

    clickElement(undoButton!)

    expect(actions).toEqual([])

    unmountReactRoot(root)
  })

  it('uses Tailwind class names instead of inline styles for toolbar primitives', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    await mountReactRoot(root, React.createElement(NovaSheetToolbar))

    const toolbar = container.querySelector<HTMLElement>('[role="toolbar"]')
    const scrollRow = toolbar?.firstElementChild as HTMLElement | null
    const fillButton = container.querySelector<HTMLButtonElement>('[data-action-id="fill-color"]')
    const menuSearch = container.querySelector<HTMLInputElement>('input[aria-label="菜单搜索"]')

    expect(toolbar?.getAttribute('style')).toBeNull()
    expect(toolbar?.className).toContain('bg-[#f8f9fa]')
    expect(toolbar?.className).toContain('rounded-full')
    expect(toolbar?.className).not.toContain('border-b')
    expect(toolbar?.className).not.toContain('ring-')
    expect(toolbar?.className).toContain('shadow-')
    expect(scrollRow?.className).toContain('h-10')
    expect(scrollRow?.className).toContain('overflow-x-auto')
    expect(fillButton?.getAttribute('style')).toBeNull()
    expect(fillButton?.className).toContain('inline-flex')
    expect(menuSearch?.getAttribute('style')).toBeNull()
    expect(menuSearch?.className).toContain('rounded-full')

    unmountReactRoot(root)
  })

  it('renders extensionItems after default controls without dispatching ToolbarAction', async () => {
    const actions: ToolbarAction[] = []
    const container = document.createElement('div')
    const root = createRoot(container)

    await mountReactRoot(
      root,
      React.createElement(NovaSheetToolbar, {
        onAction: (action) => actions.push(action),
        extensionItems: [
          {
            id: 'rich-text-bold',
            separatorBefore: true,
            render: () =>
              React.createElement(
                'button',
                {
                  type: 'button',
                  'data-rich-text-command': 'bold',
                  onClick: () => undefined,
                },
                'B',
              ),
          },
        ],
      }),
    )

    expect(container.querySelector('[data-action-id="copy"]')).not.toBeNull()
    expect(container.querySelector('[data-rich-text-command="bold"]')?.textContent).toBe('B')
    expect(actions).toEqual([])

    unmountReactRoot(root)
  })

  it('allows callers to override built-in toolbar items', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    await mountReactRoot(
      root,
      React.createElement(NovaSheetToolbar, {
        items: [{ id: 'undo', kind: 'button', label: '撤销' }],
      }),
    )

    expect(container.querySelector('[data-action-id="undo"]')).not.toBeNull()
    expect(container.querySelector('[data-action-id="copy"]')).toBeNull()

    unmountReactRoot(root)
  })
})

describe('defaultToolbarItems', () => {
  it('keeps the screenshot-inspired controls in a stable order', () => {
    expect(defaultToolbarItems.map((item) => item.id)).toEqual([
      'menu-search',
      'undo',
      'redo',
      'copy',
      'cut',
      'paste',
      'zoom',
      'fill-color',
      'borders',
      'merge-cells',
      'text-wrap',
      'value-format',
    ])
  })
})
