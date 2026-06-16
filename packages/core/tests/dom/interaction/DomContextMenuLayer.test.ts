import { describe, expect, it, mock } from 'bun:test'
import { DomContextMenuLayer } from '../../../src/dom/interaction/DomContextMenuLayer'
import { denseGridTheme } from '@novasheet/core'

function makeContainer(): HTMLElement {
  const c = document.createElement('div')
  Object.assign(c.style, { position: 'relative', width: '500px', height: '400px' })
  document.body.appendChild(c)
  return c
}

const sampleItems = [
  { id: 'cut' as const, label: '剪切', disabled: false },
  { id: 'copy' as const, label: '复制', disabled: false, separatorAfter: true },
  { id: 'paste' as const, label: '粘贴', disabled: true },
]

describe('DomContextMenuLayer — Phase 4.0 lifecycle', () => {
  it('attach 创建 hidden layer；isOpen 初始为 false', () => {
    const container = makeContainer()
    const layer = new DomContextMenuLayer(container, { onSelect: mock(() => {}) })
    layer.attach()
    layer.applyTheme(denseGridTheme)
    expect(layer.isOpen()).toBe(false)
    expect(document.body.querySelector('[data-novasheet-context-menu]')).toBeTruthy()
    layer.destroy()
    document.body.removeChild(container)
  })

  it('open 之后 isOpen=true；渲染 items 数量正确', () => {
    const container = makeContainer()
    const layer = new DomContextMenuLayer(container, { onSelect: mock(() => {}) })
    layer.attach()
    layer.applyTheme(denseGridTheme)
    layer.open({ clientX: 50, clientY: 60, items: sampleItems })
    expect(layer.isOpen()).toBe(true)
    const buttons = document.body.querySelectorAll('[data-ns-action]')
    expect(buttons.length).toBe(3)
    expect((buttons[0] as HTMLElement).textContent).toBe('剪切')
    expect((buttons[2] as HTMLElement).getAttribute('aria-disabled')).toBe('true')
    expect(document.body.querySelector('[role="separator"]')).toBeTruthy()
    layer.destroy()
    document.body.removeChild(container)
  })

  it('click 非 disabled item 触发 onSelect 并关闭', () => {
    const container = makeContainer()
    const onSelect = mock((_id: string) => {})
    const layer = new DomContextMenuLayer(container, { onSelect })
    layer.attach()
    layer.applyTheme(denseGridTheme)
    layer.open({ clientX: 50, clientY: 60, items: sampleItems })
    const cutBtn = document.body.querySelector('[data-ns-action="cut"]') as HTMLElement
    cutBtn.click()
    expect(onSelect).toHaveBeenCalledWith('cut')
    expect(layer.isOpen()).toBe(false)
    layer.destroy()
    document.body.removeChild(container)
  })

  it('click disabled item — onSelect 不触发，菜单保持打开', () => {
    const container = makeContainer()
    const onSelect = mock((_id: string) => {})
    const layer = new DomContextMenuLayer(container, { onSelect })
    layer.attach()
    layer.applyTheme(denseGridTheme)
    layer.open({ clientX: 50, clientY: 60, items: sampleItems })
    const pasteBtn = document.body.querySelector('[data-ns-action="paste"]') as HTMLElement
    pasteBtn.click()
    expect(onSelect).not.toHaveBeenCalled()
    expect(layer.isOpen()).toBe(true)
    layer.destroy()
    document.body.removeChild(container)
  })

  it('close 后再 open 复用同一 menu 节点', () => {
    const container = makeContainer()
    const layer = new DomContextMenuLayer(container, { onSelect: mock(() => {}) })
    layer.attach()
    layer.applyTheme(denseGridTheme)
    layer.open({ clientX: 10, clientY: 20, items: sampleItems })
    const first = document.body.querySelector('[data-novasheet-context-menu]')!
    layer.close()
    layer.open({ clientX: 30, clientY: 40, items: sampleItems })
    const second = document.body.querySelector('[data-novasheet-context-menu]')!
    expect(first).toBe(second)
    layer.destroy()
    document.body.removeChild(container)
  })

  it('destroy 移除 DOM 且后续 open 不抛', () => {
    const container = makeContainer()
    const layer = new DomContextMenuLayer(container, { onSelect: mock(() => {}) })
    layer.attach()
    layer.destroy()
    expect(document.body.querySelector('[data-novasheet-context-menu-layer]')).toBeNull()
    // destroy 后再操作幂等
    layer.close()
    layer.open({ clientX: 0, clientY: 0, items: sampleItems })
    expect(layer.isOpen()).toBe(false)
    document.body.removeChild(container)
  })
})

describe('DomContextMenuLayer — keyboard navigation (spec §4.7)', () => {
  function openLayer() {
    const container = makeContainer()
    const onSelect = mock((_id: string) => {})
    const layer = new DomContextMenuLayer(container, { onSelect })
    layer.attach()
    layer.applyTheme(denseGridTheme)
    layer.open({ clientX: 0, clientY: 0, items: sampleItems })
    return { container, onSelect, layer }
  }

  it('open 后焦点落在第一个非 disabled item', () => {
    const { container, layer } = openLayer()
    expect((document.activeElement as HTMLElement).getAttribute('data-ns-action')).toBe('cut')
    layer.destroy()
    document.body.removeChild(container)
  })

  it('ArrowDown 移到下一个 item；End 跳到最后一个非 disabled', () => {
    const { container, layer } = openLayer()
    const menu = document.body.querySelector('[data-novasheet-context-menu]') as HTMLElement
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    expect((document.activeElement as HTMLElement).getAttribute('data-ns-action')).toBe('copy')
    // 'paste' is disabled — ArrowDown should skip
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    expect((document.activeElement as HTMLElement).getAttribute('data-ns-action')).toBe('cut')
    // End → last non-disabled = copy
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
    expect((document.activeElement as HTMLElement).getAttribute('data-ns-action')).toBe('copy')
    layer.destroy()
    document.body.removeChild(container)
  })

  it('Enter 触发当前 focus item', () => {
    const { container, onSelect, layer } = openLayer()
    const menu = document.body.querySelector('[data-novasheet-context-menu]') as HTMLElement
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(onSelect).toHaveBeenCalledWith('cut')
    expect(layer.isOpen()).toBe(false)
    layer.destroy()
    document.body.removeChild(container)
  })

  it('Escape 关闭菜单', () => {
    const { container, layer } = openLayer()
    const menu = document.body.querySelector('[data-novasheet-context-menu]') as HTMLElement
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(layer.isOpen()).toBe(false)
    layer.destroy()
    document.body.removeChild(container)
  })

  it('Tab 关闭菜单（4.0 fail-safe：避免 focus 卡菜单）', () => {
    const { container, layer } = openLayer()
    const menu = document.body.querySelector('[data-novasheet-context-menu]') as HTMLElement
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    expect(layer.isOpen()).toBe(false)
    layer.destroy()
    document.body.removeChild(container)
  })

  it('外部 pointerdown 关闭菜单', () => {
    const { container, layer } = openLayer()
    document.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    expect(layer.isOpen()).toBe(false)
    layer.destroy()
    document.body.removeChild(container)
  })
})

describe('DomContextMenuLayer — focus restoration on close (spec §4.5)', () => {
  it('焦点在菜单内时关闭 → onClose 被调用', () => {
    const container = makeContainer()
    const onClose = mock(() => {})
    const layer = new DomContextMenuLayer(container, { onSelect: mock(() => {}), onClose })
    layer.attach()
    layer.applyTheme(denseGridTheme)
    layer.open({ clientX: 0, clientY: 0, items: sampleItems })
    // focus is now on the first enabled button (inside the menu)
    expect(
      document.body
        .querySelector('[data-novasheet-context-menu]')!
        .contains(document.activeElement),
    ).toBe(true)
    layer.close()
    expect(onClose).toHaveBeenCalledTimes(1)
    layer.destroy()
    document.body.removeChild(container)
  })

  it('焦点不在菜单内时关闭 → onClose 不被调用', () => {
    const container = makeContainer()
    const onClose = mock(() => {})
    const layer = new DomContextMenuLayer(container, { onSelect: mock(() => {}), onClose })
    layer.attach()
    layer.applyTheme(denseGridTheme)
    layer.open({ clientX: 0, clientY: 0, items: sampleItems })
    // move focus away from menu
    ;(document.activeElement as HTMLElement | null)?.blur()
    container.focus()
    expect(
      document.body
        .querySelector('[data-novasheet-context-menu]')!
        .contains(document.activeElement),
    ).toBe(false)
    layer.close()
    expect(onClose).not.toHaveBeenCalled()
    layer.destroy()
    document.body.removeChild(container)
  })
})

describe('DomContextMenuLayer — disabled 项 ARIA focusable (spec §4.7)', () => {
  it('disabled 项保留 focusable（ARIA menu 模式）', () => {
    const container = makeContainer()
    const layer = new DomContextMenuLayer(container, { onSelect: mock(() => {}) })
    layer.attach()
    layer.applyTheme(denseGridTheme)
    layer.open({ clientX: 0, clientY: 0, items: sampleItems })
    const pasteBtn = document.body.querySelector('[data-ns-action="paste"]') as HTMLButtonElement
    expect(pasteBtn.disabled).toBe(false) // HTML disabled NOT set
    expect(pasteBtn.getAttribute('aria-disabled')).toBe('true') // aria-only
    pasteBtn.focus()
    expect(document.activeElement).toBe(pasteBtn) // can be programmatically focused
    layer.destroy()
    document.body.removeChild(container)
  })
})

describe('DomContextMenuLayer — viewport clamp (spec §4.4)', () => {
  it('right overflow: 贴右边 8px', () => {
    const container = makeContainer()
    const layer = new DomContextMenuLayer(container, { onSelect: mock(() => {}) })
    layer.attach()
    layer.applyTheme(denseGridTheme)
    const menu = document.body.querySelector('[data-novasheet-context-menu]') as HTMLElement
    Object.defineProperty(menu, 'offsetWidth', { configurable: true, value: 200 })
    Object.defineProperty(menu, 'offsetHeight', { configurable: true, value: 100 })
    // happy-dom default window.innerWidth = 1024
    layer.open({ clientX: 1000, clientY: 50, items: sampleItems })
    expect(menu.style.left).toBe(`${1024 - 200 - 8}px`)
    layer.destroy()
    document.body.removeChild(container)
  })

  it('bottom overflow: flip 到 pointer 上方', () => {
    const container = makeContainer()
    const layer = new DomContextMenuLayer(container, { onSelect: mock(() => {}) })
    layer.attach()
    layer.applyTheme(denseGridTheme)
    const menu = document.body.querySelector('[data-novasheet-context-menu]') as HTMLElement
    Object.defineProperty(menu, 'offsetWidth', { configurable: true, value: 200 })
    Object.defineProperty(menu, 'offsetHeight', { configurable: true, value: 200 })
    // happy-dom default innerHeight = 768; clientY=700 + 200 = 900 > 768 → flip
    layer.open({ clientX: 50, clientY: 700, items: sampleItems })
    expect(menu.style.top).toBe(`${700 - 200}px`)
    layer.destroy()
    document.body.removeChild(container)
  })

  it('top overflow after flip: 贴顶 8px', () => {
    const container = makeContainer()
    const layer = new DomContextMenuLayer(container, { onSelect: mock(() => {}) })
    layer.attach()
    layer.applyTheme(denseGridTheme)
    const menu = document.body.querySelector('[data-novasheet-context-menu]') as HTMLElement
    Object.defineProperty(menu, 'offsetWidth', { configurable: true, value: 200 })
    Object.defineProperty(menu, 'offsetHeight', { configurable: true, value: 900 })
    // menu too tall — flip would put top at -200; top clamp → 8
    layer.open({ clientX: 50, clientY: 700, items: sampleItems })
    expect(menu.style.top).toBe(`8px`)
    layer.destroy()
    document.body.removeChild(container)
  })

  it('left overflow: 贴左 8px', () => {
    const container = makeContainer()
    const layer = new DomContextMenuLayer(container, { onSelect: mock(() => {}) })
    layer.attach()
    layer.applyTheme(denseGridTheme)
    const menu = document.body.querySelector('[data-novasheet-context-menu]') as HTMLElement
    Object.defineProperty(menu, 'offsetWidth', { configurable: true, value: 200 })
    Object.defineProperty(menu, 'offsetHeight', { configurable: true, value: 100 })
    layer.open({ clientX: -10, clientY: 50, items: sampleItems })
    expect(menu.style.left).toBe('8px')
    layer.destroy()
    document.body.removeChild(container)
  })
})

describe('DomContextMenuLayer — unified visual model', () => {
  it('renders icon slot label shortcut and category separators', () => {
    const container = makeContainer()
    const layer = new DomContextMenuLayer(container, { onSelect: mock(() => {}) })
    layer.attach()
    layer.applyTheme(denseGridTheme)
    layer.open({
      clientX: 0,
      clientY: 0,
      items: [
        {
          id: 'cut',
          label: '剪切',
          disabled: false,
          icon: { kind: 'builtin', name: 'cut' },
          shortcut: '⌘X',
          category: 'clipboard',
        },
        {
          id: 'insert-col-left',
          label: '在左侧插入 1 列',
          disabled: false,
          icon: { kind: 'builtin', name: 'plus' },
          category: 'structure',
        },
      ],
    })

    expect(document.body.querySelector('[data-ns-menu-icon="cut"]')).toBeTruthy()
    expect(document.body.querySelector('[data-ns-menu-shortcut]')!.textContent).toBe('⌘X')
    expect(document.body.querySelectorAll('[role="separator"]').length).toBeGreaterThanOrEqual(1)
    layer.destroy()
    document.body.removeChild(container)
  })

  it('renders submenu arrow and dispatches submenu item click', () => {
    const container = makeContainer()
    const onSelect = mock((_id: string) => {})
    const layer = new DomContextMenuLayer(container, { onSelect })
    layer.attach()
    layer.applyTheme(denseGridTheme)
    layer.open({
      clientX: 0,
      clientY: 0,
      items: [
        {
          id: 'more',
          label: '查看更多列操作',
          disabled: false,
          submenu: [{ id: 'custom.freeze-column', label: '冻结到当前列', disabled: false }],
        },
      ],
    })

    expect(document.body.querySelector('[data-ns-submenu-arrow]')).toBeTruthy()
    const parent = document.body.querySelector('[data-ns-action="more"]') as HTMLElement
    parent.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    ;(document.body.querySelector('[data-ns-action="custom.freeze-column"]') as HTMLElement).click()
    expect(onSelect).toHaveBeenCalledWith('custom.freeze-column')
    layer.destroy()
    document.body.removeChild(container)
  })

  it('icon slot is rendered even without icon (empty slot for alignment)', () => {
    const container = makeContainer()
    const layer = new DomContextMenuLayer(container, { onSelect: mock(() => {}) })
    layer.attach()
    layer.applyTheme(denseGridTheme)
    layer.open({
      clientX: 0,
      clientY: 0,
      items: [{ id: 'sort-none', label: '无排序', disabled: false }],
    })
    expect(document.body.querySelector('[data-ns-menu-icon-slot]')).toBeTruthy()
    layer.destroy()
    document.body.removeChild(container)
  })

  it('category separator inserted between items with different categories', () => {
    const container = makeContainer()
    const layer = new DomContextMenuLayer(container, { onSelect: mock(() => {}) })
    layer.attach()
    layer.applyTheme(denseGridTheme)
    layer.open({
      clientX: 0,
      clientY: 0,
      items: [
        { id: 'cut', label: '剪切', disabled: false, category: 'clipboard' },
        { id: 'copy', label: '复制', disabled: false, category: 'clipboard' },
        { id: 'insert-col-left', label: '插入列', disabled: false, category: 'structure' },
      ],
    })
    // should have exactly 1 separator between clipboard and structure groups
    const separators = document.body.querySelectorAll('[role="separator"]')
    expect(separators.length).toBe(1)
    layer.destroy()
    document.body.removeChild(container)
  })

  it('separatorAfter still inserts separator (backward compat)', () => {
    const container = makeContainer()
    const layer = new DomContextMenuLayer(container, { onSelect: mock(() => {}) })
    layer.attach()
    layer.applyTheme(denseGridTheme)
    layer.open({
      clientX: 0,
      clientY: 0,
      items: [
        { id: 'cut', label: '剪切', disabled: false, separatorAfter: true },
        { id: 'paste', label: '粘贴', disabled: false },
      ],
    })
    expect(document.body.querySelector('[role="separator"]')).toBeTruthy()
    layer.destroy()
    document.body.removeChild(container)
  })
})
