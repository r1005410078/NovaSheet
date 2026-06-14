# React Toolbar Extension + Rich Text Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 `@novasheet/react` toolbar 增加扩展 slot，并把 `@novasheet/cell-kit` rich-text 改为 Google Sheets-like 外部 React toolbar 控制当前 inline editor 选区。

**Architecture:** React toolbar 只新增 `extensionItems` 渲染缝，不扩 `ToolbarActionId`。Rich-text session/provider 留在 `cell-kit`，由 editor 注册 active `contenteditable` session，外部 rich-text toolbar item 通过 session 改 DOM selection，commit 时仍一次写回 `richText` attachment + plain text。

**Tech Stack:** TypeScript strict、React 18、bun:test + happy-dom、`@storybook/html`、NovaSheet MBD 场景。

---

## Context

Read before executing any task:

- Spec: `docs/superpowers/specs/2026-06-14-novasheet-react-toolbar-extension-rich-text-design.md`
- Method: `docs/superpowers/specs/2026-06-10-novasheet-bdd-tdd-method-design.md`
- Existing rich-text spec: `docs/superpowers/specs/2026-06-13-novasheet-cell-kit-rich-text-design.md`
- Existing cleanup plan: `docs/superpowers/plans/2026-06-14-novasheet-rich-text-cleanup-batch.md`

Plan risks that require STOP+ASK:

| Risk | STOP condition |
| --- | --- |
| `contenteditable` selection restore | happy-dom/browser behavior cannot preserve/restore Range enough to test external toolbar |
| blur/commit timing | toolbar click closes editor before command applies |
| package boundary | `cell-kit` would need to import non-exported `@novasheet/react` internals |
| scenario wording | external toolbar expectation conflicts with current L3c scenario or coverage tooling |

## File Structure

| File | Responsibility | Action |
| --- | --- | --- |
| `packages/react/src/features/toolbar/types.ts` | public toolbar extension item types | Modify |
| `packages/react/src/features/toolbar/components/NovaSheetToolbar.tsx` | render `items ?? defaultToolbarItems` + `extensionItems` | Modify |
| `packages/react/src/features/toolbar/index.ts` | export new extension types | Modify |
| `packages/react/src/index.ts` | public re-export | Modify |
| `packages/react/tests/features/toolbar/NovaSheetToolbar.test.ts` | toolbar extension seam tests | Modify |
| `packages/react/tests/excel/scenarios/L3c-rich-text-toolbar-bold-substring.md` | BDD contract says external React toolbar | Modify |
| `packages/react/tests/excel/scenarios.manifest.json` | regenerated manifest | Modify |
| `packages/react/tests/excel/SCENARIOS.md` | regenerated scenario catalog | Modify |
| `packages/cell-kit/src/rich-text/editingSession.ts` | DOM Range/session command core | Create |
| `packages/cell-kit/src/rich-text/RichTextToolbarProvider.tsx` | React context/provider/session store | Create |
| `packages/cell-kit/src/rich-text/RichTextToolbarExtension.tsx` | extension item factory + buttons | Create |
| `packages/cell-kit/src/rich-text/RichTextCellEditor.tsx` | register session, optional inline toolbar | Modify |
| `packages/cell-kit/src/rich-text/index.ts` | export provider/session/extension editor factory | Modify |
| `packages/cell-kit/tests/rich-text/editingSession.test.ts` | session DOM unit tests | Create |
| `packages/cell-kit/tests/rich-text/RichTextToolbarExtension.test.tsx` | external toolbar item tests | Create |
| `packages/cell-kit/tests/rich-text/RichTextCellEditor.test.tsx` | session registration + inline toolbar default tests | Modify |
| `packages/react/tests/excel/rich-text-extension.test.ts` | L3c shim uses external toolbar contract | Modify |
| `apps/storybook/src/stories/RichText.stories.ts` | external toolbar demo | Modify |

## Task 1: BDD Contract Update — External React Toolbar Scenario

**Files:**
- Modify: `packages/react/tests/excel/scenarios/L3c-rich-text-toolbar-bold-substring.md`
- Modify: `packages/react/tests/excel/scenarios.manifest.json`
- Modify: `packages/react/tests/excel/SCENARIOS.md`
- Modify: `packages/react/tests/excel/rich-text-extension.test.ts`

- [ ] **Step 1: Update scenario wording**

Replace the scenario summary and steps so the behavior is explicitly external React toolbar:

```md
---
id: excel.L3c.rich-text-toolbar-bold-substring
layer: L3c
summary: 注册 cell-kit 后外部 React toolbar 可加粗编辑态子串
tags: [cell-extension, rich-text, editing, toolbar]
status: draft
---

## User Story

作为用户，当我在注册 cell-kit richTextExtension 的表格里编辑单元格并选中部分文字时，我希望表格上方的 React toolbar 能加粗该子串，以获得 Google 表格同款 rich-text 体验。

## Given

- 注册 richTextExtension（codec+renderer+editor）的 Grid
- React toolbar 挂载 rich-text extension item
- 某 text 单元格值为 'abcd'

## When

- 编辑该格
- 在 inline editor 内选中 'bc'
- 点击外部 React toolbar 的 Bold 按钮并提交

## Then

- 'richText' 附件存 [1,3) bold run
- renderer 切段绘制时 'bc' 段 font 含 bold
```

- [ ] **Step 2: Regenerate manifest**

Run:

```bash
bun run --filter @novasheet/mbd mbd manifest
```

Expected:

```text
packages/react/tests/excel/scenarios.manifest.json updated
packages/react/tests/excel/SCENARIOS.md updated
```

- [ ] **Step 3: Update L3c shim to assert exported external-toolbar pieces**

In `packages/react/tests/excel/rich-text-extension.test.ts`, add a failing test after the default-not-bundled test:

```ts
  it('excel.L3c.rich-text-toolbar-bold-substring — cell-kit exposes external toolbar integration points', () => {
    expect(typeof richTextExtension.editor.open).toBe('function')
    const extension = richTextExtension as Record<string, unknown>
    expect(typeof extension['toolbarExtension']).toBe('function')
    expect(typeof extension['ToolbarProvider']).toBe('function')
  })
```

This fails at runtime because `toolbarExtension` and `ToolbarProvider` do not exist, but it must still typecheck. Do not access missing properties directly on `richTextExtension`.

- [ ] **Step 4: Run red check**

Run:

```bash
bun test packages/react/tests/excel/rich-text-extension.test.ts
```

Expected: FAIL with `toolbarExtension` / `ToolbarProvider` undefined.

- [ ] **Step 5: Commit BDD contract**

```bash
git add packages/react/tests/excel/scenarios/L3c-rich-text-toolbar-bold-substring.md packages/react/tests/excel/scenarios.manifest.json packages/react/tests/excel/SCENARIOS.md packages/react/tests/excel/rich-text-extension.test.ts
git commit -m "test(react): 更新 rich-text 外部 toolbar 行为场景"
```

## Task 2: React Toolbar Extension Seam

**Files:**
- Modify: `packages/react/src/features/toolbar/types.ts`
- Modify: `packages/react/src/features/toolbar/components/NovaSheetToolbar.tsx`
- Modify: `packages/react/src/features/toolbar/index.ts`
- Modify: `packages/react/src/index.ts`
- Modify: `packages/react/tests/features/toolbar/NovaSheetToolbar.test.ts`

- [ ] **Step 1: Write failing toolbar extension tests**

Append the following tests inside the existing `describe('NovaSheetToolbar', () => {` block in `NovaSheetToolbar.test.ts`, before the closing `})` for that block:

```ts
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
```

- [ ] **Step 2: Run red check**

Run:

```bash
bun test packages/react/tests/features/toolbar/NovaSheetToolbar.test.ts
```

Expected: FAIL because `extensionItems` / `items` props do not exist and default rendering ignores them.

- [ ] **Step 3: Add public types**

In `packages/react/src/features/toolbar/types.ts`, add `ToolbarRenderContext` and `ToolbarExtensionItem`, and extend props:

```ts
export interface ToolbarRenderContext {
  readonly state?: NovaSheetToolbarState
  readonly disabledActionIds: ReadonlySet<ToolbarActionId>
  readonly closePopover: () => void
}

export interface ToolbarExtensionItem {
  readonly id: string
  readonly separatorBefore?: boolean
  render(ctx: ToolbarRenderContext): ReactNode
}

export interface NovaSheetToolbarProps {
  readonly ariaLabel?: string
  readonly className?: string
  readonly state?: NovaSheetToolbarState
  readonly disabledActionIds?: readonly ToolbarActionId[]
  readonly onAction?: (action: ToolbarAction) => void
  readonly onMenuSearchChange?: (value: string) => void
  readonly items?: readonly ToolbarItem[]
  readonly extensionItems?: readonly ToolbarExtensionItem[]
}
```

- [ ] **Step 4: Render custom items and extension items**

In `NovaSheetToolbar.tsx`:

1. Import `ToolbarExtensionItem` and `ToolbarRenderContext`.
2. Destructure props:

```ts
    items = defaultToolbarItems,
    extensionItems = [],
```

3. Replace `defaultToolbarItems.map` with `items.map`.
4. After built-in item map, render extension items:

```tsx
        {extensionItems.map((item) => (
          <Fragment key={item.id}>
            {item.separatorBefore ? (
              <span aria-hidden className="mx-1.5 h-6 w-px flex-none bg-slate-300" />
            ) : null}
            <span data-toolbar-extension-id={item.id} className="inline-flex flex-none">
              {item.render({
                state,
                disabledActionIds: disabled,
                closePopover: () => setOpenPopoverId(null),
              })}
            </span>
          </Fragment>
        ))}
```

- [ ] **Step 5: Export new types**

In `packages/react/src/features/toolbar/index.ts`, add:

```ts
  ToolbarRenderContext,
  ToolbarExtensionItem,
```

to the exported type list.

In `packages/react/src/index.ts`, add the same type re-exports from `./features/toolbar`.

- [ ] **Step 6: Run green checks**

Run:

```bash
bun test packages/react/tests/features/toolbar/NovaSheetToolbar.test.ts
bun run --filter @novasheet/react typecheck
```

Expected: both PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/react/src/features/toolbar/types.ts packages/react/src/features/toolbar/components/NovaSheetToolbar.tsx packages/react/src/features/toolbar/index.ts packages/react/src/index.ts packages/react/tests/features/toolbar/NovaSheetToolbar.test.ts
git commit -m "feat(react): NovaSheetToolbar 支持扩展 items"
```

## Task 3: Rich-text Editing Session Core

**Files:**
- Create: `packages/cell-kit/src/rich-text/editingSession.ts`
- Test: `packages/cell-kit/tests/rich-text/editingSession.test.ts`

- [ ] **Step 1: Write failing session tests**

Create `packages/cell-kit/tests/rich-text/editingSession.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import {
  createRichTextEditingSession,
  getActiveAttrsFromSelection,
} from '../../src/rich-text/editingSession'

function selectText(root: HTMLElement, start: number, end: number): void {
  const text = root.querySelector('span')!.firstChild!
  const range = document.createRange()
  range.setStart(text, start)
  range.setEnd(text, end)
  const sel = window.getSelection()!
  sel.removeAllRanges()
  sel.addRange(range)
}

describe('rich-text editing session', () => {
  it('saves and restores a non-collapsed selection inside the editor', () => {
    const editable = document.createElement('div')
    editable.innerHTML = '<span>abcd</span>'
    document.body.appendChild(editable)
    selectText(editable, 1, 3)

    const session = createRichTextEditingSession(editable)
    session.saveSelection()
    window.getSelection()!.removeAllRanges()

    expect(session.restoreSelection()).toBe(true)
    expect(window.getSelection()!.toString()).toBe('bc')
  })

  it('toggleInlineStyle wraps restored selection in bold span', () => {
    const editable = document.createElement('div')
    editable.innerHTML = '<span>abcd</span>'
    document.body.appendChild(editable)
    selectText(editable, 1, 3)

    const session = createRichTextEditingSession(editable)
    session.saveSelection()
    window.getSelection()!.removeAllRanges()
    session.toggleInlineStyle('bold')

    expect(editable.textContent).toBe('abcd')
    expect(editable.innerHTML).toContain('font-weight')
  })

  it('setFontSize and setFontFamily apply explicit inline styles', () => {
    const editable = document.createElement('div')
    editable.innerHTML = '<span>abcd</span>'
    document.body.appendChild(editable)
    selectText(editable, 1, 3)

    const session = createRichTextEditingSession(editable)
    session.saveSelection()
    session.setFontSize(18)
    selectText(editable, 1, 3)
    session.saveSelection()
    session.setFontFamily('Arial')

    expect(editable.innerHTML).toContain('font-size')
    expect(editable.innerHTML).toContain('font-family')
  })

  it('getActiveAttrsFromSelection reads nearest inline attrs', () => {
    const editable = document.createElement('div')
    editable.innerHTML = '<span style="font-weight:bold;color:#ff0000;font-size:18px">ab</span>'
    document.body.appendChild(editable)
    selectText(editable, 0, 1)

    expect(getActiveAttrsFromSelection(editable)).toMatchObject({
      bold: true,
      fontSize: 18,
    })
  })
})
```

- [ ] **Step 2: Run red check**

Run:

```bash
bun test packages/cell-kit/tests/rich-text/editingSession.test.ts
```

Expected: FAIL because `editingSession.ts` does not exist.

- [ ] **Step 3: Implement session core**

Create `packages/cell-kit/src/rich-text/editingSession.ts`:

```ts
import type { TextRunAttrs } from './types'
import { isSelectionFullyStyled } from './FloatingFormatToolbar'

export type RichTextInlineStyle = 'bold' | 'italic' | 'underline' | 'strikethrough'

export interface RichTextEditingSession {
  readonly active: boolean
  saveSelection(): void
  restoreSelection(): boolean
  toggleInlineStyle(kind: RichTextInlineStyle): void
  setColor(color: string): void
  setFontSize(size: number): void
  setFontFamily(fontFamily: string): void
  getActiveAttrs(): TextRunAttrs
}

export function createRichTextEditingSession(editable: HTMLElement): RichTextEditingSession {
  let savedRange: Range | null = null

  const restoreSelection = (): boolean => {
    if (!savedRange) return false
    if (!editable.contains(savedRange.commonAncestorContainer)) return false
    const sel = window.getSelection()
    if (!sel) return false
    sel.removeAllRanges()
    sel.addRange(savedRange)
    return true
  }

  const wrap = (apply: (span: HTMLSpanElement) => void): void => {
    restoreSelection()
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    if (range.collapsed) return
    if (!editable.contains(range.commonAncestorContainer)) return
    const span = document.createElement('span')
    apply(span)
    const contents = range.extractContents()
    span.appendChild(contents)
    range.insertNode(span)
    const next = document.createRange()
    next.selectNodeContents(span)
    savedRange = next.cloneRange()
    sel.removeAllRanges()
    sel.addRange(next)
  }

  const toggleInlineStyle = (kind: RichTextInlineStyle): void => {
    restoreSelection()
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    if (range.collapsed) return
    if (!editable.contains(range.commonAncestorContainer)) return

    if (kind === 'bold') {
      const off = isSelectionFullyStyled(range, (el) => el.style.fontWeight === 'bold')
      wrap((s) => { s.style.fontWeight = off ? 'normal' : 'bold' })
      return
    }
    if (kind === 'italic') {
      const off = isSelectionFullyStyled(range, (el) => el.style.fontStyle === 'italic')
      wrap((s) => { s.style.fontStyle = off ? 'normal' : 'italic' })
      return
    }
    if (kind === 'underline') {
      const off = isSelectionFullyStyled(range, (el) => el.style.textDecoration === 'underline')
      wrap((s) => { s.style.textDecoration = off ? 'none' : 'underline' })
      return
    }
    const off = isSelectionFullyStyled(range, (el) => el.style.textDecoration === 'line-through')
    wrap((s) => { s.style.textDecoration = off ? 'none' : 'line-through' })
  }

  return {
    active: true,
    saveSelection: () => {
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0) return
      const range = sel.getRangeAt(0)
      if (range.collapsed) return
      if (!editable.contains(range.commonAncestorContainer)) return
      savedRange = range.cloneRange()
    },
    restoreSelection,
    toggleInlineStyle,
    setColor: (color) => wrap((s) => { s.style.color = color }),
    setFontSize: (size) => wrap((s) => { s.style.fontSize = `${size}px` }),
    setFontFamily: (fontFamily) => wrap((s) => { s.style.fontFamily = fontFamily }),
    getActiveAttrs: () => getActiveAttrsFromSelection(editable),
  }
}

export function getActiveAttrsFromSelection(editable: HTMLElement): TextRunAttrs {
  const sel = window.getSelection()
  const node = sel?.anchorNode ?? null
  if (!node || !editable.contains(node)) return {}
  let current: Node | null = node.nodeType === Node.TEXT_NODE ? node.parentNode : node
  const attrs: Record<string, unknown> = {}
  while (current !== null && current !== editable.parentNode) {
    if (current.nodeType === Node.ELEMENT_NODE) {
      const style = (current as HTMLElement).style
      if (style.fontWeight === 'bold') attrs.bold = true
      if (style.fontStyle === 'italic') attrs.italic = true
      if ((style.textDecoration || style.textDecorationLine).includes('underline')) attrs.underline = true
      if ((style.textDecoration || style.textDecorationLine).includes('line-through')) attrs.strikethrough = true
      if (style.color) attrs.color = style.color
      if (style.fontSize) {
        const size = parseFloat(style.fontSize)
        if (!Number.isNaN(size)) attrs.fontSize = size
      }
      if (style.fontFamily) attrs.fontFamily = style.fontFamily
    }
    if (current === editable) break
    current = current.parentNode
  }
  return attrs as TextRunAttrs
}
```

- [ ] **Step 4: Run green checks**

Run:

```bash
bun test packages/cell-kit/tests/rich-text/editingSession.test.ts
bun run --filter @novasheet/cell-kit typecheck
```

Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cell-kit/src/rich-text/editingSession.ts packages/cell-kit/tests/rich-text/editingSession.test.ts
git commit -m "feat(cell-kit): 新增 rich-text 编辑 session"
```

## Task 4: RichTextToolbarProvider and External Toolbar Items

**Files:**
- Create: `packages/cell-kit/src/rich-text/RichTextToolbarProvider.tsx`
- Create: `packages/cell-kit/src/rich-text/RichTextToolbarExtension.tsx`
- Modify: `packages/cell-kit/src/rich-text/index.ts`
- Test: `packages/cell-kit/tests/rich-text/RichTextToolbarExtension.test.tsx`

- [ ] **Step 1: Write failing provider/toolbar tests**

Create `packages/cell-kit/tests/rich-text/RichTextToolbarExtension.test.tsx`:

```tsx
import { describe, expect, it } from 'bun:test'
import { act, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import {
  RichTextToolbarProvider,
  richTextToolbarExtension,
  useRichTextToolbarController,
} from '../../src/rich-text'
import { createRichTextEditingSession } from '../../src/rich-text/editingSession'

function Harness(): JSX.Element {
  const controller = useRichTextToolbarController()
  const item = richTextToolbarExtension(controller)
  return <>{item.render({ disabledActionIds: new Set(), closePopover: () => undefined })}</>
}

describe('richTextToolbarExtension', () => {
  it('renders disabled controls without active session', async () => {
    const host = document.createElement('div')
    const root = createRoot(host)
    await act(async () => { root.render(<RichTextToolbarProvider><Harness /></RichTextToolbarProvider>) })

    const bold = host.querySelector<HTMLButtonElement>('[data-rich-text-command="bold"]')
    expect(bold).not.toBeNull()
    expect(bold!.disabled).toBe(true)
  })

  it('calls active session from external bold button', async () => {
    const editable = document.createElement('div')
    editable.innerHTML = '<span>abcd</span>'
    document.body.appendChild(editable)
    const text = editable.querySelector('span')!.firstChild!
    const range = document.createRange()
    range.setStart(text, 1)
    range.setEnd(text, 3)
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)

    function ActiveHarness(): JSX.Element {
      const controller = useRichTextToolbarController()
      const item = richTextToolbarExtension(controller)
      const session = createRichTextEditingSession(editable)
      useEffect(() => {
        controller.setSession(session)
        session.saveSelection()
        return () => controller.setSession(null)
      }, [controller, session])
      return <>{item.render({ disabledActionIds: new Set(), closePopover: () => undefined })}</>
    }

    const host = document.createElement('div')
    const root = createRoot(host)
    await act(async () => { root.render(<RichTextToolbarProvider><ActiveHarness /></RichTextToolbarProvider>) })

    const bold = host.querySelector<HTMLButtonElement>('[data-rich-text-command="bold"]')
    await act(async () => { bold!.click() })

    expect(editable.innerHTML).toContain('font-weight')
  })
})
```

- [ ] **Step 2: Run red check**

Run:

```bash
bun test packages/cell-kit/tests/rich-text/RichTextToolbarExtension.test.tsx
```

Expected: FAIL because provider/extension files do not exist.

- [ ] **Step 3: Implement provider**

Create `packages/cell-kit/src/rich-text/RichTextToolbarProvider.tsx`:

```tsx
import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import type { RichTextEditingSession } from './editingSession'

export interface RichTextToolbarController {
  getSession(): RichTextEditingSession | null
  setSession(session: RichTextEditingSession | null): void
  subscribe(listener: () => void): () => void
}

function createController(): RichTextToolbarController {
  let session: RichTextEditingSession | null = null
  const listeners = new Set<() => void>()
  return {
    getSession: () => session,
    setSession: (next) => {
      session = next
      for (const listener of listeners) listener()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

const RichTextToolbarContext = createContext<RichTextToolbarController | null>(null)

export function RichTextToolbarProvider({
  children,
}: {
  readonly children: ReactNode
}): JSX.Element {
  const controller = useMemo(() => createController(), [])
  return (
    <RichTextToolbarContext.Provider value={controller}>
      {children}
    </RichTextToolbarContext.Provider>
  )
}

export function useRichTextToolbarController(): RichTextToolbarController {
  const controller = useContext(RichTextToolbarContext)
  if (!controller) throw new Error('RichTextToolbarProvider is required')
  return controller
}

export function useRichTextSession(): RichTextEditingSession | null {
  const controller = useRichTextToolbarController()
  return useSyncExternalStore(controller.subscribe, controller.getSession, controller.getSession)
}
```

- [ ] **Step 4: Implement extension item factory**

Create `packages/cell-kit/src/rich-text/RichTextToolbarExtension.tsx`:

```tsx
import { useSyncExternalStore } from 'react'
import type { ToolbarExtensionItem } from '@novasheet/react'
import type { RichTextToolbarController } from './RichTextToolbarProvider'

function commandButton(
  label: string,
  command: string,
  disabled: boolean,
  onClick: () => void,
): JSX.Element {
  return (
    <button
      type="button"
      data-rich-text-command={command}
      disabled={disabled}
      title={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {label}
    </button>
  )
}

export function richTextToolbarExtension(
  controller: RichTextToolbarController,
): ToolbarExtensionItem {
  return {
    id: 'rich-text',
    separatorBefore: true,
    render: () => <RichTextToolbarControls controller={controller} />,
  }
}

function RichTextToolbarControls({
  controller,
}: {
  readonly controller: RichTextToolbarController
}): JSX.Element {
  const session = useSyncExternalStore(
    controller.subscribe,
    controller.getSession,
    controller.getSession,
  )
  const disabled = !session
  return (
    <span data-rich-text-toolbar="" role="group" aria-label="富文本">
      {commandButton('B', 'bold', disabled, () => session?.toggleInlineStyle('bold'))}
      {commandButton('I', 'italic', disabled, () => session?.toggleInlineStyle('italic'))}
      {commandButton('U', 'underline', disabled, () => session?.toggleInlineStyle('underline'))}
      {commandButton('S', 'strikethrough', disabled, () => session?.toggleInlineStyle('strikethrough'))}
      {commandButton('A+', 'font-size-inc', disabled, () => {
        const current = session?.getActiveAttrs().fontSize ?? 14
        session?.setFontSize(Math.min(96, current + 2))
      })}
      {commandButton('A-', 'font-size-dec', disabled, () => {
        const current = session?.getActiveAttrs().fontSize ?? 14
        session?.setFontSize(Math.max(8, current - 2))
      })}
    </span>
  )
}
```

- [ ] **Step 5: Export provider and extension**

In `packages/cell-kit/src/rich-text/index.ts`, export:

```ts
export { RichTextToolbarProvider, useRichTextToolbarController, useRichTextSession } from './RichTextToolbarProvider'
export type { RichTextToolbarController } from './RichTextToolbarProvider'
export { richTextToolbarExtension } from './RichTextToolbarExtension'
export { createRichTextEditingSession } from './editingSession'
export type { RichTextEditingSession, RichTextInlineStyle } from './editingSession'
```

Also extend `richTextExtension`:

```ts
export const richTextExtension = {
  codec: richTextCodec,
  renderer: richTextRenderer,
  editor: richTextEditor,
  toolbarExtension: richTextToolbarExtension,
  ToolbarProvider: RichTextToolbarProvider,
} as const
```

- [ ] **Step 6: Run green checks**

Run:

```bash
bun test packages/cell-kit/tests/rich-text/RichTextToolbarExtension.test.tsx packages/react/tests/excel/rich-text-extension.test.ts
bun run --filter @novasheet/cell-kit typecheck
```

Expected: all PASS. The L3c red test from Task 1 should now pass.

- [ ] **Step 7: Commit**

```bash
git add packages/cell-kit/src/rich-text/RichTextToolbarProvider.tsx packages/cell-kit/src/rich-text/RichTextToolbarExtension.tsx packages/cell-kit/src/rich-text/index.ts packages/cell-kit/tests/rich-text/RichTextToolbarExtension.test.tsx packages/react/tests/excel/rich-text-extension.test.ts
git commit -m "feat(cell-kit): 提供 rich-text 外部 toolbar 扩展"
```

## Task 5: RichTextCellEditor Registers Active Session

**Files:**
- Modify: `packages/cell-kit/src/rich-text/RichTextCellEditor.tsx`
- Modify: `packages/cell-kit/src/rich-text/index.ts`
- Modify: `packages/cell-kit/tests/rich-text/RichTextCellEditor.test.tsx`

- [ ] **Step 1: Write failing editor tests**

Append to `RichTextCellEditor.test.tsx`:

```tsx
import { RichTextToolbarProvider, useRichTextToolbarController } from '../../src/rich-text/RichTextToolbarProvider'
import { createRichTextEditor } from '../../src/rich-text/RichTextCellEditor'
import { createRoot } from 'react-dom/client'
```

Add tests:

```tsx
  it('default richTextEditor does not render inline floating toolbar', async () => {
    const { ctx, container } = open()
    await act(async () => { richTextEditor.open(ctx) })

    expect(container.querySelector('[data-novasheet-format-toolbar]')).toBeNull()
  })

  it('createRichTextEditor can opt into inline toolbar for legacy demos', async () => {
    const { ctx, container } = open()
    const editor = createRichTextEditor({ showInlineToolbar: true })
    await act(async () => { editor.open(ctx) })

    expect(container.querySelector('[data-novasheet-format-toolbar]')).not.toBeNull()
  })
```

For session registration, create a provider harness that opens the editor through a wrapper:

```tsx
  it('registers active session with RichTextToolbarProvider while mounted', async () => {
    let captured: ReturnType<typeof useRichTextToolbarController> | null = null

    function Capture(): JSX.Element {
      captured = useRichTextToolbarController()
      return <div />
    }

    const providerHost = document.createElement('div')
    const root = createRoot(providerHost)
    await act(async () => {
      root.render(<RichTextToolbarProvider><Capture /></RichTextToolbarProvider>)
    })

    const { ctx } = open()
    const editor = createRichTextEditor({ getToolbarController: () => captured })
    await act(async () => { editor.open(ctx) })

    expect(captured?.getSession()).not.toBeNull()
  })
```

- [ ] **Step 2: Run red check**

Run:

```bash
bun test packages/cell-kit/tests/rich-text/RichTextCellEditor.test.tsx
```

Expected: FAIL because `createRichTextEditor` and provider wiring do not exist, and default editor still renders inline toolbar.

- [ ] **Step 3: Add editor factory and options**

Modify `RichTextCellEditor.tsx`:

```ts
import { createRichTextEditingSession } from './editingSession'
import type { RichTextToolbarController } from './RichTextToolbarProvider'

export interface RichTextEditorOptions {
  readonly showInlineToolbar?: boolean
  readonly getToolbarController?: () => RichTextToolbarController | null
}
```

Change component props to include options:

```ts
function RichTextCellEditorComponent(
  props: ReactCellEditorProps & { readonly options?: RichTextEditorOptions },
): JSX.Element {
```

Inside component:

```ts
  const { options } = props
```

Register session:

```ts
  useEffect(() => {
    const el = ref.current
    const controller = options?.getToolbarController?.()
    if (!el || !controller) return
    const session = createRichTextEditingSession(el)
    controller.setSession(session)
    const save = (): void => session.saveSelection()
    el.addEventListener('mouseup', save)
    el.addEventListener('keyup', save)
    document.addEventListener('selectionchange', save)
    return () => {
      el.removeEventListener('mouseup', save)
      el.removeEventListener('keyup', save)
      document.removeEventListener('selectionchange', save)
      if (controller.getSession() === session) controller.setSession(null)
    }
  }, [options])
```

Render inline toolbar only when opted in:

```tsx
      {options?.showInlineToolbar ? (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: TOOLBAR_HEIGHT, display: 'flex', alignItems: 'center', background: '#fff', border: '1px solid #e0e0e0', borderRadius: '4px 4px 0 0', boxShadow: '0 -2px 8px rgba(0,0,0,.1)', zIndex: 1 }}>
          <FloatingFormatToolbar editableRef={ref} />
        </div>
      ) : null}
```

Set wrapper padding conditionally:

```tsx
    <div style={{ position: 'relative', paddingTop: options?.showInlineToolbar ? TOOLBAR_HEIGHT : 0 }}>
```

Add factory:

```ts
export function createRichTextEditor(options: RichTextEditorOptions = {}): CellEditor {
  return createReactCellEditor(
    (props) => <RichTextCellEditorComponent {...props} options={options} />,
    { kind: 'inline' },
  )
}

export const richTextEditor: CellEditor = createRichTextEditor()
```

- [ ] **Step 4: Export factory**

In `packages/cell-kit/src/rich-text/index.ts`, export:

```ts
export { richTextEditor, createRichTextEditor } from './RichTextCellEditor'
export type { RichTextEditorOptions } from './RichTextCellEditor'
```

- [ ] **Step 5: Run green checks**

Run:

```bash
bun test packages/cell-kit/tests/rich-text/RichTextCellEditor.test.tsx packages/cell-kit/tests/rich-text/RichTextToolbarExtension.test.tsx
bun run --filter @novasheet/cell-kit typecheck
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/cell-kit/src/rich-text/RichTextCellEditor.tsx packages/cell-kit/src/rich-text/index.ts packages/cell-kit/tests/rich-text/RichTextCellEditor.test.tsx
git commit -m "feat(cell-kit): rich-text editor 注册外部 toolbar session"
```

## Task 6: Storybook External Toolbar Demo

**Files:**
- Modify: `apps/storybook/.storybook/main.ts`
- Modify: `apps/storybook/src/stories/RichText.stories.ts`

- [ ] **Step 1: Update story docs**

Change docs copy to say:

```ts
const RICH_TEXT_DOCS = `
Rich-text cell editing via \`@novasheet/cell-kit\`.

### Google Sheets-like external toolbar

| 注册点 | API | 作用 |
|---|---|---|
| codec | \`cellAttachments: [richTextExtension.codec]\` | 持久化 TextRun[] 至 \`richText\` namespace |
| renderer | \`canvas2dBackend({ cellRenderers: { text: richTextExtension.renderer } })\` | 分段渲染 rich-text runs |
| editor | \`cellEditors: { text: createRichTextEditor({ getToolbarController }) }\` | inline contenteditable editor |
| toolbar | \`NovaSheetToolbar extensionItems={[richTextExtension.toolbarExtension(controller)]}\` | 外部 React toolbar 控制当前 editor 选区 |

### 使用方式

- 双击或 F2 进入 rich-text 编辑。
- 在单元格内选中部分文本。
- 使用表格上方 toolbar 切换 Bold / Italic / Underline / Strike / 字号。
- Enter 提交，Esc 取消，提交后 canvas renderer 显示格式化文本。
`.trim()
```

- [ ] **Step 2: Render external React toolbar + grid**

Add the missing source alias in `apps/storybook/.storybook/main.ts`, because Storybook build resolves workspace package exports to `packages/cell-kit/dist` unless aliased:

```ts
          '@novasheet/cell-kit': fileURLToPath(
            new URL('../../../packages/cell-kit/src/index.ts', import.meta.url),
          ),
```

Modify story imports:

```ts
import React from 'react'
import { createRoot } from 'react-dom/client'
import { NovaSheetToolbar } from '@novasheet/react'
import {
  createRichTextEditor,
  richTextExtension,
  RichTextToolbarProvider,
  useRichTextToolbarController,
} from '@novasheet/cell-kit'
```

Use a React wrapper:

```tsx
function RichTextStoryApp(): JSX.Element {
  const controller = useRichTextToolbarController()
  const gridRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    const host = gridRef.current
    if (!host) return
    const schema = basicTextSchema()
    const data = new InMemoryDataSource({ schema, rows: generateRows(schema, 30) })
    const grid = new Grid(host, {
      data,
      cellAttachments: [richTextExtension.codec],
      cellEditors: { text: createRichTextEditor({ getToolbarController: () => controller }) },
      backend: canvas2dBackend({ cellRenderers: { text: richTextExtension.renderer } }),
    })
    ;(host as HTMLElement & { __grid?: Grid }).__grid = grid
    return () => grid.destroy()
  }, [controller])

  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', height: '100%', minHeight: 0 }}>
      <NovaSheetToolbar extensionItems={[richTextExtension.toolbarExtension(controller)]} />
      <div ref={gridRef} style={{ position: 'relative', minHeight: 0 }} />
    </div>
  )
}
```

In story `render`, mount the wrapper:

```ts
  render: () => {
    const host = document.createElement('div')
    host.style.width = '100%'
    host.style.height = '100%'
    host.style.minHeight = '0'
    const root = createRoot(host)
    root.render(
      <RichTextToolbarProvider>
        <RichTextStoryApp />
      </RichTextToolbarProvider>,
    )
    ;(host as HTMLElement & { __root?: ReturnType<typeof createRoot> }).__root = root
    return host
  },
```

- [ ] **Step 3: Run storybook build check**

Run:

```bash
bun run build-storybook
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/storybook/src/stories/RichText.stories.ts
git commit -m "docs(storybook): 展示 rich-text 外部 React toolbar"
```

## Task 7: Full Verification

**Files:**
- No source edits expected unless verification finds failures.

- [ ] **Step 1: Run targeted tests**

Run:

```bash
bun test packages/react/tests/features/toolbar/NovaSheetToolbar.test.ts packages/cell-kit/tests/rich-text/editingSession.test.ts packages/cell-kit/tests/rich-text/RichTextToolbarExtension.test.tsx packages/cell-kit/tests/rich-text/RichTextCellEditor.test.tsx packages/react/tests/excel/rich-text-extension.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run package checks**

Run:

```bash
bun test packages/react/ packages/cell-kit/
bun run --filter '*' typecheck
```

Expected: PASS.

- [ ] **Step 3: Run repository gates**

Run:

```bash
bun run lint
bun test
bun run --filter @novasheet/web build && bun run --filter @novasheet/canvas2d build && bun run --filter @novasheet/core build
```

Expected: all PASS. If `@novasheet/web` is not a workspace in this branch, STOP+ASK before substituting package names because AGENTS.md names the gate explicitly.

- [ ] **Step 4: Commit any verification fixes**

Only if fixes were required:

```bash
git add <changed-files>
git commit -m "fix(cell-kit): 修正 rich-text 外部 toolbar 验证问题"
```
