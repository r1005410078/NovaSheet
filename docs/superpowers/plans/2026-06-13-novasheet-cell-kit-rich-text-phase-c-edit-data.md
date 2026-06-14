# cell-attachment 数据完整性（Phase C-edit-data）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 cell-attachment（含 rich-text runs）随 **fill 柄平铺**（D1）与 **clipboard copy/paste**（D2）正确跟随，对齐 Google 表格「填充/复制携带格式」语义；非连续映射/跨 Grid 时保守降级（no-op / 无附件），不错位。纯 core，与 C-edit-UI 互不依赖。

**Architecture:** 两条独立轴，均镜像既有 format/merge 的成熟模式。**D1 fill:** `FillStylePropagator` 加第 3 依赖 `attachmentStore`，平铺 attachment（仿 `tileFillFormat`）+ 快照进 `FillStyleSnapshots` → fill `UndoCommand` attachment 字段 → `FillUndoHandler` 恢复。**D2 clipboard:** `GridRuntime.clipboardCache` 扩展携带选区 attachment（copy 时经注册 codec serialize、view→raw 读）；paste 在 typed-cache 命中（同 Grid）时经 codec deserialize 写回目标，bundle 进 paste `UndoCommand`；cache miss（跨 Grid/外部）降级无附件。

**Tech Stack:** TypeScript（strict + `noUncheckedIndexedAccess` + `verbatimModuleSyntax`）、`bun:test`、`@novasheet/mbd`（Core L1/L2 场景）。

**前置:** Phase A（attachment 轴 + `CellAttachmentStore` + `setCellAttachment`/`getCellAttachment` + codec 注册）已 ship。C-edit-UI 已加 `engine.viewRowToRaw/viewColToRaw`（公开）。spec [`2026-06-13-novasheet-cell-kit-rich-text-design.md`](../specs/2026-06-13-novasheet-cell-kit-rich-text-design.md) §5.2/§9。路线图 [`2026-06-13-novasheet-rich-text-roadmap.md`](./2026-06-13-novasheet-rich-text-roadmap.md) §4.3（CD1–CD3）。

**方法论（BDD 外环 × TDD 内环）:**
- BDD gate：Core L1 `core.L1.cell-attachment-fill-propagate`（fill 携带）+ Core L2 `core.L2.cell-attachment-clipboard-roundtrip`（copy/paste 往返）先红。
- 内环 TDD：propagator/undo/runtime 单元。
- **plan-risk（须 STOP+ASK）:**
  - D1 fill 平铺的「源无附件则清除目标陈旧附件」语义须与 `tileFillFormat` 一致（对齐 Google 覆盖语义）；若与某测试期望矛盾，先停。
  - D2 paste undo bundling：attachment 写入须与 value 写入**同一条** paste undo 命令（一次 undo 全撤），不得各自入栈产生多条 undo。若实现导致多条 undo，STOP+ASK。
  - D2 copy 读 attachment 用 view→raw（选区是 view），paste 写也 view→raw；若坐标空间混用导致错位，先停。

---

## 设计要点（贯穿全 plan）

**D1 fill 平铺**（镜像 `tileFillFormat`，spec §5.2）：源选区每格的全部 namespace 附件，按填充轴 `positiveModulo` 平铺到目标；源格无附件 → 清除目标对应格陈旧附件。快照 = 平铺前后 `attachmentStore.snapshot()`。

**D2 clipboard 携带**（镜像 `clipboardCache` typed buffer，spec §5.2）：
- copy/cut：选区每格、每注册 namespace 经 `codec.serialize(getCellAttachment(ns, raw))` 存进 cache 的 `attachments`（相对选区左上角偏移）。
- paste：仅 typed-cache 命中（`tsvHash` 相等 = 同 Grid 内部）时，按目标偏移 `codec.deserialize` 写回；cache miss（跨 Grid/外部 TSV）→ 无附件（spec「安全降级」）。
- undo：attachment 写入 bundle 进 paste `UndoCommand` 的 attachment 快照（一次 undo 全撤）。

**attachment 快照类型**（Phase A 已有）：`CellAttachmentSnapshot`（`packages/core/src/kernel/protocol/AttachmentTypes.ts`，`grep` 确认导出名）。

---

## File Structure

| 文件 | 责任 | 动作 |
| --- | --- | --- |
| `packages/core/src/features/fill/FillStylePropagator.ts` | 加 `attachmentStore` 依赖 + `tileFillAttachment` + 快照 | Modify |
| `packages/core/src/engine/DefaultGridEngine.ts` | `FillStylePropagator` 注入 attachmentStore；fill/paste undo ctx 加 `restoreAttachments`；暴露注册 namespaces | Modify |
| `packages/core/src/kernel/undo/UndoCommand.ts` | fill + paste 命令加 `attachmentBefore?/attachmentAfter?` | Modify |
| `packages/core/src/features/fill/FillUndoHandler.ts` | `FillUndoContext.restoreAttachments` + undo/redo 恢复 | Modify |
| `packages/core/src/features/clipboard/PasteController.ts` | paste 携带 attachment 写入 + 快照进 undo | Modify |
| `packages/core/src/dom/runtime/GridRuntime.ts` | `clipboardCache.attachments` 捕获（copy）+ 恢复（paste typed-hit） | Modify |
| `packages/core/src/engine/GridEngine.ts` | 接口加 `getAttachmentNamespaces`（若需） | Modify |
| `packages/core/tests/...` | propagator/undo/runtime 单元 + Core L1/L2 BDD | Create |

---

## Task 1: D1 — FillStylePropagator 平铺 attachment + 快照

**Files:**
- Modify: `packages/core/src/features/fill/FillStylePropagator.ts`
- Modify: `packages/core/src/engine/DefaultGridEngine.ts`（注入 attachmentStore）
- Test: `packages/core/tests/features/fill/fill-attachment-propagate.test.ts`

- [ ] **Step 1: 探查**

```bash
grep -n "new FillStylePropagator\|FillStyleSnapshots\|attachmentStore" packages/core/src/engine/DefaultGridEngine.ts packages/core/src/features/fill/FillStylePropagator.ts
grep -n "snapshot\|restore\|set\b\|get\b" packages/core/src/features/attachment/CellAttachmentStore.ts | head
```
确认 `CellAttachmentStore` 的 `snapshot()`/`restore()`/`get`/`set` 签名（Phase A）。

- [ ] **Step 2: 写失败测试**

`packages/core/tests/features/fill/fill-attachment-propagate.test.ts`——构造一个最小 `FillStylePropagator`（直接 new，注入 fake/真 stores + coords），验证 `propagateFillStyles` 把源格附件向下平铺到目标格 + 快照含 attachmentBefore/After：

```ts
import { describe, expect, it } from 'bun:test'
import { FillStylePropagator } from '../../../src/features/fill/FillStylePropagator'
import { CellAttachmentStore } from '../../../src/features/attachment/CellAttachmentStore'
// RangeStyleStore/MergeStore/CoordinateSpace 构造按既有 fill 单测的 setup（先看同目录 *.test.ts）

describe('FillStylePropagator — attachment 平铺', () => {
  it('源格附件向下平铺到 fill 目标 + 快照', () => {
    // setup：identity coords（view===raw），formatStore/mergeStore 空
    // 源 (row0,col0) 设 attachment 'demo' = { v: 1 }
    // fill down 到 row1
    // 期望：propagateFillStyles 后 attachmentStore.get('demo', 1, 0) === { v: 1 }
    //       返回 snapshots.attachmentBefore / attachmentAfter 非 undefined
  })
})
```

> **实现者注:** 先看 `packages/core/tests/features/fill/` 既有 `*.test.ts` 如何 new `FillStylePropagator`（RangeStyleStore/MergeStore/CoordinateSpace 怎么造）。**照搬 setup**，只加 `CellAttachmentStore` 第 3 参 + attachment 断言。若既有 fill 单测都走 engine 而非直接 new propagator，则改为在本测试直接 new propagator（构造 3 store + identity coords stub）。把上面伪代码补成真实可跑测试。

- [ ] **Step 3: 跑确认红**

Run: `bun test packages/core/tests/features/fill/fill-attachment-propagate.test.ts`
Expected: FAIL（构造器不接 attachmentStore / 不平铺）。

- [ ] **Step 4: 加 attachmentStore 依赖 + tileFillAttachment**

`FillStylePropagator.ts`：
- 构造器加第 3 参（在 mergeStore 后、coords 前 **或** coords 后——按既有顺序，attachmentStore 放 coords 前最自然）：`private readonly attachmentStore: CellAttachmentStore`。import `CellAttachmentStore` 类型 + `CellAttachmentSnapshot`。
- `FillStyleSnapshots` 加：`attachmentBefore?: CellAttachmentSnapshot; attachmentAfter?: CellAttachmentSnapshot`。
- `propagateFillStyles` 在 `tileFillMerge` 后加 `this.tileFillAttachment(rawSource, rawFill, direction)`，并在返回对象加 `attachmentBefore`（平铺前快照）/`attachmentAfter`（平铺后快照）。
- 新 `tileFillAttachment`（仿 `tileFillFormat`，但遍历全 namespace）：

```ts
  /** 附件平铺：清空目标区每格附件后，按填充轴取源格附件重写（源无 → 清除目标陈旧，对齐 Google）。 */
  private tileFillAttachment(rawSource: RawRange, rawFill: RawRange, direction: FillDirection): void {
    const namespaces = this.attachmentStore.namespacesInRange(rawSource, rawFill)
    if (namespaces.length === 0) return
    const sRows = rawSource.endRow - rawSource.startRow + 1
    const sCols = rawSource.endCol - rawSource.startCol + 1
    const vertical = direction === 'down' || direction === 'up'
    for (let row = rawFill.startRow; row <= rawFill.endRow; row += 1) {
      for (let col = rawFill.startCol; col <= rawFill.endCol; col += 1) {
        const srcRow = vertical ? rawSource.startRow + positiveModulo(row - rawSource.startRow, sRows) : row
        const srcCol = vertical ? col : rawSource.startCol + positiveModulo(col - rawSource.startCol, sCols)
        for (const ns of namespaces) {
          const data = this.attachmentStore.get(ns, srcRow, srcCol)
          this.attachmentStore.set(ns, row, col, data) // data===undefined 即清除目标陈旧
        }
      }
    }
  }
```

> **`namespacesInRange` 缺则补:** `CellAttachmentStore` 可能无「列出某区域涉及的 namespace」方法。若无，加一个 `namespaces(): readonly string[]`（返回 store 内所有 namespace）最简单——遍历全 namespace 对 fill 区写（源无则清）。**优先加最小 `namespaces()`**（返回 store 持有的全部 namespace key），`tileFillAttachment` 用它（不需 range 过滤，源无附件时 `get` 返 undefined→`set` 清除目标，语义正确）。把上面 `namespacesInRange(...)` 改为 `namespaces()`。

`DefaultGridEngine.ts`——`new FillStylePropagator(...)` 加 `this.formatState.attachmentStore` 参（位置匹配构造器签名）。

- [ ] **Step 5: 跑确认绿 + core 回归**

```bash
bun test packages/core/tests/features/fill/
bun test packages/core/
bun run --filter @novasheet/core typecheck
```
Expected: 新测试绿；core 全回归绿。若「源无附件清除目标」语义与测试冲突 → STOP+ASK。

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/features/fill/FillStylePropagator.ts packages/core/src/features/attachment/CellAttachmentStore.ts packages/core/src/engine/DefaultGridEngine.ts packages/core/tests/features/fill/fill-attachment-propagate.test.ts
git commit -m "feat(core): fill 平铺 attachment（仿 tileFillFormat，源无则清目标）+ 快照

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: D1 — fill undo attachment 恢复 + Core L1 BDD

**Files:**
- Modify: `packages/core/src/kernel/undo/UndoCommand.ts`
- Modify: `packages/core/src/features/fill/FillUndoHandler.ts`
- Modify: `packages/core/src/engine/DefaultGridEngine.ts`（commitFill 组装 attachment 快照 + FillUndoContext.restoreAttachments）
- Create: `packages/core/tests/acceptance/.../scenarios/cell-attachment-fill-propagate.md`
- Test: `packages/core/tests/...` 对应 BDD 测试

- [ ] **Step 1: 探查 commitFill 组装 + fill undo ctx**

```bash
grep -n "kind: 'fill'\|formatBefore\|FillStyleSnapshots\|commitFill\|FillUndoContext\|restoreFormat\|restoreMerge" packages/core/src/engine/DefaultGridEngine.ts | head
grep -n "attachmentBefore\|restoreAttachments\|FormatUndoContext" packages/core/src/engine/DefaultGridEngine.ts | head
```
看 fill undo 命令在哪组装（FillStyleSnapshots → `{kind:'fill', ..., formatBefore, ...}`），及 Phase A 的 `restoreAttachments` 怎么注入 FormatUndoContext（复用同款）。

- [ ] **Step 2: 写失败测试（fill attachment undo/redo）**

验证 fill 携带附件后 undo 还原源态、redo 再平铺。最小 engine 级测试（或扩 Task 1 测试）：

```ts
// 在 mounted engine：源格设 attachment → fill down → undo → 目标格附件消失、源保留
//                                                  → redo → 目标格附件恢复
```
按既有 fill undo 测试（`packages/core/tests/.../fill` 或 undo 目录）的 engine setup 写。

- [ ] **Step 3: 跑确认红**

- [ ] **Step 4: 实现**

`UndoCommand.ts`——`kind:'fill'` 命令加（紧挨 mergeBefore/After）：
```ts
      readonly attachmentBefore?: CellAttachmentSnapshot
      readonly attachmentAfter?: CellAttachmentSnapshot
```
（import `CellAttachmentSnapshot`——Phase A 的 format 命令已 import，确认。）

`FillUndoHandler.ts`：
- `FillUndoContext` 加 `restoreAttachments(snap: CellAttachmentSnapshot): void`。
- `applyUndo`：`if (command.attachmentBefore) this.ctx.restoreAttachments(command.attachmentBefore)`（在 restoreMerge 后、restoreSelection 前，次序敏感——附件与 format/merge 同组）。
- `applyRedo`：`if (command.attachmentAfter) this.ctx.restoreAttachments(command.attachmentAfter)`。

`DefaultGridEngine.ts`：
- commitFill 组装 fill 命令处，把 `styles.attachmentBefore/attachmentAfter`（Task 1 返回）填进命令。
- FillUndoContext 注入 `restoreAttachments: (snap) => this.formatState.restoreAttachments(snap)`（复用 Phase A 的 `restoreAttachments`，与 FormatUndoContext 同款）。

- [ ] **Step 5: BDD 场景 + 跑绿**

Core L1 场景 `cell-attachment-fill-propagate.md`（放 Phase A 附件场景同目录 `packages/core/tests/acceptance/contract/plugin-api/scenarios/`）：

```markdown
---
id: core.L1.cell-attachment-fill-propagate
layer: L1
summary: fill 柄向下平铺携带源格附件
tags: [grid, attachment, fill]
status: implemented
---

## User Story

作为单元格扩展作者，当用户从含附件的源格向下拖填充柄时，我希望附件随之平铺到目标格（对齐 Google 携带格式），undo 能整体撤销。

## Given
- mounted Grid，注册 namespace `demo`，raw (0,0) 设附件 `{ v: 1 }`

## When
- 选中 (0,0)，向下 fill 到 (2,0)

## Then
- `getCellAttachment('demo', 1, 0)` 与 `(2,0)` 均为 `{ v: 1 }`
- undo 后 `(1,0)`/`(2,0)` 附件消失，`(0,0)` 保留
```

按 Phase A 附件 BDD 测试（`bdd.test.ts`）的模式补对应测试断言（同文件追加 describe 或新建）。`mbd validate` + scenario-coverage 不退化。

```bash
bun test packages/core/
bun run --filter @novasheet/mbd mbd validate
bun run --filter @novasheet/core typecheck
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/kernel/undo/UndoCommand.ts packages/core/src/features/fill/FillUndoHandler.ts packages/core/src/engine/DefaultGridEngine.ts packages/core/tests
git commit -m "feat(core): fill undo/redo 恢复 attachment 快照 + Core L1 fill-propagate 场景

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: D2 — paste undo attachment 字段 + engine 暴露 namespaces + codec 访问

**Files:**
- Modify: `packages/core/src/kernel/undo/UndoCommand.ts`（paste 命令 attachment 字段）
- Modify: `packages/core/src/engine/GridEngine.ts` + `DefaultGridEngine.ts`（暴露 `getAttachmentNamespaces` + `getAttachmentCodec`）
- Test: `packages/core/tests/engine/attachment-namespaces.test.ts`

> D2 copy/paste 在 GridRuntime（DOM 壳）需要：① 列出注册 namespace（遍历选区附件）；② 取 codec（serialize/deserialize）。本 task 暴露这两个 engine 公开能力 + 给 paste 命令加 attachment 快照字段（Task 5 填充）。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'bun:test'
// mounted engine with cellAttachments: [demoCodec]
describe('engine attachment registry accessors', () => {
  it('exposes registered namespaces + codec', () => {
    // expect(engine.getAttachmentNamespaces()).toContain('demo')
    // expect(engine.getAttachmentCodec('demo')?.serialize({...})).toBe('...')
  })
})
```
按既有 engine 测试 setup（`packages/core/tests/engine/` 或 acceptance）补 mounted engine + demoCodec。

- [ ] **Step 2: 跑确认红 + 实现**

`GridEngine.ts` 接口加：
```ts
  /** 已注册的附件 namespace 列表（供 clipboard 遍历选区附件）。 */
  getAttachmentNamespaces(): readonly string[]
  /** 取某 namespace 的 codec（serialize/deserialize）；未注册返回 undefined。 */
  getAttachmentCodec(namespace: string): CellAttachmentCodec<unknown> | undefined
```
`DefaultGridEngine.ts` 实现（`codecRegistry` 已是 `Map<string, CellAttachmentCodec<unknown>>`，DefaultGridEngine.ts:102）：
```ts
  getAttachmentNamespaces(): readonly string[] { return [...this.codecRegistry.keys()] }
  getAttachmentCodec(namespace: string): CellAttachmentCodec<unknown> | undefined { return this.codecRegistry.get(namespace) }
```

`UndoCommand.ts`——`kind:'paste'` 命令加：
```ts
      readonly attachmentBefore?: CellAttachmentSnapshot
      readonly attachmentAfter?: CellAttachmentSnapshot
```

> 注：mock-grid-engine（canvas2d/core 测试 helper）若实现 `GridEngine` 接口，须补这两个新方法 stub——`grep -rn "getAttachmentNamespaces\|implements GridEngine\|mock-grid-engine" packages` 找到后补 `() => []` / `() => undefined`。

- [ ] **Step 3: 跑绿 + 回归**

```bash
bun test packages/core/
bun run --filter '*' typecheck   # mock 同步后全包绿
```

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/engine packages/core/src/kernel/undo/UndoCommand.ts packages/core/tests packages/canvas2d/tests/helpers
git commit -m "feat(core): engine 暴露 attachment namespaces/codec + paste undo attachment 字段

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: D2 — copy/cut 捕获选区 attachment 进 clipboardCache

**Files:**
- Modify: `packages/core/src/dom/runtime/GridRuntime.ts`
- Test: `packages/core/tests/dom/runtime/clipboard-attachment-copy.test.ts`

> `clipboardCache`（GridRuntime.ts:326）扩展携带选区 attachment：copy/cut 时按选区每格、每注册 namespace 经 codec serialize 存（相对选区左上角偏移）。坐标：选区是 view，读 attachment 经 `engine.viewRowToRaw/viewColToRaw`。

- [ ] **Step 1: 探查 + 写失败测试**

```bash
grep -n "clipboardCache\|snapshotSelection\|handleClipboardCopy\|viewRowToRaw" packages/core/src/dom/runtime/GridRuntime.ts
```
测试 `clipboard-attachment-copy.test.ts`：mounted runtime + demoCodec，选区某格设 attachment，调 `handleClipboardCopy`，断言 `clipboardCache.attachments` 含该格 serialize 后的数据（相对偏移 0,0）。按既有 GridRuntime clipboard 测试 setup（`packages/core/tests/dom/runtime/` 找 clipboard 相关）。

- [ ] **Step 2: 跑确认红**

- [ ] **Step 3: 实现**

`GridRuntime.ts`：
- `clipboardCache` 类型加 `attachments?: ReadonlyArray<ReadonlyArray<Record<string, string>>>`（行×列，每格 `{ [namespace]: serialized }`，无附件则空对象）。
- `snapshotSelection` 后或 copy/cut 内，构建 attachments：遍历选区 view 行列，`engine.getAttachmentNamespaces()` 每 ns，`engine.getCellAttachment(ns, viewRowToRaw(r), viewColToRaw(c))`，有则 `codec.serialize(data)` 存。
- 抽 helper `captureSelectionAttachments(range): Record<string,string>[][]`，在 `handleClipboardCopy`/`handleClipboardCut` 都填入 cache。

```ts
  private captureSelectionAttachments(range: CellRange): Record<string, string>[][] {
    const namespaces = this.engine.getAttachmentNamespaces()
    const grid: Record<string, string>[][] = []
    for (let r = range.startRow; r <= range.endRow; r++) {
      const rowOut: Record<string, string>[] = []
      for (let c = range.startCol; c <= range.endCol; c++) {
        const cell: Record<string, string> = {}
        if (namespaces.length > 0) {
          const rawRow = this.engine.viewRowToRaw(r)
          const rawCol = this.engine.viewColToRaw(c)
          for (const ns of namespaces) {
            const data = this.engine.getCellAttachment(ns, rawRow, rawCol)
            if (data !== undefined) {
              const codec = this.engine.getAttachmentCodec(ns)
              if (codec) cell[ns] = codec.serialize(data)
            }
          }
        }
        rowOut.push(cell)
      }
      grid.push(rowOut)
    }
    return grid
  }
```
copy/cut 内：`this.clipboardCache = { range: snap.range, rows: snap.rows, tsvHash: ..., attachments: this.captureSelectionAttachments(snap.range) }`。

- [ ] **Step 4: 跑绿**

```bash
bun test packages/core/tests/dom/runtime/clipboard-attachment-copy.test.ts
bun test packages/core/
bun run --filter @novasheet/core typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/dom/runtime/GridRuntime.ts packages/core/tests/dom/runtime/clipboard-attachment-copy.test.ts
git commit -m "feat(core): copy/cut 捕获选区 attachment 进 clipboardCache（codec serialize，view→raw）

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: D2 — paste 恢复 attachment（typed-hit）bundle 进 undo + Core L2 BDD

**Files:**
- Modify: `packages/core/src/dom/runtime/GridRuntime.ts`（paste 恢复 attachment）
- Modify: `packages/core/src/engine/DefaultGridEngine.ts` + `packages/core/src/features/clipboard/PasteController.ts`（attachment 写入 bundle 进 paste undo）
- Create: Core L2 场景 `cell-attachment-clipboard-roundtrip.md`
- Test: `packages/core/tests/...` paste 恢复 + undo + BDD

> **plan-risk（bundle 进单 undo）:** paste 的 attachment 写入须与 value 写入**同一条** paste undo 命令。设计：`commitPaste` 增可选 `attachmentWrites`（目标 raw 坐标 + ns + data 列表），PasteController 在 value 写入后应用 attachment 写入，并把 `attachmentStore.snapshot()` before/after 填进 `{kind:'paste'}` 命令；paste undo handler 恢复。**若难以 bundle 进单命令，STOP+ASK**——别用多条 setCellAttachment（各自入栈）凑。

- [ ] **Step 1: 探查 commitPaste + PasteController 接线**

```bash
grep -n "commitPaste\|PasteController\|pushUndo\|applyPaste\|attachmentStore" packages/core/src/engine/DefaultGridEngine.ts packages/core/src/features/clipboard/PasteController.ts
grep -rn "kind === 'paste'\|applyUndo.*paste\|paste 分支" packages/core/src/ | grep -i undo
```
看 paste undo **恢复**在哪（PasteController 只组装命令，恢复在 DefaultGridEngine.applyUndo 的 paste 分支 or 某 PasteUndoHandler）。

- [ ] **Step 2: 写失败测试**

mounted runtime：源格设 attachment → copy → 移动选区 → paste → 目标格附件出现（codec 往返）；undo → 目标附件消失（一次 undo）。

- [ ] **Step 3: 跑确认红 + 实现**

- `commitPaste`（engine）加可选参 `attachmentWrites?: readonly { rawRow: number; rawCol: number; namespace: string; data: unknown }[]`。
- PasteController：value 写入后，若有 attachmentWrites，`attachmentBefore = attachmentStore.snapshot()` → 逐条 `attachmentStore.set(...)` → `attachmentAfter = snapshot()`，填进 `pushUndo({ kind:'paste', target, before, after, attachmentBefore, attachmentAfter })`。
- paste undo **恢复**分支（按 Step 1 定位）：`if (cmd.attachmentBefore) restoreAttachments(cmd.attachmentBefore)`（undo）/ `attachmentAfter`（redo）。注入 `restoreAttachments`（复用 Phase A）。
- `GridRuntime.handleClipboardPaste`：typed-cache 命中分支（`clipboardCache.tsvHash === tsvHash`）时，从 `clipboardCache.attachments` 按 target 偏移 `codec.deserialize` 构建 `attachmentWrites`（target view→raw），传给 `commitPaste`。cache miss 分支不传（降级无附件）。

> target 偏移映射：paste target 左上角对齐 cache 左上角，按 `attachments[i][j]` 平铺到 target 各格（与 value typed paste 同偏移逻辑）。target 格 view→raw 后作 attachmentWrites 坐标。

- [ ] **Step 4: BDD 场景 + 跑绿**

Core L2 `cell-attachment-clipboard-roundtrip.md`：

```markdown
---
id: core.L2.cell-attachment-clipboard-roundtrip
layer: L2
summary: copy/paste 同 Grid 内携带附件往返
tags: [grid, attachment, clipboard]
status: implemented
---

## User Story

作为单元格扩展作者，当用户在同一 Grid 内复制含附件的格再粘贴到别处时，我希望附件经 codec 往返出现在目标格，undo 整体撤销；跨 Grid/外部纯文本粘贴则安全降级无附件。

## Given
- mounted Grid，注册 `demo` codec，raw (0,0) 附件 `{ v: 9 }`

## When
- copy (0,0)，选中 (2,0) paste

## Then
- `getCellAttachment('demo', 2, 0)` === `{ v: 9 }`（codec 往返）
- undo 后 `(2,0)` 附件消失
```

```bash
bun test packages/core/
bun run --filter @novasheet/mbd mbd validate
bun run --filter @novasheet/react lint:scenario-coverage
bun run --filter @novasheet/core typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src packages/core/tests
git commit -m "feat(core): paste typed-hit 经 codec 恢复 attachment（bundle 单 undo）+ Core L2 往返场景

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 6: 全量 gates + 里程碑收尾

- [ ] **Step 1: 全量四门**

```bash
bun test
bun run --filter '*' typecheck
bun run lint
bun run --filter @novasheet/core build && bun run --filter @novasheet/canvas2d build && bun run --filter @novasheet/react build && bun run --filter @novasheet/cell-kit build
grep -rn "TextRun\|fontWeight\|strikethrough" packages/core/src/   # 须空
```
Expected: 四门全过；core grep 空。

- [ ] **Step 2: 里程碑收尾**

dispatch code-reviewer（即便全绿）。更新路线图 §1.3 fill/clipboard ☑、§4.3 标 C-edit-data ship。

---

## Self-Review（plan 对 spec §5.2 + roadmap §4.3）

**Spec 覆盖:**
- §5.2 fill 柄携带附件（延续 bb015ed format 携带）→ Task 1+2。✓
- §5.2 clipboard copy 经 codec serialize / paste 经 deserialize / 跨 Grid 安全降级 → Task 3-5。✓（typed-cache 命中=同 Grid 携带；miss=降级无附件）
- §5.2 undo（set 经写门面入栈，快照对比同 format）→ fill undo（Task 2）+ paste undo bundle（Task 5）。✓
- sort/filter 打散保守 no-op → fill propagator 已有「view→raw 非连续返回空对象」（Task 1 复用既有 guard，attachment 平铺只在 raw 连续时执行）。✓

**roadmap §4.3 映射:** CD1 fill → Task 1+2；CD2 clipboard → Task 3-5；CD3 BDD → Task 2（L1 fill）+ Task 5（L2 clipboard）。✓

**plan-risk 已标:** ① fill「源无则清目标」语义（Task 1）；② paste undo bundle 单命令（Task 5）；③ copy/paste view→raw 坐标空间（Task 4/5）。三处 STOP+ASK。

**Placeholder 扫描:** Task 1/2 测试为伪代码骨架（因 fill/undo 单测 setup 依赖既有 harness，明确要求实现者照搬既有 setup 补全）——非占位，是「按既有模式补全」的显式指引 + 完整断言意图。其余步含完整代码。

**类型一致性:** `CellAttachmentSnapshot`（Phase A）、`FillStyleSnapshots`（加 attachment 字段）、`tileFillAttachment`、`captureSelectionAttachments`、`getAttachmentNamespaces`/`getAttachmentCodec`、paste/fill UndoCommand attachment 字段跨 task 命名统一；`restoreAttachments` 复用 Phase A 同名方法。

**依赖顺序:** Task 1→2（fill）独立于 Task 3→4→5（clipboard）；Task 6 收尾。fill 与 clipboard 两轴可并行（但本 plan 顺序执行）。
