# Phase 4.1 Clipboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 真正的 Cut / Copy / Paste：内部类型缓存 + 系统剪贴板 TSV 双写；Ctrl+X/C/V 快捷键；自动接 4.0 右键菜单（consumer 不传 `onContextMenuAction` 时走默认引擎）。

**Architecture:** Core 写 3 个纯函数（TSV serialize / parse、computePasteTarget + applyPaste、engine.clearRange）；Web 加 1 个剪贴板适配器（封装 `navigator.clipboard`）+ Runtime 三个 async 方法（copy/cut/paste）+ keydown 路由 + Grid facade 包一层。

**Tech Stack:** TypeScript（strict + `verbatimModuleSyntax` + `noUncheckedIndexedAccess`）；bun:test + happy-dom；`navigator.clipboard` mock 在 web 包测试中。

**Spec:** [docs/superpowers/specs/2026-05-18-clipboard-design.md](../specs/2026-05-18-clipboard-design.md)

---

## File Structure

**Create:**

- `packages/core/src/clipboard/TsvFormat.ts` — serialize / parse
- `packages/core/src/clipboard/ApplyPaste.ts` — target rect + coerce + apply
- `packages/core/src/clipboard/types.ts` — PasteSkippedCell / ClipboardAction
- `packages/core/tests/clipboard/TsvFormat.test.ts`
- `packages/core/tests/clipboard/ApplyPaste.test.ts`
- `packages/web/src/clipboard/WebClipboardAdapter.ts` — navigator.clipboard 封装
- `packages/web/tests/clipboard/WebClipboardAdapter.test.ts`
- `apps/storybook/src/stories/Clipboard.stories.ts`
- `apps/storybook/src/stories/snippets/clipboard.basic.snippet.ts`

**Modify:**

- `packages/core/src/index.ts` — re-export
- `packages/core/src/engine/DefaultGridEngine.ts` — `clearRange(range)` 方法
- `packages/core/src/engine/GridEngine.ts` — 接口加 `clearRange`
- `packages/core/tests/engine/DefaultGridEngine.test.ts`
- `packages/web/src/runtime/WebGridRuntime.ts` — copy/cut/paste + 内部缓存 + keydown 路由 + onContextMenuAction 默认实现
- `packages/web/tests/runtime/WebGridRuntime.test.ts`
- `packages/web/src/grid/GridController.ts` — 接口 `copy/cut/paste`
- `packages/web/src/backends/Canvas2DBackend.ts` — 装配 adapter
- `packages/web/src/Grid.ts` — facade + 4 个新回调
- `packages/web/src/index.ts` — 导出新类型
- `packages/web/tests/Grid.test.ts`
- `README.md` — 标 4.1 完成

---

## Task 1: Core types + TsvFormat（serialize + parse）

**Files:**

- Create: `packages/core/src/clipboard/types.ts`
- Create: `packages/core/src/clipboard/TsvFormat.ts`
- Create: `packages/core/tests/clipboard/TsvFormat.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing tests**

```ts
// packages/core/tests/clipboard/TsvFormat.test.ts
import { describe, expect, it } from 'bun:test'
import { serializeRowsToTsv, parseTsvToCells } from '../../src/clipboard/TsvFormat'
import type { Schema } from '../../src/data/Schema'

const schema: Schema = {
  fields: [
    { id: 'name', name: 'Name', type: 'text', width: 100 },
    { id: 'qty', name: 'Qty', type: 'number', width: 100 },
    { id: 'done', name: 'Done', type: 'checkbox', width: 80 },
  ],
}

describe('serializeRowsToTsv', () => {
  it('text / number / boolean / null 按规则序列化', () => {
    const rows = [
      { name: 'apple', qty: 3, done: true },
      { name: 'banana', qty: null, done: false },
    ]
    expect(serializeRowsToTsv(rows, ['name', 'qty', 'done'])).toBe(
      'apple\t3\ttrue\nbanana\t\tfalse',
    )
  })

  it('undefined / NaN / Infinity → 空串', () => {
    const rows = [{ name: undefined, qty: NaN, done: undefined }]
    expect(serializeRowsToTsv(rows, ['name', 'qty', 'done'])).toBe('\t\t')
  })

  it('Date → ISO 字符串', () => {
    const d = new Date('2026-05-18T00:00:00.000Z')
    expect(serializeRowsToTsv([{ at: d }], ['at'])).toBe('2026-05-18T00:00:00.000Z')
  })

  it('数组（multiSelect）→ 逗号连接', () => {
    expect(serializeRowsToTsv([{ tags: ['a', 'b'] }], ['tags'])).toBe('a,b')
  })

  it('空 rows → 空字符串', () => {
    expect(serializeRowsToTsv([], ['name'])).toBe('')
  })
})

describe('parseTsvToCells', () => {
  it('两行 × 三列', () => {
    const out = parseTsvToCells('apple\t3\ttrue\nbanana\t\tfalse', ['name', 'qty', 'done'], schema)
    expect(out).toEqual([
      ['apple', 3, true],
      ['banana', null, false],
    ])
  })

  it('number 列：NaN → null（pure parse）', () => {
    const out = parseTsvToCells('abc\nhello', ['qty'], schema)
    expect(out).toEqual([[null], [null]])
  })

  it('text 列：空串保留为空串（不是 null）', () => {
    const out = parseTsvToCells('\nhello', ['name'], schema)
    expect(out).toEqual([[''], ['hello']])
  })

  it('checkbox：true/1/yes → true；false/0/no → false；其它 → null', () => {
    const out = parseTsvToCells('true\n1\nyes\nfalse\n0\nno\nmaybe', ['done'], schema)
    expect(out).toEqual([[true], [true], [true], [false], [false], [false], [null]])
  })

  it('行长不齐：短行右侧补 null', () => {
    const out = parseTsvToCells('a\tb\nc', ['name', 'qty'], schema)
    // 第二行只有 'c'，第二列缺 → null
    expect(out[1]).toEqual(['c', null])
  })

  it('trim 末尾换行', () => {
    expect(parseTsvToCells('a\n', ['name'], schema)).toEqual([['a']])
  })

  it('未知列 id（解析时 schema 没找到）→ raw string', () => {
    const out = parseTsvToCells('x\ny', ['nope'], schema)
    expect(out).toEqual([['x'], ['y']])
  })
})
```

- [ ] **Step 2: Run — fail（模块不存在）**

```bash
bun test packages/core/tests/clipboard/TsvFormat.test.ts
```

- [ ] **Step 3: Implement `types.ts`**

```ts
// packages/core/src/clipboard/types.ts
export type ClipboardAction = 'cut' | 'copy' | 'paste'

export interface PasteSkippedCell {
  readonly rowIndex: number
  readonly fieldId: string
  readonly reason: 'type' | 'readonly'
}
```

- [ ] **Step 4: Implement `TsvFormat.ts`**

```ts
// packages/core/src/clipboard/TsvFormat.ts
import type { CellValue, Schema } from '../data/Schema'
import type { Row } from '../data/DataSource'

function serializeValue(v: CellValue | undefined): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return ''
    return String(v)
  }
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (v instanceof Date) return v.toISOString()
  if (Array.isArray(v)) return v.join(',')
  return String(v)
}

export function serializeRowsToTsv(rows: readonly Row[], fieldIds: readonly string[]): string {
  return rows.map((row) => fieldIds.map((fid) => serializeValue(row[fid])).join('\t')).join('\n')
}

type ParsedCellValue = string | number | boolean | null

function coerce(value: string, type: string | undefined): ParsedCellValue {
  if (type === 'number') {
    if (value === '') return null
    const n = Number(value.trim())
    return Number.isFinite(n) ? n : null
  }
  if (type === 'checkbox') {
    const v = value.trim().toLowerCase()
    if (v === 'true' || v === '1' || v === 'yes') return true
    if (v === 'false' || v === '0' || v === 'no' || v === '') return false
    return null
  }
  // text / unknown → raw
  return value
}

export function parseTsvToCells(
  text: string,
  fieldIds: readonly string[],
  schema: Schema,
): readonly (readonly ParsedCellValue[])[] {
  const trimmed = text.replace(/\r\n/g, '\n').replace(/\n$/, '')
  if (trimmed === '') return []
  const fieldTypeById = new Map(schema.fields.map((f) => [f.id, f.type as string]))
  return trimmed.split('\n').map((line) => {
    const parts = line.split('\t')
    return fieldIds.map((fid, i) => {
      if (i >= parts.length) return null
      return coerce(parts[i]!, fieldTypeById.get(fid))
    })
  })
}
```

- [ ] **Step 5: Add exports to core `index.ts`** (interaction 块附近):

```ts
export { serializeRowsToTsv, parseTsvToCells } from './clipboard/TsvFormat'
export type { ClipboardAction, PasteSkippedCell } from './clipboard/types'
```

- [ ] **Step 6: Run tests + typecheck**

```bash
bun test packages/core/tests/clipboard/TsvFormat.test.ts
bun run --filter @novasheet/core typecheck
```

Expected: ~13 tests pass; typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/clipboard/ \
        packages/core/tests/clipboard/TsvFormat.test.ts \
        packages/core/src/index.ts
git commit -m "feat(core): Phase 4.1 TSV serialize + parse + clipboard types"
```

---

## Task 2: Core ApplyPaste（target rect + per-cell apply）

**Files:**

- Create: `packages/core/src/clipboard/ApplyPaste.ts`
- Create: `packages/core/tests/clipboard/ApplyPaste.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Failing tests**

```ts
// packages/core/tests/clipboard/ApplyPaste.test.ts
import { describe, expect, it, mock } from 'bun:test'
import {
  computePasteTarget,
  applyPaste,
  type ApplyPasteSource,
} from '../../src/clipboard/ApplyPaste'
import type { Schema } from '../../src/data/Schema'

const schema: Schema = {
  fields: [
    { id: 'a', name: 'A', type: 'text', width: 100 },
    { id: 'b', name: 'B', type: 'number', width: 100 },
    { id: 'c', name: 'C', type: 'text', width: 100 },
  ],
}

describe('computePasteTarget', () => {
  it('单格选区 → 从 active cell 起向右下扩 sourceRows × sourceCols', () => {
    const t = computePasteTarget(
      { rowIndex: 2, colIndex: 1 },
      { startRow: 2, endRow: 2, startCol: 1, endCol: 1 },
      3,
      2,
      { rowCount: 10, colCount: 3 },
    )
    expect(t).toEqual({
      startRow: 2,
      endRow: 4,
      startCol: 1,
      endCol: 2,
      tile: { rows: 1, cols: 1 },
    })
  })

  it('一对一选区 → 用 selectedRange 本身', () => {
    const t = computePasteTarget(
      { rowIndex: 1, colIndex: 0 },
      { startRow: 1, endRow: 3, startCol: 0, endCol: 1 },
      3,
      2,
      { rowCount: 10, colCount: 3 },
    )
    expect(t).toEqual({
      startRow: 1,
      endRow: 3,
      startCol: 0,
      endCol: 1,
      tile: { rows: 1, cols: 1 },
    })
  })

  it('整数倍 tile：4×4 选区 × 2×2 源 → tile 2×2', () => {
    const t = computePasteTarget(
      { rowIndex: 0, colIndex: 0 },
      { startRow: 0, endRow: 3, startCol: 0, endCol: 3 },
      2,
      2,
      { rowCount: 10, colCount: 4 },
    )
    expect(t).toEqual({
      startRow: 0,
      endRow: 3,
      startCol: 0,
      endCol: 3,
      tile: { rows: 2, cols: 2 },
    })
  })

  it('mismatch：从 selection 左上角填，多余 source 丢，不足 target 不动', () => {
    const t = computePasteTarget(
      { rowIndex: 0, colIndex: 0 },
      { startRow: 0, endRow: 2, startCol: 0, endCol: 0 },
      2,
      2,
      { rowCount: 10, colCount: 3 },
    )
    expect(t).toEqual({
      startRow: 0,
      endRow: 1,
      startCol: 0,
      endCol: 1,
      tile: { rows: 1, cols: 1 },
    })
  })

  it('超出 grid 边界 → 裁切', () => {
    const t = computePasteTarget(
      { rowIndex: 8, colIndex: 2 },
      { startRow: 8, endRow: 8, startCol: 2, endCol: 2 },
      5,
      3,
      { rowCount: 10, colCount: 3 },
    )
    // colCount=3 → endCol 最大 2；rowCount=10 → endRow 最大 9
    expect(t).toEqual({
      startRow: 8,
      endRow: 9,
      startCol: 2,
      endCol: 2,
      tile: { rows: 1, cols: 1 },
    })
  })
})

describe('applyPaste', () => {
  function makeData() {
    const writes: { row: number; field: string; value: unknown }[] = []
    return {
      writes,
      updateCell: mock((row: number, field: string, value: unknown) => {
        writes.push({ row, field, value })
      }),
    }
  }

  const fields = ['a', 'b', 'c']

  it('1×2 source → target 1×2 写两格', () => {
    const data = makeData()
    const source: ApplyPasteSource = {
      cells: [['hello', 42]],
      sourceFieldIds: ['a', 'b'],
      typed: true,
    }
    applyPaste(
      source,
      { startRow: 0, endRow: 0, startCol: 0, endCol: 1, tile: { rows: 1, cols: 1 } },
      schema,
      fields,
      data as never,
    )
    expect(data.writes).toEqual([
      { row: 0, field: 'a', value: 'hello' },
      { row: 0, field: 'b', value: 42 },
    ])
  })

  it('类型不匹配跳过 + onSkipped 收集', () => {
    const data = makeData()
    const skipped: { rowIndex: number; fieldId: string; reason: string }[] = []
    // source 不带类型（外部 TSV 路径）—— 'abc' 落到 number 列 b → 跳过
    const source: ApplyPasteSource = {
      cells: [['abc']],
      sourceFieldIds: ['b'],
      typed: false,
    }
    applyPaste(
      source,
      { startRow: 0, endRow: 0, startCol: 1, endCol: 1, tile: { rows: 1, cols: 1 } },
      schema,
      fields,
      data as never,
      (s) => skipped.push(...s),
    )
    expect(data.writes).toHaveLength(0)
    expect(skipped).toEqual([{ rowIndex: 0, fieldId: 'b', reason: 'type' }])
  })

  it('tile：2×2 source tile 2 次 → 写 4×2 = 8 格', () => {
    const data = makeData()
    const source: ApplyPasteSource = {
      cells: [
        ['x', 1],
        ['y', 2],
      ],
      sourceFieldIds: ['a', 'b'],
      typed: true,
    }
    applyPaste(
      source,
      { startRow: 0, endRow: 3, startCol: 0, endCol: 1, tile: { rows: 2, cols: 1 } },
      schema,
      fields,
      data as never,
    )
    expect(data.writes).toHaveLength(8)
    // tile 行重复 2 次：x,y,x,y
    expect(data.writes.map((w) => w.value)).toEqual(['x', 1, 'y', 2, 'x', 1, 'y', 2])
  })
})
```

- [ ] **Step 2: Run — fail**

```bash
bun test packages/core/tests/clipboard/ApplyPaste.test.ts
```

- [ ] **Step 3: Implement `ApplyPaste.ts`**

```ts
// packages/core/src/clipboard/ApplyPaste.ts
import type { MutableDataSource } from '../data/MutableDataSource'
import type { CellAddress, CellRange } from '../interaction/SelectionModel'
import type { CellValue, Schema } from '../data/Schema'
import type { PasteSkippedCell } from './types'

export interface PasteTargetRect {
  readonly startRow: number
  readonly endRow: number
  readonly startCol: number
  readonly endCol: number
  readonly tile: { rows: number; cols: number }
}

export interface ApplyPasteSource {
  /** 二维：rows × cols。值类型：typed=true 时是 CellValue；typed=false 时是 string|number|boolean|null（来自 TSV parse） */
  readonly cells: readonly (readonly (string | number | boolean | null | CellValue)[])[]
  /** source 各列对应的 field id（用于优先匹配；不够时按位置） */
  readonly sourceFieldIds: readonly string[]
  /** true=内部缓存命中（值已是目标类型，跳过 coerce）；false=外部 TSV 解析（每格再按目标列类型 coerce） */
  readonly typed: boolean
}

export interface GridDimensions {
  readonly rowCount: number
  readonly colCount: number
}

export function computePasteTarget(
  active: CellAddress,
  selection: CellRange,
  sourceRows: number,
  sourceCols: number,
  dims: GridDimensions,
): PasteTargetRect {
  const selRows = selection.endRow - selection.startRow + 1
  const selCols = selection.endCol - selection.startCol + 1

  let startRow = selection.startRow
  let startCol = selection.startCol
  let endRow: number
  let endCol: number
  let tileRows = 1
  let tileCols = 1

  if (selRows === 1 && selCols === 1) {
    // single cell — expand from active to source size
    startRow = active.rowIndex
    startCol = active.colIndex
    endRow = startRow + sourceRows - 1
    endCol = startCol + sourceCols - 1
  } else if (selRows === sourceRows && selCols === sourceCols) {
    // one-to-one
    endRow = selection.endRow
    endCol = selection.endCol
  } else if (selRows % sourceRows === 0 && selCols % sourceCols === 0) {
    // tile within selection
    tileRows = selRows / sourceRows
    tileCols = selCols / sourceCols
    endRow = selection.endRow
    endCol = selection.endCol
  } else {
    // mismatch — fill from top-left, source clipped to fit
    endRow = Math.min(selection.startRow + sourceRows - 1, selection.endRow)
    endCol = Math.min(selection.startCol + sourceCols - 1, selection.endCol)
  }

  // clip to grid dims
  endRow = Math.min(endRow, dims.rowCount - 1)
  endCol = Math.min(endCol, dims.colCount - 1)
  return { startRow, endRow, startCol, endCol, tile: { rows: tileRows, cols: tileCols } }
}

export function applyPaste(
  source: ApplyPasteSource,
  target: PasteTargetRect,
  schema: Schema,
  fieldIdsAtCols: readonly string[], // schema.fields[colIdx].id 映射，传入避免每次重算
  data: MutableDataSource,
  onSkipped?: (cells: readonly PasteSkippedCell[]) => void,
): void {
  const skipped: PasteSkippedCell[] = []
  const sourceRows = source.cells.length
  const sourceCols = source.cells[0]?.length ?? 0
  if (sourceRows === 0 || sourceCols === 0) return

  const fieldTypeById = new Map(schema.fields.map((f) => [f.id, f.type as string]))

  for (let r = target.startRow; r <= target.endRow; r++) {
    for (let c = target.startCol; c <= target.endCol; c++) {
      const localR = (r - target.startRow) % sourceRows
      const localC = (c - target.startCol) % sourceCols
      const rawValue = source.cells[localR]![localC]!
      const fieldId = fieldIdsAtCols[c]
      if (!fieldId) continue

      if (source.typed) {
        // 内部缓存：值已是正确类型，直接写
        data.updateCell(r, fieldId, rawValue as CellValue)
        continue
      }

      // 外部 TSV：按目标列类型 coerce 一次
      const type = fieldTypeById.get(fieldId)
      const coerced = coerceForType(rawValue, type)
      if (coerced === SKIP) {
        skipped.push({ rowIndex: r, fieldId, reason: 'type' })
        continue
      }
      data.updateCell(r, fieldId, coerced as CellValue)
    }
  }

  if (skipped.length > 0) onSkipped?.(skipped)
}

const SKIP = Symbol('skip')

function coerceForType(
  raw: string | number | boolean | null | CellValue,
  type: string | undefined,
): CellValue | typeof SKIP {
  if (raw === null || raw === undefined) return null
  if (type === 'number') {
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : SKIP
    if (typeof raw === 'string') {
      if (raw.trim() === '') return null
      const n = Number(raw.trim())
      return Number.isFinite(n) ? n : SKIP
    }
    return SKIP
  }
  if (type === 'checkbox') {
    if (typeof raw === 'boolean') return raw
    return SKIP
  }
  // text / unknown → string-ify
  if (typeof raw === 'string') return raw
  return String(raw)
}
```

- [ ] **Step 4: Export from core**

```ts
// packages/core/src/index.ts — 追加
export { computePasteTarget, applyPaste } from './clipboard/ApplyPaste'
export type { ApplyPasteSource, GridDimensions, PasteTargetRect } from './clipboard/ApplyPaste'
```

- [ ] **Step 5: Run tests + typecheck**

```bash
bun test packages/core/tests/clipboard/ApplyPaste.test.ts
bun run --filter @novasheet/core typecheck
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/clipboard/ApplyPaste.ts \
        packages/core/tests/clipboard/ApplyPaste.test.ts \
        packages/core/src/index.ts
git commit -m "feat(core): Phase 4.1 computePasteTarget + applyPaste with type coerce"
```

---

## Task 3: engine.clearRange

**Files:**

- Modify: `packages/core/src/engine/GridEngine.ts`
- Modify: `packages/core/src/engine/DefaultGridEngine.ts`
- Modify: `packages/core/tests/engine/DefaultGridEngine.test.ts`

- [ ] **Step 1: Failing test (append to existing DefaultGridEngine.test.ts)**

```ts
import type { CellRange } from '../../src/interaction/SelectionModel'

it('clearRange 对 MutableDataSource 把每个 cell 置 null', () => {
  const data = new InMemoryDataSource({
    schema: {
      fields: [
        { id: 'a', name: 'A', type: 'text', width: 100 },
        { id: 'b', name: 'B', type: 'number', width: 100 },
      ],
    },
    rows: [
      { a: 'x', b: 1 },
      { a: 'y', b: 2 },
    ],
  })
  const engine = new DefaultGridEngine({ data })
  const range: CellRange = { startRow: 0, endRow: 1, startCol: 0, endCol: 1 }
  engine.clearRange(range)
  expect(data.getCell(0, 'a')).toBe(null)
  expect(data.getCell(0, 'b')).toBe(null)
  expect(data.getCell(1, 'a')).toBe(null)
  expect(data.getCell(1, 'b')).toBe(null)
})

it('clearRange 在 non-Mutable DataSource 上 silent no-op', () => {
  const data = {
    getRowCount: () => 1,
    getSchema: () => ({ fields: [{ id: 'a', name: 'A', type: 'text', width: 100 }] }),
    getRows: () => [],
    getCell: () => 'x',
    subscribe: () => () => {},
  }
  const engine = new DefaultGridEngine({ data: data as never })
  expect(() => engine.clearRange({ startRow: 0, endRow: 0, startCol: 0, endCol: 0 })).not.toThrow()
})
```

- [ ] **Step 2: Run — fail**

- [ ] **Step 3: Add to GridEngine interface (`GridEngine.ts`):**

```ts
clearRange(range: CellRange): void
```

- [ ] **Step 4: Implement in DefaultGridEngine:**

```ts
clearRange(range: CellRange): void {
  if (!isMutableDataSource(this.data)) return
  const fields = this.data.getSchema().fields
  for (let r = range.startRow; r <= range.endRow; r++) {
    for (let c = range.startCol; c <= range.endCol; c++) {
      const field = fields[c]
      if (!field) continue
      this.data.updateCell(r, field.id, null)
    }
  }
}
```

- [ ] **Step 5: Run + typecheck**

```bash
bun test packages/core/tests/engine/DefaultGridEngine.test.ts
bun run --filter @novasheet/core typecheck
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/engine/GridEngine.ts \
        packages/core/src/engine/DefaultGridEngine.ts \
        packages/core/tests/engine/DefaultGridEngine.test.ts
git commit -m "feat(core): engine.clearRange for Phase 4.1 cut"
```

---

## Task 4: WebClipboardAdapter（navigator.clipboard 封装）

**Files:**

- Create: `packages/web/src/clipboard/WebClipboardAdapter.ts`
- Create: `packages/web/tests/clipboard/WebClipboardAdapter.test.ts`

- [ ] **Step 1: Failing tests**

```ts
// packages/web/tests/clipboard/WebClipboardAdapter.test.ts
import { describe, expect, it, mock } from 'bun:test'
import { WebClipboardAdapter } from '../../src/clipboard/WebClipboardAdapter'
import { stubGlobal, unstubAllGlobals } from '../helpers/global-stub'

describe('WebClipboardAdapter', () => {
  it('writeText 走 navigator.clipboard.writeText', async () => {
    const writeText = mock(async (_: string) => {})
    stubGlobal('navigator', { clipboard: { writeText } } as never)
    const adapter = new WebClipboardAdapter()
    await adapter.writeText('hello')
    expect(writeText).toHaveBeenCalledWith('hello')
    unstubAllGlobals()
  })

  it('readText 走 navigator.clipboard.readText', async () => {
    const readText = mock(async () => 'world')
    stubGlobal('navigator', { clipboard: { readText } } as never)
    const adapter = new WebClipboardAdapter()
    expect(await adapter.readText()).toBe('world')
    unstubAllGlobals()
  })

  it('clipboard API 不存在时：write/readText silent fallback', async () => {
    stubGlobal('navigator', {} as never)
    const adapter = new WebClipboardAdapter()
    expect(await adapter.writeText('x')).toBe(false) // 表示未成功写
    expect(await adapter.readText()).toBe(null)
    unstubAllGlobals()
  })

  it('writeText 抛错（如权限）→ 返回 false，不抛', async () => {
    const writeText = mock(async () => {
      throw new Error('denied')
    })
    stubGlobal('navigator', { clipboard: { writeText } } as never)
    const adapter = new WebClipboardAdapter()
    expect(await adapter.writeText('x')).toBe(false)
    unstubAllGlobals()
  })
})
```

- [ ] **Step 2: Run — fail**

- [ ] **Step 3: Implement adapter**

```ts
// packages/web/src/clipboard/WebClipboardAdapter.ts
/** navigator.clipboard 的薄封装；失败不抛错，返回 false / null，方便上层 silent fallback。 */
export class WebClipboardAdapter {
  async writeText(text: string): Promise<boolean> {
    const cb = (globalThis as { navigator?: { clipboard?: Clipboard } }).navigator?.clipboard
    if (!cb || typeof cb.writeText !== 'function') return false
    try {
      await cb.writeText(text)
      return true
    } catch {
      return false
    }
  }

  async readText(): Promise<string | null> {
    const cb = (globalThis as { navigator?: { clipboard?: Clipboard } }).navigator?.clipboard
    if (!cb || typeof cb.readText !== 'function') return null
    try {
      return await cb.readText()
    } catch {
      return null
    }
  }
}
```

- [ ] **Step 4: Run + typecheck**

```bash
bun test packages/web/tests/clipboard/WebClipboardAdapter.test.ts
bun run --filter @novasheet/web typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/clipboard/WebClipboardAdapter.ts \
        packages/web/tests/clipboard/WebClipboardAdapter.test.ts
git commit -m "feat(web): WebClipboardAdapter (navigator.clipboard wrapper)"
```

---

## Task 5: Runtime clipboard methods（copy/cut/paste + 内部缓存 + hash）

**Files:**

- Modify: `packages/web/src/runtime/WebGridRuntime.ts`
- Modify: `packages/web/tests/runtime/WebGridRuntime.test.ts`

要点：

- 新字段：`clipboardAdapter`, `clipboardCache`（snapshot + tsvHash）
- 三个 async 方法：`handleClipboardCopy()` / `handleClipboardCut()` / `handleClipboardPaste()`
- TSV hash 用 FNV-1a（小函数挂在 module-private）
- 4.0 内部缓存 ready 信号自动更新

- [ ] **Step 1: Failing tests**

```ts
// 在 WebGridRuntime.test.ts 加 describe — clipboard
describe('WebGridRuntime clipboard — Phase 4.1', () => {
  function makeClipboard() {
    return {
      writeText: mock(async (_: string) => true),
      readText: mock(async () => ''),
    }
  }

  it('copy 写 TSV 到 adapter；缓存填上', async () => {
    const engine = makeEngine()
    engine.getSelection = mock(() => ({
      activeCell: { rowIndex: 0, colIndex: 0 },
      anchorCell: { rowIndex: 0, colIndex: 0 },
      extentCell: { rowIndex: 0, colIndex: 1 },
      selectedRange: { startRow: 0, endRow: 0, startCol: 0, endCol: 1 },
    }))
    const data = {
      getCell: (r: number, f: string) => (f === 'a' ? `r${r}` : r * 10),
      getSchema: () => ({
        fields: [
          { id: 'a', name: 'A', type: 'text', width: 100 },
          { id: 'b', name: 'B', type: 'number', width: 100 },
        ],
      }),
      getRowCount: () => 5,
      getRows: () => [],
      subscribe: () => () => {},
      updateCell: mock(() => {}),
    }
    engine.getData = mock(() => data as never)
    const adapter = makeClipboard()
    const runtime = new WebGridRuntime({ engine, host: makeHost(), renderer: makeRenderer() })
    runtime.setClipboardAdapter(adapter as never)
    await runtime.handleClipboardCopy()
    expect(adapter.writeText).toHaveBeenCalledWith('r0\t0')
  })

  it('cut 写 TSV + 清原格', async () => {
    const engine = makeEngine()
    engine.getSelection = mock(() => ({
      activeCell: { rowIndex: 0, colIndex: 0 },
      anchorCell: { rowIndex: 0, colIndex: 0 },
      extentCell: { rowIndex: 0, colIndex: 0 },
      selectedRange: { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
    }))
    engine.clearRange = mock(() => {})
    const data = {
      getCell: () => 'x',
      getSchema: () => ({ fields: [{ id: 'a', name: 'A', type: 'text', width: 100 }] }),
      getRowCount: () => 5,
      getRows: () => [],
      subscribe: () => () => {},
      updateCell: mock(() => {}),
    }
    engine.getData = mock(() => data as never)
    const adapter = makeClipboard()
    const runtime = new WebGridRuntime({ engine, host: makeHost(), renderer: makeRenderer() })
    runtime.setClipboardAdapter(adapter as never)
    await runtime.handleClipboardCut()
    expect(adapter.writeText).toHaveBeenCalledWith('x')
    expect(engine.clearRange).toHaveBeenCalledWith({
      startRow: 0,
      endRow: 0,
      startCol: 0,
      endCol: 0,
    })
  })

  it('paste 内部缓存命中走 typed=true 路径', async () => {
    // copy 后 paste 同一 grid，应走内部缓存
    // ...略，参考前两 test 的 setup
  })

  it('paste readText 抛错（adapter null 返回）→ silent no-op', async () => {
    const engine = makeEngine()
    engine.getSelection = mock(() => ({
      activeCell: { rowIndex: 0, colIndex: 0 },
      anchorCell: { rowIndex: 0, colIndex: 0 },
      extentCell: { rowIndex: 0, colIndex: 0 },
      selectedRange: { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
    }))
    const data = {
      getCell: () => 'x',
      getSchema: () => ({ fields: [{ id: 'a', name: 'A', type: 'text', width: 100 }] }),
      getRowCount: () => 5,
      getRows: () => [],
      subscribe: () => () => {},
      updateCell: mock(() => {}),
    }
    engine.getData = mock(() => data as never)
    const adapter = { writeText: mock(async () => true), readText: mock(async () => null) }
    const runtime = new WebGridRuntime({ engine, host: makeHost(), renderer: makeRenderer() })
    runtime.setClipboardAdapter(adapter as never)
    const ok = await runtime.handleClipboardPaste()
    expect(ok).toBe(false)
    expect(data.updateCell).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run — fail**

- [ ] **Step 3: Implement in WebGridRuntime.ts**

新增 imports：

```ts
import {
  serializeRowsToTsv,
  parseTsvToCells,
  computePasteTarget,
  applyPaste,
  type ApplyPasteSource,
  type PasteSkippedCell,
  type Row,
  type CellRange,
} from '@novasheet/core'
import type { WebClipboardAdapter } from '../clipboard/WebClipboardAdapter'
```

新字段：

```ts
private clipboardAdapter?: WebClipboardAdapter
private clipboardCache: { range: CellRange; rows: Row[]; tsvHash: number } | null = null
private onCopy?: (range: CellRange) => void
private onCut?: (range: CellRange) => void
private onPaste?: (target: CellRange) => void
private onPasteSkipped?: (cells: readonly PasteSkippedCell[]) => void
```

Setters：

```ts
setClipboardAdapter(adapter: WebClipboardAdapter): void { this.clipboardAdapter = adapter }
setOnCopy(cb: (r: CellRange) => void): void { this.onCopy = cb }
setOnCut(cb: (r: CellRange) => void): void { this.onCut = cb }
setOnPaste(cb: (r: CellRange) => void): void { this.onPaste = cb }
setOnPasteSkipped(cb: (c: readonly PasteSkippedCell[]) => void): void { this.onPasteSkipped = cb }
```

Hash helper（同文件 module-private 或单独 util）：

```ts
function fnv1a(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}
```

Method `snapshotSelection()`（private helper）：

```ts
private snapshotSelection(): { range: CellRange; rows: Row[]; tsv: string } | null {
  const sel = this.engine.getSelection()
  const range = sel.selectedRange
  if (!range) return null
  const data = this.engine.getData()
  const fields = data.getSchema().fields
  const fieldIds = fields.slice(range.startCol, range.endCol + 1).map((f) => f.id)
  const rows: Row[] = []
  for (let r = range.startRow; r <= range.endRow; r++) {
    const row: Row = {}
    for (const fid of fieldIds) row[fid] = data.getCell(r, fid) ?? null
    rows.push(row)
  }
  const tsv = serializeRowsToTsv(rows, fieldIds)
  return { range, rows, tsv }
}
```

Async methods：

```ts
async handleClipboardCopy(): Promise<boolean> {
  if (this.destroyed) return false
  const snap = this.snapshotSelection()
  if (!snap) return false
  this.clipboardCache = { range: snap.range, rows: snap.rows, tsvHash: fnv1a(snap.tsv) }
  await this.clipboardAdapter?.writeText(snap.tsv)
  this.onCopy?.(snap.range)
  return true
}

async handleClipboardCut(): Promise<boolean> {
  if (this.destroyed) return false
  if (!isMutableDataSource(this.engine.getData())) return false
  const snap = this.snapshotSelection()
  if (!snap) return false
  this.clipboardCache = { range: snap.range, rows: snap.rows, tsvHash: fnv1a(snap.tsv) }
  await this.clipboardAdapter?.writeText(snap.tsv)
  this.engine.clearRange(snap.range)
  this.afterEngineMutation()
  this.onCut?.(snap.range)
  return true
}

async handleClipboardPaste(): Promise<boolean> {
  if (this.destroyed) return false
  const data = this.engine.getData()
  if (!isMutableDataSource(data)) return false
  const sel = this.engine.getSelection()
  const active = sel.activeCell
  const range = sel.selectedRange
  if (!active || !range) return false

  const tsv = (await this.clipboardAdapter?.readText()) ?? ''
  if (tsv === '') return false

  const schema = data.getSchema()
  const fields = schema.fields
  const fieldIdsAtCols = fields.map((f) => f.id)
  const tsvHash = fnv1a(tsv)
  let source: ApplyPasteSource

  if (this.clipboardCache && this.clipboardCache.tsvHash === tsvHash) {
    // 内部缓存命中
    const cachedRange = this.clipboardCache.range
    const cachedFieldIds = fields
      .slice(cachedRange.startCol, cachedRange.endCol + 1)
      .map((f) => f.id)
    const cells = this.clipboardCache.rows.map((row) => cachedFieldIds.map((fid) => row[fid] ?? null))
    source = { cells, sourceFieldIds: cachedFieldIds, typed: true }
  } else {
    const anchorFieldIds = fieldIdsAtCols.slice(active.colIndex)
    const cells = parseTsvToCells(tsv, anchorFieldIds, schema)
    source = { cells, sourceFieldIds: anchorFieldIds, typed: false }
  }

  const sourceRows = source.cells.length
  const sourceCols = source.cells[0]?.length ?? 0
  if (sourceRows === 0 || sourceCols === 0) return false

  const target = computePasteTarget(active, range, sourceRows, sourceCols, {
    rowCount: data.getRowCount(),
    colCount: fields.length,
  })

  applyPaste(source, target, schema, fieldIdsAtCols, data, (skipped) => this.onPasteSkipped?.(skipped))
  this.afterEngineMutation()
  this.onPaste?.({
    startRow: target.startRow, endRow: target.endRow,
    startCol: target.startCol, endCol: target.endCol,
  })
  return true
}
```

`setData`：`this.clipboardCache = null`（在已有的 setData 内补一行）。

- [ ] **Step 4: Run tests + typecheck**

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/runtime/WebGridRuntime.ts \
        packages/web/tests/runtime/WebGridRuntime.test.ts
git commit -m "feat(web): WebGridRuntime clipboard methods + internal typed cache"
```

---

## Task 6: Ctrl+X / C / V 快捷键路由

**Files:**

- Modify: `packages/web/src/runtime/WebGridRuntime.ts`
- Modify: `packages/web/tests/runtime/WebGridRuntime.test.ts`

- [ ] **Step 1: Failing tests**

```ts
it('Ctrl+C 在 grid 持焦点时调 copy', async () => {
  // setup engine + adapter mock
  const handled = runtime.handleHostKeyDown({
    key: 'c',
    ctrlKey: true,
    shiftKey: false,
    metaKey: false,
    altKey: false,
  })
  expect(handled).toBe(true)
  await Promise.resolve() // 等微任务
  expect(adapter.writeText).toHaveBeenCalled()
})

it('Cmd+C（macOS）同样工作', async () => {
  runtime.handleHostKeyDown({
    key: 'c',
    ctrlKey: false,
    metaKey: true,
    shiftKey: false,
    altKey: false,
  })
  // 同上断言
})

it('编辑中 Ctrl+C 不被拦截（返回 false）', () => {
  engine.isCellEditing = mock(() => true)
  const handled = runtime.handleHostKeyDown({
    key: 'c',
    ctrlKey: true,
    shiftKey: false,
    metaKey: false,
    altKey: false,
  })
  expect(handled).toBe(false)
})

it('Shift+Ctrl+C / Alt+Ctrl+C 不触发剪贴板（避免误抢）', () => {
  // assert handled === false
})
```

- [ ] **Step 2: Run — fail**

- [ ] **Step 3: Modify `handleHostKeyDown` in WebGridRuntime.ts**

在 `if (this.engine.isCellEditing()) return false` 之后、F2 分支之前插入：

```ts
// Ctrl+X / C / V 剪贴板快捷键
const mod = event.ctrlKey || event.metaKey
if (mod && !event.shiftKey && !event.altKey) {
  if (event.key === 'c' || event.key === 'C') {
    void this.handleClipboardCopy()
    return true
  }
  if (event.key === 'x' || event.key === 'X') {
    void this.handleClipboardCut()
    return true
  }
  if (event.key === 'v' || event.key === 'V') {
    void this.handleClipboardPaste()
    return true
  }
}
```

- [ ] **Step 4: Run + typecheck**

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/runtime/WebGridRuntime.ts \
        packages/web/tests/runtime/WebGridRuntime.test.ts
git commit -m "feat(web): keyboard Ctrl/Cmd+X/C/V routes to clipboard handlers"
```

---

## Task 7: 4.0 menu 默认走 4.1 引擎

**Files:**

- Modify: `packages/web/src/runtime/WebGridRuntime.ts`
- Modify: `packages/web/tests/runtime/WebGridRuntime.test.ts`

要点：`handleContextMenuSelected` 不再仅调外部 callback——consumer 没传时，自动 dispatch 到 `handleClipboardCopy / Cut / Paste`。Paste 项 disabled 改为基于 `isMutableDataSource`，不再看 `clipboardReady`。

- [ ] **Step 1: Failing test**

```ts
it('handleContextMenuSelected 没有外部 callback 时自动跑 copy/cut/paste', async () => {
  // ... 设置 runtime + adapter，**不**调 setOnContextMenuAction
  runtime.handleContextMenuSelected('copy')
  await Promise.resolve()
  expect(adapter.writeText).toHaveBeenCalled()
})

it('handleContextMenuSelected 有 callback 时优先走 callback（4.0 兼容）', async () => {
  const consumer = mock((_a: string, _c: never) => {})
  runtime.setOnContextMenuAction(consumer)
  runtime.handleContextMenuSelected('copy')
  expect(consumer).toHaveBeenCalled()
  expect(adapter.writeText).not.toHaveBeenCalled()
})
```

也改 `handleHostContextMenu` 里 ctx 的 `clipboardReady` 判断——Paste 永远 enabled 只要 mutable：

```ts
const ctx: ContextMenuContext = {
  cell: hit,
  selectedRange: newSelection.selectedRange,
  hasSelection: newSelection.activeCell !== null,
  clipboardReady: isMutableDataSource(this.engine.getData()), // 4.1 改：mutable 即 enabled
}
```

- [ ] **Step 2: Run — fail**

- [ ] **Step 3: Modify `handleContextMenuSelected`**

```ts
handleContextMenuSelected(id: ContextMenuAction): void {
  if (this.onContextMenuAction) {
    // consumer 接管（4.0 行为保留）
    if (this.lastContextMenuContext) this.onContextMenuAction(id, this.lastContextMenuContext)
    return
  }
  // 默认走 4.1 引擎
  if (id === 'copy') { void this.handleClipboardCopy(); return }
  if (id === 'cut') { void this.handleClipboardCut(); return }
  if (id === 'paste') { void this.handleClipboardPaste(); return }
}
```

并更新 `handleHostContextMenu` 中 `clipboardReady` 的来源。

- [ ] **Step 4: Run + typecheck**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(web): menu default dispatch to clipboard engine; Paste enabled per Mutable"
```

---

## Task 8: Canvas2DBackend 装配 + Grid facade

**Files:**

- Modify: `packages/web/src/grid/GridController.ts`
- Modify: `packages/web/src/backends/Canvas2DBackend.ts`
- Modify: `packages/web/src/Grid.ts`
- Modify: `packages/web/src/index.ts`
- Modify: `packages/web/tests/Grid.test.ts`

- [ ] **Step 1: Failing test**

```ts
// Grid.test.ts 追加
it('grid.copy() 写到 navigator.clipboard.writeText', async () => {
  const writeText = mock(async (_: string) => {})
  stubGlobal('navigator', { clipboard: { writeText } } as never)
  const container = document.createElement('div')
  document.body.appendChild(container)
  const data = new InMemoryDataSource({
    schema: { fields: [{ id: 'a', name: 'A', type: 'text', width: 100 }] },
    rows: [{ a: 'hello' }],
  })
  const grid = new Grid(container, { data })
  // 模拟选区 — 先点 (0, 0)
  const sh = container.querySelector('[data-novasheet-scroll-host]') as HTMLElement
  sh.dispatchEvent(
    new PointerEvent('pointerdown', { clientX: 10, clientY: 50, button: 0, bubbles: true }),
  )
  sh.dispatchEvent(new PointerEvent('pointerup', { clientX: 10, clientY: 50, bubbles: true }))
  await grid.copy()
  expect(writeText).toHaveBeenCalledWith('hello')
  grid.destroy()
  document.body.removeChild(container)
  unstubAllGlobals()
})

it('onContextMenuAction 不传时点 Cut 默认走 grid.cut()', async () => {
  // ...
})
```

- [ ] **Step 2: Run — fail**

- [ ] **Step 3: Extend GridController + Canvas2DBackend + Grid**

`GridController.ts`:

```ts
copy(): Promise<boolean>
cut(): Promise<boolean>
paste(): Promise<boolean>
```

`Canvas2DBackend.ts` 构造里：

```ts
this.clipboardAdapter = new WebClipboardAdapter()
this.runtime.setClipboardAdapter(this.clipboardAdapter)
if (gridOptions?.onCopy) this.runtime.setOnCopy(gridOptions.onCopy)
if (gridOptions?.onCut) this.runtime.setOnCut(gridOptions.onCut)
if (gridOptions?.onPaste) this.runtime.setOnPaste(gridOptions.onPaste)
if (gridOptions?.onPasteSkipped) this.runtime.setOnPasteSkipped(gridOptions.onPasteSkipped)
```

转发：

```ts
copy(): Promise<boolean> { return this.runtime.handleClipboardCopy() }
cut(): Promise<boolean> { return this.runtime.handleClipboardCut() }
paste(): Promise<boolean> { return this.runtime.handleClipboardPaste() }
```

`Grid.ts` GridOptions 加 4 个回调；class 加 3 个 async 转发方法。

`web/index.ts` 加：

```ts
export type { ClipboardAction, PasteSkippedCell } from '@novasheet/core'
```

- [ ] **Step 4: Run full chain**

```bash
bun test
bun run --filter '*' typecheck
bun run lint
```

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(web): Phase 4.1 Grid facade — copy/cut/paste + onCopy/onCut/onPaste/onPasteSkipped"
```

---

## Task 9: Storybook + README

**Files:**

- Create: `apps/storybook/src/stories/snippets/clipboard.basic.snippet.ts`
- Create: `apps/storybook/src/stories/Clipboard.stories.ts`
- Modify: `README.md`

- [ ] **Step 1: snippet**

```ts
// apps/storybook/src/stories/snippets/clipboard.basic.snippet.ts
// @ts-nocheck — storybook docs display snippet
import { Grid } from '@novasheet/web'
import { InMemoryDataSource, type Schema } from '@novasheet/core'

const schema: Schema = {
  fields: [
    { id: 'name', name: '姓名', type: 'text', width: 120 },
    { id: 'qty', name: '数量', type: 'number', width: 100 },
  ],
}

const grid = new Grid(container, {
  data: new InMemoryDataSource({ schema, rows }),
  onCopy: (range) => console.log('copied', range),
  onPaste: (target) => console.log('pasted into', target),
  onPasteSkipped: (cells) => console.warn('skipped', cells),
})

// 选区后：
// Ctrl/Cmd+C 复制；Ctrl/Cmd+X 剪切（原格立即清）；Ctrl/Cmd+V 粘贴
// 也可右键菜单 Cut/Copy/Paste（4.0）
// 或编程：await grid.copy() / cut() / paste()
```

- [ ] **Step 2: story**

```ts
// apps/storybook/src/stories/Clipboard.stories.ts
import type { Meta, StoryObj } from '@storybook/html'
import { InMemoryDataSource } from '@novasheet/core'
import { createGridHost } from '../grid-host'
import { basicTextSchema, generateRows } from '../mock-data'
import { docsMeta, docsStory } from '../story-docs'
import basicSrc from './snippets/clipboard.basic.snippet.ts?raw'

const meta: Meta = {
  title: '表格/剪贴板',
  parameters: { layout: 'centered' },
  ...docsMeta(
    'Phase 4.1：Cut / Copy / Paste。Ctrl/Cmd+X/C/V 快捷键 + 右键菜单同一引擎。Excel / Sheets 双向互通（TSV）；类型不匹配跳过 + onPasteSkipped 事件。',
  ),
}
export default meta
type Story = StoryObj

export const Basic: Story = {
  name: '基础剪贴板',
  ...docsStory(
    basicSrc,
    '选区后用 Ctrl/Cmd+C/X/V 或右键菜单；打开 console 看 onCopy/onPaste 输出。',
  ),
  render: () => {
    const schema = basicTextSchema()
    const data = new InMemoryDataSource({ schema, rows: generateRows(schema, 50) })
    return createGridHost({
      data,
      onCopy: (r) => console.log('[clipboard] copy', r),
      onCut: (r) => console.log('[clipboard] cut', r),
      onPaste: (t) => console.log('[clipboard] paste', t),
      onPasteSkipped: (c) => console.warn('[clipboard] skipped', c),
    })
  },
}
```

- [ ] **Step 3: README**

- 测试数：bun test 跑后取实际数字更新
- 在 "Phase 4.0" 行下追加 Phase 4.1 ✅
- 在 "Phase 4 剪贴板" 表里把 4.1 标 ✅
- "暂未交付" 表里 Phase 4.1+ 改为 Phase 4.2+

- [ ] **Step 4: Full verify**

```bash
bun test
bun run --filter '*' typecheck
bun run lint
bun run --filter @novasheet/storybook build-storybook
```

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(storybook,docs): Phase 4.1 clipboard stories + README sign-off"
```

---

## Risks / Known issues

1. **Cut 立即清** 跟未来 Phase 4.2 Undo 配合：cut → 切换 app → app crash → 数据丢。4.2 之前 consumer 自负责。
2. **TSV 含 `\t`/`\n` 的 text**：4.1 不引入双引号转义；spec §7.1 显式声明。
3. **navigator.clipboard 在非 HTTPS / 旧浏览器** 不可用：adapter 静默 fallback false / null；4.1 内菜单 Paste 仍然 enabled，点了就 no-op（spec §4.1 决策）。
4. **`isMutableDataSource` import 路径**：runtime 已有引用？没有的话 Task 5 加 `import { isMutableDataSource } from '@novasheet/core'`。实现前 grep 确认。
5. **Row 类型**：core 已经导出 `Row`。Task 5 imports 检查。

---

## Self-Review

**Spec 覆盖：**

- §4.1 Cut（立即清）→ Task 3 + Task 5
- §4.2 Copy → Task 5
- §4.3 Paste（target rect + coerce + skip event）→ Task 2 + Task 5
- §4.4 onPasteSkipped → Task 2 + Task 8
- §4.5 编辑中不拦截 → Task 6
- §4.6 焦点要求 → Task 6（用现有 keydown 入口）
- §5 Public API → Task 8（facade methods + GridOptions callbacks）
- §6.1 包内位置 → Tasks 1-4
- §6.2 数据流 → Task 5（snapshot + hash + paste）
- §6.3 缓存生命周期（setData 清缓存）→ Task 5
- §6.4 engine.clearRange → Task 3
- §6.5 不变量 → 各 task
- §7 TSV format → Task 1

**Type 一致性：**

- `Row` 从 `@novasheet/core` 导出（已存在）
- `MutableDataSource` / `isMutableDataSource` 已存在
- `CellRange` 来自 SelectionModel
- `ContextMenuAction` 沿用 4.0 已导出类型

**Placeholder scan：**

- 无 TBD / TODO
- Task 4 的 Clipboard 类型在某些 TS lib.dom.d.ts 里有定义；如果 typecheck 报错可改 `globalThis as any`，但 4.1 plan 保留 strict cast
- Task 5 部分测试只列断言要点（"// ...略"）—— 实现前需补全；实现 subagent 自己写

**Naming：**

- `clipboardCache`（runtime 内部）
- `WebClipboardAdapter`（web 类）
- `serializeRowsToTsv` / `parseTsvToCells`（core 函数）
- `computePasteTarget` / `applyPaste`（core 函数）
- `handleClipboard{Copy,Cut,Paste}`（runtime methods）
- `Grid.copy/cut/paste`（facade）

一致。
