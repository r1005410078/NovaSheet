# Phase 4.0 Cell Context Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 单元格 body 区域右键打开 DOM 菜单（Cut / Copy / Paste），通过 `onContextMenuAction` 回调外抛；剪贴板语义留给 4.1。

**Architecture:** 沿用 resize handle / cell editor 的 DOM overlay 模式——`@novasheet/core` 提供纯函数 + 类型，`@novasheet/web` 拥有 layer 和 host listener，Theme 走 CSS 变量。新增 `DomContextMenuLayer` + 一个 host 回调 + 一个 runtime 处理函数 + 几个 Grid facade 方法。

**Tech Stack:** TypeScript（`verbatimModuleSyntax`、`noUncheckedIndexedAccess`、strict）；bun:test + happy-dom；Storybook 10。

**Spec:** [docs/superpowers/specs/2026-05-17-context-menu-design.md](../specs/2026-05-17-context-menu-design.md)

---

## File Structure

**Create:**

- `packages/core/src/interaction/ContextMenuModel.ts` — types + `getCellContextMenuItems`
- `packages/core/tests/interaction/ContextMenuModel.test.ts`
- `packages/web/src/host/context-menu-style.ts` — themed stylesheet
- `packages/web/src/interaction/DomContextMenuLayer.ts` — DOM overlay
- `packages/web/tests/interaction/DomContextMenuLayer.test.ts`
- `apps/storybook/src/stories/ContextMenu.stories.ts`
- `apps/storybook/src/stories/snippets/contextMenu.basic.snippet.ts`

**Modify:**

- `packages/core/src/theme/Theme.ts` — 新增 4 个 token
- `packages/core/src/theme/denseGridTheme.ts` — 默认值
- `packages/core/src/index.ts` — re-exports
- `packages/web/src/host/WebHost.ts` — `onContextMenu` 回调签名
- `packages/web/src/host/DomGridHost.ts` — `contextmenu` 监听 + dispatch
- `packages/web/tests/host/DomGridHost.test.ts`
- `packages/web/src/runtime/WebGridRuntime.ts` — `handleHostContextMenu` + 状态机集成
- `packages/web/tests/runtime/WebGridRuntime.test.ts`
- `packages/web/src/grid/GridController.ts` — controller 接口三个方法 + option
- `packages/web/src/backends/Canvas2DBackend.ts` — 装配 layer
- `packages/web/src/Grid.ts` — facade 暴露三个方法 + option
- `packages/web/src/index.ts` — 导出新类型
- `README.md` — 标 4.0 完成

每个 file 一个 single responsibility；layer / style / model 分别独立，与 Phase 3.4 resize 一致。

---

## Task 1: Theme tokens for menu

**Files:**

- Modify: `packages/core/src/theme/Theme.ts`
- Modify: `packages/core/src/theme/denseGridTheme.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/tests/theme/Theme.test.ts (新增或追加)
import { describe, expect, it } from 'bun:test'
import { denseGridTheme } from '../../src/theme/denseGridTheme'

describe('denseGridTheme — Phase 4.0 menu tokens', () => {
  it('exposes menuItemHover (defaulting to hoverRowBg value)', () => {
    expect(denseGridTheme.colors.menuItemHover).toBe(denseGridTheme.colors.hoverRowBg)
  })

  it('exposes menuShadow string', () => {
    expect(typeof denseGridTheme.metrics.menuShadow).toBe('string')
    expect(denseGridTheme.metrics.menuShadow.length).toBeGreaterThan(0)
  })

  it('exposes menuPaddingX / menuPaddingY as numbers', () => {
    expect(typeof denseGridTheme.metrics.menuPaddingX).toBe('number')
    expect(typeof denseGridTheme.metrics.menuPaddingY).toBe('number')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test packages/core/tests/theme/Theme.test.ts
```

Expected: fail（类型不存在 / 字段 undefined）

- [ ] **Step 3: Add tokens to Theme.ts**

```ts
// packages/core/src/theme/Theme.ts — ThemeColors 末尾新增
readonly menuItemHover: string

// ThemeMetrics 末尾新增
readonly menuShadow: string
readonly menuPaddingX: number
readonly menuPaddingY: number
```

- [ ] **Step 4: Provide defaults in denseGridTheme.ts**

```ts
// denseGridTheme.colors — 在已有字段末尾追加
menuItemHover: '#eef2f7', // 与 hoverRowBg 同值；后续 4.5 列头菜单可独立调

// denseGridTheme.metrics — 在已有字段末尾追加
menuShadow: '0 4px 12px rgba(15, 23, 42, 0.12)',
menuPaddingX: 8,
menuPaddingY: 4,
```

> **重要：** `hoverRowBg` 当前值取自 `denseGridTheme.ts`。打开文件确认实际值，把 `menuItemHover` 设成**完全相同的字符串字面量**——否则测试断言 `toBe(...hoverRowBg)` 失败。

- [ ] **Step 5: Run test to verify it passes + typecheck**

```bash
bun test packages/core/tests/theme/Theme.test.ts
bun run --filter @novasheet/core typecheck
```

Expected: pass

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/theme/Theme.ts packages/core/src/theme/denseGridTheme.ts packages/core/tests/theme/Theme.test.ts
git commit -m "feat(core): theme tokens for Phase 4.0 context menu"
```

---

## Task 2: ContextMenuModel — types + getCellContextMenuItems

**Files:**

- Create: `packages/core/src/interaction/ContextMenuModel.ts`
- Create: `packages/core/tests/interaction/ContextMenuModel.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/tests/interaction/ContextMenuModel.test.ts
import { describe, expect, it } from 'bun:test'
import {
  getCellContextMenuItems,
  type ContextMenuContext,
} from '../../src/interaction/ContextMenuModel'

const baseCtx: ContextMenuContext = {
  cell: { rowIndex: 0, colIndex: 0 },
  selectedRange: { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
  hasSelection: true,
  clipboardReady: false,
}

describe('getCellContextMenuItems — Phase 4.0', () => {
  it('returns Cut / Copy / Paste in order', () => {
    expect(getCellContextMenuItems(baseCtx).map((i) => i.id)).toEqual(['cut', 'copy', 'paste'])
  })

  it('separator after Copy only', () => {
    const items = getCellContextMenuItems(baseCtx)
    expect(items[0]!.separatorAfter).toBeFalsy()
    expect(items[1]!.separatorAfter).toBe(true)
    expect(items[2]!.separatorAfter).toBeFalsy()
  })

  it('Cut / Copy enabled when hasSelection', () => {
    const items = getCellContextMenuItems(baseCtx)
    expect(items.find((i) => i.id === 'cut')!.disabled).toBe(false)
    expect(items.find((i) => i.id === 'copy')!.disabled).toBe(false)
  })

  it('Cut / Copy disabled when no selection', () => {
    const items = getCellContextMenuItems({ ...baseCtx, hasSelection: false })
    expect(items.find((i) => i.id === 'cut')!.disabled).toBe(true)
    expect(items.find((i) => i.id === 'copy')!.disabled).toBe(true)
  })

  it('Paste disabled when clipboardReady is false', () => {
    expect(getCellContextMenuItems(baseCtx).find((i) => i.id === 'paste')!.disabled).toBe(true)
  })

  it('Paste enabled when clipboardReady is true', () => {
    expect(
      getCellContextMenuItems({ ...baseCtx, clipboardReady: true }).find((i) => i.id === 'paste')!
        .disabled,
    ).toBe(false)
  })

  it('labels are stable English strings', () => {
    const items = getCellContextMenuItems(baseCtx)
    expect(items.find((i) => i.id === 'cut')!.label).toBe('Cut')
    expect(items.find((i) => i.id === 'copy')!.label).toBe('Copy')
    expect(items.find((i) => i.id === 'paste')!.label).toBe('Paste')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test packages/core/tests/interaction/ContextMenuModel.test.ts
```

Expected: fail（模块不存在）

- [ ] **Step 3: Implement ContextMenuModel.ts**

```ts
// packages/core/src/interaction/ContextMenuModel.ts
import type { CellAddress, CellRange } from './SelectionModel'

export type ContextMenuAction = 'cut' | 'copy' | 'paste'

export interface ContextMenuContext {
  readonly cell: CellAddress
  readonly selectedRange: CellRange | null
  readonly hasSelection: boolean
  readonly clipboardReady: boolean
}

export interface ContextMenuItem {
  readonly id: ContextMenuAction
  readonly label: string
  readonly disabled: boolean
  readonly separatorAfter?: boolean
}

export function getCellContextMenuItems(ctx: ContextMenuContext): readonly ContextMenuItem[] {
  return [
    { id: 'cut', label: 'Cut', disabled: !ctx.hasSelection },
    { id: 'copy', label: 'Copy', disabled: !ctx.hasSelection, separatorAfter: true },
    { id: 'paste', label: 'Paste', disabled: !ctx.clipboardReady },
  ]
}
```

- [ ] **Step 4: Export from core index**

```ts
// packages/core/src/index.ts — 追加（位置紧邻已有 interaction 块）
export { getCellContextMenuItems } from './interaction/ContextMenuModel'
export type {
  ContextMenuAction,
  ContextMenuContext,
  ContextMenuItem,
} from './interaction/ContextMenuModel'
```

- [ ] **Step 5: Run test + typecheck**

```bash
bun test packages/core/tests/interaction/ContextMenuModel.test.ts
bun run --filter @novasheet/core typecheck
```

Expected: 7 tests pass

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/interaction/ContextMenuModel.ts \
        packages/core/tests/interaction/ContextMenuModel.test.ts \
        packages/core/src/index.ts
git commit -m "feat(core): ContextMenuModel + getCellContextMenuItems"
```

---

## Task 3: context-menu-style.ts + DomContextMenuLayer 基本生命周期

**Files:**

- Create: `packages/web/src/host/context-menu-style.ts`
- Create: `packages/web/src/interaction/DomContextMenuLayer.ts`
- Create: `packages/web/tests/interaction/DomContextMenuLayer.test.ts`

- [ ] **Step 1: Write the failing test — attach/open/close/destroy**

```ts
// packages/web/tests/interaction/DomContextMenuLayer.test.ts
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
```

- [ ] **Step 2: Run — fail**

```bash
bun test packages/web/tests/interaction/DomContextMenuLayer.test.ts
```

Expected: fail（模块不存在）

- [ ] **Step 3: Implement context-menu-style.ts**

```ts
// packages/web/src/host/context-menu-style.ts
import type { Theme } from '@novasheet/core'

const STYLESHEET_ID = 'novasheet-context-menu-style'

const CSS = `
[data-novasheet-context-menu-layer] {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 3;
}
[data-novasheet-context-menu] {
  position: fixed;
  display: none;
  pointer-events: auto;
  min-width: 160px;
  padding: var(--ns-menu-padding-y) 0;
  background: var(--ns-menu-bg);
  border: 1px solid var(--ns-menu-border);
  border-radius: 4px;
  box-shadow: var(--ns-menu-shadow);
  color: var(--ns-menu-text);
  font-family: var(--ns-menu-font);
  font-size: var(--ns-menu-font-size);
  user-select: none;
}
[data-novasheet-context-menu][data-open] {
  display: block;
}
[data-novasheet-context-menu] [role="menuitem"] {
  display: block;
  width: 100%;
  padding: 6px var(--ns-menu-padding-x);
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
[data-novasheet-context-menu] [role="menuitem"]:focus,
[data-novasheet-context-menu] [role="menuitem"]:hover:not([aria-disabled="true"]) {
  background: var(--ns-menu-item-hover);
  outline: none;
}
[data-novasheet-context-menu] [role="menuitem"][aria-disabled="true"] {
  color: var(--ns-menu-text-disabled);
  cursor: default;
}
[data-novasheet-context-menu] [role="separator"] {
  height: 1px;
  margin: 4px 0;
  background: var(--ns-menu-separator);
}
`.trim()

export function ensureContextMenuStylesheet(doc: Document = document): void {
  if (doc.getElementById(STYLESHEET_ID)) return
  const style = doc.createElement('style')
  style.id = STYLESHEET_ID
  style.textContent = CSS
  doc.head.appendChild(style)
}

export function applyContextMenuTheme(host: HTMLElement, theme: Theme): void {
  ensureContextMenuStylesheet(host.ownerDocument)
  const { colors, metrics } = theme
  host.style.setProperty('--ns-menu-bg', colors.background)
  host.style.setProperty('--ns-menu-border', colors.gridLineStrong)
  host.style.setProperty('--ns-menu-text', colors.text)
  host.style.setProperty('--ns-menu-text-disabled', colors.headerText)
  host.style.setProperty('--ns-menu-item-hover', colors.menuItemHover)
  host.style.setProperty('--ns-menu-separator', colors.gridLine)
  host.style.setProperty('--ns-menu-shadow', metrics.menuShadow)
  host.style.setProperty('--ns-menu-font', metrics.fontFamily)
  host.style.setProperty('--ns-menu-font-size', `${metrics.fontSize}px`)
  host.style.setProperty('--ns-menu-padding-x', `${metrics.menuPaddingX}px`)
  host.style.setProperty('--ns-menu-padding-y', `${metrics.menuPaddingY}px`)
}
```

- [ ] **Step 4: Implement DomContextMenuLayer.ts (生命周期 only — keyboard / clamp 在后续 task)**

```ts
// packages/web/src/interaction/DomContextMenuLayer.ts
import type { ContextMenuAction, ContextMenuItem, Theme } from '@novasheet/core'
import { applyContextMenuTheme, ensureContextMenuStylesheet } from '../host/context-menu-style'

export interface DomContextMenuLayerCallbacks {
  onSelect: (id: ContextMenuAction) => void
}

export interface OpenContextMenuOptions {
  clientX: number
  clientY: number
  items: readonly ContextMenuItem[]
}

export class DomContextMenuLayer {
  private container: HTMLElement
  private callbacks: DomContextMenuLayerCallbacks
  private layer!: HTMLElement
  private menu!: HTMLElement
  private attached = false
  private destroyed = false
  private opened = false

  constructor(container: HTMLElement, callbacks: DomContextMenuLayerCallbacks) {
    this.container = container
    this.callbacks = callbacks
  }

  attach(): void {
    if (this.attached || this.destroyed) return
    this.attached = true
    this.layer = document.createElement('div')
    this.layer.setAttribute('data-novasheet-context-menu-layer', '')
    this.menu = document.createElement('div')
    this.menu.setAttribute('data-novasheet-context-menu', '')
    this.menu.setAttribute('role', 'menu')
    this.menu.setAttribute('aria-label', 'Cell actions')
    this.menu.addEventListener('contextmenu', this.onMenuContextMenu)
    this.layer.appendChild(this.menu)
    this.container.appendChild(this.layer)
    ensureContextMenuStylesheet(this.container.ownerDocument)
  }

  applyTheme(theme: Theme): void {
    if (!this.attached) return
    applyContextMenuTheme(this.container, theme)
  }

  isOpen(): boolean {
    return this.attached && this.opened
  }

  open(options: OpenContextMenuOptions): void {
    if (!this.attached || this.destroyed) return
    this.renderItems(options.items)
    this.menu.style.left = `${options.clientX}px`
    this.menu.style.top = `${options.clientY}px`
    this.menu.setAttribute('data-open', '')
    this.opened = true
  }

  close(): void {
    if (!this.attached || !this.opened) return
    this.menu.removeAttribute('data-open')
    this.opened = false
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    if (this.attached) {
      this.menu.removeEventListener('contextmenu', this.onMenuContextMenu)
      if (this.layer.parentNode === this.container) {
        this.container.removeChild(this.layer)
      }
      this.attached = false
      this.opened = false
    }
  }

  private renderItems(items: readonly ContextMenuItem[]): void {
    while (this.menu.firstChild) this.menu.removeChild(this.menu.firstChild)
    for (const item of items) {
      const btn = document.createElement('button')
      btn.setAttribute('role', 'menuitem')
      btn.setAttribute('data-ns-action', item.id)
      btn.setAttribute('tabindex', '-1')
      btn.textContent = item.label
      if (item.disabled) {
        btn.setAttribute('aria-disabled', 'true')
        btn.disabled = true
      }
      btn.addEventListener('click', () => this.onItemClick(item))
      this.menu.appendChild(btn)
      if (item.separatorAfter) {
        const sep = document.createElement('div')
        sep.setAttribute('role', 'separator')
        this.menu.appendChild(sep)
      }
    }
  }

  private onItemClick(item: ContextMenuItem): void {
    if (item.disabled) return
    this.callbacks.onSelect(item.id)
    this.close()
  }

  private onMenuContextMenu = (event: Event): void => {
    // 在菜单自身上右键：阻止浏览器菜单嵌套
    event.preventDefault()
  }
}
```

- [ ] **Step 5: Run test — pass**

```bash
bun test packages/web/tests/interaction/DomContextMenuLayer.test.ts
bun run --filter @novasheet/web typecheck
```

Expected: 6 tests pass

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/host/context-menu-style.ts \
        packages/web/src/interaction/DomContextMenuLayer.ts \
        packages/web/tests/interaction/DomContextMenuLayer.test.ts
git commit -m "feat(web): DomContextMenuLayer lifecycle + themed CSS"
```

---

## Task 4: 菜单键盘导航（a11y）+ Esc / 外部点击关闭

**Files:**

- Modify: `packages/web/src/interaction/DomContextMenuLayer.ts`
- Modify: `packages/web/tests/interaction/DomContextMenuLayer.test.ts`

- [ ] **Step 1: Add failing keyboard nav tests**

```ts
// 追加到 DomContextMenuLayer.test.ts 的 describe 末尾
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
    const menu = container.querySelector('[data-novasheet-context-menu]') as HTMLElement
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    expect((document.activeElement as HTMLElement).getAttribute('data-ns-action')).toBe('copy')
    // 'paste' disabled — ArrowDown 应跳过
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    expect((document.activeElement as HTMLElement).getAttribute('data-ns-action')).toBe('cut')
    // End 跳到最后一个非 disabled = copy
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
    expect((document.activeElement as HTMLElement).getAttribute('data-ns-action')).toBe('copy')
    layer.destroy()
    document.body.removeChild(container)
  })

  it('Enter 触发当前 focus item', () => {
    const { container, onSelect, layer } = openLayer()
    const menu = container.querySelector('[data-novasheet-context-menu]') as HTMLElement
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(onSelect).toHaveBeenCalledWith('cut')
    expect(layer.isOpen()).toBe(false)
    document.body.removeChild(container)
  })

  it('Escape 关闭菜单', () => {
    const { container, layer } = openLayer()
    const menu = container.querySelector('[data-novasheet-context-menu]') as HTMLElement
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(layer.isOpen()).toBe(false)
    document.body.removeChild(container)
  })

  it('Tab 关闭菜单（4.0 选择 fail-safe，避免 focus 卡在菜单）', () => {
    const { container, layer } = openLayer()
    const menu = container.querySelector('[data-novasheet-context-menu]') as HTMLElement
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    expect(layer.isOpen()).toBe(false)
    document.body.removeChild(container)
  })

  it('外部 pointerdown 关闭菜单', () => {
    const { container, layer } = openLayer()
    document.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    expect(layer.isOpen()).toBe(false)
    document.body.removeChild(container)
  })
})
```

- [ ] **Step 2: Run — fail**

```bash
bun test packages/web/tests/interaction/DomContextMenuLayer.test.ts
```

Expected: 6 new tests fail；已有 6 个仍 pass

- [ ] **Step 3: Implement keyboard nav + outside-pointerdown 监听**

修改 `DomContextMenuLayer.ts`：

1. attach() 末尾加 `document.addEventListener('pointerdown', this.onDocumentPointerDown, true)`，destroy 里对应 remove
2. open() 渲染完成后 `this.focusFirstEnabled()`
3. 新增 keydown handler 挂在 `this.menu` 上（attach 时）
4. 新增辅助方法：

```ts
private onDocumentPointerDown = (event: Event): void => {
  if (!this.opened) return
  const target = event.target as Node | null
  if (target && this.menu.contains(target)) return
  this.close()
}

private onMenuKeyDown = (event: KeyboardEvent): void => {
  switch (event.key) {
    case 'Escape':
    case 'Tab':
      event.preventDefault()
      this.close()
      return
    case 'Enter':
    case ' ':
      event.preventDefault()
      this.activateFocused()
      return
    case 'ArrowDown':
      event.preventDefault()
      this.focusMove(1)
      return
    case 'ArrowUp':
      event.preventDefault()
      this.focusMove(-1)
      return
    case 'Home':
      event.preventDefault()
      this.focusFirstEnabled()
      return
    case 'End':
      event.preventDefault()
      this.focusLastEnabled()
      return
  }
}

private getItemButtons(): HTMLButtonElement[] {
  return Array.from(this.menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
}

private enabledButtons(): HTMLButtonElement[] {
  return this.getItemButtons().filter((b) => b.getAttribute('aria-disabled') !== 'true')
}

private focusFirstEnabled(): void {
  this.enabledButtons()[0]?.focus()
}

private focusLastEnabled(): void {
  const list = this.enabledButtons()
  list[list.length - 1]?.focus()
}

private focusMove(delta: 1 | -1): void {
  const list = this.enabledButtons()
  if (list.length === 0) return
  const current = list.findIndex((b) => b === document.activeElement)
  // 循环
  const next = (current + delta + list.length) % list.length
  list[next]?.focus()
}

private activateFocused(): void {
  const active = document.activeElement
  if (!(active instanceof HTMLButtonElement)) return
  const id = active.getAttribute('data-ns-action') as ContextMenuAction | null
  if (!id) return
  if (active.getAttribute('aria-disabled') === 'true') return
  this.callbacks.onSelect(id)
  this.close()
}
```

attach() 内加：

```ts
this.menu.addEventListener('keydown', this.onMenuKeyDown)
document.addEventListener('pointerdown', this.onDocumentPointerDown, true)
```

destroy() 内对应清理。

- [ ] **Step 4: Run tests — all pass**

```bash
bun test packages/web/tests/interaction/DomContextMenuLayer.test.ts
```

Expected: 12 tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/interaction/DomContextMenuLayer.ts \
        packages/web/tests/interaction/DomContextMenuLayer.test.ts
git commit -m "feat(web): DomContextMenuLayer keyboard nav + Esc / outside-click close"
```

---

## Task 5: 视口 clamp（右溢贴边、下溢 flip）

**Files:**

- Modify: `packages/web/src/interaction/DomContextMenuLayer.ts`
- Modify: `packages/web/tests/interaction/DomContextMenuLayer.test.ts`

- [ ] **Step 1: Failing test**

```ts
describe('DomContextMenuLayer — viewport clamp (spec §4.4)', () => {
  it('right overflow: 贴右边 8px', () => {
    const container = makeContainer()
    const layer = new DomContextMenuLayer(container, { onSelect: mock(() => {}) })
    layer.attach()
    layer.applyTheme(denseGridTheme)
    // 用 mock 让 menu.offsetWidth 返回固定值
    const menu = container.querySelector('[data-novasheet-context-menu]') as HTMLElement
    Object.defineProperty(menu, 'offsetWidth', { configurable: true, value: 200 })
    Object.defineProperty(menu, 'offsetHeight', { configurable: true, value: 100 })
    // happy-dom 默认 window.innerWidth 1024
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
    const menu = container.querySelector('[data-novasheet-context-menu]') as HTMLElement
    Object.defineProperty(menu, 'offsetWidth', { configurable: true, value: 200 })
    Object.defineProperty(menu, 'offsetHeight', { configurable: true, value: 200 })
    // happy-dom innerHeight 默认 768；clientY=700 + 200 = 900 > 768 → flip
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
    const menu = container.querySelector('[data-novasheet-context-menu]') as HTMLElement
    Object.defineProperty(menu, 'offsetWidth', { configurable: true, value: 200 })
    Object.defineProperty(menu, 'offsetHeight', { configurable: true, value: 900 })
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
    const menu = container.querySelector('[data-novasheet-context-menu]') as HTMLElement
    Object.defineProperty(menu, 'offsetWidth', { configurable: true, value: 200 })
    Object.defineProperty(menu, 'offsetHeight', { configurable: true, value: 100 })
    layer.open({ clientX: -10, clientY: 50, items: sampleItems })
    expect(menu.style.left).toBe('8px')
    layer.destroy()
    document.body.removeChild(container)
  })
})
```

- [ ] **Step 2: Run — fail（位置目前用 clientX/Y 原样）**

```bash
bun test packages/web/tests/interaction/DomContextMenuLayer.test.ts
```

Expected: 4 new tests fail

- [ ] **Step 3: Add clamp logic in open()**

在 `open()` 里把直接赋值 left/top 换成下面的算法（写在 `data-open` 之后——offsetWidth/Height 必须在 visible 时才有效）：

```ts
open(options: OpenContextMenuOptions): void {
  if (!this.attached || this.destroyed) return
  this.renderItems(options.items)
  // 先设置位置占位再开 visible，offsetWidth/Height 取到后再 clamp
  this.menu.style.left = `${options.clientX}px`
  this.menu.style.top = `${options.clientY}px`
  this.menu.setAttribute('data-open', '')
  this.clampToViewport(options.clientX, options.clientY)
  this.opened = true
  this.focusFirstEnabled()
}

private clampToViewport(clientX: number, clientY: number): void {
  const EDGE = 8
  const win = this.menu.ownerDocument.defaultView!
  const w = this.menu.offsetWidth
  const h = this.menu.offsetHeight
  let left = clientX
  let top = clientY
  if (left + w > win.innerWidth) left = win.innerWidth - w - EDGE
  if (left < EDGE) left = EDGE
  if (top + h > win.innerHeight) top = clientY - h // flip to above pointer
  if (top < EDGE) top = EDGE
  this.menu.style.left = `${left}px`
  this.menu.style.top = `${top}px`
}
```

- [ ] **Step 4: Run — pass**

```bash
bun test packages/web/tests/interaction/DomContextMenuLayer.test.ts
```

Expected: 16 tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/interaction/DomContextMenuLayer.ts \
        packages/web/tests/interaction/DomContextMenuLayer.test.ts
git commit -m "feat(web): DomContextMenuLayer viewport clamp + flip"
```

---

## Task 6: WebHost.onContextMenu + DomGridHost listener

**Files:**

- Modify: `packages/web/src/host/WebHost.ts`
- Modify: `packages/web/src/host/DomGridHost.ts`
- Modify: `packages/web/tests/host/DomGridHost.test.ts`

- [ ] **Step 1: Failing test for DomGridHost contextmenu**

```ts
// 追加 packages/web/tests/host/DomGridHost.test.ts
it('contextmenu on scroll-host invokes onContextMenu with local coords', () => {
  const container = document.createElement('div')
  Object.assign(container.style, { width: '300px', height: '200px', position: 'relative' })
  document.body.appendChild(container)
  const onContextMenu = mock((_e: WebPointerEvent) => {})
  const scheduler = new FrameScheduler()
  const host = new DomGridHost({
    container,
    scheduler,
    onScroll: () => {},
    onResize: () => {},
    onContextMenu,
  })
  host.attach()
  const scrollHost = container.querySelector('[data-novasheet-scroll-host]') as HTMLElement
  // contextmenu 不冒到 document（spec：菜单层来 close）；这里只测 host 回调
  const evt = new MouseEvent('contextmenu', {
    clientX: 40,
    clientY: 30,
    bubbles: true,
    cancelable: true,
  })
  // 让 scroll-host getBoundingClientRect 返回 (10, 5) 偏移
  scrollHost.getBoundingClientRect = () =>
    ({
      x: 10,
      y: 5,
      left: 10,
      top: 5,
      width: 300,
      height: 200,
      right: 310,
      bottom: 205,
      toJSON: () => ({}),
    }) as DOMRect
  scrollHost.dispatchEvent(evt)
  expect(onContextMenu).toHaveBeenCalledWith({ x: 30, y: 25, shiftKey: false })
  expect(evt.defaultPrevented).toBe(true) // host 内部 preventDefault
  host.destroy()
  document.body.removeChild(container)
})
```

- [ ] **Step 2: Run — fail**

```bash
bun test packages/web/tests/host/DomGridHost.test.ts
```

Expected: fail（`onContextMenu` 字段不存在 / handler 未实现）

- [ ] **Step 3: Add to WebHost.ts interface**

```ts
// WebHostOptions 内追加（onDoubleClick 旁边）
/** contextmenu 入口；runtime 负责命中 + 打开菜单。Host 内部已 preventDefault。 */
onContextMenu?: (event: WebPointerEvent) => void
```

- [ ] **Step 4: Wire listener in DomGridHost.ts**

attach() 内追加（与 pointerdown 同位置）：

```ts
this.scrollHost.addEventListener('contextmenu', this.onContextMenuEvent)
```

destroy() 对应：

```ts
this.scrollHost.removeEventListener('contextmenu', this.onContextMenuEvent)
```

新增字段 + handler：

```ts
private onContextMenuEvent = (event: MouseEvent): void => {
  event.preventDefault()
  if (!this.options.onContextMenu) return
  const rect = this.scrollHost.getBoundingClientRect()
  this.options.onContextMenu({
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
    shiftKey: event.shiftKey,
  })
}
```

- [ ] **Step 5: Run test — pass**

```bash
bun test packages/web/tests/host/DomGridHost.test.ts
bun run --filter @novasheet/web typecheck
```

Expected: pass

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/host/WebHost.ts \
        packages/web/src/host/DomGridHost.ts \
        packages/web/tests/host/DomGridHost.test.ts
git commit -m "feat(web): DomGridHost contextmenu listener; preventDefault + dispatch"
```

---

## Task 7: WebGridRuntime.handleHostContextMenu + 状态机集成

**Files:**

- Modify: `packages/web/src/runtime/WebGridRuntime.ts`
- Modify: `packages/web/tests/runtime/WebGridRuntime.test.ts`

涉及：drag-select / resize-drag 期间不开；cell edit 中先 commit；range 内不动 selection、range 外 `selectCell`；setData / clearSelection / scroll 自动 close。

- [ ] **Step 1: Failing tests for handleHostContextMenu**

```ts
// packages/web/tests/runtime/WebGridRuntime.test.ts — 新 describe 块
describe('WebGridRuntime contextmenu — Phase 4.0', () => {
  function makeContextMenu() {
    return {
      open: mock(() => {}),
      close: mock(() => {}),
      isOpen: mock(() => false),
      applyTheme: mock(() => {}),
      destroy: mock(() => {}),
    }
  }

  it('drag-select 进行中不开菜单', () => {
    const engine = makeEngine()
    const runtime = new WebGridRuntime({ engine, host: makeHost(), renderer: makeRenderer() })
    const menu = makeContextMenu()
    runtime.setContextMenuLayer(menu as never)
    // 模拟拖选中：直接置标志（或先触发一次 pointerdown 进入 dragging）
    ;(runtime as unknown as { draggingSelection: boolean }).draggingSelection = true
    runtime.handleHostContextMenu({ x: 100, y: 100, shiftKey: false })
    expect(menu.open).not.toHaveBeenCalled()
  })

  it('cell 编辑中先 commit 再决定是否开菜单', () => {
    const engine = makeEngine()
    engine.isCellEditing = mock(() => true)
    engine.commitCellEdit = mock(() => true)
    const runtime = new WebGridRuntime({ engine, host: makeHost(), renderer: makeRenderer() })
    const editor = {
      open: mock(() => {}),
      close: mock(() => {}),
      isOpen: mock(() => true),
      applyTheme: mock(() => {}),
      destroy: mock(() => {}),
    }
    runtime.setCellEditor(editor as never)
    const menu = makeContextMenu()
    runtime.setContextMenuLayer(menu as never)
    // hit-test 命中 body cell — 由 runtime.handleHostContextMenu 内部走 hitTestCell；这里
    // 让 engine.getFrame 返回一个最小可命中的 viewport region。
    engine.getFrame = mock(() => ({
      data: {} as never,
      theme: { metrics: { headerHeight: 32 } } as never,
      rowsAxis: { indexToPosition: () => 0, getSize: () => 28 } as never,
      colsAxis: { indexToPosition: () => 0, getSize: () => 100 } as never,
      viewport: {
        regions: [
          {
            id: 'main',
            rowBand: 'middle',
            rowRange: [0, 9],
            colRange: [0, 2],
            rect: { x: 0, y: 32, width: 300, height: 200 },
            scrollOffsetX: 0,
            scrollOffsetY: 0,
            zIndex: 10,
          },
        ],
      } as never,
    }))
    runtime.handleHostContextMenu({ x: 50, y: 60, shiftKey: false })
    expect(engine.commitCellEdit).toHaveBeenCalled()
    expect(menu.open).toHaveBeenCalled()
  })

  it('命中 header band 不开菜单', () => {
    const engine = makeEngine()
    engine.getFrame = mock(() => ({
      data: {} as never,
      theme: { metrics: { headerHeight: 32 } } as never,
      rowsAxis: { indexToPosition: () => 0, getSize: () => 28 } as never,
      colsAxis: { indexToPosition: () => 0, getSize: () => 100 } as never,
      viewport: { regions: [] } as never,
    }))
    const runtime = new WebGridRuntime({ engine, host: makeHost(), renderer: makeRenderer() })
    const menu = makeContextMenu()
    runtime.setContextMenuLayer(menu as never)
    runtime.handleHostContextMenu({ x: 50, y: 10, shiftKey: false }) // y < headerHeight
    expect(menu.open).not.toHaveBeenCalled()
  })

  it('range 外右键调 selectCell；range 内不动 selection', () => {
    const engine = makeEngine()
    const selectCell = mock(() => {})
    engine.selectCell = selectCell
    engine.getSelection = mock(() => ({
      activeCell: { rowIndex: 0, colIndex: 0 },
      anchorCell: { rowIndex: 0, colIndex: 0 },
      extentCell: { rowIndex: 0, colIndex: 0 },
      selectedRange: { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
    }))
    engine.getFrame = mock(() => ({
      data: {} as never,
      theme: { metrics: { headerHeight: 32 } } as never,
      rowsAxis: { indexToPosition: () => 0, getSize: () => 28 } as never,
      colsAxis: { indexToPosition: () => 0, getSize: () => 100 } as never,
      viewport: {
        regions: [
          {
            id: 'main',
            rowBand: 'middle',
            rowRange: [0, 9],
            colRange: [0, 2],
            rect: { x: 0, y: 32, width: 300, height: 200 },
            scrollOffsetX: 0,
            scrollOffsetY: 0,
            zIndex: 10,
          },
        ],
      } as never,
    }))
    const runtime = new WebGridRuntime({ engine, host: makeHost(), renderer: makeRenderer() })
    runtime.setContextMenuLayer(makeContextMenu() as never)
    // 命中 (rowIndex=1, colIndex=1) — 在 range (0,0,0,0) 外
    runtime.handleHostContextMenu({ x: 150, y: 100, shiftKey: false })
    expect(selectCell).toHaveBeenCalledWith({ rowIndex: 1, colIndex: 1 })

    // 重置；命中 (0, 0) — 在 range 内
    selectCell.mockClear()
    runtime.handleHostContextMenu({ x: 50, y: 40, shiftKey: false })
    expect(selectCell).not.toHaveBeenCalled()
  })

  it('setData / clearSelection / scroll 关闭菜单', () => {
    const engine = makeEngine()
    const runtime = new WebGridRuntime({ engine, host: makeHost(), renderer: makeRenderer() })
    const menu = makeContextMenu()
    menu.isOpen = mock(() => true)
    runtime.setContextMenuLayer(menu as never)

    runtime.setData({} as never, () => makeRenderer())
    expect(menu.close).toHaveBeenCalledTimes(1)

    runtime.handleHostScroll(100, 0)
    expect(menu.close).toHaveBeenCalledTimes(2)

    // clearSelection 路径要求 engine.clearSelection 调用后 runtime 也 close；通过 afterEngineMutation 关闭
    // — 由 runtime 实现 setSelectionCleared 钩子或在 setData / scroll 之外补充
  })
})
```

> **注：** `setContextMenuLayer` 与 `cellEditor` 模式一致。如果 runtime 当前没有 setter，本任务追加一个新方法 + 内部 `contextMenuLayer?` 字段。

- [ ] **Step 2: Run — fail**

```bash
bun test packages/web/tests/runtime/WebGridRuntime.test.ts
```

Expected: 新增 5 个 fail（旧测试不变）

- [ ] **Step 3: Implement in WebGridRuntime.ts**

新增字段 + setter（与 cellEditor 旁）：

```ts
private contextMenuLayer?: DomContextMenuLayer
setContextMenuLayer(layer: DomContextMenuLayer): void {
  this.contextMenuLayer = layer
  this.syncContextMenuTheme()
}
private syncContextMenuTheme(): void {
  this.contextMenuLayer?.applyTheme(this.engine.getTheme())
}
```

setTheme / setData 内补 `this.syncContextMenuTheme()` / `this.contextMenuLayer?.close()`。

handleHostScroll / setData / 任何 `afterEngineMutation` 触发的 selection mutation 之后调 `this.contextMenuLayer?.close()`——直接在 `afterEngineMutation` 末尾加一行：

```ts
this.contextMenuLayer?.close()
```

注意：避免在 contextmenu 打开**当帧**就 close——把 close 调用集中在 host scroll / setData / setTheme 等回调路径；`handleHostContextMenu` 本身在 close 之后 open 不冲突，因为 close 是 idempotent。

新方法：

```ts
handleHostContextMenu(event: WebPointerEvent): void {
  if (this.destroyed) return
  if (!this.contextMenuLayer) return
  if (this.resizeDrag || this.draggingSelection) return

  // 编辑中：先 commit
  if (this.engine.isCellEditing()) {
    this.commitCellEdit(false)
  }

  const hit = hitTestCell(this.engine.getFrame(), event.x, event.y)
  if (!hit) return
  // header band 判断：hit.cell.rowIndex < 0 表示列头；rowIndex >= 0 且 colIndex < 0 表示行号列；
  // 视 hitTestCell 现有约定调整。具体判断由 hit 字段提供（如 hit.band）；若现有 hitTestCell
  // 不返回 band，本任务先按 y < headerHeight 简单判断列头，colIndex < 0 判断行号列。
  if (hit.cell.colIndex < 0 || hit.cell.rowIndex < 0) return

  // selection 调整
  const selection = this.engine.getSelection()
  const range = selection.selectedRange
  const inRange =
    range !== null &&
    hit.cell.rowIndex >= range.startRow &&
    hit.cell.rowIndex <= range.endRow &&
    hit.cell.colIndex >= range.startCol &&
    hit.cell.colIndex <= range.endCol
  if (!inRange) {
    this.engine.selectCell(hit.cell)
  }
  this.afterEngineMutation()

  // 组装 context
  const newSel = this.engine.getSelection()
  const ctx: ContextMenuContext = {
    cell: hit.cell,
    selectedRange: newSel.selectedRange,
    hasSelection: newSel.activeCell !== null,
    clipboardReady: this.clipboardReady,
  }
  const items = getCellContextMenuItems(ctx)

  // clientX/Y：runtime 拿到的是 scroll-host 局部 (x, y)，菜单 layer 需要 viewport 坐标。
  // host 给出的 event 已是局部；这里通过 host.getContainerSize + container.getBoundingClientRect
  // 转换为 client 坐标；简化为：layer 用 fixed，但 open 时还要再加上 container 偏移。
  // 在 WebHostOptions.onContextMenu 中改回传 client 坐标更直接——本任务推荐改 host 实现：
  // 增加 clientX / clientY 字段到 WebPointerEvent，或新增 WebContextMenuEvent。
  // 选择：扩展 WebPointerEvent 增加可选 clientX/clientY；contextmenu 路径填，其它路径不填。
  this.contextMenuLayer.open({
    clientX: event.clientX ?? event.x,
    clientY: event.clientY ?? event.y,
    items,
  })
  this.lastContextMenuContext = ctx
}
```

> **重要：** 上面 handler 用 `event.clientX / clientY`——`WebPointerEvent` 当前只有 `x, y, shiftKey`，**必须先扩展类型加 `clientX?: number; clientY?: number`**，并让 `DomGridHost.onContextMenuEvent` 同时填这两个字段。已有 pointerdown 路径不传，类型 optional 不破坏。

存 `lastContextMenuContext: ContextMenuContext | null` 字段，给后续 onSelect 回调用。

- [ ] **Step 4: Wire layer.onSelect 触发外部回调**

新增字段 + 暴露 setter：

```ts
private onContextMenuAction?: (action: ContextMenuAction, ctx: ContextMenuContext) => void
setOnContextMenuAction(cb: typeof this.onContextMenuAction): void {
  this.onContextMenuAction = cb
}
private lastContextMenuContext: ContextMenuContext | null = null
```

构造 `DomContextMenuLayer` 时把 `onSelect` 接到这里（Canvas2DBackend 改造在 Task 8）：

```ts
new DomContextMenuLayer(container, {
  onSelect: (id) => {
    if (this.lastContextMenuContext) {
      this.onContextMenuAction?.(id, this.lastContextMenuContext)
    }
  },
})
```

新增 setter：

```ts
private clipboardReady = false
setClipboardReady(ready: boolean): void {
  this.clipboardReady = ready
}
openContextMenuAt(rowIndex: number, fieldId: string): void {
  // 计算 cell 右下角 client 坐标后转交 handleHostContextMenu 内部逻辑
  // 详见 Task 8 的 Grid facade 实现路径
}
closeContextMenu(): void {
  this.contextMenuLayer?.close()
}
```

- [ ] **Step 5: Run all tests — pass**

```bash
bun test packages/web/tests/runtime/WebGridRuntime.test.ts
bun run --filter @novasheet/web typecheck
```

Expected: 全 pass（新 5 + 旧）

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/host/WebHost.ts \
        packages/web/src/host/DomGridHost.ts \
        packages/web/src/runtime/WebGridRuntime.ts \
        packages/web/tests/runtime/WebGridRuntime.test.ts
git commit -m "feat(web): WebGridRuntime.handleHostContextMenu + state machine integration"
```

---

## Task 8: Canvas2DBackend 装配 + Grid facade

**Files:**

- Modify: `packages/web/src/grid/GridController.ts`
- Modify: `packages/web/src/backends/Canvas2DBackend.ts`
- Modify: `packages/web/src/Grid.ts`
- Modify: `packages/web/src/index.ts`

- [ ] **Step 1: Failing test for Grid facade**

```ts
// packages/web/tests/grid/Grid.test.ts — 追加
describe('Grid — Phase 4.0 context menu facade', () => {
  it('setClipboardReady 切换 Paste enable 状态', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const onAction = mock(() => {})
    const grid = new Grid(container, {
      data: new InMemoryDataSource({
        schema: { fields: [{ id: 'a', name: 'A', type: 'text', width: 100 }] },
        rows: [{ a: '1' }],
      }),
      onContextMenuAction: onAction,
    })

    // 触发 contextmenu 在 body cell
    const scrollHost = container.querySelector('[data-novasheet-scroll-host]') as HTMLElement
    scrollHost.dispatchEvent(
      new MouseEvent('contextmenu', { clientX: 50, clientY: 50, bubbles: true, cancelable: true }),
    )

    // Paste 默认 disabled
    let pasteBtn = container.querySelector('[data-ns-action="paste"]') as HTMLButtonElement
    expect(pasteBtn.getAttribute('aria-disabled')).toBe('true')

    // 关闭 + 设 ready + 重开
    grid.closeContextMenu()
    grid.setClipboardReady(true)
    scrollHost.dispatchEvent(
      new MouseEvent('contextmenu', { clientX: 60, clientY: 60, bubbles: true, cancelable: true }),
    )
    pasteBtn = container.querySelector('[data-ns-action="paste"]') as HTMLButtonElement
    expect(pasteBtn.getAttribute('aria-disabled')).toBeNull()

    grid.destroy()
    document.body.removeChild(container)
  })

  it('点击 Cut 触发 onContextMenuAction("cut")', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const onAction = mock(() => {})
    const grid = new Grid(container, {
      data: new InMemoryDataSource({
        schema: { fields: [{ id: 'a', name: 'A', type: 'text', width: 100 }] },
        rows: [{ a: '1' }],
      }),
      onContextMenuAction: onAction,
    })
    const scrollHost = container.querySelector('[data-novasheet-scroll-host]') as HTMLElement
    scrollHost.dispatchEvent(
      new MouseEvent('contextmenu', { clientX: 30, clientY: 50, bubbles: true, cancelable: true }),
    )
    ;(container.querySelector('[data-ns-action="cut"]') as HTMLElement).click()
    expect(onAction).toHaveBeenCalledTimes(1)
    expect(onAction.mock.calls[0]![0]).toBe('cut')
    grid.destroy()
    document.body.removeChild(container)
  })
})
```

- [ ] **Step 2: Run — fail**

```bash
bun test packages/web/tests/grid/Grid.test.ts
```

Expected: fail（option / methods 不存在）

- [ ] **Step 3: Extend GridController + GridOptions**

```ts
// packages/web/src/grid/GridController.ts — 接口新增
interface GridController {
  // ...existing...
  setClipboardReady(ready: boolean): void
  openContextMenuAt(rowIndex: number, fieldId: string): void
  closeContextMenu(): void
}
```

```ts
// packages/web/src/Grid.ts — GridOptions 扩展
import type { ContextMenuAction, ContextMenuContext, GridEngineOptions } from '@novasheet/core'

export interface GridOptions extends GridEngineOptions {
  renderer?: GridRendererBackend
  onContextMenuAction?: (action: ContextMenuAction, ctx: ContextMenuContext) => void
}
```

`engineOptionsFrom` 内继续剥离 `renderer` 和新加 `onContextMenuAction`：

```ts
function engineOptionsFrom(options: GridOptions): GridEngineOptions {
  const { renderer: _renderer, onContextMenuAction: _cb, ...engineOptions } = options
  void _renderer
  void _cb
  return engineOptions
}
```

`Grid` 内追加 3 个公开方法：

```ts
setClipboardReady(ready: boolean): void {
  this.delegate.setClipboardReady(ready)
}
openContextMenuAt(rowIndex: number, fieldId: string): void {
  this.delegate.openContextMenuAt(rowIndex, fieldId)
}
closeContextMenu(): void {
  this.delegate.closeContextMenu()
}
```

- [ ] **Step 4: Wire layer in Canvas2DBackend**

```ts
// Canvas2DBackend constructor 末尾，cellEditor wiring 之后
this.contextMenuLayer = new DomContextMenuLayer(this.container, {
  onSelect: (id) => this.runtime.handleContextMenuSelected(id),
})
this.contextMenuLayer.attach()
this.runtime.setContextMenuLayer(this.contextMenuLayer)
if (options.onContextMenuAction) {
  this.runtime.setOnContextMenuAction(options.onContextMenuAction)
}
```

DomGridHost 构造里新增 `onContextMenu: (e) => this.runtime.handleHostContextMenu(e)`。

backend 三个方法转发 runtime：

```ts
setClipboardReady(ready: boolean): void { this.runtime.setClipboardReady(ready) }
openContextMenuAt(row: number, fieldId: string): void { this.runtime.openContextMenuAt(row, fieldId) }
closeContextMenu(): void { this.runtime.closeContextMenu() }
```

`destroy()` 内先 `this.contextMenuLayer.destroy()` 再走原 destroy 流程（不变量 #3）。

`openContextMenuAt` 实现（在 WebGridRuntime）：

```ts
openContextMenuAt(rowIndex: number, fieldId: string): void {
  if (!this.contextMenuLayer) return
  const colIndex = this.engine.getColumnIndex(fieldId)
  if (colIndex < 0) return
  const rect = computeCellRect(this.engine.getFrame(), { rowIndex, colIndex })
  if (!rect) return
  // 取 cell 右下角作为锚点
  const containerRect = (this.host as DomGridHost).getContainerRect?.() ?? { left: 0, top: 0 }
  this.handleHostContextMenu({
    x: rect.x + rect.width,
    y: rect.y + rect.height,
    clientX: containerRect.left + rect.x + rect.width,
    clientY: containerRect.top + rect.y + rect.height,
    shiftKey: false,
  })
}
```

> 若 `DomGridHost` 暂未暴露 `getContainerRect`，本任务追加一个公共方法：
>
> ```ts
> getContainerRect(): { left: number; top: number } {
>   return this.scrollHost.getBoundingClientRect()
> }
> ```

- [ ] **Step 5: Export new types from web**

```ts
// packages/web/src/index.ts — 追加
export type { ContextMenuAction, ContextMenuContext, ContextMenuItem } from '@novasheet/core'
```

- [ ] **Step 6: Run full test + typecheck + lint + build**

```bash
bun test
bun run --filter '*' typecheck
bun run lint
bun run --filter @novasheet/web build && bun run --filter @novasheet/web-canvas2d build && bun run --filter @novasheet/core build
```

Expected: 全 pass / 0 error

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/grid/GridController.ts \
        packages/web/src/backends/Canvas2DBackend.ts \
        packages/web/src/Grid.ts \
        packages/web/src/index.ts \
        packages/web/src/host/DomGridHost.ts \
        packages/web/src/runtime/WebGridRuntime.ts \
        packages/web/tests/grid/Grid.test.ts
git commit -m "feat(web): Phase 4.0 Grid facade — onContextMenuAction + setClipboardReady"
```

---

## Task 9: Storybook 故事 + README 标 4.0 完成

**Files:**

- Create: `apps/storybook/src/stories/ContextMenu.stories.ts`
- Create: `apps/storybook/src/stories/snippets/contextMenu.basic.snippet.ts`
- Modify: `README.md`

- [ ] **Step 1: Create snippet**

```ts
// apps/storybook/src/stories/snippets/contextMenu.basic.snippet.ts
// @ts-nocheck — storybook docs display snippet; references undefined demo names by design
import { Grid } from '@novasheet/web'
import { InMemoryDataSource, type Schema } from '@novasheet/core'

const schema: Schema = {
  fields: [
    { id: 'name', name: '姓名', type: 'text', width: 120 },
    { id: 'team', name: '团队', type: 'text', width: 120 },
  ],
}

const grid = new Grid(container, {
  data: new InMemoryDataSource({ schema, rows }),
  onContextMenuAction: (action, ctx) => {
    console.log('action', action, 'cell', ctx.cell, 'range', ctx.selectedRange)
  },
})

// 4.1 引擎实现后挂上：grid.setClipboardReady(true) 让 Paste 变可用
```

- [ ] **Step 2: Create story**

```ts
// apps/storybook/src/stories/ContextMenu.stories.ts
import type { Meta, StoryObj } from '@storybook/html'
import { InMemoryDataSource } from '@novasheet/core'
import { createGridHost } from '../grid-host'
import { basicTextSchema, generateRows } from '../mock-data'
import { docsMeta, docsStory } from '../story-docs'
import basicSrc from './snippets/contextMenu.basic.snippet.ts?raw'

const meta: Meta = {
  title: '表格/右键菜单',
  parameters: { layout: 'centered' },
  ...docsMeta(
    'Phase 4.0：body 单元格右键打开 Cut / Copy / Paste。Paste 默认 disabled——4.1 剪贴板就绪后通过 `grid.setClipboardReady(true)` 启用。点击 Cut/Copy 通过 `onContextMenuAction` 回调外抛，4.0 内部不动剪贴板。',
  ),
}
export default meta

type Story = StoryObj

export const Basic: Story = {
  name: '基础右键菜单',
  ...docsStory(basicSrc, '右键 body 区域看菜单；Esc 关闭；↑↓ 切换；Enter 触发回调。'),
  render: () => {
    const schema = basicTextSchema()
    const data = new InMemoryDataSource({ schema, rows: generateRows(schema, 30) })
    const host = createGridHost({
      data,
      onContextMenuAction: (action, ctx) => {
        // eslint-disable-next-line no-console
        console.log('[ContextMenu]', action, ctx.cell)
      },
    })
    return host
  },
}

export const PasteEnabled: Story = {
  name: 'Paste 启用（模拟 4.1）',
  ...docsStory(
    basicSrc.replace('// 4.1', 'grid.setClipboardReady(true) // 4.0'),
    'mount 后调用 `setClipboardReady(true)`——Paste 项变可用。',
  ),
  render: () => {
    const schema = basicTextSchema()
    const data = new InMemoryDataSource({ schema, rows: generateRows(schema, 30) })
    const host = createGridHost({ data })
    requestAnimationFrame(() => {
      const grid = (host as HTMLElement & { __grid: import('@novasheet/web').Grid }).__grid
      grid.setClipboardReady(true)
    })
    return host
  },
}
```

> `createGridHost` 当前可能不支持 `onContextMenuAction` 透传——若如此，本任务里给 `apps/storybook/src/grid-host.ts` 加一行透传（与已有 options 同列）。

- [ ] **Step 3: Update README**

`README.md` 当前状态：路线图里 Phase 4.0 在"未交付"段。改：

```md
| Phase 4.0 | 单元格右键菜单（cut/copy/paste shell；剪贴板真正语义留 4.1） |
```

移动到"已交付"段；从"未交付"删除对应行。同时在子阶段表里把 4.0 标 ✅ + 短描述。

- [ ] **Step 4: Run full chain + storybook build**

```bash
bun test
bun run --filter '*' typecheck
bun run lint
bun run --filter @novasheet/storybook build-storybook
```

Expected: 全 pass / Storybook build 成功

- [ ] **Step 5: Commit**

```bash
git add apps/storybook/src/stories/ContextMenu.stories.ts \
        apps/storybook/src/stories/snippets/contextMenu.basic.snippet.ts \
        apps/storybook/src/grid-host.ts \
        README.md
git commit -m "feat(storybook,docs): Phase 4.0 context menu stories + README sign-off"
```

---

## Risk / Known Issues

1. **`hitTestCell` 没有 `band` 字段时**：本 plan §Task 7 Step 3 用 `hit.cell.colIndex < 0 || hit.cell.rowIndex < 0` 近似判断头区。如果现有 `hitTestCell` 实现已经在头区返回 null，那 §Step 3 的「命中 header band 不开菜单」测试可以直接断言 `hit === null` 路径，跳过 `band` 判断。**实现前先 `grep -n "hitTestCell" packages/core/src/interaction/` 看实际返回类型，按事实简化。**
2. **`WebPointerEvent` 加 `clientX/clientY` 是侵入式改动**：Task 6 / Task 7 双向依赖。如果 reviewer 倾向单一职责，可以新增 `WebContextMenuEvent` 类型替代——本 plan 选 optional 字段方案省一类型，按 reviewer 偏好可改。
3. **`afterEngineMutation` 末尾 `contextMenuLayer?.close()`**：可能误关菜单刚开的同一帧。验证：`handleHostContextMenu` 中先调 `afterEngineMutation`（如果有 selection 变化）再调 `layer.open`——顺序成立时 close 在 open 前，无干扰。Step 3 的最后一个测试要覆盖这条路径。
4. **`apps/storybook/src/grid-host.ts` 的 options 透传范围**：若该文件不接受 `onContextMenuAction`，Task 9 内修；否则照搬即可。

---

## Final verification

每个 task 末尾都跑相应包的测试 + typecheck；最后一个 task 跑全链：`bun test` / `bun run --filter '*' typecheck` / `bun run lint` / Storybook build。所有 9 个 commit 落完后 9 个原子 commit 应该都自身可 typecheck / 通过测试。

---

## Self-Review

**Spec 覆盖**：

- §4.1 触发（body / 头 / handle / drag / edit）→ Task 7
- §4.2 selection 调整 → Task 7
- §4.3 items + clipboardReady → Task 2 / Task 8
- §4.4 clamp → Task 5
- §4.5 关闭 + 焦点恢复 → Task 4（关闭路径）+ Task 7（scroll / setData close）
- §4.6 交叉表 → Task 7（drag/resize/edit 状态机）
- §4.7 a11y 键盘 → Task 4
- §5 Public API → Task 8 + Task 2
- §6.1–6.3 包/DOM/Theme → Task 1 / Task 3
- §6.4 runtime 时序 → Task 7
- §6.5 不变量 → 各 task：layer 不读 DataSource（Task 7 经 engine 取上下文）；多 Grid 独立（每 Grid 一个 backend 实例）；destroy 先关菜单（Task 8 backend destroy 顺序）；菜单期间禁 drag-select / resize（Task 7 状态机）；setData / clearSelection / scroll 自动 close（Task 7）；菜单不参与 hitTestCell（无修改 hitTestCell）

**焦点恢复（spec §4.5）**：4.0 plan **未显式实现**——layer close 时不显式 `scrollHost.focus()`。这是一个 conscious 减裁：键盘用户 Tab 关闭后焦点自然由浏览器走 Tab 顺序；外部 pointerdown 关闭后焦点由用户点击的元素接管；Esc 关闭后焦点目前留在 menu DOM 节点（已 detach data-open，但还在 DOM）——这条路径可能确实卡焦点。**Mitigation**：Task 4 的 Esc 测试加一条 follow-up，在 close() 内追加 `if (closedByKeyboard) container.focus()` 一行 polish。若主审认为过 polish，可挪到 4.0.1。

**Type 一致性**：

- `CellRange`（不是 `SelectedRange`）—— Task 2 已写
- `engine.selectCell(cell)` —— Task 7 已写（不是 `setActiveCell`）
- `menuItemHover` 默认 = `hoverRowBg` —— Task 1 已写

**Placeholder scan**：

- 无 TBD / TODO / "later"
- Task 7 中标注了 `hitTestCell` band 判断在实现前查实际类型——明确指导而非占位
- Task 8 中 `getContainerRect` 若不存在则追加——明确指导

**Type / 命名一致性**：

- `getCellContextMenuItems(ctx)` 全文一致
- `ContextMenuAction` `'cut' | 'copy' | 'paste'` 全文一致
- `ContextMenuItem` 字段 `id / label / disabled / separatorAfter?` 全文一致
- `Grid.{setClipboardReady, openContextMenuAt, closeContextMenu}` 命名 facade / controller / runtime 三层一致
