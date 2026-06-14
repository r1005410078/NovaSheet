# rich-text Cleanup Batch（F1–F9）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 收口 rich-text 五子阶段（A/B/C-display/C-edit-UI/C-edit-data）遗留的 9 项 follow-up（路线图 §7.1 F1–F9），把 §7 判据②（注册后改字号/重开保持/toggle 取消）补到全 ☑，并清理 cut 语义、storybook、测试 import、文档不对称。

**Architecture:** 四类收口——① **editor 缝对称**：补 `getAttachment` 读通道（对称 `setAttachment`），让编辑器既存 runs 回填（F1）；② **toolbar 完善**：toggle-off + 字号按钮（F2/F5）；③ **选区加粗接线**：补 `Grid.getCellText` facade + cell-kit adapter（F3）；④ **数据语义/housekeeping**：cut 清源附件（F9）、storybook story（F4）、测试改包名 import（F7）、namespace 不对称文档（F8）。纯收口，无新架构。

**Tech Stack:** TypeScript（strict + `noUncheckedIndexedAccess` + `verbatimModuleSyntax`）、React 18、`bun:test` + happy-dom、`@storybook/html`。

**前置:** rich-text 五子阶段全 ship（1441 tests 绿）。路线图 [`2026-06-13-novasheet-rich-text-roadmap.md`](./2026-06-13-novasheet-rich-text-roadmap.md) §7.1 F1–F9。

**方法论:** 内环 TDD（serialize/toolbar/adapter happy-dom 测试 + core 单元）。F4 storybook 为视觉 story（不强求 test，但须 `bun run build-storybook` 不破）。
**plan-risk（须 STOP+ASK）:**
- F2 toggle-off 的「选区是否已全 bold」判定依赖遍历选区 inline style；happy-dom 对 Range/DOM 遍历支持若不足以判定，STOP+ASK（降级或换策略）。
- F3 `Grid.getCellText` raw 坐标读值——若 raw col→fieldId 映射或 DataSource 读取在 facade 层不可得，STOP+ASK。
- F9 clearRange 清 attachment 须 bundle 进 **clearRange undo**（一次 undo 全撤值+附件）；若导致多条 undo，STOP+ASK。

---

## File Structure

| 文件 | 责任 | 动作 | FU |
| --- | --- | --- | --- |
| `packages/core/src/dom/interaction/CellEditorContract.ts` | `CellEditorOpenContext.getAttachment?` | Modify | F1 |
| `packages/core/src/dom/runtime/GridRuntime.ts` | 注入 `getAttachment`（view→raw） | Modify | F1 |
| `packages/cell-kit/src/rich-text/RichTextCellEditor.tsx` | 既存 runs 回填初值 | Modify | F1 |
| `packages/cell-kit/src/rich-text/FloatingFormatToolbar.tsx` | toggle-off + 字号 −/+ 按钮 | Modify | F2/F5 |
| `packages/core/src/Grid.ts` | `getCellText(rawRow, rawCol)` facade | Modify | F3 |
| `packages/core/src/dom/runtime/GridRuntime.ts` / `GridController` | `getCellText` 委派 | Modify | F3 |
| `packages/cell-kit/src/rich-text/selectionBold.ts` | `createGridAccess(grid)` adapter + `applySelectionBold(grid)` | Modify | F3 |
| `packages/core/src/features/edit/EditController.ts` | clearRange 清 attachment + 快照进 undo | Modify | F9 |
| `packages/core/src/kernel/undo/UndoCommand.ts` | clearRange 命令 attachment 字段 | Modify | F9 |
| `packages/core/src/features/edit/CellUndoHandler.ts`（或 clearRange undo 分支） | 恢复 attachment | Modify | F9 |
| `apps/storybook/package.json` + `src/stories/RichText.stories.ts` | cell-kit dep + 注册示例 story | Create/Modify | F4 |
| `packages/react/tests/excel/rich-text-extension.test.ts` | import 改 `@novasheet/cell-kit` | Modify | F7 |
| `packages/core/src/features/fill/FillStylePropagator.ts`（注释）| namespace 不对称说明 | Modify | F8 |

---

## Task 1: F1 — editor `getAttachment` 读通道 + 既存 runs 回填

**Files:**
- Modify: `packages/core/src/dom/interaction/CellEditorContract.ts`
- Modify: `packages/core/src/dom/runtime/GridRuntime.ts`
- Modify: `packages/cell-kit/src/rich-text/RichTextCellEditor.tsx`
- Test: `packages/core/tests/dom/runtime/custom-editor-attachment.test.ts`（追加）+ `packages/cell-kit/tests/rich-text/RichTextCellEditor.test.tsx`（追加）

> 对称 `setAttachment`（C-edit-UI T1）：editor open ctx 加 `getAttachment(namespace): unknown`（绑定到编辑单元格，内部 view→raw）。编辑器初值回填读既存 runs。

- [ ] **Step 1: 写失败测试（core 缝）**

`custom-editor-attachment.test.ts` 追加：验证 open ctx 的 `getAttachment('demo')` 读到编辑格已存附件（经 view→raw）。镜像既有 `setAttachment` 测试。

```ts
it('open ctx.getAttachment reads attachment at editing cell raw coords', () => {
  // engine 在 raw (1,0) 预置 attachment 'demo' = { note: 'z' }
  // openEditorAt view (1,0) → captured ctx.getAttachment
  // expect(captured!('demo')).toEqual({ note: 'z' })
})
```

- [ ] **Step 2: 跑红 + 实现 core 缝**

`CellEditorContract.ts`——`CellEditorOpenContext` 紧挨 `setAttachment` 加：
```ts
  /** 读本单元格附件（namespace 由 cellAttachments 注册）；内部 view→raw。rich-text 回填既存 runs 用。 */
  getAttachment?(namespace: string): unknown
```
`GridRuntime.ts` 的 `openCustomCellEditor` 的 `editor.open({...})` 加：
```ts
      getAttachment: (namespace) =>
        this.engine.getCellAttachment(namespace, this.engine.viewRowToRaw(cell.rowIndex), this.engine.viewColToRaw(cell.colIndex)),
```
**mock 同步**：实现 `CellEditorOpenContext` 的 mock/测试若有 inline ctx，按需补（多数测试构造 ctx 字面量，加可选字段不破）。

- [ ] **Step 3: 写失败测试（cell-kit 回填）**

`RichTextCellEditor.test.tsx` 追加：ctx 提供 `getAttachment: () => [{start:1,end:3,attrs:{bold:true}}]`，open 后 contenteditable 初值含 `font-weight:bold` 的 'bc' span。

- [ ] **Step 4: 跑红 + 实现回填**

`RichTextCellEditor.tsx` 的 `useEffect` 初值回填改为读既存 runs：
```ts
    const text = value == null ? '' : String(value)
    const runs = (props.getAttachment?.('richText') as RichTextValue | undefined) ?? []
    el.innerHTML = richTextToHtml(text, runs)
```
（`props.getAttachment` 经 `ReactCellEditorProps extends CellEditorOpenContext` 继承，spread 流入。）

- [ ] **Step 5: 跑绿 + 回归**

```bash
bun test packages/core/ packages/cell-kit/
bun run --filter '*' typecheck
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/dom/interaction/CellEditorContract.ts packages/core/src/dom/runtime/GridRuntime.ts packages/cell-kit/src/rich-text/RichTextCellEditor.tsx packages/core/tests/dom/runtime/custom-editor-attachment.test.ts packages/cell-kit/tests/rich-text/RichTextCellEditor.test.tsx
git commit -m "feat(core): editor 缝加 getAttachment 读通道 + cell-kit 既存 runs 回填（F1）

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: F2 + F5 — toolbar toggle-off + 字号 −/+ 按钮

**Files:**
- Modify: `packages/cell-kit/src/rich-text/FloatingFormatToolbar.tsx`
- Test: `packages/cell-kit/tests/rich-text/FloatingFormatToolbar.test.tsx`（追加）

> F2 toggle-off：选区已全 bold（/italic/...）再点 → 移除该样式。F5：字号 −/+ 按钮，对选区包 `font-size` span（步进 ±2px，clamp [8,96]）。

- [ ] **Step 1: 写失败测试**

```tsx
it('Bold toggles OFF when selection already fully bold', async () => {
  // editable.innerHTML = '<span style="font-weight:bold">bc</span>'，选中 'bc'
  // 点 Bold → 'bc' 不再含 font-weight:bold（移除）
})
it('font-size +/- wraps selection with font-size span', async () => {
  // 选中 'bc' → 点 A+ → innerHTML 含 'font-size:' span
})
```

- [ ] **Step 2: 跑红 + 实现**

`FloatingFormatToolbar.tsx`：
- 加 `isSelectionFullyStyled(range, predicate)` helper：遍历 range 内 text node，每个的 ancestor 链查 inline style（`el.style.fontWeight==='bold'` 等）；全满足返 true。
- Bold 点击改为：先判 `isSelectionFullyStyled(range, hasBold)`，若是 → `wrap((s) => s.style.fontWeight = 'normal')`（serialize 视 'normal' 为非 bold），否则 → `wrap((s) => s.style.fontWeight = 'bold')`。I/U/strike 同模式。
- 加字号按钮 `data-cmd="font-size-inc"`/`"font-size-dec"`：`wrap((s) => s.style.fontSize = '${next}px')`，next 由当前选区字号 ±2 clamp（当前字号取选区 anchor 的 inline fontSize，缺省 theme 默认 14——用常量 `DEFAULT_FONT_SIZE=14`）。

> **plan-risk:** `isSelectionFullyStyled` 遍历依赖 happy-dom 的 Range/DOM API。若 happy-dom 无法可靠遍历 range 内节点，STOP+ASK——可降级为「读 anchorNode 父链 inline style」单点判定，或在测试里直接构造已知 DOM 验 helper（不经 Range）。

- [ ] **Step 3: 跑绿**

```bash
bun test packages/cell-kit/tests/rich-text/FloatingFormatToolbar.test.tsx
bun run --filter @novasheet/cell-kit typecheck
```

- [ ] **Step 4: Commit**

```bash
git add packages/cell-kit/src/rich-text/FloatingFormatToolbar.tsx packages/cell-kit/tests/rich-text/FloatingFormatToolbar.test.tsx
git commit -m "feat(cell-kit): toolbar toggle-off + 字号 −/+ 按钮（F2/F5）

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: F3 — `Grid.getCellText` facade + selection-bold 接线

**Files:**
- Modify: `packages/core/src/Grid.ts`、`packages/core/src/dom/runtime/GridRuntime.ts`、`packages/core/src/dom/runtime/GridController.ts`（接口）
- Modify: `packages/cell-kit/src/rich-text/selectionBold.ts`
- Test: `packages/core/tests/...`（getCellText）+ `packages/cell-kit/tests/rich-text/selectionBold.test.ts`（追加 adapter）

> 补 `Grid.getCellText(rawRow, rawCol): string`（selection-bold adapter 读格文本）+ cell-kit `createGridAccess(grid)` 把 Grid 适配成 `RichTextGridAccess` + `applySelectionBold(grid)`（读选区 raw range，逐格 applyBoldToRange）。

- [ ] **Step 1: 写失败测试（core facade）**

```ts
// mounted Grid，raw (0,0) 值 'abc' → expect(grid.getCellText(0,0)).toBe('abc')
// 空格 → ''
```
按既有 Grid facade 测试 setup。

- [ ] **Step 2: 跑红 + 实现 facade**

`Grid.ts` 加：
```ts
  /** 读 raw cell 文本（String(value)，空为 ''）；rich-text 选区加粗 adapter 用。 */
  getCellText(rawRow: number, rawCol: number): string {
    return this.delegate.getCellText(rawRow, rawCol)
  }
```
`GridController` 接口 + `GridRuntime` 实现：`getCellText(rawRow, rawCol)` —— 经 `engine.getData()` 取 schema.fields[rawCol].id → `data.getCell(rawRow, fieldId)` → `value == null ? '' : String(value)`。先 `grep -n "getData\|getCell\|GridController" packages/core/src/dom/runtime/GridRuntime.ts` 看既有读 data 模式。

> **plan-risk:** 若 raw col → fieldId 映射或 `data.getCell` 在 runtime 层须经 view 转换，按既有 `clearRange`（EditController 用 `data.getCell(r, field.id)`）模式处理；坐标空间不清则 STOP+ASK。

- [ ] **Step 3: 写失败测试（adapter）+ 实现**

`selectionBold.ts` 追加 `createGridAccess` + `applySelectionBold`：

```ts
import type { RichTextValue } from './types'
// ... 既有 RichTextGridAccess/applyBoldToRange/RawRange ...

/** 把 Grid facade 适配成 RichTextGridAccess（raw 坐标）。 */
export interface RichTextGrid {
  getCellText(rawRow: number, rawCol: number): string
  getCellAttachment(namespace: string, rawRow: number, rawCol: number): unknown
  setCellAttachment(namespace: string, rawRow: number, rawCol: number, data: unknown): boolean
  getSelection(): { selectedRange: { startRow: number; endRow: number; startCol: number; endCol: number } | null }
}

export function createGridAccess(grid: RichTextGrid): RichTextGridAccess {
  return {
    getCellText: (r, c) => grid.getCellText(r, c),
    getRichText: (r, c) => grid.getCellAttachment('richText', r, c) as RichTextValue | undefined,
    setRichText: (r, c, runs) => grid.setCellAttachment('richText', r, c, runs),
  }
}

/** 对当前选区应用逐格 full-span bold（selection 为 view===raw 的简化；sort/filter 下由调用方保证）。 */
export function applySelectionBold(grid: RichTextGrid): void {
  const range = grid.getSelection().selectedRange
  if (!range) return
  applyBoldToRange(createGridAccess(grid), range)
}
```

测试 `selectionBold.test.ts` 追加：fake RichTextGrid（selectedRange + getCellText + get/setCellAttachment）验证 `applySelectionBold` 逐格写 bold。

> 注：`applySelectionBold` 用 selection 的 view range 直接当 raw（view===raw 简化）。**sort/filter 下 view≠raw 的精确映射留更后续**（本批不做 view→raw 范围转换——记 `TODO(rich-text-selection-bold-viewraw)`）；adapter + facade 已就位，组合根/storybook 可用。

- [ ] **Step 4: 跑绿**

```bash
bun test packages/core/ packages/cell-kit/
bun run --filter '*' typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/Grid.ts packages/core/src/dom/runtime packages/cell-kit/src/rich-text/selectionBold.ts packages/core/tests packages/cell-kit/tests/rich-text/selectionBold.test.ts
git commit -m "feat(core): Grid.getCellText facade + cell-kit selection-bold adapter 接线（F3）

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: F9 — clearRange 清 attachment（bundle clearRange undo）

**Files:**
- Modify: `packages/core/src/features/edit/EditController.ts`
- Modify: `packages/core/src/kernel/undo/UndoCommand.ts`（clearRange 命令 attachment 字段）
- Modify: `packages/core/src/features/edit/CellUndoHandler.ts`（或 clearRange undo 分支）
- Test: `packages/core/tests/...`（clearRange 清附件 + undo）

> cut 经 `clearRange` 清值但不清 attachment（剪切=复制残留孤儿）。修法：`clearRange` 同时清选区 attachment + 快照 bundle 进 clearRange undo（一次 undo 全撤）。Delete 键也走 clearRange——删除单元格同时清 rich-text，语义正确。

- [ ] **Step 1: 探查 clearRange undo 恢复**

```bash
grep -n "kind: 'clearRange'\|clearRange\|kind === 'clearRange'" packages/core/src/features/edit/EditController.ts packages/core/src/features/edit/CellUndoHandler.ts packages/core/src/kernel/undo/UndoCommand.ts
grep -n "attachmentStore\|EditControllerContext\|ctx\." packages/core/src/features/edit/EditController.ts | head
```
看 clearRange undo **恢复**在哪（CellUndoHandler 的 clearRange 分支？）+ EditController 能否拿到 attachmentStore（看 ctx 注入）。

- [ ] **Step 2: 写失败测试**

```ts
// raw (0,0) 值 'x' + attachment 'demo'={v:1}；clearRange 选区含 (0,0)
// → 值清空 + getCellAttachment('demo',0,0) === undefined
// undo → 值恢复 'x' + attachment 恢复 {v:1}（一次 undo）
```

- [ ] **Step 3: 跑红 + 实现**

- `UndoCommand.ts`——`kind:'clearRange'` 命令加 `attachmentBefore?/attachmentAfter?: CellAttachmentSnapshot`。
- `EditController.clearRange`：清值后，`attachmentBefore = attachmentStore.snapshot()` → 遍历选区 raw 格、全 namespace `attachmentStore.set(ns, raw, undefined)` 清除 → `attachmentAfter = snapshot()`，填进 `pushUndo({ kind:'clearRange', range, before, attachmentBefore, attachmentAfter })`。需 EditController ctx 加 attachmentStore 访问（namespaces() + snapshot/set）——看 ctx 注入，加最小能力。坐标：clearRange 已用 `viewRowToRaw`（见既有实现），attachment 同 raw。
- clearRange undo 恢复分支（Step 1 定位）：`if (cmd.attachmentBefore) restoreAttachments(cmd.attachmentBefore)`（undo）/ `attachmentAfter`（redo）。注入 `restoreAttachments`（复用 Phase A）。

> **plan-risk:** attachment 清除须 bundle 进 **clearRange undo**（与值同命令）；若各自入栈 STOP+ASK。

- [ ] **Step 4: 跑绿 + 回归**

```bash
bun test packages/core/
bun run --filter '*' typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/features/edit packages/core/src/kernel/undo/UndoCommand.ts packages/core/tests
git commit -m "feat(core): clearRange 清 attachment（bundle undo）——cut/Delete 同时清 rich-text（F9）

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: F4 — storybook rich-text 注册示例 story

**Files:**
- Modify: `apps/storybook/package.json`（加 `@novasheet/cell-kit` dep）
- Create: `apps/storybook/src/stories/RichText.stories.ts`
- 可能 Modify: `apps/storybook/src/grid-host.ts`（若不支持 cellEditors/cellAttachments 透传）

> 注册三点（cellAttachments + cellEditors + cellRenderers）的可运行 story，演示选中子串加粗。

- [ ] **Step 1: 探查 grid-host + Grid 注册形态**

```bash
sed -n '1,60p' apps/storybook/src/grid-host.ts
grep -n "cellEditors\|cellRenderers\|cellAttachments\|backend\|new Grid\|canvas2dBackend" apps/storybook/src/grid-host.ts
grep -n "richTextExtension" packages/cell-kit/src/rich-text/index.ts
```
确认 `createGridHost` 是否透传 `cellEditors`/`cellAttachments`/`backend(cellRenderers)`；若不支持，story 内直接 `new Grid(container, {...})` 或扩展 grid-host options。

- [ ] **Step 2: 加 cell-kit dep + story**

`apps/storybook/package.json` `dependencies` 加 `"@novasheet/cell-kit": "workspace:*"`，`bun install`。

`RichText.stories.ts`（参既有 story 结构 + `docsMeta`/`docsStory`）：

```ts
import type { Meta, StoryObj } from '@storybook/html'
import { InMemoryDataSource } from '@novasheet/core'
import { canvas2dBackend } from '@novasheet/canvas2d'
import { richTextExtension } from '@novasheet/cell-kit'
import { createGridHost } from '../grid-host'
import { basicTextSchema, generateRows } from '../mock-data'
import { docsMeta, docsStory } from '../story-docs'

const meta: Meta = {
  title: 'Cell-Kit/RichText',
  parameters: { layout: 'centered' },
  ...docsMeta('@novasheet/cell-kit rich-text：注册 codec+renderer+editor 后，双击单元格选中子串可加粗/斜/下划/删除线/改色，提交后渲染保持。默认 Grid 不带——须显式注册。'),
}
export default meta
type Story = StoryObj

export const Registered: Story = {
  name: 'Registered rich-text',
  render: () => {
    const schema = basicTextSchema()
    const data = new InMemoryDataSource({ schema, rows: generateRows(schema, 30) })
    return createGridHost({
      data,
      cellAttachments: [richTextExtension.codec],
      cellEditors: { text: richTextExtension.editor },
      backend: canvas2dBackend({ cellRenderers: { text: richTextExtension.renderer } }),
    })
  },
}
```

> 若 `createGridHost` 签名不接这些字段，按 Step 1 结果：① 扩展 `createGridHost` options 透传，或 ② story 内直接构造 Grid（参 grid-host 内部 `new Grid` 写法）。**保持与既有 story 风格一致**。

- [ ] **Step 3: 验证 storybook 构建不破**

```bash
bun run --filter @novasheet/storybook typecheck
bun run build-storybook 2>&1 | tail -5    # 不报错
```
（不强求 story 有自动化 test；视觉 story 以构建通过为准。）

- [ ] **Step 4: Commit**

```bash
git add apps/storybook/package.json apps/storybook/src/stories/RichText.stories.ts apps/storybook/src/grid-host.ts bun.lock
git commit -m "docs(storybook): rich-text 注册示例 story（cell-kit 三注册点）（F4）

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 6: F7 + F8 housekeeping + 全量 gates + 里程碑

**Files:**
- Modify: `packages/react/tests/excel/rich-text-extension.test.ts`（F7）
- Modify: `packages/cell-kit/package.json`（若需）+ `packages/core/src/features/fill/FillStylePropagator.ts`（F8 注释）

- [ ] **Step 1: F7 — Excel L3 测试改包名 import**

`grep -n "cell-kit/src" packages/react/tests/excel/rich-text-extension.test.ts`——把 `../../../cell-kit/src/rich-text/...` 改为 `@novasheet/cell-kit`。确认 react devDeps 含 `@novasheet/cell-kit`（若无则加 + `bun install`）。跑 `bun test packages/react/tests/excel/rich-text-extension.test.ts` 确认仍绿（包名解析到 dist——若需先 build cell-kit，story/coverage 不变即可；若 dist 解析失败，保留 src import 并改注释说明权衡，报告里注明）。

> **F7 权衡:** 包名 import 解析到 `dist`（需 cell-kit 已 build）。若 CI test 顺序不保证 cell-kit 先 build，包名 import 会失败——此时**保留 src import**，F7 改为「在 README/注释记权衡」而非强改。按实际解析结果决定，报告里说明。

- [ ] **Step 2: F8 — namespace 不对称注释**

`FillStylePropagator.ts` 的 `tileFillAttachment` 上方 TSDoc 补一句：
```ts
  // 注：fill 遍历 attachmentStore.namespaces()（内存全 ns，平铺无需 serialize）；clipboard 用
  // codecRegistry（仅可序列化 ns）。fill 可携无 codec 附件、clipboard 不行——刻意不对称（F8）。
```

- [ ] **Step 3: 全量四门**

```bash
bun test
bun run --filter '*' typecheck
bun run lint
bun run --filter @novasheet/core build && bun run --filter @novasheet/canvas2d build && bun run --filter @novasheet/react build && bun run --filter @novasheet/cell-kit build
grep -rn "TextRun\|fontWeight\|strikethrough" packages/core/src/   # 须空
```

- [ ] **Step 4: Commit + 里程碑收尾**

```bash
git add packages/react/tests packages/core/src/features/fill/FillStylePropagator.ts
git commit -m "chore(rich-text): Excel L3 测试包名 import + fill/clipboard namespace 不对称注释（F7/F8）

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

dispatch code-reviewer（即便全绿）。更新路线图 §7.1：F1–F9 全 ☑、§7 判据② ☑、rich-text feature 端到端 Done。

---

## Self-Review（plan 对 roadmap §7.1 F1–F9）

**FU 覆盖:**
- F1 既存 runs 回填 → Task 1（getAttachment 缝 + 回填）。✓
- F2 toggle-off → Task 2。✓
- F3 选区加粗接线（Grid.getCellText）→ Task 3。✓（view→raw 范围精确映射留 `TODO`，adapter/facade 就位）
- F4 storybook → Task 5。✓
- F5 字号按钮 → Task 2。✓
- F7 测试包名 import → Task 6（含权衡降级）。✓
- F8 namespace 不对称文档 → Task 6。✓
- F9 cut 清源附件 → Task 4（clearRange 清 attachment bundle undo）。✓

**plan-risk 已标:** F2 happy-dom range 遍历、F3 raw col→fieldId、F9 undo bundle——三处 STOP+ASK。

**Placeholder 扫描:** Task 1/3/4 部分测试为意图骨架（依赖既有 facade/undo setup），明确要求实现者照既有模式补全 + 完整断言意图——非占位。其余步含完整代码。

**类型一致性:** `getAttachment`（缝，对称 setAttachment）、`getCellText`（facade）、`createGridAccess`/`applySelectionBold`/`RichTextGrid`（adapter）、clearRange/fill/paste UndoCommand attachment 字段、`restoreAttachments`（复用 Phase A）跨 task 命名统一。

**残留显式 deferred（本批不做，记 TODO，非 §7 阻断）:**
- 选区加粗 view→raw 范围精确映射（sort/filter 下）——`TODO(rich-text-selection-bold-viewraw)`。
- range 级整列加粗单 layer（spec §2 非目标，roadmap §6 deferred）。
