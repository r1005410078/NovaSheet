# NovaSheet Header Hover Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Google Sheets-like column header hover dropdown entry and converge right-click/header dropdown menus into one extensible menu system.

**Architecture:** Extend the existing context-menu model first, then upgrade the DOM menu renderer, then pass header-hover state through `GridEngine.getFrame()` into Canvas2D header painting. Runtime owns pointer hit-testing and menu opening; renderer only consumes `RenderFrame`.

**Tech Stack:** TypeScript, `bun:test`, DOM tests with happy-dom, Canvas painter tests with `RecordingContext2D`, core engine `RenderFrame`, Canvas2D backend.

---

## File Map

| File | Responsibility |
|---|---|
| `packages/core/src/features/context-menu/ContextMenuModel.ts` | Expand item metadata, built-in icons, platform shortcuts, config extension helpers |
| `packages/core/tests/features/context-menu/ContextMenuModel.test.ts` | Model metadata and config extension tests |
| `packages/core/src/dom/interaction/DomContextMenuLayer.ts` | Unified menu DOM renderer: icon slot, shortcut slot, category separators, submenu |
| `packages/core/tests/dom/interaction/DomContextMenuLayer.test.ts` | DOM menu BDD coverage |
| `packages/core/src/dom/host/context-menu-style.ts` | Shared Google Sheets-like menu styles |
| `packages/core/src/Grid.ts` | Public `GridOptions.contextMenus`, `contextMenuRenderer`, custom action callback typing |
| `packages/core/src/dom/runtime/GridController.ts` | Controller type exports for menu config/renderer |
| `packages/core/src/dom/runtime/GridControllerImpl.ts` | Pass menu config/renderer into runtime; lifecycle for DOM override |
| `packages/core/src/dom/runtime/GridRuntime.ts` | Apply menu extensions, dispatch custom actions, header hover hit-test and click-open path |
| `packages/core/tests/dom/runtime/GridRuntime.test.ts` | Runtime behavior tests |
| `packages/core/src/kernel/render/RenderFrame.ts` | Add `hoveredColumnHeaderMenu` state |
| `packages/core/src/engine/GridEngine.ts` | Add internal setter for hover menu state |
| `packages/core/src/engine/DefaultGridEngine.ts` | Store hover menu state and feed frame assembler |
| `packages/core/src/engine/FrameAssembler.ts` | Copy hover menu state into `RenderFrame` |
| `packages/core/tests/engine/HeaderHoverMenuFrame.test.ts` | Frame state propagation tests |
| `packages/canvas2d/src/render/Canvas2DRenderer.ts` | Forward frame hover state to `HeaderPainter` |
| `packages/canvas2d/src/painters/HeaderPainter.ts` | Paint dropdown triangle/circle and reserve icon/text width |
| `packages/canvas2d/tests/painters/HeaderPainter.test.ts` | Painter tests with `RecordingContext2D` |
| `packages/*/src/index.ts` | Export new public types if missing |
| `apps/storybook/src/stories/ContextMenu.stories.ts` | Add header menu config and DOM override demos |

---

## Task 1: Context Menu Model Metadata

**Files:**
- Modify: `packages/core/src/features/context-menu/ContextMenuModel.ts`
- Modify: `packages/core/tests/features/context-menu/ContextMenuModel.test.ts`
- Modify: `packages/core/src/features/view/ViewLayer.ts` if type compatibility requires it
- Modify: `packages/core/src/features/view/FilterLayer.ts` and `packages/core/src/features/view/SortLayer.ts` only if their menu items need explicit metadata

- [ ] **Step 1: Write failing tests for default item metadata**

Append these tests to `packages/core/tests/features/context-menu/ContextMenuModel.test.ts`:

```ts
describe('ContextMenuItem metadata — unified menu', () => {
  it('cell clipboard items expose icon shortcut and category', () => {
    const items = getCellContextMenuItems({ ...baseCtx, clipboardReady: true })

    expect(items.find((item) => item.id === 'cut')).toMatchObject({
      icon: { kind: 'builtin', name: 'cut' },
      shortcut: expect.any(String),
      category: 'clipboard',
    })
    expect(items.find((item) => item.id === 'copy')).toMatchObject({
      icon: { kind: 'builtin', name: 'copy' },
      shortcut: expect.any(String),
      category: 'clipboard',
    })
    expect(items.find((item) => item.id === 'paste')).toMatchObject({
      icon: { kind: 'builtin', name: 'paste' },
      shortcut: expect.any(String),
      category: 'clipboard',
    })
  })

  it('column menu structure items expose icon and structure category', () => {
    const { pipeline } = setup()
    const items = getColumnHeaderContextMenuItems(
      { targetKind: 'columnHeader', field: schema.fields[0]!, colIndex: 0 },
      pipeline,
    )

    expect(items.find((item) => item.id === 'insert-col-left')).toMatchObject({
      icon: { kind: 'builtin', name: 'plus' },
      category: 'structure',
    })
    expect(items.find((item) => item.id === 'delete-cols')).toMatchObject({
      icon: { kind: 'builtin', name: 'trash' },
      category: 'structure',
    })
    expect(items.find((item) => item.id === 'resize-column-width')).toMatchObject({
      icon: { kind: 'builtin', name: 'resize' },
      category: 'structure',
    })
  })
})
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
bun test packages/core/tests/features/context-menu/ContextMenuModel.test.ts
```

Expected: FAIL because `icon`, `shortcut`, and `category` do not exist on returned items.

- [ ] **Step 3: Extend menu item types and default metadata**

In `ContextMenuModel.ts`, replace the current `ContextMenuItem` interface and add helpers:

```ts
export type BuiltInMenuIconName =
  | 'cut'
  | 'copy'
  | 'paste'
  | 'plus'
  | 'trash'
  | 'clear'
  | 'hide'
  | 'resize'
  | 'filter'
  | 'sortAsc'
  | 'sortDesc'
  | 'more'

export type MenuIcon =
  | { readonly kind: 'builtin'; readonly name: BuiltInMenuIconName }
  | { readonly kind: 'svg-path'; readonly path: string }
  | { readonly kind: 'text'; readonly text: string }

export interface ContextMenuItem {
  readonly id: ContextMenuAction | (string & {})
  readonly label: string
  readonly disabled?: boolean
  readonly icon?: MenuIcon
  readonly shortcut?: string
  readonly category?: string
  readonly separatorAfter?: boolean
  readonly submenu?: readonly ContextMenuItem[]
}

const isMac =
  typeof navigator !== 'undefined' && /\bMac|iPhone|iPad|iPod\b/.test(navigator.platform)

function shortcut(mac: string, other: string): string {
  return isMac ? mac : other
}

function builtinIcon(name: BuiltInMenuIconName): MenuIcon {
  return { kind: 'builtin', name }
}
```

Update default item literals, for example:

```ts
{ id: 'cut', label: '剪切', disabled: !ctx.hasSelection, icon: builtinIcon('cut'), shortcut: shortcut('⌘X', 'Ctrl+X'), category: 'clipboard' }
```

Use these categories:

| Action group | category |
|---|---|
| `cut/copy/paste` | `clipboard` |
| `filter-open/filter-clear` | `filter` |
| `sort-asc/sort-desc/sort-none` | `sort` |
| column/row insert/delete/hide/resize | `structure` |

- [ ] **Step 4: Run tests and verify they pass**

Run:

```bash
bun test packages/core/tests/features/context-menu/ContextMenuModel.test.ts packages/core/tests/features/view/FilterLayer.test.ts packages/core/tests/features/view/SortLayer.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/features/context-menu/ContextMenuModel.ts packages/core/tests/features/context-menu/ContextMenuModel.test.ts packages/core/src/features/view/ViewLayer.ts packages/core/src/features/view/FilterLayer.ts packages/core/src/features/view/SortLayer.ts
git commit -m "feat(core): 扩展上下文菜单项元数据"
```

---

## Task 2: Config Extension API

**Files:**
- Modify: `packages/core/src/features/context-menu/ContextMenuModel.ts`
- Modify: `packages/core/tests/features/context-menu/ContextMenuModel.test.ts`
- Modify: `packages/core/src/Grid.ts`
- Modify: `packages/core/src/dom/runtime/GridController.ts`
- Modify: `packages/core/src/dom/runtime/GridControllerImpl.ts`
- Modify: `packages/core/src/dom/runtime/GridRuntime.ts`

- [ ] **Step 1: Write failing model tests for append/prepend/replace/transform**

Add tests:

```ts
describe('applyContextMenuConfig — config extension', () => {
  const customItem = {
    id: 'custom.freeze-column',
    label: '冻结到当前列',
    category: 'custom',
    disabled: false,
  } as const

  it('appends custom items by default', () => {
    const base = getCellContextMenuItems(baseCtx)
    const result = applyContextMenuConfig(base, baseCtx, { items: [customItem] })
    expect(result.map((item) => item.id)).toEqual(['cut', 'copy', 'paste', 'custom.freeze-column'])
  })

  it('prepends custom items', () => {
    const base = getCellContextMenuItems(baseCtx)
    const result = applyContextMenuConfig(base, baseCtx, {
      mode: 'prepend',
      items: [customItem],
    })
    expect(result[0]!.id).toBe('custom.freeze-column')
  })

  it('replaces default items', () => {
    const base = getCellContextMenuItems(baseCtx)
    const result = applyContextMenuConfig(base, baseCtx, {
      mode: 'replace',
      items: [customItem],
    })
    expect(result.map((item) => item.id)).toEqual(['custom.freeze-column'])
  })

  it('runs transform after mode/items are applied', () => {
    const base = getCellContextMenuItems(baseCtx)
    const result = applyContextMenuConfig(base, baseCtx, {
      items: [customItem],
      transform: (items) => items.filter((item) => item.id !== 'copy'),
    })
    expect(result.map((item) => item.id)).toEqual(['cut', 'paste', 'custom.freeze-column'])
  })
})
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
bun test packages/core/tests/features/context-menu/ContextMenuModel.test.ts
```

Expected: FAIL because `applyContextMenuConfig` and config types do not exist.

- [ ] **Step 3: Add config types and helper**

In `ContextMenuModel.ts`, add:

```ts
export interface ContextMenuExtensionConfig {
  readonly cell?: ContextMenuConfig
  readonly columnHeader?: ContextMenuConfig
  readonly rowHeader?: ContextMenuConfig
}

export interface ContextMenuConfig {
  readonly mode?: 'append' | 'prepend' | 'replace'
  readonly items?: readonly ContextMenuItem[]
  transform?(
    items: readonly ContextMenuItem[],
    ctx: ContextMenuContext,
  ): readonly ContextMenuItem[]
}

export function applyContextMenuConfig(
  baseItems: readonly ContextMenuItem[],
  ctx: ContextMenuContext,
  config: ContextMenuConfig | undefined,
): readonly ContextMenuItem[] {
  if (!config) return baseItems
  const extra = config.items ?? []
  const mode = config.mode ?? 'append'
  const merged =
    mode === 'replace'
      ? [...extra]
      : mode === 'prepend'
        ? [...extra, ...baseItems]
        : [...baseItems, ...extra]
  return config.transform ? config.transform(merged, ctx) : merged
}
```

- [ ] **Step 4: Wire public options**

In `GridOptions`, add:

```ts
contextMenus?: ContextMenuExtensionConfig
```

Pass `contextMenus: options.contextMenus` into `GridControllerImpl`, then into `GridRuntimeOptions`.

In `GridRuntime`, store:

```ts
private contextMenus?: ContextMenuExtensionConfig
```

and use `applyContextMenuConfig` at every menu item generation point:

```ts
const items = applyContextMenuConfig(getCellContextMenuItems(ctx), ctx, this.contextMenus?.cell)
```

Use `columnHeader` and `rowHeader` for those target kinds.

- [ ] **Step 5: Run focused typecheck/tests**

Run:

```bash
bun test packages/core/tests/features/context-menu/ContextMenuModel.test.ts
bun run --filter @novasheet/core typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/features/context-menu/ContextMenuModel.ts packages/core/tests/features/context-menu/ContextMenuModel.test.ts packages/core/src/Grid.ts packages/core/src/dom/runtime/GridController.ts packages/core/src/dom/runtime/GridControllerImpl.ts packages/core/src/dom/runtime/GridRuntime.ts
git commit -m "feat(core): 支持上下文菜单配置式扩展"
```

---

## Task 3: Unified DOM Menu Rendering

**Files:**
- Modify: `packages/core/src/dom/interaction/DomContextMenuLayer.ts`
- Modify: `packages/core/tests/dom/interaction/DomContextMenuLayer.test.ts`
- Modify: `packages/core/src/dom/host/context-menu-style.ts`

- [ ] **Step 1: Write failing DOM rendering tests**

Append tests:

```ts
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
    expect(document.body.querySelector('[role="separator"]')).toBeTruthy()
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

    const parent = document.body.querySelector('[data-ns-action="more"]') as HTMLElement
    parent.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    expect(document.body.querySelector('[data-ns-submenu-arrow]')).toBeTruthy()
    ;(document.body.querySelector('[data-ns-action="custom.freeze-column"]') as HTMLElement).click()
    expect(onSelect).toHaveBeenCalledWith('custom.freeze-column')
    layer.destroy()
    document.body.removeChild(container)
  })
})
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
bun test packages/core/tests/dom/interaction/DomContextMenuLayer.test.ts
```

Expected: FAIL because icon/shortcut/submenu DOM is not rendered.

- [ ] **Step 3: Implement structured item DOM**

Replace the text-only button body in `renderItems()` with a helper:

```ts
private renderMenuItem(item: ContextMenuItem): HTMLButtonElement {
  const btn = this.menu.ownerDocument.createElement('button')
  btn.setAttribute('role', 'menuitem')
  btn.setAttribute('data-ns-action', item.id)
  btn.setAttribute('tabindex', '-1')
  if (item.disabled) btn.setAttribute('aria-disabled', 'true')
  if (item.submenu?.length) btn.setAttribute('aria-haspopup', 'menu')

  const icon = this.renderIcon(item.icon)
  const label = this.menu.ownerDocument.createElement('span')
  label.setAttribute('data-ns-menu-label', '')
  label.textContent = item.label
  const shortcut = this.menu.ownerDocument.createElement('span')
  shortcut.setAttribute('data-ns-menu-shortcut', '')
  shortcut.textContent = item.submenu?.length ? '▶' : (item.shortcut ?? '')
  if (item.submenu?.length) shortcut.setAttribute('data-ns-submenu-arrow', '')

  btn.append(icon, label, shortcut)
  btn.addEventListener('click', () => this.onItemClick(item))
  btn.addEventListener('mouseenter', () => this.openSubmenuFor(btn, item))
  return btn
}
```

Implement `renderIcon()` for `builtin`, `text`, and `svg-path`. For built-ins, render a span with `data-ns-menu-icon="<name>"`; draw glyphs with CSS/text first if local icon tokens are not available. Keep the icon slot even when `item.icon` is undefined.

Insert separators when either `separatorAfter` is true or adjacent `category` changes:

```ts
const previous = items[index - 1]
if (index > 0 && previous?.category !== item.category) this.menu.appendChild(this.createSeparator())
```

- [ ] **Step 4: Update CSS**

In `context-menu-style.ts`, add styles for:

```css
[data-novasheet-context-menu] {
  min-width: 320px;
  padding: 8px 0;
  border-radius: 6px;
  box-shadow: 0 6px 18px rgb(60 64 67 / 20%);
}

[data-novasheet-context-menu] [role="menuitem"] {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) auto;
  align-items: center;
  min-height: 36px;
}

[data-ns-menu-shortcut] {
  opacity: 0.56;
  padding-left: 24px;
}
```

Use existing theme CSS variables for colors; do not hardcode painter colors.

- [ ] **Step 5: Run DOM menu tests**

Run:

```bash
bun test packages/core/tests/dom/interaction/DomContextMenuLayer.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/dom/interaction/DomContextMenuLayer.ts packages/core/tests/dom/interaction/DomContextMenuLayer.test.ts packages/core/src/dom/host/context-menu-style.ts
git commit -m "feat(core): 统一上下文菜单 DOM 渲染"
```

---

## Task 4: DOM Override Renderer

**Files:**
- Modify: `packages/core/src/features/context-menu/ContextMenuModel.ts`
- Modify: `packages/core/src/Grid.ts`
- Modify: `packages/core/src/dom/runtime/GridControllerImpl.ts`
- Modify: `packages/core/src/dom/runtime/GridRuntime.ts`
- Modify: `packages/core/tests/dom/runtime/GridRuntime.test.ts`

- [ ] **Step 1: Write failing runtime tests for DOM override**

Add tests to `GridRuntime.test.ts` using the existing runtime helper pattern:

```ts
it('contextMenuRenderer receives resolved column header menu options', () => {
  const renderer = {
    open: mock((_options: ContextMenuRenderOptions) => {}),
    close: mock(() => {}),
    destroy: mock(() => {}),
  }
  const runtime = makeRuntime({
    contextMenuRenderer: renderer,
    contextMenus: {
      columnHeader: {
        items: [{ id: 'custom.freeze-column', label: '冻结到当前列', disabled: false }],
      },
    },
  })

  runtime.handleHostContextMenu({
    x: 120,
    y: 8,
    clientX: 220,
    clientY: 108,
    shiftKey: false,
  })

  expect(renderer.open).toHaveBeenCalledTimes(1)
  const options = renderer.open.mock.calls[0]![0]
  expect(options.targetKind).toBe('columnHeader')
  expect(options.items.some((item) => item.id === 'custom.freeze-column')).toBe(true)
  expect(options.anchor).toEqual({ clientX: 220, clientY: 108 })
})

it('contextMenuRenderer.select dispatches built-in actions', () => {
  let captured: ContextMenuRenderOptions | null = null
  const runtime = makeRuntime({
    contextMenuRenderer: {
      open: mock((options: ContextMenuRenderOptions) => {
        captured = options
      }),
      close: mock(() => {}),
      destroy: mock(() => {}),
    },
  })

  runtime.handleHostContextMenu({ x: 120, y: 8, clientX: 220, clientY: 108, shiftKey: false })
  captured!.select('sort-asc')

  expect(runtime.getSortLayer().getSpec()).toMatchObject({ direction: 'asc' })
})
```

Before adding these tests, extend the existing `makeExcelHeaderRuntime()` helper so it accepts:

```ts
function makeExcelHeaderRuntime(
  options: {
    rowHeaderWidth?: number
    columnWidth?: number
    runtimeOptions?: Partial<GridRuntimeOptions>
  } = {},
) {
  // keep the existing fixture body
  const runtime = new GridRuntime({
    engine,
    host,
    renderer: makeRenderer(),
    ...options.runtimeOptions,
  })
  return { engine, runtime, host }
}
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
bun test packages/core/tests/dom/runtime/GridRuntime.test.ts
```

Expected: FAIL because `contextMenuRenderer` types/options are not wired.

- [ ] **Step 3: Add renderer types**

In `ContextMenuModel.ts`, add:

```ts
export interface ContextMenuRenderer {
  open(options: ContextMenuRenderOptions): void
  close(): void
  destroy(): void
}

export interface ContextMenuRenderOptions {
  readonly targetKind: ContextMenuTargetKind
  readonly context: ContextMenuContext
  readonly items: readonly ContextMenuItem[]
  readonly anchor: { readonly clientX: number; readonly clientY: number }
  readonly select: (id: string) => void
  readonly close: () => void
}
```

Expose `contextMenuRenderer?: ContextMenuRenderer` on `GridOptions` and pass into runtime.

- [ ] **Step 4: Implement unified open helper**

In `GridRuntime`, add:

```ts
private openResolvedContextMenu(args: {
  readonly ctx: ContextMenuContext
  readonly clientX: number
  readonly clientY: number
  readonly baseItems: readonly ContextMenuItem[]
}): void {
  const config =
    args.ctx.targetKind === 'cell'
      ? this.contextMenus?.cell
      : args.ctx.targetKind === 'columnHeader'
        ? this.contextMenus?.columnHeader
        : this.contextMenus?.rowHeader
  const items = this.markUnhandledCustomItemsDisabled(
    applyContextMenuConfig(args.baseItems, args.ctx, config),
  )
  this.lastContextMenuContext = args.ctx
  this.lastContextMenuPoint = { clientX: args.clientX, clientY: args.clientY }
  if (this.contextMenuRenderer) {
    this.contextMenuLayer?.close()
    this.contextMenuRenderer.open({
      targetKind: args.ctx.targetKind,
      context: args.ctx,
      items,
      anchor: { clientX: args.clientX, clientY: args.clientY },
      select: (id) => this.handleContextMenuSelected(id),
      close: () => this.contextMenuRenderer?.close(),
    })
    return
  }
  this.contextMenuLayer?.open({ clientX: args.clientX, clientY: args.clientY, items })
}
```

Implement `markUnhandledCustomItemsDisabled()`:

```ts
private markUnhandledCustomItemsDisabled(items: readonly ContextMenuItem[]): readonly ContextMenuItem[] {
  return items.map((item) => {
    const submenu = item.submenu ? this.markUnhandledCustomItemsDisabled(item.submenu) : undefined
    const custom = !this.isBuiltInContextMenuAction(item.id)
    const disabled = item.disabled === true || (custom && !this.onContextMenuAction)
    return submenu === item.submenu && disabled === item.disabled ? item : { ...item, submenu, disabled }
  })
}
```

Custom ids are dispatched through `onContextMenuAction(id, ctx)` if the id is not built in.

- [ ] **Step 5: Lifecycle**

In `GridRuntime.closeContextMenu()` call both:

```ts
this.contextMenuLayer?.close()
this.contextMenuRenderer?.close()
```

In destroy path call `this.contextMenuRenderer?.destroy()`.

Ensure `GridControllerImpl.destroy()` does not double-destroy custom renderer if runtime owns it; prefer runtime owns renderer lifecycle.

- [ ] **Step 6: Run runtime tests**

Run:

```bash
bun test packages/core/tests/dom/runtime/GridRuntime.test.ts
bun run --filter @novasheet/core typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/features/context-menu/ContextMenuModel.ts packages/core/src/Grid.ts packages/core/src/dom/runtime/GridControllerImpl.ts packages/core/src/dom/runtime/GridRuntime.ts packages/core/tests/dom/runtime/GridRuntime.test.ts
git commit -m "feat(core): 支持上下文菜单 DOM 覆盖"
```

---

## Task 5: RenderFrame Header Hover State

**Files:**
- Modify: `packages/core/src/kernel/render/RenderFrame.ts`
- Modify: `packages/core/src/engine/GridEngine.ts`
- Modify: `packages/core/src/engine/DefaultGridEngine.ts`
- Modify: `packages/core/src/engine/FrameAssembler.ts`
- Test: existing engine/frame assembler test, or create `packages/core/tests/engine/HeaderHoverMenuFrame.test.ts`

- [ ] **Step 1: Write failing frame propagation test**

Create `packages/core/tests/engine/HeaderHoverMenuFrame.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { DefaultGridEngine } from '../../src/engine/DefaultGridEngine'
import { InMemoryDataSource } from '../../src/kernel/data/InMemoryDataSource'

describe('DefaultGridEngine hovered column header menu frame state', () => {
  it('includes hoveredColumnHeaderMenu in RenderFrame', () => {
    const engine = new DefaultGridEngine({
      data: new InMemoryDataSource({
        rows: [{ a: 'A' }],
        schema: { fields: [{ id: 'a', name: 'A', type: 'text', width: 100 }] },
      }),
    })

    engine.setHoveredColumnHeaderMenu({ colIndex: 0 })

    expect(engine.getFrame().hoveredColumnHeaderMenu).toEqual({ colIndex: 0 })
  })

  it('clears hoveredColumnHeaderMenu with null', () => {
    const engine = new DefaultGridEngine({
      data: new InMemoryDataSource({
        rows: [{ a: 'A' }],
        schema: { fields: [{ id: 'a', name: 'A', type: 'text', width: 100 }] },
      }),
    })

    engine.setHoveredColumnHeaderMenu({ colIndex: 0 })
    engine.setHoveredColumnHeaderMenu(null)

    expect(engine.getFrame().hoveredColumnHeaderMenu).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
bun test packages/core/tests/engine/HeaderHoverMenuFrame.test.ts
```

Expected: FAIL because the setter and frame property do not exist.

- [ ] **Step 3: Add types and engine state**

In `RenderFrame.ts`:

```ts
export interface HoveredColumnHeaderMenu {
  readonly colIndex: number
}

export interface RenderFrame {
  // keep the current fields unchanged
  hoveredColumnHeaderMenu?: HoveredColumnHeaderMenu
}
```

In `FrameAssemblerInput` add:

```ts
readonly hoveredColumnHeaderMenu?: HoveredColumnHeaderMenu
```

Return it only when defined:

```ts
hoveredColumnHeaderMenu: input.hoveredColumnHeaderMenu,
```

In `GridEngine.ts`, add:

```ts
setHoveredColumnHeaderMenu(state: HoveredColumnHeaderMenu | null): void
```

In `DefaultGridEngine.ts`, store and pass it into `assembleRenderFrame()`.

- [ ] **Step 4: Run focused engine tests**

Run:

```bash
bun test packages/core/tests/engine/HeaderHoverMenuFrame.test.ts
bun run --filter @novasheet/core typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/kernel/render/RenderFrame.ts packages/core/src/engine/GridEngine.ts packages/core/src/engine/DefaultGridEngine.ts packages/core/src/engine/FrameAssembler.ts packages/core/tests/engine/HeaderHoverMenuFrame.test.ts
git commit -m "feat(core): 下发列头悬停菜单状态"
```

---

## Task 6: HeaderPainter Button Rendering

**Files:**
- Modify: `packages/canvas2d/src/painters/HeaderPainter.ts`
- Modify: `packages/canvas2d/src/render/Canvas2DRenderer.ts`
- Test: `packages/canvas2d/tests/painters/HeaderPainter.test.ts`

- [ ] **Step 1: Write failing painter tests**

Add tests:

```ts
import { describe, expect, it } from 'bun:test'
import { HeaderPainter } from '../../src/painters/HeaderPainter'
import { RecordingContext2D } from '../helpers/recording-context'
import { ChunkedAxis, denseGridTheme } from '@novasheet/core'

describe('HeaderPainter — hover menu button', () => {
  it('paints dropdown button only for hovered column', () => {
    const ctx = new RecordingContext2D()
    const colsAxis = new ChunkedAxis(2, 100)
    const painter = new HeaderPainter(denseGridTheme)

    painter.paint(ctx as unknown as CanvasRenderingContext2D, {
      schema: {
        fields: [
          { id: 'a', name: 'A', type: 'text', width: 100 },
          { id: 'b', name: 'B', type: 'text', width: 100 },
        ],
      },
      colsAxis,
      colRange: [0, 1],
      width: 200,
      hoveredColumnHeaderMenu: { colIndex: 1 },
    })

    const arcs = ctx.ops.filter((op) => op.name === 'arc')
    expect(arcs.length).toBe(1)
    const fills = ctx.ops.filter((op) => op.name === 'fill')
    expect(fills.length).toBeGreaterThan(0)
  })

  it('does not paint dropdown button for columns narrower than 32px', () => {
    const ctx = new RecordingContext2D()
    const colsAxis = new ChunkedAxis(1, 31)
    const painter = new HeaderPainter(denseGridTheme)

    painter.paint(ctx as unknown as CanvasRenderingContext2D, {
      schema: { fields: [{ id: 'a', name: 'A', type: 'text', width: 31 }] },
      colsAxis,
      colRange: [0, 0],
      width: 31,
      hoveredColumnHeaderMenu: { colIndex: 0 },
    })

    expect(ctx.ops.some((op) => op.name === 'arc')).toBe(false)
  })
})
```

Adjust operation names to match `RecordingContext2D` if it records `ellipse` instead of `arc`.

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
bun test packages/canvas2d/tests/painters/HeaderPainter.test.ts
```

Expected: FAIL because `hoveredColumnHeaderMenu` is not accepted/painted.

- [ ] **Step 3: Add painter params and paint button**

In `HeaderPaintParams`, add:

```ts
hoveredColumnHeaderMenu?: { readonly colIndex: number }
```

Use constants:

```ts
const HEADER_MENU_BUTTON_SIZE = 24
const MIN_HEADER_MENU_BUTTON_COL_WIDTH = 32
const HEADER_MENU_TRIANGLE_WIDTH = 8
const HEADER_MENU_TRIANGLE_HEIGHT = 5
```

In text/icon layout:

```ts
const menuReserve = this.shouldPaintMenuButton(c, colWidth, params.hoveredColumnHeaderMenu)
  ? HEADER_MENU_BUTTON_SIZE
  : 0
const iconReserve = this.measureIconReserve(icons.length) + menuReserve
```

Paint icons before the button by passing `rightReserve: menuReserve` into `paintStateIcons()`.

Add:

```ts
private paintHeaderMenuButton(ctx: CanvasRenderingContext2D, params: {
  readonly colLeft: number
  readonly colWidth: number
  readonly headerHeight: number
  readonly padX: number
  readonly color: string
}): void {
  const centerX = params.colLeft + params.colWidth - params.padX - HEADER_MENU_BUTTON_SIZE / 2
  const centerY = params.headerHeight / 2
  ctx.save()
  ctx.fillStyle = this.theme.colors.hoverRowBg
  ctx.beginPath()
  ctx.arc(centerX, centerY, HEADER_MENU_BUTTON_SIZE / 2, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = params.color
  ctx.beginPath()
  ctx.moveTo(centerX - HEADER_MENU_TRIANGLE_WIDTH / 2, centerY - HEADER_MENU_TRIANGLE_HEIGHT / 2)
  ctx.lineTo(centerX + HEADER_MENU_TRIANGLE_WIDTH / 2, centerY - HEADER_MENU_TRIANGLE_HEIGHT / 2)
  ctx.lineTo(centerX, centerY + HEADER_MENU_TRIANGLE_HEIGHT / 2)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}
```

- [ ] **Step 4: Forward frame state from renderer**

In `Canvas2DRenderer.paintHeaders()`, pass:

```ts
hoveredColumnHeaderMenu: frame.hoveredColumnHeaderMenu,
```

Update method signature to receive the frame or add an argument.

- [ ] **Step 5: Run painter and renderer tests**

Run:

```bash
bun test packages/canvas2d/tests/painters/HeaderPainter.test.ts packages/canvas2d/tests/render/Canvas2DRenderer.test.ts
bun run --filter @novasheet/canvas2d typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/canvas2d/src/painters/HeaderPainter.ts packages/canvas2d/src/render/Canvas2DRenderer.ts packages/canvas2d/tests/painters/HeaderPainter.test.ts
git commit -m "feat(canvas2d): 绘制列头悬停菜单按钮"
```

---

## Task 7: Runtime Header Hit-Test and Click Open

**Files:**
- Modify: `packages/core/src/dom/runtime/GridRuntime.ts`
- Modify: `packages/core/tests/dom/runtime/GridRuntime.test.ts`

- [ ] **Step 1: Write failing runtime tests**

Add tests:

```ts
it('pointer move over column header sets hoveredColumnHeaderMenu', () => {
  const { runtime, engine } = makeRuntimeWithTwoColumns()

  runtime.handleHostPointerMove({ x: 120, y: 8, clientX: 120, clientY: 8, shiftKey: false })

  expect(engine.getFrame().hoveredColumnHeaderMenu).toEqual({ colIndex: 1 })
})

it('pointer move outside header clears hoveredColumnHeaderMenu', () => {
  const { runtime, engine } = makeRuntimeWithTwoColumns()

  runtime.handleHostPointerMove({ x: 120, y: 8, clientX: 120, clientY: 8, shiftKey: false })
  runtime.handleHostPointerMove({ x: 120, y: 80, clientX: 120, clientY: 80, shiftKey: false })

  expect(engine.getFrame().hoveredColumnHeaderMenu).toBeUndefined()
})

it('clicking header menu button opens column header menu', () => {
  const { runtime, contextMenuLayer } = makeRuntimeWithTwoColumns()

  runtime.handleHostPointerMove({ x: 190, y: 8, clientX: 290, clientY: 108, shiftKey: false })
  runtime.handleHostPointerDown({ x: 190, y: 8, clientX: 290, clientY: 108, shiftKey: false })

  expect(contextMenuLayer.open).toHaveBeenCalled()
  const options = contextMenuLayer.open.mock.calls[0]![0]
  expect(options.items.some((item) => item.id === 'insert-col-left')).toBe(true)
})
```

Use the existing `makeExcelHeaderRuntime()` fixture. For the click test, create it with `{ columnWidth: 100 }`; column B spans x `100..199`, so `x: 190` lands inside the 24px button area at the right side of column B.

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
bun test packages/core/tests/dom/runtime/GridRuntime.test.ts
```

Expected: FAIL because pointer move does not update hover state and click hit-test does not open the menu.

- [ ] **Step 3: Implement hit-test helper**

In `GridRuntime.ts` add constants matching painter:

```ts
const HEADER_MENU_BUTTON_SIZE = 24
const MIN_HEADER_MENU_BUTTON_COL_WIDTH = 32
```

Add helpers:

```ts
private hitTestColumnHeader(event: WebPointerEvent): { readonly colIndex: number } | null {
  const frame = this.engine.getFrame()
  const headerHeight = frame.theme.metrics.headerHeight
  const rowHeaderWidth = frame.viewport.rowHeaderWidth ?? 0
  if (event.y < 0 || event.y >= headerHeight) return null
  if (event.x < rowHeaderWidth) return null
  const logicalX = event.x - rowHeaderWidth + frame.viewport.scrollX
  const colIndex = frame.colsAxis.positionToIndex(logicalX)
  if (colIndex < 0 || colIndex >= frame.colsAxis.getCount()) return null
  return { colIndex }
}

private hitTestColumnHeaderMenuButton(event: WebPointerEvent): { readonly colIndex: number } | null {
  const hit = this.hitTestColumnHeader(event)
  if (!hit) return null
  const frame = this.engine.getFrame()
  const colLeft = (frame.viewport.rowHeaderWidth ?? 0) + frame.colsAxis.indexToPosition(hit.colIndex) - frame.viewport.scrollX
  const colWidth = frame.colsAxis.getSize(hit.colIndex)
  if (colWidth < MIN_HEADER_MENU_BUTTON_COL_WIDTH) return null
  const buttonLeft = colLeft + colWidth - this.engine.getTheme().metrics.cellPaddingX - HEADER_MENU_BUTTON_SIZE
  const buttonRight = buttonLeft + HEADER_MENU_BUTTON_SIZE
  return event.x >= buttonLeft && event.x <= buttonRight ? hit : null
}
```

If an existing private `hitTestColumnHeader` already exists for drag, extend it instead of duplicating.

- [ ] **Step 4: Update pointer move and pointer down**

In `handleHostPointerMove`, when no drag is active:

```ts
const headerHit = this.hitTestColumnHeader(event)
const next = headerHit ? { colIndex: headerHit.colIndex } : null
this.engine.setHoveredColumnHeaderMenu(next)
this.invalidate()
```

Only call `invalidate()` when the hover state changes.

In `handleHostPointerDown`, before drag start:

```ts
const menuHit = this.hitTestColumnHeaderMenuButton(event)
if (menuHit) {
  event.preventDefault?.()
  this.openColumnHeaderContextMenu(menuHit.colIndex, event)
  return
}
```

Extract existing column header context-menu logic from `handleHostContextMenu()` into:

```ts
private openColumnHeaderContextMenu(colIndex: number, event: WebPointerEvent): void
```

Use `openResolvedContextMenu()` from Task 4.

- [ ] **Step 5: Run runtime tests**

Run:

```bash
bun test packages/core/tests/dom/runtime/GridRuntime.test.ts
bun run --filter @novasheet/core typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/dom/runtime/GridRuntime.ts packages/core/tests/dom/runtime/GridRuntime.test.ts
git commit -m "feat(core): 点击列头悬停按钮打开菜单"
```

---

## Task 8: Public Exports, Story, and Final Verification

**Files:**
- Modify: `packages/core/src/index.ts`
- Modify: `packages/react/src/index.ts` if it re-exports core public types
- Modify: `apps/storybook/src/stories/ContextMenu.stories.ts`
- Modify: `docs/superpowers/plans/2026-06-16-novasheet-header-hover-menu-implementation.md` only to tick completed boxes during execution

- [ ] **Step 1: Write or update story/demo**

Add a new story export named `CustomExtensions` to `apps/storybook/src/stories/ContextMenu.stories.ts`. Use this grid options block to show config extension:

```ts
contextMenus: {
  columnHeader: {
    items: [
      {
        id: 'demo.freeze-column',
        label: '冻结到当前列',
        icon: { kind: 'builtin', name: 'more' },
        category: 'custom',
      },
    ],
  },
},
onContextMenuAction(action, ctx) {
  console.log('context menu action', action, ctx)
},
```

Add a second story export named `DomOverride` in the same file. Its `contextMenuRenderer.open()` should append a simple absolutely positioned `div` into the story host and render the received `items` labels. Its `destroy()` must remove that custom node.

- [ ] **Step 2: Export public types**

From `packages/core/src/index.ts`, export:

```ts
export type {
  BuiltInMenuIconName,
  MenuIcon,
  ContextMenuConfig,
  ContextMenuExtensionConfig,
  ContextMenuRenderer,
  ContextMenuRenderOptions,
} from './features/context-menu/ContextMenuModel'
```

Mirror through React package only if current React package exports `GridOptions`-adjacent types.

- [ ] **Step 3: Run focused tests**

Run:

```bash
bun test packages/core/tests/features/context-menu/ContextMenuModel.test.ts packages/core/tests/dom/interaction/DomContextMenuLayer.test.ts packages/core/tests/dom/runtime/GridRuntime.test.ts packages/canvas2d/tests/painters/HeaderPainter.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run required gates**

Run:

```bash
bun run lint
bun run --filter '*' typecheck
bun test
bun run --filter @novasheet/web build
bun run --filter @novasheet/canvas2d build
bun run --filter @novasheet/core build
```

Expected: all PASS, lint has 0 errors / 0 warnings.

- [ ] **Step 5: Manual visual verification**

Start Storybook or the repo’s dev story server using the existing script. If `localhost:6006` is already running, reuse it. Open:

```text
http://localhost:6006/?path=/story/table-field-types--custom-extensions
```

Verify:

| Scenario | Expected |
|---|---|
| Hover column header | only hovered column shows right-side dropdown triangle |
| Hover triangle | light gray circular background visible |
| Click triangle | same menu items as column header right-click |
| Right-click column header | unified icon/shortcut/category style |
| Custom config item | appears in configured location |
| DOM override story if present | built-in DOM menu is not rendered; custom renderer receives options |

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/index.ts packages/react/src/index.ts packages/*/src/**/*.stories.ts packages/*/src/**/*.stories.tsx
git commit -m "feat(story): 展示列头菜单扩展能力"
```

If only exports changed and no story changed, use:

```bash
git add packages/core/src/index.ts packages/react/src/index.ts
git commit -m "feat(core): 导出上下文菜单扩展类型"
```

---

## Self-Review Checklist

| Spec requirement | Covered by |
|---|---|
| Hover current column only | Task 5, Task 6, Task 7 |
| Click dropdown opens column menu | Task 7 |
| Right-click keeps behavior | Task 4, Task 7 regression tests |
| Sort/filter icons do not overlap button | Task 6 |
| Frozen/scroll positioning follows header geometry | Task 6 renderer forwarding, Task 7 hit-test geometry |
| Unified menu style | Task 3 |
| Icon/shortcut/category/submenu | Task 1, Task 3 |
| Config extension | Task 2 |
| DOM override | Task 4 |
| Public API/types | Task 8 |
| BDD scenarios | Tasks 1-8 tests |

The plan has been checked for red-flag placeholder wording and formatting before handoff.
