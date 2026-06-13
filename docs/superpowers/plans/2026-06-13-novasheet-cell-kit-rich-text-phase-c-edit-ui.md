# cell-kit rich-text 编辑 UI 半（Phase C-edit-UI）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 rich-text 可**编辑**——补 editor 缝（提交时写 value + runs 附件）、实现 `RichTextCellEditor`（contenteditable，runs↔DOM 双向序列化）、`FloatingFormatToolbar`（Selection API toggle，复用 react color picker）、选区加粗（逐格 full-span run），装配进 `richTextExtension`，并以 Excel L3 BDD 罩端到端「选中子串加粗→提交→重开保持」+「默认不带」。

**Architecture:** 编辑能力分三层缝补 + 组装：① **core editor 缝**——`CellEditorOpenContext` 加 `setAttachment` 写通道（GridRuntime view→raw 映射后调 `engine.setCellAttachment`）；② **react 缝**——导出既有 `CustomColorPicker` 原语供复用；③ **cell-kit**——runs↔DOM 纯序列化（happy-dom TDD）+ `RichTextCellEditor.tsx` + `FloatingFormatToolbar.tsx` + 选区加粗 helper。最易错的 contenteditable↔runs 抽成 `serialize.ts` 纯函数独立 TDD。cell-kit 本 plan 起加 `react` peer 依赖。

**Tech Stack:** TypeScript（strict + `noUncheckedIndexedAccess` + `verbatimModuleSyntax`）、React 18、`bun:test` + happy-dom（root bunfig 已 preload）、`@novasheet/mbd`（场景 validate/manifest）。

**前置:** C-display 已 ship（types/normalize/codec/renderer/extension display 半）。spec [`2026-06-13-novasheet-cell-kit-rich-text-design.md`](../specs/2026-06-13-novasheet-cell-kit-rich-text-design.md) §8/§9/§11.2。路线图 [`2026-06-13-novasheet-rich-text-roadmap.md`](./2026-06-13-novasheet-rich-text-roadmap.md) §4.2（CE1–CE3, CE6 editor 部分, CE7）。**fill/clipboard（CE4/CE5, D1/D2）不在本 plan**——留 C-edit-data plan。

**方法论（BDD 外环 × TDD 内环）:**
- **BDD gate（Task 7 先行红）:** Excel L3 场景 `excel.L3.rich-text-toolbar-bold-substring` + `excel.L3.rich-text-default-not-bundled` 定稿（MD + manifest），作外环契约。但**因被测对象（RichTextCellEditor）在 cell-kit、Excel 测试在 react**，BDD 场景描述「集成方注册 cell-kit 后的可观测行为」；具体测试在 cell-kit/react 落点见 Task 7。
- 内环 TDD：serialize 纯函数 + 组件 happy-dom 测试。
- **plan-risk（须 STOP+ASK）:**
  - Task 3 contenteditable `domToRichText` 的属性提取依赖 happy-dom 对 inline `style`/`fontWeight` 的解析——若 happy-dom 不暴露某 style 字段（如 `fontWeight: 'bold'` vs `'700'`），导致测试期望无法满足，STOP+ASK，别静默改期望。
  - Task 5 选区加粗的 Grid facade 读取（selection + cell value）若缺公开 API，STOP——补缝再接，别走私有通道（spec ADR-C）。

---

## 设计要点（贯穿全 plan）

**editor 缝扩展**（core，spec §11.2「commit(text) + setCellAttachment(runs)」）：

```ts
// CellEditorOpenContext 新增（紧挨 commit）：
/** 写本单元格附件（namespace 由 cellAttachments 注册）；内部 view→raw 映射。rich-text 提交 runs 用。 */
setAttachment?(namespace: string, data: unknown): boolean
```

GridRuntime 在 `openCustomCellEditor` 注入：`setAttachment: (ns, data) => this.engine.setCellAttachment(ns, this.engine.viewRowToRaw(cell.rowIndex), this.engine.viewColToRaw(cell.colIndex), data)`（`viewRowToRaw`/`viewColToRaw` 须为 engine 公开方法——Task 1 确认/补）。

**runs↔DOM 序列化**（cell-kit `serialize.ts`，纯函数，happy-dom TDD）：
- `richTextToHtml(text, runs)`：normalized runs → `<span style>` 串（含 escape）；`\n` → `<br>`。供编辑器初值回填。
- `htmlElementToRichText(root)`：遍历 contenteditable DOM → `{ text, runs }`（normalize 收尾）。`<br>`→`\n`（+1 offset）；inline style → `TextRunAttrs`。

**toolbar 作用域**：编辑态 → 作用于 DOM Selection（包/拆 span）；非编辑态范围选区 → 逐格 full-span run（spec §9）。

---

## File Structure

| 文件 | 责任 | 动作 |
| --- | --- | --- |
| `packages/core/src/dom/interaction/CellEditorContract.ts` | `CellEditorOpenContext.setAttachment?` | Modify |
| `packages/core/src/dom/runtime/GridRuntime.ts` | `openCustomCellEditor` 注入 `setAttachment`（view→raw） | Modify |
| `packages/core/src/engine/GridEngine.ts` + `DefaultGridEngine.ts` | 暴露 `viewRowToRaw`/`viewColToRaw`（若未公开） | Modify |
| `packages/react/src/index.ts` | 导出 `CustomColorPicker` | Modify |
| `packages/react/src/features/toolbar/components/index`（或就近） | 确保 `CustomColorPicker` 可从包根达 | Modify |
| `packages/cell-kit/package.json` | 加 `react` peer + devDeps（react/react-dom）；jsx | Modify |
| `packages/cell-kit/tsconfig.json` | `jsx: react-jsx` | Modify |
| `packages/cell-kit/src/rich-text/serialize.ts` | `richTextToHtml` + `htmlElementToRichText` | Create |
| `packages/cell-kit/src/rich-text/RichTextCellEditor.tsx` | contenteditable 编辑器组件 + `richTextEditor`（CellEditor） | Create |
| `packages/cell-kit/src/rich-text/FloatingFormatToolbar.tsx` | 浮动工具栏（Selection toggle + color picker） | Create |
| `packages/cell-kit/src/rich-text/selectionBold.ts` | 选区逐格 full-span run helper | Create |
| `packages/cell-kit/src/rich-text/index.ts` | `richTextExtension` 补 `editor` | Modify |
| `packages/cell-kit/tests/rich-text/*.test.ts(x)` | serialize/editor/toolbar/selectionBold TDD | Create |
| `packages/react/tests/excel/scenarios/L3-rich-text-*.md` | Excel L3 BDD 场景 | Create |
| `packages/react/tests/excel/scenarios.manifest.json` | 场景 manifest 登记 | Modify |

---

## Task 1: core editor 缝 — `setAttachment` 写通道

**Files:**
- Modify: `packages/core/src/dom/interaction/CellEditorContract.ts`
- Modify: `packages/core/src/engine/GridEngine.ts`、`packages/core/src/engine/DefaultGridEngine.ts`（若 view→raw 未公开）
- Modify: `packages/core/src/dom/runtime/GridRuntime.ts`
- Test: `packages/core/tests/dom/runtime/custom-editor-attachment.test.ts`（就近既有 runtime 测试目录；若无则新建）

- [ ] **Step 1: 探查**

```bash
grep -n "viewRowToRaw\|viewColToRaw" packages/core/src/engine/GridEngine.ts   # 是否已在公开接口
grep -n "openCustomCellEditor\|editor.open({" packages/core/src/dom/runtime/GridRuntime.ts
ls packages/core/tests/dom/runtime/ 2>/dev/null || echo "no runtime test dir"
```

- [ ] **Step 2: 写失败测试**

`packages/core/tests/dom/runtime/custom-editor-attachment.test.ts`——验证 custom editor open context 暴露的 `setAttachment` 经 view→raw 写到 engine（用一个最小 fake editor 捕获 ctx 并调用 `setAttachment`，断言 `engine.getCellAttachment` 在对应 raw 坐标可读）。

```ts
import { describe, expect, it } from 'bun:test'
import { createTestGridRuntime } from '../../helpers/runtime-harness' // 若不存在，见下方注

// 注：若无现成 harness，改为最小化构造——本测试目标是验证 ctx.setAttachment 落到 engine。
// 实现者按既有 runtime 测试模式调整 setup（参考同目录其他 *.test.ts）。

describe('custom editor open ctx.setAttachment', () => {
  it('writes attachment at the editing cell raw coords', () => {
    const codec = { namespace: 'demo', serialize: (d: unknown) => JSON.stringify(d), deserialize: (t: string) => JSON.parse(t) }
    let captured: ((ns: string, data: unknown) => boolean) | undefined
    const editor = {
      open: (ctx: { setAttachment?: (ns: string, data: unknown) => boolean }) => { captured = ctx.setAttachment },
    }
    const { runtime, engine, openEditorAt } = createTestGridRuntime({
      cellAttachments: [codec],
      cellEditors: { text: editor },
      // 2 行 1 列 text 数据，无 sort/filter（view===raw）
    })
    openEditorAt({ rowIndex: 1, colIndex: 0 }) // 触发 editor.open
    expect(captured).toBeDefined()
    expect(captured!('demo', { note: 'x' })).toBe(true)
    expect(engine.getCellAttachment('demo', 1, 0)).toEqual({ note: 'x' })
  })
})
```

> **实现者注:** 本仓库 runtime 测试 setup 形态需先看同目录既有 `*.test.ts`（如何构造 `GridRuntime` + 触发 custom editor open）。若没有 `runtime-harness` helper，**不要新造大 harness**——改用最小直接构造或复用既有测试的 setup 片段。若 view===raw 的最小数据无法直接触发 `openCustomCellEditor`，可用 `engine` 直接断言 `setCellAttachment` + 在 GridRuntime 单元验证 ctx 注入（拆两个更小断言）。**若 setup 成本过高，STOP+ASK 控制器给方向。**

- [ ] **Step 3: 跑确认红**

Run: `bun test packages/core/tests/dom/runtime/custom-editor-attachment.test.ts`
Expected: FAIL（`ctx.setAttachment` undefined）。

- [ ] **Step 4: 加 `setAttachment` 到 contract**

`CellEditorContract.ts`——`CellEditorOpenContext` 内紧挨 `commit`：

```ts
  commit(value: CellValue | null): void
  /** 写本单元格附件（namespace 由 GridOptions.cellAttachments 注册）；内部 view→raw 映射，含 undo。 */
  setAttachment?(namespace: string, data: unknown): boolean
  cancel(): void
```

- [ ] **Step 5: engine 暴露 view→raw（若未公开）**

`GridEngine.ts`——若接口无 `viewRowToRaw`/`viewColToRaw`，加：

```ts
  /** view 行 → raw 行（sort/filter/hide 解析）。 */
  viewRowToRaw(viewRow: number): number
  /** view 列 → raw 列。 */
  viewColToRaw(viewCol: number): number
```

`DefaultGridEngine.ts`——实现委派 `this.coords.viewRowToRaw/viewColToRaw`（既有，见 `DefaultGridEngine.ts:925-926` 同源）：

```ts
  viewRowToRaw(viewRow: number): number { return this.coords.viewRowToRaw(viewRow) }
  viewColToRaw(viewCol: number): number { return this.coords.viewColToRaw(viewCol) }
```

> 若接口已有等价公开方法，复用，不重复加。

- [ ] **Step 6: GridRuntime 注入 `setAttachment`**

`GridRuntime.ts` 的 `openCustomCellEditor` 的 `editor.open({ ... })` 对象内，紧挨 `commit`/`cancel` 加：

```ts
      setAttachment: (namespace, data) =>
        this.engine.setCellAttachment(
          namespace,
          this.engine.viewRowToRaw(cell.rowIndex),
          this.engine.viewColToRaw(cell.colIndex),
          data,
        ),
```

> `cell` 是已 `resolveEditCell` 的 view 坐标（该函数同段已算）。setAttachment 走与 `commit` 一致的 view→raw→engine 路径。

- [ ] **Step 7: 跑确认绿 + core 回归**

```bash
bun test packages/core/tests/dom/runtime/custom-editor-attachment.test.ts
bun test packages/core/
bun run --filter @novasheet/core typecheck
```
Expected: 绿；core 全回归绿（新增可选字段 + 公开方法零回归）。

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/dom/interaction/CellEditorContract.ts packages/core/src/engine/GridEngine.ts packages/core/src/engine/DefaultGridEngine.ts packages/core/src/dom/runtime/GridRuntime.ts packages/core/tests/dom/runtime/custom-editor-attachment.test.ts
git commit -m "feat(core): editor 缝加 setAttachment 写通道（view→raw 映射，供 rich-text 提交 runs）

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: react 缝 — 导出 `CustomColorPicker` 原语

**Files:**
- Modify: `packages/react/src/index.ts`
- Test: `packages/react/tests/editors/color-picker-export.test.ts`（轻量导出存在性测试）

> spec §8.3：浮动工具栏的颜色 A 复用 react 既有 `CustomColorPicker`（`2026-06-11-toolbar-custom-color-picker`）。它当前仅在 `features/toolbar/components/` 内部，未从包根导出——cell-kit 要复用须先导出（dogfood：拼不出=缝缺口）。

- [ ] **Step 1: 探查导出链**

```bash
grep -rn "CustomColorPicker" packages/react/src
grep -n "export" packages/react/src/features/toolbar/index.ts 2>/dev/null | head
```

- [ ] **Step 2: 写失败测试**

`packages/react/tests/editors/color-picker-export.test.ts`：

```ts
import { describe, expect, it } from 'bun:test'
import * as react from '../../src'

describe('@novasheet/react exports CustomColorPicker', () => {
  it('exposes CustomColorPicker for reuse by cell-kit', () => {
    expect(typeof (react as Record<string, unknown>).CustomColorPicker).toBe('function')
  })
})
```

- [ ] **Step 3: 跑确认红**

Run: `bun test packages/react/tests/editors/color-picker-export.test.ts`
Expected: FAIL（未导出）。

- [ ] **Step 4: 导出**

`packages/react/src/index.ts`——加（路径按 Step 1 探查结果）：

```ts
export { CustomColorPicker, CHECKERBOARD_BG } from './features/toolbar/components/CustomColorPicker'
```

> 若 react boundary lint（`check-react-boundary.ts`）禁 index 直引 feature 内部组件，改为经 `features/toolbar/index.ts` re-export 再由 index 导出（与既有 toolbar 导出一致）。Step 5 的 `bun run lint:react-boundary` 会暴露。

- [ ] **Step 5: 跑确认绿 + boundary**

```bash
bun test packages/react/tests/editors/color-picker-export.test.ts
bun run lint:react-boundary
bun run --filter @novasheet/react typecheck
```
Expected: 绿；boundary exit 0；typecheck 0 error。

- [ ] **Step 6: Commit**

```bash
git add packages/react/src/index.ts packages/react/tests/editors/color-picker-export.test.ts
git commit -m "feat(react): 导出 CustomColorPicker 原语（供 cell-kit rich-text 工具栏复用）

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: cell-kit 加 react 依赖 + runs↔DOM 序列化（纯函数）

**Files:**
- Modify: `packages/cell-kit/package.json`、`packages/cell-kit/tsconfig.json`
- Create: `packages/cell-kit/src/rich-text/serialize.ts`
- Test: `packages/cell-kit/tests/rich-text/serialize.test.ts`

- [ ] **Step 1: cell-kit 加 react peer + jsx**

`package.json`——加 `peerDependencies` + devDeps（照搬 react 包）：

```json
  "peerDependencies": {
    "react": ">=18.3.0",
    "react-dom": ">=18.3.0"
  },
```
`devDependencies` 追加：`"@types/react": "^18.3.0"`、`"@types/react-dom": "^18.3.0"`、`"react": "^18.3.1"`、`"react-dom": "^18.3.1"`、`"@happy-dom/global-registrator": "^20.9.0"`、`"happy-dom": "^20.9.0"`。

`tsconfig.json`——`compilerOptions` 加 `"jsx": "react-jsx"`，`types` 改 `["bun", "react"]`。

`build.ts`——`EXTERNALS` 加 `'react'`、`'react-dom'`（照搬 react build）。

跑 `bun install`（lockfile 变动连同提交）。

- [ ] **Step 2: 写 serialize 失败测试**

`packages/cell-kit/tests/rich-text/serialize.test.ts`（happy-dom 由 root bunfig 全局 preload，`document` 可用）：

```ts
import { describe, expect, it } from 'bun:test'
import { richTextToHtml, htmlElementToRichText } from '../../src/rich-text/serialize'
import type { RichTextValue } from '../../src/rich-text/types'

describe('richTextToHtml', () => {
  it('no runs → escaped plain text in single span', () => {
    expect(richTextToHtml('a<b>', [])).toBe('<span>a&lt;b&gt;</span>')
  })
  it('bold middle run → 3 spans, middle has font-weight', () => {
    const runs: RichTextValue = [{ start: 1, end: 3, attrs: { bold: true } }]
    const html = richTextToHtml('abcd', runs)
    expect(html).toBe('<span>a</span><span style="font-weight:bold">bc</span><span>d</span>')
  })
  it('newline → <br>', () => {
    expect(richTextToHtml('a\nb', [])).toBe('<span>a</span><br><span>b</span>')
  })
})

describe('htmlElementToRichText', () => {
  it('round-trips bold substring', () => {
    const root = document.createElement('div')
    root.innerHTML = richTextToHtml('abcd', [{ start: 1, end: 3, attrs: { bold: true } }])
    const { text, runs } = htmlElementToRichText(root)
    expect(text).toBe('abcd')
    expect(runs).toEqual([{ start: 1, end: 3, attrs: { bold: true } }])
  })
  it('extracts color + italic + underline from inline style', () => {
    const root = document.createElement('div')
    root.innerHTML = '<span style="font-style:italic;text-decoration:underline;color:#ff0000">hi</span>'
    const { text, runs } = htmlElementToRichText(root)
    expect(text).toBe('hi')
    expect(runs[0]?.attrs.italic).toBe(true)
    expect(runs[0]?.attrs.underline).toBe(true)
    expect(runs[0]?.attrs.color).toBe('#ff0000')
  })
  it('<br> → \\n with +1 offset', () => {
    const root = document.createElement('div')
    root.innerHTML = '<span>a</span><br><span>b</span>'
    expect(htmlElementToRichText(root).text).toBe('a\nb')
  })
})
```

> **plan-risk:** happy-dom 对 `style.color='#ff0000'` 可能回读为 `rgb(255, 0, 0)` 或保留 hex；对 `font-weight:bold` 可能回读 `'bold'` 或 `'700'`。实现 `extractAttrs` 时按 happy-dom 实际行为写判据（`fontWeight==='bold' || Number(fontWeight)>=600`；color 直接取字符串）。**若测试断言 `color==='#ff0000'` 与 happy-dom 回读不符，STOP+ASK**——调期望 vs 调实现需控制器拍板（别静默）。

- [ ] **Step 3: 跑确认红**

Run: `bun test packages/cell-kit/tests/rich-text/serialize.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 4: 实现 serialize.ts**

`packages/cell-kit/src/rich-text/serialize.ts`：

```ts
import { normalize } from './normalize'
import type { RichTextValue, TextRun, TextRunAttrs } from './types'
import { splitIntoSegments, type CellTextDefault } from './segments'

const NEUTRAL_DEFAULT: CellTextDefault = { fontSize: 0, fontFamily: '', color: '' }

/** runs → contenteditable 初值 HTML：每段一个 <span style>，`\n` → <br>。 */
export function richTextToHtml(text: string, runs: RichTextValue): string {
  if (text.length === 0) return ''
  const norm = normalize(runs, text)
  // 复用切段（NEUTRAL_DEFAULT 不写默认值进 style——仅 run.attrs 显式样式落 style）。
  const segs = splitSegmentsWithAttrs(text, norm)
  const parts: string[] = []
  for (const { text: segText, attrs } of segs) {
    const lines = segText.split('\n')
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) parts.push('<br>')
      const style = attrsToStyle(attrs)
      parts.push(style ? `<span style="${style}">${escapeHtml(lines[i]!)}</span>` : `<span>${escapeHtml(lines[i]!)}</span>`)
    }
  }
  return parts.join('')
}

/** contenteditable DOM → { text, normalized runs }。<br> → \n（+1）；inline style → attrs。 */
export function htmlElementToRichText(root: HTMLElement): { text: string; runs: RichTextValue } {
  let text = ''
  const raw: TextRun[] = []
  walk(root, { color: undefined, bold: false, italic: false, underline: false, strikethrough: false, fontSize: undefined, fontFamily: undefined })
  function walk(node: Node, inherited: MutableAttrs): void {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3 /* TEXT_NODE */) {
        const t = child.textContent ?? ''
        if (t.length === 0) continue
        const start = text.length
        text += t
        if (hasAnyAttr(inherited)) raw.push({ start, end: text.length, attrs: toAttrs(inherited) })
      } else if (child.nodeName === 'BR') {
        text += '\n'
      } else if (child.nodeType === 1 /* ELEMENT_NODE */) {
        walk(child, mergeStyle(inherited, child as HTMLElement))
      }
    }
  }
  return { text, runs: normalize(raw, text) }
}

interface MutableAttrs {
  color?: string; bold: boolean; italic: boolean; underline: boolean; strikethrough: boolean
  fontSize?: number; fontFamily?: string
}

function mergeStyle(base: MutableAttrs, el: HTMLElement): MutableAttrs {
  const s = el.style
  const next: MutableAttrs = { ...base }
  if (s.fontWeight === 'bold' || Number(s.fontWeight) >= 600) next.bold = true
  if (s.fontStyle === 'italic') next.italic = true
  const deco = s.textDecoration || s.textDecorationLine || ''
  if (deco.includes('underline')) next.underline = true
  if (deco.includes('line-through')) next.strikethrough = true
  if (s.color) next.color = s.color
  if (s.fontSize) { const n = parseFloat(s.fontSize); if (!Number.isNaN(n)) next.fontSize = n }
  if (s.fontFamily) next.fontFamily = s.fontFamily
  return next
}

function hasAnyAttr(a: MutableAttrs): boolean {
  return a.bold || a.italic || a.underline || a.strikethrough || a.color != null || a.fontSize != null || a.fontFamily != null
}

function toAttrs(a: MutableAttrs): TextRunAttrs {
  const out: Record<string, unknown> = {}
  if (a.bold) out.bold = true
  if (a.italic) out.italic = true
  if (a.underline) out.underline = true
  if (a.strikethrough) out.strikethrough = true
  if (a.color != null) out.color = a.color
  if (a.fontSize != null) out.fontSize = a.fontSize
  if (a.fontFamily != null) out.fontFamily = a.fontFamily
  return out as TextRunAttrs
}

/** 切段但只携带 run.attrs（不并入 cell default）；gap 段 attrs={}。 */
function splitSegmentsWithAttrs(text: string, runs: RichTextValue): { text: string; attrs: TextRunAttrs }[] {
  const out: { text: string; attrs: TextRunAttrs }[] = []
  let cursor = 0
  for (const run of runs) {
    if (run.start > cursor) out.push({ text: text.slice(cursor, run.start), attrs: {} })
    out.push({ text: text.slice(run.start, run.end), attrs: run.attrs })
    cursor = run.end
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor), attrs: {} })
  return out
}

function attrsToStyle(a: TextRunAttrs): string {
  const decls: string[] = []
  if (a.bold) decls.push('font-weight:bold')
  if (a.italic) decls.push('font-style:italic')
  const deco: string[] = []
  if (a.underline) deco.push('underline')
  if (a.strikethrough) deco.push('line-through')
  if (deco.length) decls.push(`text-decoration:${deco.join(' ')}`)
  if (a.color != null) decls.push(`color:${a.color}`)
  if (a.fontSize != null) decls.push(`font-size:${a.fontSize}px`)
  if (a.fontFamily != null) decls.push(`font-family:${a.fontFamily}`)
  return decls.join(';')
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// NEUTRAL_DEFAULT/splitIntoSegments 仅在需要复用渲染切段时引入；此处用 splitSegmentsWithAttrs 独立实现。
void NEUTRAL_DEFAULT; void splitIntoSegments
```

> 实现者注：上面 `void NEUTRAL_DEFAULT; void splitIntoSegments` 是占位防 unused——**实际实现请删掉这两个 import 与该行**（`serialize.ts` 不需要 `splitIntoSegments`/`NEUTRAL_DEFAULT`，本 plan 误带，移除以过 lint）。仅保留 `normalize` + 类型 import。

- [ ] **Step 5: 跑确认绿**

Run: `bun test packages/cell-kit/tests/rich-text/serialize.test.ts`
Expected: PASS。若 color/font-weight 回读与期望不符 → STOP+ASK（plan-risk）。

- [ ] **Step 6: Commit**

```bash
git add packages/cell-kit/package.json packages/cell-kit/tsconfig.json packages/cell-kit/build.ts packages/cell-kit/src/rich-text/serialize.ts packages/cell-kit/tests/rich-text/serialize.test.ts bun.lock
git commit -m "feat(cell-kit): runs↔DOM 序列化（richTextToHtml/htmlElementToRichText）+ react 依赖

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: `RichTextCellEditor` 组件 + `richTextEditor`（CellEditor）

**Files:**
- Create: `packages/cell-kit/src/rich-text/RichTextCellEditor.tsx`
- Test: `packages/cell-kit/tests/rich-text/RichTextCellEditor.test.tsx`

> 经 react `createReactCellEditor`（已导出）包成 `CellEditor`，`kind:'inline'`。组件挂 contenteditable，`richTextToHtml` 回填初值；提交时 `htmlElementToRichText` → `{ text, runs }` → `ctx.commit(text)` + `ctx.setAttachment('richText', runs)`。

- [ ] **Step 1: 写失败测试**

`packages/cell-kit/tests/rich-text/RichTextCellEditor.test.tsx`：

```tsx
import { describe, expect, it } from 'bun:test'
import React, { act } from 'react'
import { richTextEditor } from '../../src/rich-text/RichTextCellEditor'
import type { CellEditorOpenContext } from '@novasheet/core'

function open(over: Partial<CellEditorOpenContext> = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const committed: { value: unknown; runs: unknown } = { value: undefined, runs: undefined }
  const ctx: CellEditorOpenContext = {
    cell: { rowIndex: 0, colIndex: 0 },
    field: { id: 't', name: 'T', type: 'text', width: 120 },
    value: 'abcd',
    container,
    rect: { x: 0, y: 0, width: 120, height: 24 },
    trigger: 'double-click',
    commit: (v) => { committed.value = v },
    setAttachment: (_ns, data) => { committed.runs = data; return true },
    cancel: () => {},
    ...over,
  }
  return { ctx, container, committed }
}

describe('richTextEditor', () => {
  it('renders contenteditable seeded with current value', async () => {
    const { ctx, container } = open()
    await act(async () => { richTextEditor.open(ctx) })
    const ce = container.querySelector('[contenteditable]') as HTMLElement
    expect(ce).toBeTruthy()
    expect(ce.textContent).toBe('abcd')
  })

  it('commit serializes DOM → value + runs (bold substring preserved)', async () => {
    const { ctx, container, committed } = open()
    await act(async () => { richTextEditor.open(ctx) })
    const ce = container.querySelector('[contenteditable]') as HTMLElement
    // 模拟用户把 'bc' 加粗：直接设 DOM（toolbar 行为在 Task 6 测）
    ce.innerHTML = '<span>a</span><span style="font-weight:bold">bc</span><span>d</span>'
    // 触发提交（组件暴露的提交入口——按实现：blur 或 Enter）
    await act(async () => { ce.dispatchEvent(new Event('blur', { bubbles: true })) })
    expect(committed.value).toBe('abcd')
    expect(committed.runs).toEqual([{ start: 1, end: 3, attrs: { bold: true } }])
  })
})
```

- [ ] **Step 2: 跑确认红**

Run: `bun test packages/cell-kit/tests/rich-text/RichTextCellEditor.test.tsx`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 RichTextCellEditor.tsx**

```tsx
import { useEffect, useRef } from 'react'
import { createReactCellEditor, type ReactCellEditorProps } from '@novasheet/react'
import type { CellEditor } from '@novasheet/core'
import { richTextToHtml, htmlElementToRichText } from './serialize'
import type { RichTextValue } from './types'

const RICH_TEXT_NAMESPACE = 'richText'

/** contenteditable 编辑器组件；初值由当前 value + （可选）已存 runs 回填，提交写 value+runs。 */
function RichTextCellEditorComponent(props: ReactCellEditorProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const { value, commit, setAttachment } = props

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const text = value == null ? '' : String(value)
    // 初值 runs：本 plan 由 props 暂无既存 runs 通道，先以空 runs 回填纯文本；
    // 既存 runs 回填留 Task 6 接 getAttachment（见该 task）。
    el.innerHTML = richTextToHtml(text, [])
    el.focus()
  }, [value])

  const submit = (): void => {
    const el = ref.current
    if (!el) return
    const { text, runs } = htmlElementToRichText(el)
    commit(text)
    setAttachment?.(RICH_TEXT_NAMESPACE, runs as RichTextValue)
  }

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      data-novasheet-rich-text-editor
      style={{ minWidth: 120, outline: 'none', whiteSpace: 'pre-wrap' }}
      onBlur={submit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.altKey) { e.preventDefault(); submit() }
        if (e.key === 'Escape') { e.preventDefault(); props.cancel() }
      }}
    />
  )
}

/** rich-text 的 CellEditor（注册到内置 'text'）。 */
export const richTextEditor: CellEditor = createReactCellEditor(RichTextCellEditorComponent, { kind: 'inline' })
```

> 实现者注：`createReactCellEditor` 的 `commit` 包装会在 commit 后 `close()`（见 react 实现）。本组件 `submit` 先 `commit` 再 `setAttachment`——但 `commit` 触发 close → unmount，`setAttachment` 须在 unmount 前完成。`createReactCellEditor` 的 `commit` 是同步 `ctx.commit(value); close()`。**风险:** close 后 `setAttachment` 仍可调（它是 ctx 上的闭包，不依赖 DOM）。验证测试里 `committed.runs` 被填即可。若 close 时序导致 runs 丢失，调整为先 `setAttachment` 再 `commit`（提交顺序：先写附件再提交值，避免 commit 关闭编辑器后丢附件）。

- [ ] **Step 4: 跑确认绿**

Run: `bun test packages/cell-kit/tests/rich-text/RichTextCellEditor.test.tsx`
Expected: PASS。若 commit/close 时序丢 runs，改 `submit` 顺序（先 setAttachment 后 commit）并复跑。

- [ ] **Step 5: Commit**

```bash
git add packages/cell-kit/src/rich-text/RichTextCellEditor.tsx packages/cell-kit/tests/rich-text/RichTextCellEditor.test.tsx
git commit -m "feat(cell-kit): RichTextCellEditor contenteditable（初值回填 + 提交写 value+runs）

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: 选区加粗 helper（逐格 full-span run）

**Files:**
- Create: `packages/cell-kit/src/rich-text/selectionBold.ts`
- Test: `packages/cell-kit/tests/rich-text/selectionBold.test.ts`

> spec §9：非编辑态范围选区点 Bold = 选区内**逐格写 full-span run**。helper 接收一个 grid-like 门面（读 selection + 每格 value + 写 setCellAttachment），对每格写 `[0, len)` 的 `{bold:true}` run（已有同 attr 则 toggle 清除）。

- [ ] **Step 1: 探查 Grid facade 公开 API**

```bash
grep -n "getSelection\|selectedRange\|getCellValue\|getCell\|setCellAttachment\|getCellAttachment" packages/core/src/Grid.ts
```
确认可读「当前选区 raw 范围」+「raw cell 值」+「raw cell 已存附件」。**若缺任一公开 API，STOP+ASK**（spec ADR-C：补缝再接，别走私有通道）。

- [ ] **Step 2: 写失败测试**（用最小 fake grid 门面，不依赖真 Grid）

`packages/cell-kit/tests/rich-text/selectionBold.test.ts`：

```ts
import { describe, expect, it } from 'bun:test'
import { applyBoldToRange, type RichTextGridAccess } from '../../src/rich-text/selectionBold'
import type { RichTextValue } from '../../src/rich-text/types'

function fakeGrid(values: Record<string, string>, attach: Record<string, RichTextValue> = {}): RichTextGridAccess & { written: Record<string, RichTextValue | undefined> } {
  const written: Record<string, RichTextValue | undefined> = {}
  return {
    written,
    getCellText: (r, c) => values[`${r},${c}`] ?? '',
    getRichText: (r, c) => attach[`${r},${c}`],
    setRichText: (r, c, runs) => { written[`${r},${c}`] = runs; return true },
  }
}

describe('applyBoldToRange', () => {
  it('writes full-span bold run per cell in range', () => {
    const g = fakeGrid({ '0,0': 'ab', '1,0': 'xyz' })
    applyBoldToRange(g, { startRow: 0, endRow: 1, startCol: 0, endCol: 0 })
    expect(g.written['0,0']).toEqual([{ start: 0, end: 2, attrs: { bold: true } }])
    expect(g.written['1,0']).toEqual([{ start: 0, end: 3, attrs: { bold: true } }])
  })

  it('toggles off when every cell already full-span bold', () => {
    const full: RichTextValue = [{ start: 0, end: 2, attrs: { bold: true } }]
    const g = fakeGrid({ '0,0': 'ab' }, { '0,0': full })
    applyBoldToRange(g, { startRow: 0, endRow: 0, startCol: 0, endCol: 0 })
    expect(g.written['0,0']).toEqual([]) // 清除
  })

  it('skips empty cells (no text → no run)', () => {
    const g = fakeGrid({ '0,0': '' })
    applyBoldToRange(g, { startRow: 0, endRow: 0, startCol: 0, endCol: 0 })
    expect(g.written['0,0']).toBeUndefined()
  })
})
```

- [ ] **Step 3: 跑确认红 + 实现 selectionBold.ts**

Run: `bun test packages/cell-kit/tests/rich-text/selectionBold.test.ts` → FAIL。

```ts
import type { RichTextValue } from './types'

/** rich-text 对选区操作所需的 grid 门面（raw 坐标）；由组合根用真 Grid 适配。 */
export interface RichTextGridAccess {
  getCellText(rawRow: number, rawCol: number): string
  getRichText(rawRow: number, rawCol: number): RichTextValue | undefined
  setRichText(rawRow: number, rawCol: number, runs: RichTextValue): boolean
}

export interface RawRange {
  readonly startRow: number; readonly endRow: number
  readonly startCol: number; readonly endCol: number
}

/** 选区逐格 full-span bold：全格已 full-span bold 则 toggle 清除，否则全置 bold。空格跳过。 */
export function applyBoldToRange(grid: RichTextGridAccess, range: RawRange): void {
  const cells: { r: number; c: number; len: number }[] = []
  for (let r = range.startRow; r <= range.endRow; r++) {
    for (let c = range.startCol; c <= range.endCol; c++) {
      const len = grid.getCellText(r, c).length
      if (len > 0) cells.push({ r, c, len })
    }
  }
  const allBold = cells.length > 0 && cells.every(({ r, c, len }) => isFullSpanBold(grid.getRichText(r, c), len))
  for (const { r, c, len } of cells) {
    grid.setRichText(r, c, allBold ? [] : [{ start: 0, end: len, attrs: { bold: true } }])
  }
}

function isFullSpanBold(runs: RichTextValue | undefined, len: number): boolean {
  return !!runs && runs.length === 1 && runs[0]!.start === 0 && runs[0]!.end === len && runs[0]!.attrs.bold === true
}
```

跑确认绿。

- [ ] **Step 4: Commit**

```bash
git add packages/cell-kit/src/rich-text/selectionBold.ts packages/cell-kit/tests/rich-text/selectionBold.test.ts
git commit -m "feat(cell-kit): 选区逐格 full-span bold run（toggle 语义，空格跳过）

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 6: `FloatingFormatToolbar` + 既存 runs 回填 + 装配

**Files:**
- Create: `packages/cell-kit/src/rich-text/FloatingFormatToolbar.tsx`
- Modify: `packages/cell-kit/src/rich-text/RichTextCellEditor.tsx`（嵌入 toolbar + 既存 runs 回填）
- Modify: `packages/cell-kit/src/rich-text/index.ts`（`richTextExtension` 加 `editor`）
- Test: `packages/cell-kit/tests/rich-text/FloatingFormatToolbar.test.tsx`、`packages/cell-kit/tests/rich-text/richTextExtension.test.ts`（追加 editor 断言）

- [ ] **Step 1: 写 toolbar 失败测试**

`FloatingFormatToolbar.test.tsx`——验证点 B 对当前 DOM Selection 的文本包/拆 `font-weight:bold` span：

```tsx
import { describe, expect, it } from 'bun:test'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { FloatingFormatToolbar } from '../../src/rich-text/FloatingFormatToolbar'

describe('FloatingFormatToolbar', () => {
  it('Bold button wraps current selection in font-weight:bold', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const editable = document.createElement('div')
    editable.contentEditable = 'true'
    editable.innerHTML = '<span>abcd</span>'
    document.body.appendChild(editable)
    // 选中 'bc'（offset 1..3）
    const textNode = editable.querySelector('span')!.firstChild!
    const range = document.createRange()
    range.setStart(textNode, 1); range.setEnd(textNode, 3)
    const sel = window.getSelection()!; sel.removeAllRanges(); sel.addRange(range)

    const root = createRoot(host)
    await act(async () => { root.render(<FloatingFormatToolbar editableRef={{ current: editable }} />) })
    const boldBtn = host.querySelector('[data-cmd="bold"]') as HTMLButtonElement
    await act(async () => { boldBtn.click() })
    expect(editable.innerHTML).toContain('font-weight:bold')
    expect(editable.textContent).toBe('abcd')
  })
})
```

> **plan-risk:** Selection API 在 happy-dom 的 `surroundContents`/`execCommand` 支持有限。实现 Bold 用 **Range.extractContents + 包 span + insertNode**（不依赖废弃 `execCommand`，spec §8.2）。若 happy-dom 不支持 `range.extractContents()`，STOP+ASK——可能要在测试里降级断言或换实现策略。

- [ ] **Step 2: 跑确认红 + 实现 FloatingFormatToolbar.tsx**

Run: `bun test packages/cell-kit/tests/rich-text/FloatingFormatToolbar.test.tsx` → FAIL。

```tsx
import { useState } from 'react'
import { CustomColorPicker } from '@novasheet/react'

export interface FloatingFormatToolbarProps {
  readonly editableRef: { current: HTMLElement | null }
}

/** 浮动字体组工具栏：B/I/U/删除线 toggle 当前 Selection + 颜色 A（复用 CustomColorPicker）。 */
export function FloatingFormatToolbar({ editableRef }: FloatingFormatToolbarProps): JSX.Element {
  const [showColor, setShowColor] = useState(false)

  const wrap = (apply: (span: HTMLSpanElement) => void): void => {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || !editableRef.current) return
    const range = sel.getRangeAt(0)
    if (range.collapsed) return
    const span = document.createElement('span')
    apply(span)
    const contents = range.extractContents()
    span.appendChild(contents)
    range.insertNode(span)
    sel.removeAllRanges()
  }

  return (
    <div data-novasheet-format-toolbar role="toolbar">
      <button type="button" data-cmd="bold" onMouseDown={(e) => e.preventDefault()} onClick={() => wrap((s) => (s.style.fontWeight = 'bold'))}>B</button>
      <button type="button" data-cmd="italic" onMouseDown={(e) => e.preventDefault()} onClick={() => wrap((s) => (s.style.fontStyle = 'italic'))}>I</button>
      <button type="button" data-cmd="underline" onMouseDown={(e) => e.preventDefault()} onClick={() => wrap((s) => (s.style.textDecoration = 'underline'))}>U</button>
      <button type="button" data-cmd="strikethrough" onMouseDown={(e) => e.preventDefault()} onClick={() => wrap((s) => (s.style.textDecoration = 'line-through'))}>S</button>
      <button type="button" data-cmd="color" onMouseDown={(e) => e.preventDefault()} onClick={() => setShowColor((v) => !v)}>A</button>
      {showColor && (
        <CustomColorPicker
          initialColor="#000000"
          onConfirm={(color) => { wrap((s) => (s.style.color = color)); setShowColor(false) }}
          onCancel={() => setShowColor(false)}
        />
      )}
    </div>
  )
}
```

> 注：`onMouseDown preventDefault` 防按钮抢焦点丢 Selection。toggle「已 bold 再点取消」的完整语义（spec §8.2）较复杂——本 plan 第一版只做「包 span」单向；**toggle-off 留 follow-up**（在 plan Self-Review 标）。`data-cmd` 供测试选择。

跑确认绿。

- [ ] **Step 3: RichTextCellEditor 嵌入 toolbar + 既存 runs 回填**

改 `RichTextCellEditor.tsx`：
- 初值回填改为读既存 runs：组件 props 无 runs 通道——经 `createReactCellEditor` 的 `componentProps` 注入一个 `getInitialRuns?: () => RichTextValue | undefined`？**更简方案:** 编辑器 open 时既存 runs 在 attachment 里，但编辑器组件拿不到 grid。**决策:** 第一版初值仅回填纯文本（既存 runs 视觉上由 renderer 显示，编辑态从纯文本起改）；既存 runs 回填留 follow-up（需 editor 缝再加 `getAttachment` 读通道，对称于 Task 1 的 setAttachment）。在 Self-Review 标。
- 嵌入 `<FloatingFormatToolbar editableRef={ref} />` 于 contenteditable 上方。

> 本 step 仅嵌 toolbar（既存 runs 回填如上决策留 follow-up，不阻塞 BDD「新建加粗→提交→重开保持」——重开由 renderer 显示 runs，再次编辑从纯文本起是已知第一版限制）。

- [ ] **Step 4: `richTextExtension` 加 editor**

`index.ts`：

```ts
import { richTextEditor } from './RichTextCellEditor'
export { richTextEditor } from './RichTextCellEditor'
export { FloatingFormatToolbar } from './FloatingFormatToolbar'
export { applyBoldToRange } from './selectionBold'
export type { RichTextGridAccess } from './selectionBold'

export const richTextExtension = {
  codec: richTextCodec,
  renderer: richTextRenderer,
  editor: richTextEditor,
} as const
```

`richTextExtension.test.ts` 追加：`expect(typeof richTextExtension.editor.open).toBe('function')`。

- [ ] **Step 5: 跑确认绿 + cell-kit 全回归**

```bash
bun test packages/cell-kit/
bun run --filter @novasheet/cell-kit typecheck
```
Expected: 全绿。

- [ ] **Step 6: Commit**

```bash
git add packages/cell-kit/src/rich-text packages/cell-kit/tests/rich-text
git commit -m "feat(cell-kit): FloatingFormatToolbar（Selection 包 span + 复用 color picker）+ richTextExtension 加 editor

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 7: Excel L3 BDD 场景 + 端到端 + 全量 gates

**Files:**
- Create: `packages/react/tests/excel/scenarios/L3-rich-text-toolbar-bold-substring.md`
- Create: `packages/react/tests/excel/scenarios/L3-rich-text-default-not-bundled.md`
- Modify: `packages/react/tests/excel/scenarios.manifest.json`
- Test: cell-kit 端到端 assembly 测试（注册三点后渲染 runs）；react 默认不带断言

> **BDD gate 落点辨析:** 被测 rich-text 在 cell-kit，但「集成方注册后端到端」最贴 Excel L3。两场景：① `toolbar-bold-substring`——注册 cell-kit 后选中子串加粗→提交→重开 renderer 显示 bold；② `default-not-bundled`——未注册时纯文本无字体组。**因 cell-kit→react 依赖**（cell-kit 依赖 react，react 不可反依赖 cell-kit），端到端 assembly 测试落 **cell-kit**（可同时 import react+canvas2d+core），Excel 场景 MD 作契约登记、其「默认不带」断言落 react（react 默认 Grid 无 rich-text）。

- [ ] **Step 1: 探查场景格式 + manifest**

```bash
sed -n '1,30p' packages/react/tests/excel/scenarios/L3b-clipboard.md
grep -n "id\|test\|file" packages/react/tests/excel/scenarios.manifest.json | head
cat packages/react/scripts/check-scenario-coverage.ts | sed -n '150,180p'
```

- [ ] **Step 2: 写场景 MD（先红：无对应测试）**

`L3-rich-text-default-not-bundled.md`：

```markdown
---
id: excel.L3.rich-text-default-not-bundled
layer: L3
summary: 默认 Grid 不带 rich-text；未注册 cell-kit 时纯文本无字体组
status: draft
---

## User Story

作为集成方，当我不注册 `@novasheet/cell-kit` 时，我希望 NovaSheet 默认渲染纯文本、无任何字体组能力，以保证默认包零基础组件、可 tree-shake。

## Given
- 默认 NovaExcel（未注册 richTextExtension）

## When
- 渲染 text 列

## Then
- 单元格走内置纯文本路径，无 rich-text renderer 介入
```

`L3-rich-text-toolbar-bold-substring.md`：

```markdown
---
id: excel.L3.rich-text-toolbar-bold-substring
layer: L3
summary: 注册 cell-kit 后选中子串加粗→提交→重开保持
status: draft
---

## User Story

作为用户，当我注册 cell-kit 并在某单元格选中部分文字点加粗时，我希望提交后该子串以粗体渲染，重新打开表格仍保持，以获得 Excel 同款 rich-text 体验。

## Given
- 注册 richTextExtension（codec+renderer+editor）的 Grid，某 text 单元格值 'abcd'

## When
- 编辑该格，将 'bc' 加粗并提交

## Then
- 'richText' 附件存 [1,3) bold run；renderer 切段绘制时 'bc' 段 font 含 bold
```

跑 `bun run --filter @novasheet/mbd mbd validate` 确认场景 MD 合法。

- [ ] **Step 3: manifest 登记 + 写端到端测试（cell-kit）**

`packages/cell-kit/tests/rich-text/assembly.e2e.test.ts`——注册三点后，模拟编辑提交，断言 attachment 存 run + renderer 切段含 bold：

```ts
import { describe, expect, it } from 'bun:test'
import { richTextExtension } from '../../src'
import { denseGridTheme } from '@novasheet/core'
import { createRecordingContext } from '../../../canvas2d/tests/helpers/recording-context'
import type { Canvas2DCellRenderParams } from '@novasheet/canvas2d'

describe('rich-text assembly (e2e)', () => {
  it('renderer paints bold substring from stored runs', () => {
    const runs = [{ start: 1, end: 3, attrs: { bold: true } }]
    const { ctx, ops } = createRecordingContext()
    const params: Canvas2DCellRenderParams = {
      value: 'abcd', rect: { x: 0, y: 0, width: 120, height: 24 },
      field: { id: 't', name: 'T', type: 'text', width: 120 },
      theme: denseGridTheme, rowIndex: 0, colIndex: 0,
      getAttachment: <T,>() => runs as T,
    }
    richTextExtension.renderer.paint(ctx, params)
    const fonts = ops.filter((o) => o.op === 'set:font').map((o) => (o.op === 'set:font' ? o.value : ''))
    expect(fonts.some((f) => f.includes('bold'))).toBe(true)
    const fills = ops.filter((o) => o.op === 'fillText').map((o) => (o.op === 'fillText' ? o.args[0] : ''))
    expect(fills).toContain('bc')
  })

  it('extension exposes all three registration points', () => {
    expect(richTextExtension.codec.namespace).toBe('richText')
    expect(typeof richTextExtension.renderer.paint).toBe('function')
    expect(typeof richTextExtension.editor.open).toBe('function')
  })
})
```

`scenarios.manifest.json` 按既有格式登记两个 scenario id → 对应测试文件（`default-not-bundled` 映射 react 默认渲染既有测试或新建轻量断言；`toolbar-bold-substring` 映射上面 e2e）。按 Step 1 探查的 manifest schema 填。

> **scenario-coverage 门:** `lint:scenario-coverage --fail-on-missing --fail-on-orphan`——每个新 scenario id 必须有测试映射，否则红。Step 1 必须看懂 manifest schema 再登记。**若映射机制要求测试在 react 包内**（而 e2e 在 cell-kit），则在 react 建一个引用 cell-kit 的端到端测试（react 可依赖 cell-kit 作 devDep——boundary lint 只禁 src，tests 不禁）。按 coverage 工具实际要求落位。

- [ ] **Step 4: 跑确认绿**

```bash
bun test packages/cell-kit/tests/rich-text/assembly.e2e.test.ts
bun run --filter @novasheet/mbd mbd validate
bun run --filter @novasheet/react lint:scenario-coverage
```

- [ ] **Step 5: 全量四门**

```bash
bun test
bun run --filter '*' typecheck
bun run lint
bun run --filter @novasheet/core build && bun run --filter @novasheet/canvas2d build && bun run --filter @novasheet/react build && bun run --filter @novasheet/cell-kit build
grep -rn "TextRun\|fontWeight\|strikethrough" packages/core/src/   # 须空
```
Expected: 四门全过；core grep 空。

> 注：`grep fontWeight packages/core/src` 须空——本 plan 的 `fontWeight` 只出现在 cell-kit serialize（不受 core 闸门约束）。确认 core 无泄漏。

- [ ] **Step 6: Commit**

```bash
git add packages/react/tests/excel/scenarios packages/cell-kit/tests/rich-text/assembly.e2e.test.ts
git commit -m "test(cell-kit): rich-text Excel L3 场景 + 端到端装配（注册三点渲染 bold 子串）

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

- [ ] **Step 7: 里程碑收尾**

dispatch code-reviewer（即便全绿）。更新路线图 §1.1/§1.5/§1.6/§4.2 勾选 ☑（editor/toolbar/选区加粗/装配/storybook/BDD）；§4.2 标 C-edit-UI ship；记 follow-up（toggle-off、既存 runs 回填）。storybook story（spec §1.6）若本 plan 未做，留 §4.2 follow-up 显式标。

---

## Self-Review（plan 对 spec §8/§9 + roadmap §4.2）

**Spec 覆盖:**
- §8.1 RichTextCellEditor contenteditable + runs↔DOM + 提交写 value+attachment → Task 3（序列化）+ Task 4（组件）+ Task 1（setAttachment 缝）。✓
- §8.2 FloatingFormatToolbar（B/I/U/strike/color，Selection 包/拆 span，非 execCommand）→ Task 6。**部分:** toggle-off（已格再点取消）第一版未做，留 follow-up（已标）。
- §8.3 复用 react color picker → Task 2（导出）+ Task 6（消费）。✓
- §9 选区加粗逐格 full-span run → Task 5。✓
- §11.2 commit(text) + setCellAttachment(runs) → Task 1 缝 + Task 4 提交。✓

**roadmap §4.2 映射:**
- CE1 editor → Task 3+4；CE2 toolbar → Task 6；CE3 选区加粗 → Task 5；CE6 装配 → Task 6（storybook 留 follow-up）；CE7 BDD → Task 7。
- CE4 fill / CE5 clipboard（D1/D2）→ **不在本 plan**（C-edit-data plan）。

**已知 follow-up（第一版限制，非阻断；Task 7 收尾登记）:**
1. **toolbar toggle-off**：已 bold 子串再点 B 取消——需读 Selection 内现有 span 判 + 拆。第一版只包不拆。
2. **既存 runs 回填编辑器初值**：需 editor 缝加 `getAttachment` 读通道（对称 Task 1 setAttachment）。第一版编辑态从纯文本起。
3. **storybook story**：cell-kit 注册示例 story。

**dogfood 缝缺口（本 plan 补）:** ① editor 缝缺 attachment 写通道 → Task 1；② `CustomColorPicker` 未导出 → Task 2。均验证缝完整性（spec ADR-C）。

**plan-risk 已标:** Task 3 happy-dom style 回读（color/font-weight）；Task 5 Grid facade 读取（缺 API STOP）；Task 6 happy-dom Range.extractContents 支持。三处均 STOP+ASK。

**Placeholder 扫描:** Task 3 Step 4 的 `void NEUTRAL_DEFAULT; void splitIntoSegments` 是 plan 误带——已显式标注「实现时删除」。其余每步含完整代码或精确 grep。

**类型一致性:** `richTextToHtml`/`htmlElementToRichText`/`richTextEditor`/`FloatingFormatToolbar`/`applyBoldToRange`/`RichTextGridAccess`/`richTextExtension`（加 editor）跨 task 命名统一；`ReactCellEditorProps`（react）含 `setAttachment?`（经 `CellEditorOpenContext` 继承，Task 1 加）——Task 4 用到，依赖 Task 1 先行。
