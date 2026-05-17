import { describe, expect, it, mock } from 'bun:test'
import { DomContextMenuLayer } from '../../src/interaction/DomContextMenuLayer'
import { denseGridTheme } from '@novasheet/core'

function makeContainer(): HTMLElement {
  const c = document.createElement('div')
  Object.assign(c.style, { position: 'relative', width: '500px', height: '400px' })
  document.body.appendChild(c)
  return c
}

const sampleItems = [
  { id: 'cut' as const, label: 'Cut', disabled: false },
  { id: 'copy' as const, label: 'Copy', disabled: false, separatorAfter: true },
  { id: 'paste' as const, label: 'Paste', disabled: true },
]

describe('DomContextMenuLayer — Phase 4.0 lifecycle', () => {
  it('attach 创建 hidden layer；isOpen 初始为 false', () => {
    const container = makeContainer()
    const layer = new DomContextMenuLayer(container, { onSelect: mock(() => {}) })
    layer.attach()
    layer.applyTheme(denseGridTheme)
    expect(layer.isOpen()).toBe(false)
    expect(container.querySelector('[data-novasheet-context-menu]')).toBeTruthy()
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
    const buttons = container.querySelectorAll('[data-ns-action]')
    expect(buttons.length).toBe(3)
    expect((buttons[0] as HTMLElement).textContent).toBe('Cut')
    expect((buttons[2] as HTMLElement).getAttribute('aria-disabled')).toBe('true')
    expect(container.querySelector('[role="separator"]')).toBeTruthy()
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
    const cutBtn = container.querySelector('[data-ns-action="cut"]') as HTMLElement
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
    const pasteBtn = container.querySelector('[data-ns-action="paste"]') as HTMLElement
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
    const first = container.querySelector('[data-novasheet-context-menu]')!
    layer.close()
    layer.open({ clientX: 30, clientY: 40, items: sampleItems })
    const second = container.querySelector('[data-novasheet-context-menu]')!
    expect(first).toBe(second)
    layer.destroy()
    document.body.removeChild(container)
  })

  it('destroy 移除 DOM 且后续 open 不抛', () => {
    const container = makeContainer()
    const layer = new DomContextMenuLayer(container, { onSelect: mock(() => {}) })
    layer.attach()
    layer.destroy()
    expect(container.querySelector('[data-novasheet-context-menu-layer]')).toBeNull()
    // destroy 后再操作幂等
    layer.close()
    layer.open({ clientX: 0, clientY: 0, items: sampleItems })
    expect(layer.isOpen()).toBe(false)
    document.body.removeChild(container)
  })
})
