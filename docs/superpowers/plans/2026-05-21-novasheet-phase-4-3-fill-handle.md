# Phase 4.3 填充柄实施计划

> **给 agentic workers:** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`,按 task 逐项实施。步骤使用 checkbox（`- [ ]`）语法跟踪。

**目标:** 实现 Sheets 风格的填充柄拖拽,支持复制、数字 / Date / 文本尾号序列填充,并接入 undo/redo 与 web public API。

**架构:** Core 以纯函数负责填充目标范围和填充值计算,并提供 `DefaultGridEngine.commitFill()` 与 undo/redo 分发。Web 负责 DOM overlay 命中目标和预览矩形,由 `WebGridRuntime` 编排拖拽状态、auto-scroll、commit 与事件。Canvas 渲染除已有选区 overlay 外保持不变。

**技术栈:** TypeScript、Bun test、`@novasheet/core`、`@novasheet/web`、DOM overlay layers、Canvas2D backend。

**实施后对齐记录:** 本计划已落地并合入 `main`。实现过程中根据手工体验和 review 增补了几项与当前功能一致的 follow-up:

- 填充柄样式对齐 Google Sheets:8x8 圆形手柄,拖拽 preview 为更轻的 1px dashed overlay。
- DOM pointer 的 `clientX/clientY` 在 runtime 内转换为 container-local 坐标,避免拖拽预览与鼠标错位。
- pointer 选区结束后同一帧同步填充柄,避免先出现选中框、后出现手柄的视觉延迟。
- 文本尾号支持 signed suffix,例如 `Item -2`, `Item -1` 下拉得到 `Item 0`, `Item 1`。
- 填充写入 `wrap: true` 文本后,只对实际写入行触发 autofit,避免全表重算。

---

## 文件结构

新增:

- `packages/core/src/fill/FillTarget.ts` — computes fill direction/ranges from source selection and hovered cell.
- `packages/core/src/fill/FillSeries.ts` — computes write values for copy, number series, Date series, and text-tail series.
- `packages/core/tests/fill/FillTarget.test.ts` — target range unit tests.
- `packages/core/tests/fill/FillSeries.test.ts` — value generation unit tests.
- `packages/core/tests/engine/DefaultGridEngine.fill.test.ts` — engine commit/undo/redo tests.
- `packages/web/src/interaction/DomFillHandleLayer.ts` — DOM handle + preview layer.
- `packages/web/src/interaction/RangeOverlayRects.ts` — converts `CellRange` to visible DOM overlay rects.
- `packages/web/tests/interaction/DomFillHandleLayer.test.ts` — DOM layer tests.
- `packages/web/tests/interaction/RangeOverlayRects.test.ts` — range rect tests.
- `packages/web/tests/runtime/WebGridRuntime.fill.test.ts` — runtime drag + event tests.
- `apps/storybook/src/stories/FillHandle.stories.ts` — manual demo.
- `apps/storybook/src/stories/snippets/fill-handle.basic.snippet.ts` — story snippet.

修改:

- `packages/core/src/undo/UndoCommand.ts` — add `fill` command.
- `packages/core/src/engine/GridEngine.ts` — add `commitFill`.
- `packages/core/src/engine/DefaultGridEngine.ts` — implement fill commit + undo/redo.
- `packages/core/src/index.ts` — export fill APIs.
- `packages/web/src/runtime/WebGridRuntime.ts` — fill drag state machine.
- `packages/web/src/backends/Canvas2DBackend.ts` — instantiate `DomFillHandleLayer`.
- `packages/web/src/grid/GridController.ts` — add `onFill`.
- `packages/web/src/Grid.ts` — public `onFill`.
- `packages/web/src/index.ts` — export fill event type.
- `README.md` — mark Phase 4.3 complete after implementation.

---

## Task 1: Core 填充目标范围

**Files:**

- Create: `packages/core/src/fill/FillTarget.ts`
- Create: `packages/core/tests/fill/FillTarget.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/core/tests/fill/FillTarget.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { computeFillTarget } from '../../src/fill/FillTarget'
import type { CellRange } from '../../src/interaction/SelectionModel'

const source: CellRange = { startRow: 2, endRow: 3, startCol: 1, endCol: 2 }
const dims = { rowCount: 10, colCount: 8 }

describe('computeFillTarget', () => {
  it('returns null when hover is inside source', () => {
    expect(computeFillTarget(source, { rowIndex: 2, colIndex: 1 }, dims)).toBeNull()
    expect(computeFillTarget(source, { rowIndex: 3, colIndex: 2 }, dims)).toBeNull()
  })

  it('computes downward fill range and result range', () => {
    expect(computeFillTarget(source, { rowIndex: 6, colIndex: 2 }, dims)).toEqual({
      source,
      direction: 'down',
      fill: { startRow: 4, endRow: 6, startCol: 1, endCol: 2 },
      result: { startRow: 2, endRow: 6, startCol: 1, endCol: 2 },
    })
  })

  it('computes upward fill range and result range', () => {
    expect(computeFillTarget(source, { rowIndex: 0, colIndex: 1 }, dims)).toEqual({
      source,
      direction: 'up',
      fill: { startRow: 0, endRow: 1, startCol: 1, endCol: 2 },
      result: { startRow: 0, endRow: 3, startCol: 1, endCol: 2 },
    })
  })

  it('computes rightward and leftward fill ranges', () => {
    expect(computeFillTarget(source, { rowIndex: 2, colIndex: 5 }, dims)?.fill).toEqual({
      startRow: 2,
      endRow: 3,
      startCol: 3,
      endCol: 5,
    })
    expect(computeFillTarget(source, { rowIndex: 3, colIndex: 0 }, dims)?.fill).toEqual({
      startRow: 2,
      endRow: 3,
      startCol: 0,
      endCol: 0,
    })
  })

  it('chooses the dominant axis when hover is diagonal', () => {
    expect(computeFillTarget(source, { rowIndex: 8, colIndex: 4 }, dims)?.direction).toBe('down')
    expect(computeFillTarget(source, { rowIndex: 4, colIndex: 7 }, dims)?.direction).toBe('right')
  })

  it('clamps hover to grid bounds', () => {
    expect(computeFillTarget(source, { rowIndex: 99, colIndex: 2 }, dims)?.fill).toEqual({
      startRow: 4,
      endRow: 9,
      startCol: 1,
      endCol: 2,
    })
    expect(computeFillTarget(source, { rowIndex: 2, colIndex: -5 }, dims)?.fill).toEqual({
      startRow: 2,
      endRow: 3,
      startCol: 0,
      endCol: 0,
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
bun test packages/core/tests/fill/FillTarget.test.ts
```

Expected: FAIL because `../../src/fill/FillTarget` does not exist.

- [ ] **Step 3: Implement fill target**

Create `packages/core/src/fill/FillTarget.ts`:

```ts
import type { CellAddress, CellRange } from '../interaction/SelectionModel'

export type FillDirection = 'down' | 'up' | 'right' | 'left'

export interface FillTarget {
  readonly source: CellRange
  readonly fill: CellRange
  readonly result: CellRange
  readonly direction: FillDirection
}

export interface FillDimensions {
  readonly rowCount: number
  readonly colCount: number
}

export function computeFillTarget(
  source: CellRange,
  hover: CellAddress,
  dims: FillDimensions,
): FillTarget | null {
  if (dims.rowCount <= 0 || dims.colCount <= 0) return null

  const rowIndex = clamp(hover.rowIndex, 0, dims.rowCount - 1)
  const colIndex = clamp(hover.colIndex, 0, dims.colCount - 1)
  if (
    rowIndex >= source.startRow &&
    rowIndex <= source.endRow &&
    colIndex >= source.startCol &&
    colIndex <= source.endCol
  ) {
    return null
  }

  const above = Math.max(0, source.startRow - rowIndex)
  const below = Math.max(0, rowIndex - source.endRow)
  const left = Math.max(0, source.startCol - colIndex)
  const right = Math.max(0, colIndex - source.endCol)
  const vertical = Math.max(above, below)
  const horizontal = Math.max(left, right)

  let direction: FillDirection
  if (vertical >= horizontal && vertical > 0) direction = below > 0 ? 'down' : 'up'
  else if (horizontal > 0) direction = right > 0 ? 'right' : 'left'
  else return null

  const fill = fillRangeForDirection(source, direction, rowIndex, colIndex)
  if (!fill) return null
  return { source, fill, result: unionRange(source, fill), direction }
}

function fillRangeForDirection(
  source: CellRange,
  direction: FillDirection,
  rowIndex: number,
  colIndex: number,
): CellRange | null {
  if (direction === 'down' && rowIndex > source.endRow) {
    return {
      startRow: source.endRow + 1,
      endRow: rowIndex,
      startCol: source.startCol,
      endCol: source.endCol,
    }
  }
  if (direction === 'up' && rowIndex < source.startRow) {
    return {
      startRow: rowIndex,
      endRow: source.startRow - 1,
      startCol: source.startCol,
      endCol: source.endCol,
    }
  }
  if (direction === 'right' && colIndex > source.endCol) {
    return {
      startRow: source.startRow,
      endRow: source.endRow,
      startCol: source.endCol + 1,
      endCol: colIndex,
    }
  }
  if (direction === 'left' && colIndex < source.startCol) {
    return {
      startRow: source.startRow,
      endRow: source.endRow,
      startCol: colIndex,
      endCol: source.startCol - 1,
    }
  }
  return null
}

export function unionRange(a: CellRange, b: CellRange): CellRange {
  return {
    startRow: Math.min(a.startRow, b.startRow),
    endRow: Math.max(a.endRow, b.endRow),
    startCol: Math.min(a.startCol, b.startCol),
    endCol: Math.max(a.endCol, b.endCol),
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
```

Modify `packages/core/src/index.ts`:

```ts
export { computeFillTarget, unionRange } from './fill/FillTarget'
export type { FillDimensions, FillDirection, FillTarget } from './fill/FillTarget'
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
bun test packages/core/tests/fill/FillTarget.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/fill/FillTarget.ts packages/core/tests/fill/FillTarget.test.ts packages/core/src/index.ts
git commit -m "feat(core): compute fill handle target ranges"
```

---

## Task 2: Core 填充序列写入

**Files:**

- Create: `packages/core/src/fill/FillSeries.ts`
- Create: `packages/core/tests/fill/FillSeries.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/core/tests/fill/FillSeries.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { InMemoryDataSource } from '../../src/data/InMemoryDataSource'
import { computeFillWrites } from '../../src/fill/FillSeries'
import type { Schema } from '../../src/data/Schema'
import type { CellRange } from '../../src/interaction/SelectionModel'

const schema: Schema = {
  fields: [
    { id: 'label', name: 'Label', type: 'text', width: 120 },
    { id: 'num', name: 'Number', type: 'number', width: 80 },
    { id: 'date', name: 'Date', type: 'date', width: 120 },
    { id: 'flag', name: 'Flag', type: 'checkbox', width: 80 },
  ],
}

function data(rows: Record<string, unknown>[]) {
  return new InMemoryDataSource({ schema, rows: rows as never })
}

describe('computeFillWrites', () => {
  it('copies a single source value downward', () => {
    const writes = computeFillWrites({
      data: data([{ label: 'A' }, {}, {}]),
      source: r(0, 0, 0, 0),
      fill: r(1, 2, 0, 0),
      direction: 'down',
    })
    expect(writes.map((w) => w.value)).toEqual(['A', 'A'])
  })

  it('extends number series downward and upward', () => {
    const down = computeFillWrites({
      data: data([{ num: 2 }, { num: 5 }, {}, {}]),
      source: r(0, 1, 1, 1),
      fill: r(2, 3, 1, 1),
      direction: 'down',
    })
    expect(down.map((w) => w.value)).toEqual([8, 11])

    const up = computeFillWrites({
      data: data([{}, {}, { num: 10 }, { num: 13 }]),
      source: r(2, 3, 1, 1),
      fill: r(0, 1, 1, 1),
      direction: 'up',
    })
    expect(up.map((w) => w.value)).toEqual([4, 7])
  })

  it('extends number series rightward and leftward per row', () => {
    const localSchema: Schema = {
      fields: [
        { id: 'a', name: 'A', type: 'number', width: 80 },
        { id: 'b', name: 'B', type: 'number', width: 80 },
        { id: 'c', name: 'C', type: 'number', width: 80 },
        { id: 'd', name: 'D', type: 'number', width: 80 },
      ],
    }
    const source = new InMemoryDataSource({
      schema: localSchema,
      rows: [
        { a: 1, b: 3 },
        { c: 10, d: 15 },
      ],
    })
    expect(
      computeFillWrites({
        data: source,
        source: r(0, 0, 0, 1),
        fill: r(0, 0, 2, 3),
        direction: 'right',
      }).map((w) => w.value),
    ).toEqual([5, 7])
    expect(
      computeFillWrites({
        data: source,
        source: r(1, 1, 2, 3),
        fill: r(1, 1, 0, 1),
        direction: 'left',
      }).map((w) => w.value),
    ).toEqual([0, 5])
  })

  it('extends text tail series and preserves numeric width', () => {
    const writes = computeFillWrites({
      data: data([{ label: 'Item 001' }, { label: 'Item 003' }, {}, {}]),
      source: r(0, 1, 0, 0),
      fill: r(2, 3, 0, 0),
      direction: 'down',
    })
    expect(writes.map((w) => w.value)).toEqual(['Item 005', 'Item 007'])
  })

  it('extends Date series by millisecond delta', () => {
    const writes = computeFillWrites({
      data: data([
        { date: new Date('2026-01-01T00:00:00Z') },
        { date: new Date('2026-01-03T00:00:00Z') },
        {},
        {},
      ]),
      source: r(0, 1, 2, 2),
      fill: r(2, 3, 2, 2),
      direction: 'down',
    })
    expect(writes.map((w) => (w.value as Date).toISOString().slice(0, 10))).toEqual([
      '2026-01-05',
      '2026-01-07',
    ])
  })

  it('falls back to repeating pattern for mixed or unstable samples', () => {
    const writes = computeFillWrites({
      data: data([{ label: 'A' }, { label: 'B' }, {}, {}, {}]),
      source: r(0, 1, 0, 0),
      fill: r(2, 4, 0, 0),
      direction: 'down',
    })
    expect(writes.map((w) => w.value)).toEqual(['A', 'B', 'A'])
  })

  it('computes each column independently for downward fill', () => {
    const writes = computeFillWrites({
      data: data([{ label: 'Q1', num: 1 }, { label: 'Q2', num: 3 }, {}, {}]),
      source: r(0, 1, 0, 1),
      fill: r(2, 3, 0, 1),
      direction: 'down',
    })
    expect(writes.map((w) => [w.fieldId, w.value])).toEqual([
      ['label', 'Q3'],
      ['num', 5],
      ['label', 'Q4'],
      ['num', 7],
    ])
  })
})

function r(startRow: number, endRow: number, startCol: number, endCol: number): CellRange {
  return { startRow, endRow, startCol, endCol }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
bun test packages/core/tests/fill/FillSeries.test.ts
```

Expected: FAIL because `../../src/fill/FillSeries` does not exist.

- [ ] **Step 3: Implement fill write computation**

Create `packages/core/src/fill/FillSeries.ts` with these exported types and functions:

```ts
import type { DataSource } from '../data/DataSource'
import type { CellValue } from '../data/Schema'
import type { CellRange } from '../interaction/SelectionModel'
import type { FillDirection } from './FillTarget'

export interface FillWrite {
  readonly rowIndex: number
  readonly fieldId: string
  readonly value: CellValue
}

export interface ComputeFillWritesInput {
  readonly data: DataSource
  readonly source: CellRange
  readonly fill: CellRange
  readonly direction: FillDirection
}

type Sequence =
  | { readonly kind: 'number'; readonly base: number; readonly step: number }
  | { readonly kind: 'date'; readonly base: Date; readonly step: number }
  | {
      readonly kind: 'textTail'
      readonly prefix: string
      readonly suffix: string
      readonly base: number
      readonly step: number
      readonly width: number
    }
  | { readonly kind: 'copy'; readonly samples: readonly CellValue[] }

export function computeFillWrites(input: ComputeFillWritesInput): readonly FillWrite[] {
  const fields = input.data.getSchema().fields
  if (input.direction === 'down' || input.direction === 'up')
    return computeVerticalWrites(input, fields)
  return computeHorizontalWrites(input, fields)
}

function computeVerticalWrites(
  input: ComputeFillWritesInput,
  fields: ReturnType<DataSource['getSchema']>['fields'],
): FillWrite[] {
  const writes: FillWrite[] = []
  const rows = rangeNumbers(input.fill.startRow, input.fill.endRow)
  const orderedRows = input.direction === 'up' ? [...rows].reverse() : rows
  for (const rowIndex of orderedRows) {
    for (let col = input.fill.startCol; col <= input.fill.endCol; col++) {
      const field = fields[col]
      if (!field) continue
      const samples = rangeNumbers(input.source.startRow, input.source.endRow).map((row) =>
        normalize(input.data.getCell(row, field.id)),
      )
      const seq = inferSequence(samples)
      const offset = Math.abs(
        rowIndex - (input.direction === 'up' ? input.source.startRow : input.source.endRow),
      )
      writes.push({ rowIndex, fieldId: field.id, value: valueAt(seq, offset, input.direction) })
    }
  }
  return input.direction === 'up' ? writes.reverse() : writes
}

function computeHorizontalWrites(
  input: ComputeFillWritesInput,
  fields: ReturnType<DataSource['getSchema']>['fields'],
): FillWrite[] {
  const writes: FillWrite[] = []
  for (let rowIndex = input.fill.startRow; rowIndex <= input.fill.endRow; rowIndex++) {
    const cols = rangeNumbers(input.fill.startCol, input.fill.endCol)
    const orderedCols = input.direction === 'left' ? [...cols].reverse() : cols
    const sourceCols = rangeNumbers(input.source.startCol, input.source.endCol)
    const samples = sourceCols.map((col) => {
      const field = fields[col]
      return field ? normalize(input.data.getCell(rowIndex, field.id)) : null
    })
    const seq = inferSequence(samples)
    for (const col of orderedCols) {
      const field = fields[col]
      if (!field) continue
      const offset = Math.abs(
        col - (input.direction === 'left' ? input.source.startCol : input.source.endCol),
      )
      writes.push({ rowIndex, fieldId: field.id, value: valueAt(seq, offset, input.direction) })
    }
  }
  return input.direction === 'left' ? writes.reverse() : writes
}

function inferSequence(samples: readonly CellValue[]): Sequence {
  if (samples.length >= 2 && samples.every((v) => typeof v === 'number' && Number.isFinite(v))) {
    const step = (samples[1] as number) - (samples[0] as number)
    if (samples.every((v, i) => i === 0 || (v as number) - (samples[i - 1] as number) === step)) {
      return { kind: 'number', base: samples[samples.length - 1] as number, step }
    }
  }
  if (
    samples.length >= 2 &&
    samples.every((v) => v instanceof Date && Number.isFinite(v.getTime()))
  ) {
    const step = (samples[1] as Date).getTime() - (samples[0] as Date).getTime()
    if (
      samples.every(
        (v, i) => i === 0 || (v as Date).getTime() - (samples[i - 1] as Date).getTime() === step,
      )
    ) {
      return { kind: 'date', base: samples[samples.length - 1] as Date, step }
    }
  }
  const textSeq = inferTextTail(samples)
  if (textSeq) return textSeq
  return { kind: 'copy', samples }
}

function inferTextTail(samples: readonly CellValue[]): Sequence | null {
  if (samples.length < 2 || !samples.every((v) => typeof v === 'string')) return null
  const parsed = samples.map((v) => /^(.*?)(-?\d+)(\D*)$/.exec(v as string))
  if (parsed.some((m) => !m)) return null
  const first = parsed[0]!
  const prefix = first[1]!
  const suffix = first[3]!
  const nums = parsed.map((m) => Number(m![2]))
  const width = first[2]!.replace('-', '').length
  if (
    !parsed.every(
      (m) => m![1] === prefix && m![3] === suffix && m![2]!.replace('-', '').length === width,
    )
  )
    return null
  const step = nums[1]! - nums[0]!
  if (!nums.every((n, i) => i === 0 || n - nums[i - 1]! === step)) return null
  return { kind: 'textTail', prefix, suffix, base: nums[nums.length - 1]!, step, width }
}

function valueAt(seq: Sequence, oneBasedOffset: number, direction: FillDirection): CellValue {
  const sign = direction === 'up' || direction === 'left' ? -1 : 1
  if (seq.kind === 'number') return seq.base + sign * seq.step * oneBasedOffset
  if (seq.kind === 'date') return new Date(seq.base.getTime() + sign * seq.step * oneBasedOffset)
  if (seq.kind === 'textTail') {
    const next = seq.base + sign * seq.step * oneBasedOffset
    const abs = String(Math.abs(next)).padStart(seq.width, '0')
    return `${seq.prefix}${next < 0 ? '-' : ''}${abs}${seq.suffix}`
  }
  if (seq.samples.length === 0) return null
  return seq.samples[(oneBasedOffset - 1) % seq.samples.length] ?? null
}

function normalize(value: CellValue | undefined): CellValue {
  return value === undefined ? null : value
}

function rangeNumbers(start: number, end: number): number[] {
  const out: number[] = []
  for (let i = start; i <= end; i++) out.push(i)
  return out
}
```

Modify `packages/core/src/index.ts`:

```ts
export { computeFillWrites } from './fill/FillSeries'
export type { ComputeFillWritesInput, FillWrite } from './fill/FillSeries'
```

- [ ] **Step 4: Run tests**

Run:

```bash
bun test packages/core/tests/fill/FillSeries.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/fill/FillSeries.ts packages/core/tests/fill/FillSeries.test.ts packages/core/src/index.ts
git commit -m "feat(core): compute fill handle series writes"
```

---

## Task 3: Engine 提交填充与 Undo/Redo

**Files:**

- Modify: `packages/core/src/undo/UndoCommand.ts`
- Modify: `packages/core/src/engine/GridEngine.ts`
- Modify: `packages/core/src/engine/DefaultGridEngine.ts`
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/tests/engine/DefaultGridEngine.fill.test.ts`

- [ ] **Step 1: Write failing engine tests**

Create `packages/core/tests/engine/DefaultGridEngine.fill.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { InMemoryDataSource } from '../../src/data/InMemoryDataSource'
import { DefaultGridEngine } from '../../src/engine/DefaultGridEngine'
import type { DataSource } from '../../src/data/DataSource'
import type { Schema } from '../../src/data/Schema'

const schema: Schema = {
  fields: [
    { id: 'a', name: 'A', type: 'text', width: 80 },
    { id: 'b', name: 'B', type: 'number', width: 80 },
  ],
}

function engine() {
  return new DefaultGridEngine({
    data: new InMemoryDataSource({
      schema,
      rows: [
        { a: 'Item 1', b: 1 },
        { a: 'Item 2', b: 3 },
        { a: null, b: null },
        { a: null, b: null },
      ],
    }),
  })
}

describe('DefaultGridEngine.commitFill', () => {
  it('writes fill range and leaves source unchanged', () => {
    const e = engine()
    const result = e.commitFill(
      { startRow: 0, endRow: 1, startCol: 0, endCol: 1 },
      { startRow: 2, endRow: 3, startCol: 0, endCol: 1 },
      'down',
    )
    expect(result?.writes.length).toBe(4)
    expect(e.getData().getCell(0, 'a')).toBe('Item 1')
    expect(e.getData().getCell(2, 'a')).toBe('Item 3')
    expect(e.getData().getCell(3, 'b')).toBe(7)
    expect(e.getSelection().selectedRange).toEqual({
      startRow: 0,
      endRow: 3,
      startCol: 0,
      endCol: 1,
    })
  })

  it('pushes one undo command and restores fill range only', () => {
    const e = engine()
    e.commitFill(
      { startRow: 0, endRow: 1, startCol: 0, endCol: 1 },
      { startRow: 2, endRow: 3, startCol: 0, endCol: 1 },
      'down',
    )
    const cmd = e.undo()
    expect(cmd?.kind).toBe('fill')
    expect(e.getData().getCell(2, 'a')).toBeNull()
    expect(e.getData().getCell(3, 'b')).toBeNull()
    expect(e.getData().getCell(0, 'a')).toBe('Item 1')
    expect(e.getSelection().selectedRange).toEqual({
      startRow: 0,
      endRow: 1,
      startCol: 0,
      endCol: 1,
    })
  })

  it('redo writes fill values again and restores result selection', () => {
    const e = engine()
    e.commitFill(
      { startRow: 0, endRow: 1, startCol: 0, endCol: 1 },
      { startRow: 2, endRow: 3, startCol: 0, endCol: 1 },
      'down',
    )
    e.undo()
    const cmd = e.redo()
    expect(cmd?.kind).toBe('fill')
    expect(e.getData().getCell(2, 'a')).toBe('Item 3')
    expect(e.getSelection().selectedRange).toEqual({
      startRow: 0,
      endRow: 3,
      startCol: 0,
      endCol: 1,
    })
  })

  it('non-mutable data source does not write or push undo', () => {
    const readonly: DataSource = {
      getRowCount: () => 2,
      getSchema: () => schema,
      getRows: () => [],
      getCell: () => null,
      subscribe: () => () => {},
    }
    const e = new DefaultGridEngine({ data: readonly })
    expect(
      e.commitFill(
        { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
        { startRow: 1, endRow: 1, startCol: 0, endCol: 0 },
        'down',
      ),
    ).toBeNull()
    expect(e.canUndo()).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
bun test packages/core/tests/engine/DefaultGridEngine.fill.test.ts
```

Expected: FAIL because `commitFill` is not defined.

- [ ] **Step 3: Add types and interface**

Modify `packages/core/src/undo/UndoCommand.ts` by adding to `UndoCommand`:

```ts
  | {
      readonly kind: 'fill'
      readonly source: CellRange
      readonly fill: CellRange
      readonly result: CellRange
      readonly before: ReadonlyArray<CellWrite>
      readonly after: ReadonlyArray<CellWrite>
    }
```

Modify `packages/core/src/engine/GridEngine.ts` imports:

```ts
import type { CellWrite } from '../undo/UndoCommand'
import type { FillDirection } from '../fill/FillTarget'
```

Add this interface above `export interface GridEngine`:

```ts
export interface FillCommitResult {
  readonly source: CellRange
  readonly fill: CellRange
  readonly result: CellRange
  readonly writes: readonly CellWrite[]
}
```

Add to `GridEngine`:

```ts
commitFill(source: CellRange, fill: CellRange, direction: FillDirection): FillCommitResult | null
```

- [ ] **Step 4: Implement DefaultGridEngine commit and dispatch**

Modify `packages/core/src/engine/DefaultGridEngine.ts` imports:

```ts
import { computeFillWrites } from '../fill/FillSeries'
import { unionRange, type FillDirection } from '../fill/FillTarget'
```

Add method:

```ts
commitFill(source: CellRange, fill: CellRange, direction: FillDirection): FillCommitResult | null {
  if (!isMutableDataSource(this.data)) return null
  const after = computeFillWrites({ data: this.data, source, fill, direction }).map((w) => ({
    rowIndex: w.rowIndex,
    fieldId: w.fieldId,
    value: w.value,
  }))
  if (after.length === 0) return null

  const before: CellWrite[] = after.map((w) => ({
    rowIndex: w.rowIndex,
    fieldId: w.fieldId,
    value: this.data.getCell(w.rowIndex, w.fieldId) ?? null,
  }))
  for (const w of after) this.data.updateCell(w.rowIndex, w.fieldId, w.value)

  const result = unionRange(source, fill)
  this.undoStack.push({ kind: 'fill', source, fill, result, before, after })
  this.selection.setSelectedRange(result)
  return { source, fill, result, writes: after }
}
```

Extend `applyUndo`:

```ts
      case 'fill':
        for (const w of cmd.before) this.applyEditCellWrite(w.rowIndex, w.fieldId, w.value)
        this.restoreSelectionForRange(cmd.source)
        return
```

Extend `applyRedo`:

```ts
      case 'fill':
        for (const w of cmd.after) this.applyEditCellWrite(w.rowIndex, w.fieldId, w.value)
        this.restoreSelectionForRange(cmd.result)
        return
```

- [ ] **Step 5: Export result type**

Modify `packages/core/src/index.ts` so the engine export includes `FillCommitResult`:

```ts
export type { FillCommitResult, GridEngine, GridEngineOptions } from './engine/GridEngine'
```

- [ ] **Step 6: Run core fill tests**

Run:

```bash
bun test packages/core/tests/fill/FillTarget.test.ts packages/core/tests/fill/FillSeries.test.ts packages/core/tests/engine/DefaultGridEngine.fill.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run core suite and typecheck**

Run:

```bash
bun test packages/core/
bun run --filter @novasheet/core typecheck
```

Expected: PASS and typecheck exits 0.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/undo/UndoCommand.ts packages/core/src/engine/GridEngine.ts packages/core/src/engine/DefaultGridEngine.ts packages/core/src/index.ts packages/core/tests/engine/DefaultGridEngine.fill.test.ts
git commit -m "feat(core): commit fill handle operations with undo"
```

---

## Task 4: Web 范围 Overlay 矩形

**Files:**

- Create: `packages/web/src/interaction/RangeOverlayRects.ts`
- Create: `packages/web/tests/interaction/RangeOverlayRects.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/web/tests/interaction/RangeOverlayRects.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import {
  computeFillHandleRect,
  computeRangeOverlayRects,
} from '../../src/interaction/RangeOverlayRects'
import type { RenderFrame } from '@novasheet/core'

describe('RangeOverlayRects', () => {
  it('computes visible rect for range intersection with region', () => {
    const frame = makeFrame()
    expect(
      computeRangeOverlayRects(frame, { startRow: 1, endRow: 2, startCol: 1, endCol: 2 }),
    ).toEqual([{ x: 100, y: 60, width: 200, height: 60 }])
  })

  it('returns empty when range is outside visible region', () => {
    expect(
      computeRangeOverlayRects(makeFrame(), { startRow: 20, endRow: 21, startCol: 0, endCol: 1 }),
    ).toEqual([])
  })

  it('anchors fill handle at bottom-right of the visible source range', () => {
    expect(
      computeFillHandleRect(makeFrame(), { startRow: 1, endRow: 2, startCol: 1, endCol: 2 }),
    ).toEqual({
      x: 296,
      y: 116,
      width: 8,
      height: 8,
    })
  })
})

function makeFrame(): RenderFrame {
  return {
    data: { getSchema: () => ({ fields: [] }) } as never,
    theme: { metrics: { headerHeight: 30 } } as never,
    rowsAxis: {
      indexToPosition: (i: number) => i * 30,
      getSize: () => 30,
    } as never,
    colsAxis: {
      indexToPosition: (i: number) => i * 100,
      getSize: () => 100,
    } as never,
    viewport: {
      contentRect: { width: 400, height: 300 },
      scrollX: 0,
      scrollY: 0,
      headerHeight: 30,
      rowHeaderWidth: 0,
      regions: [
        {
          id: 'main',
          rowBand: 'middle',
          colBand: 'center',
          rowRange: [0, 9],
          colRange: [0, 3],
          rect: { x: 0, y: 30, width: 400, height: 270 },
          scrollOffsetX: 0,
          scrollOffsetY: 0,
          zIndex: 0,
        },
      ],
    },
    selection: undefined,
  } as RenderFrame
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test packages/web/tests/interaction/RangeOverlayRects.test.ts
```

Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement range rect helpers**

Create `packages/web/src/interaction/RangeOverlayRects.ts`:

```ts
import type { CellRange, RenderFrame } from '@novasheet/core'

export interface OverlayRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

const HANDLE_SIZE = 8

export function computeRangeOverlayRects(frame: RenderFrame, range: CellRange): OverlayRect[] {
  const rects: OverlayRect[] = []
  for (const region of frame.viewport.regions) {
    const startRow = Math.max(range.startRow, region.rowRange[0])
    const endRow = Math.min(range.endRow, region.rowRange[1])
    const startCol = Math.max(range.startCol, region.colRange[0])
    const endCol = Math.min(range.endCol, region.colRange[1])
    if (endRow < startRow || endCol < startCol) continue

    const x = region.rect.x + frame.colsAxis.indexToPosition(startCol) - region.scrollOffsetX
    const y = region.rect.y + frame.rowsAxis.indexToPosition(startRow) - region.scrollOffsetY
    const right =
      region.rect.x +
      frame.colsAxis.indexToPosition(endCol) -
      region.scrollOffsetX +
      frame.colsAxis.getSize(endCol)
    const bottom =
      region.rect.y +
      frame.rowsAxis.indexToPosition(endRow) -
      region.scrollOffsetY +
      frame.rowsAxis.getSize(endRow)
    rects.push({ x, y, width: right - x, height: bottom - y })
  }
  return rects
}

export function computeFillHandleRect(frame: RenderFrame, range: CellRange): OverlayRect | null {
  const rects = computeRangeOverlayRects(frame, range)
  if (rects.length === 0) return null
  const bottomRight = rects
    .slice()
    .sort((a, b) => a.y + a.height - (b.y + b.height) || a.x + a.width - (b.x + b.width))
    .at(-1)!
  return {
    x: bottomRight.x + bottomRight.width - HANDLE_SIZE / 2,
    y: bottomRight.y + bottomRight.height - HANDLE_SIZE / 2,
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
  }
}
```

- [ ] **Step 4: Run test**

```bash
bun test packages/web/tests/interaction/RangeOverlayRects.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/interaction/RangeOverlayRects.ts packages/web/tests/interaction/RangeOverlayRects.test.ts
git commit -m "feat(web): compute range overlay rects for fill handle"
```

---

## Task 5: DOM 填充柄 Layer

**Files:**

- Create: `packages/web/src/interaction/DomFillHandleLayer.ts`
- Create: `packages/web/tests/interaction/DomFillHandleLayer.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/web/tests/interaction/DomFillHandleLayer.test.ts`:

```ts
import { describe, expect, it, mock } from 'bun:test'
import { DomFillHandleLayer } from '../../src/interaction/DomFillHandleLayer'

describe('DomFillHandleLayer', () => {
  it('attaches, syncs handle, and destroys', () => {
    const root = document.createElement('div')
    const layer = new DomFillHandleLayer(root, callbacks())
    layer.attach()
    layer.sync({ x: 10, y: 20, width: 8, height: 8 })
    const handle = root.querySelector('[data-novasheet-fill-handle]') as HTMLElement
    expect(handle.style.left).toBe('10px')
    expect(handle.style.top).toBe('20px')
    layer.sync(null)
    expect(handle.style.display).toBe('none')
    layer.destroy()
    expect(root.querySelector('[data-novasheet-fill-layer]')).toBeNull()
  })

  it('shows and hides preview rects', () => {
    const root = document.createElement('div')
    const layer = new DomFillHandleLayer(root, callbacks())
    layer.attach()
    layer.showPreview([
      { x: 0, y: 0, width: 100, height: 30 },
      { x: 0, y: 30, width: 100, height: 30 },
    ])
    expect(root.querySelectorAll('[data-novasheet-fill-preview]').length).toBe(2)
    layer.hidePreview()
    expect(root.querySelectorAll('[data-novasheet-fill-preview]').length).toBe(0)
  })

  it('forwards pointer events from the handle', () => {
    const cb = callbacks()
    const root = document.createElement('div')
    const layer = new DomFillHandleLayer(root, cb)
    layer.attach()
    layer.sync({ x: 10, y: 20, width: 8, height: 8 })
    const handle = root.querySelector('[data-novasheet-fill-handle]') as HTMLElement

    handle.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 7, clientX: 14, clientY: 24, bubbles: true }),
    )
    handle.dispatchEvent(
      new PointerEvent('pointermove', { pointerId: 7, clientX: 20, clientY: 40, bubbles: true }),
    )
    handle.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, bubbles: true }))

    expect(cb.onFillPointerDown).toHaveBeenCalledWith(7, 14, 24)
    expect(cb.onFillPointerMove).toHaveBeenCalledWith(7, 20, 40)
    expect(cb.onFillPointerUp).toHaveBeenCalledWith(7)
  })
})

function callbacks() {
  return {
    onFillPointerDown: mock(() => {}),
    onFillPointerMove: mock(() => {}),
    onFillPointerUp: mock(() => {}),
  }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test packages/web/tests/interaction/DomFillHandleLayer.test.ts
```

Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement DOM layer**

Create `packages/web/src/interaction/DomFillHandleLayer.ts`:

```ts
import type { OverlayRect } from './RangeOverlayRects'

export interface DomFillHandleLayerCallbacks {
  readonly onFillPointerDown: (pointerId: number, clientX: number, clientY: number) => void
  readonly onFillPointerMove: (pointerId: number, clientX: number, clientY: number) => void
  readonly onFillPointerUp: (pointerId: number) => void
}

export class DomFillHandleLayer {
  private layer!: HTMLDivElement
  private handle!: HTMLDivElement
  private previewEls: HTMLDivElement[] = []
  private attached = false
  private destroyed = false

  constructor(
    private readonly container: HTMLElement,
    private readonly callbacks: DomFillHandleLayerCallbacks,
  ) {}

  attach(): void {
    if (this.attached || this.destroyed) return
    this.attached = true
    this.layer = document.createElement('div')
    this.layer.setAttribute('data-novasheet-fill-layer', '')
    Object.assign(this.layer.style, {
      position: 'absolute',
      inset: '0',
      pointerEvents: 'none',
      zIndex: '3',
    })

    this.handle = document.createElement('div')
    this.handle.setAttribute('data-novasheet-fill-handle', '')
    Object.assign(this.handle.style, {
      position: 'absolute',
      display: 'none',
      pointerEvents: 'auto',
      touchAction: 'none',
      cursor: 'crosshair',
      background: 'var(--novasheet-selection-border, #0969da)',
      border: '1px solid #fff',
      boxSizing: 'border-box',
    })
    this.handle.addEventListener('pointerdown', this.onPointerDown)
    this.handle.addEventListener('pointermove', this.onPointerMove)
    this.handle.addEventListener('pointerup', this.onPointerUp)
    this.handle.addEventListener('pointercancel', this.onPointerUp)
    this.layer.appendChild(this.handle)
    this.container.appendChild(this.layer)
  }

  sync(rect: OverlayRect | null): void {
    if (!this.attached || this.destroyed) return
    if (!rect) {
      this.handle.style.display = 'none'
      return
    }
    Object.assign(this.handle.style, {
      display: 'block',
      left: `${rect.x}px`,
      top: `${rect.y}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    })
  }

  showPreview(rects: readonly OverlayRect[]): void {
    if (!this.attached || this.destroyed) return
    this.hidePreview()
    for (const rect of rects) {
      const el = document.createElement('div')
      el.setAttribute('data-novasheet-fill-preview', '')
      Object.assign(el.style, {
        position: 'absolute',
        pointerEvents: 'none',
        boxSizing: 'border-box',
        border: '2px solid var(--novasheet-selection-border, #0969da)',
        background: 'rgba(9,105,218,0.06)',
        left: `${rect.x}px`,
        top: `${rect.y}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      })
      this.layer.appendChild(el)
      this.previewEls.push(el)
    }
  }

  hidePreview(): void {
    for (const el of this.previewEls) el.remove()
    this.previewEls = []
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.hidePreview()
    this.handle?.removeEventListener('pointerdown', this.onPointerDown)
    this.handle?.removeEventListener('pointermove', this.onPointerMove)
    this.handle?.removeEventListener('pointerup', this.onPointerUp)
    this.handle?.removeEventListener('pointercancel', this.onPointerUp)
    this.layer?.remove()
    this.attached = false
  }

  private onPointerDown = (event: PointerEvent): void => {
    event.preventDefault()
    event.stopPropagation()
    this.handle.setPointerCapture?.(event.pointerId)
    this.callbacks.onFillPointerDown(event.pointerId, event.clientX, event.clientY)
  }

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.handle.hasPointerCapture?.(event.pointerId)) return
    this.callbacks.onFillPointerMove(event.pointerId, event.clientX, event.clientY)
  }

  private onPointerUp = (event: PointerEvent): void => {
    if (this.handle.hasPointerCapture?.(event.pointerId))
      this.handle.releasePointerCapture(event.pointerId)
    this.callbacks.onFillPointerUp(event.pointerId)
  }
}
```

- [ ] **Step 4: Run test**

```bash
bun test packages/web/tests/interaction/DomFillHandleLayer.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/interaction/DomFillHandleLayer.ts packages/web/tests/interaction/DomFillHandleLayer.test.ts
git commit -m "feat(web): add fill handle DOM layer"
```

---

## Task 6: Web Runtime 填充拖拽

**Files:**

- Modify: `packages/web/src/runtime/WebGridRuntime.ts`
- Modify: `packages/web/src/backends/Canvas2DBackend.ts`
- Create: `packages/web/tests/runtime/WebGridRuntime.fill.test.ts`

- [ ] **Step 1: Write failing runtime tests**

Create `packages/web/tests/runtime/WebGridRuntime.fill.test.ts`:

```ts
import { describe, expect, it, mock } from 'bun:test'
import type { DataSource, GridEngine, GridSelection, Theme } from '@novasheet/core'
import { WebGridRuntime } from '../../src/runtime/WebGridRuntime'
import type { WebHost } from '../../src/host/WebHost'
import type { WebRenderer } from '../../src/render/WebRenderer'
import type { OverlayRect } from '../../src/interaction/RangeOverlayRects'

describe('WebGridRuntime fill handle', () => {
  it('syncs fill handle after render when selection exists', () => {
    const fillLayer = makeFillLayer()
    const engine = makeEngine()
    const runtime = new WebGridRuntime({
      engine,
      host: makeHost(),
      renderer: makeRenderer(),
      fillLayer,
    })
    ;(runtime as unknown as { syncFillHandle(): void }).syncFillHandle()
    expect(fillLayer.sync).toHaveBeenCalled()
  })

  it('drag commits fill target and emits onFill', () => {
    const engine = makeEngine()
    const fillLayer = makeFillLayer()
    const runtime = new WebGridRuntime({
      engine,
      host: makeHost(),
      renderer: makeRenderer(),
      fillLayer,
    })
    const onFill = mock(() => {})
    runtime.setOnFill(onFill)

    runtime.handleFillPointerDown(1, 250, 90)
    runtime.handleFillPointerMove(1, 250, 150)
    runtime.handleFillPointerUp(1)

    expect(engine.commitFill).toHaveBeenCalled()
    expect(onFill).toHaveBeenCalled()
  })

  it('does not enter fill drag without a selected range', () => {
    const engine = makeEngine({
      selectedRange: null,
      activeCell: null,
      anchorCell: null,
      extentCell: null,
    })
    const runtime = new WebGridRuntime({
      engine,
      host: makeHost(),
      renderer: makeRenderer(),
      fillLayer: makeFillLayer(),
    })
    runtime.handleFillPointerDown(1, 0, 0)
    runtime.handleFillPointerMove(1, 0, 150)
    runtime.handleFillPointerUp(1)
    expect(engine.commitFill).not.toHaveBeenCalled()
  })
})

function makeFillLayer() {
  return {
    sync: mock((_rect: OverlayRect | null) => {}),
    showPreview: mock((_rects: readonly OverlayRect[]) => {}),
    hidePreview: mock(() => {}),
  }
}

function makeEngine(
  selection: GridSelection = {
    activeCell: { rowIndex: 0, colIndex: 0 },
    anchorCell: { rowIndex: 0, colIndex: 0 },
    extentCell: { rowIndex: 1, colIndex: 1 },
    selectedRange: { startRow: 0, endRow: 1, startCol: 0, endCol: 1 },
  },
): GridEngine {
  const data = {
    getRowCount: () => 10,
    getSchema: () => ({
      fields: [
        { id: 'a', name: 'A', type: 'text', width: 100 },
        { id: 'b', name: 'B', type: 'number', width: 100 },
      ],
    }),
    getRows: () => [],
    getCell: () => null,
    subscribe: () => () => {},
  } as unknown as DataSource
  const frame = {
    data,
    theme: { metrics: { headerHeight: 30 } } as Theme,
    rowsAxis: {
      getCount: () => 10,
      indexToPosition: (i: number) => i * 30,
      getSize: () => 30,
    } as never,
    colsAxis: {
      getCount: () => 2,
      indexToPosition: (i: number) => i * 100,
      getSize: () => 100,
    } as never,
    viewport: {
      contentRect: { width: 400, height: 300 },
      regions: [
        {
          id: 'main',
          rowBand: 'middle',
          colBand: 'center',
          rowRange: [0, 9],
          colRange: [0, 1],
          rect: { x: 0, y: 30, width: 200, height: 270 },
          scrollOffsetX: 0,
          scrollOffsetY: 0,
          zIndex: 0,
        },
      ],
    },
    selection,
  } as never
  return {
    setData: mock(() => {}),
    setTheme: mock(() => {}),
    setFrozen: mock(() => {}),
    setViewportSize: mock(() => {}),
    setHeaderHeight: mock(() => {}),
    setScroll: mock(() => {}),
    setRowHeight: mock(() => {}),
    setColumnWidth: mock(() => {}),
    selectCell: mock(() => {}),
    navigateSelection: mock(() => false),
    beginCellEdit: mock(() => false),
    updateCellEditDraft: mock(() => {}),
    cancelCellEdit: mock(() => {}),
    commitCellEdit: mock(() => true),
    isCellEditing: mock(() => false),
    clearRange: mock(() => {}),
    clearSelection: mock(() => {}),
    getSelection: mock(() => selection),
    getFrame: mock(() => frame),
    getRowsTotalSize: () => 300,
    getColsTotalSize: () => 200,
    getColumnIndex: () => 0,
    getTheme: () => ({ metrics: { headerHeight: 30 } }) as Theme,
    getRowsAxis: () => frame.rowsAxis,
    getColsAxis: () => frame.colsAxis,
    getViewport: mock(() => ({}) as never),
    getData: mock(() => data),
    undo: mock(() => undefined),
    redo: mock(() => undefined),
    canUndo: mock(() => false),
    canRedo: mock(() => false),
    commitRowResize: mock(() => {}),
    commitColumnResize: mock(() => {}),
    commitPaste: mock(() => {}),
    commitFill: mock((source, fill, direction) => ({
      source,
      fill,
      result: { startRow: 0, endRow: 4, startCol: 0, endCol: 1 },
      direction,
      writes: [],
    })),
  } as GridEngine
}

function makeHost(): WebHost {
  return {
    attach: mock(() => {}),
    applyScrollbarTheme: mock(() => {}),
    setScrollSize: mock(() => {}),
    scrollTo: mock(() => {}),
    getDpr: () => 1,
    getContainerSize: () => ({ width: 400, height: 300 }),
    getContainerBoundingRect: () => ({ left: 0, top: 0 }),
    getScrollPosition: () => ({ scrollTop: 0, scrollLeft: 0 }),
    focusScrollHost: mock(() => {}),
    destroy: mock(() => {}),
  }
}

function makeRenderer(): WebRenderer {
  return {
    mount: mock(() => {}),
    resize: mock(() => {}),
    render: mock(() => {}),
    destroy: mock(() => {}),
  }
}
```

Use local helpers equivalent to the existing runtime tests. `makeEngine().commitFill` should return `{ source, fill, result, writes: [] }` for a successful call.

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test packages/web/tests/runtime/WebGridRuntime.fill.test.ts
```

Expected: FAIL because `fillLayer`, `setOnFill`, and `handleFillPointer*` are not implemented.

- [ ] **Step 3: Add runtime options and event type**

Modify `packages/web/src/runtime/WebGridRuntime.ts`:

```ts
import { computeFillTarget, type FillDirection, type FillTarget } from '@novasheet/core'
import type { DomFillHandleLayer } from '../interaction/DomFillHandleLayer'
import { computeFillHandleRect, computeRangeOverlayRects } from '../interaction/RangeOverlayRects'
```

Add to `WebGridRuntimeOptions`:

```ts
fillLayer?: DomFillHandleLayer
```

Add event:

```ts
export interface FillEvent {
  readonly source: CellRange
  readonly fill: CellRange
  readonly result: CellRange
  readonly direction: FillDirection
}
```

Add fields:

```ts
private fillLayer?: DomFillHandleLayer
private onFill?: (event: FillEvent) => void
private fillDrag: {
  pointerId: number
  source: CellRange
  target: FillTarget | null
  lastPointer: WebPointerEvent | null
} | null = null
```

Set `this.fillLayer = opts.fillLayer` in constructor.

- [ ] **Step 4: Add fill runtime methods**

Add public methods:

```ts
setOnFill(cb: (event: FillEvent) => void): void {
  this.onFill = cb
}

handleFillPointerDown(pointerId: number, clientX: number, clientY: number): void {
  if (this.destroyed || this.resizeDrag || this.draggingSelection) return
  if (this.engine.isCellEditing()) this.commitCellEdit(false)
  const source = this.engine.getSelection().selectedRange
  if (!source) return
  this.closeContextMenu()
  this.draggingSelection = false
  this.fillDrag = { pointerId, source, target: null, lastPointer: { x: clientX, y: clientY, clientX, clientY, shiftKey: false } }
}

handleFillPointerMove(pointerId: number, clientX: number, clientY: number): void {
  if (this.destroyed || !this.fillDrag || this.fillDrag.pointerId !== pointerId) return
  const pointer = { x: clientX, y: clientY, clientX, clientY, shiftKey: false }
  this.fillDrag.lastPointer = pointer
  const hit = hitTestCell(this.engine.getFrame(), pointer)
  if (!hit) return
  const data = this.engine.getData()
  this.fillDrag.target = computeFillTarget(this.fillDrag.source, hit, {
    rowCount: data.getRowCount(),
    colCount: data.getSchema().fields.length,
  })
  if (this.fillDrag.target) this.fillLayer?.showPreview(computeRangeOverlayRects(this.engine.getFrame(), this.fillDrag.target.fill))
  else this.fillLayer?.hidePreview()
}

handleFillPointerUp(pointerId: number): void {
  if (!this.fillDrag || this.fillDrag.pointerId !== pointerId) return
  const target = this.fillDrag.target
  this.fillDrag = null
  this.fillLayer?.hidePreview()
  if (!target) return
  const result = this.engine.commitFill(target.source, target.fill, target.direction)
  if (!result) return
  this.afterEngineMutation()
  this.onFill?.({ source: target.source, fill: target.fill, result: target.result, direction: target.direction })
}
```

- [ ] **Step 5: Sync fill handle**

Modify `invalidate()` and `paintSync()` to call `this.syncFillHandle()` after `this.syncResizeHandles()`.

Add:

```ts
private syncFillHandle(): void {
  if (!this.fillLayer) return
  if (this.resizeDrag || this.draggingSelection || this.fillDrag || this.engine.isCellEditing()) {
    this.fillLayer.sync(null)
    return
  }
  const range = this.engine.getSelection().selectedRange
  if (!range) {
    this.fillLayer.sync(null)
    return
  }
  this.fillLayer.sync(computeFillHandleRect(this.engine.getFrame(), range))
}
```

Call `this.fillLayer?.hidePreview()` in `destroy()` and when `afterEngineMutation()` closes context menu.

- [ ] **Step 6: Wire backend**

Modify `packages/web/src/backends/Canvas2DBackend.ts`:

```ts
import { DomFillHandleLayer } from '../interaction/DomFillHandleLayer'
```

Add field:

```ts
private fillHandleLayer: DomFillHandleLayer
```

In constructor after `DomHandleLayer` setup:

```ts
this.fillHandleLayer = new DomFillHandleLayer(this.container, {
  onFillPointerDown: (pointerId, x, y) => this.runtime.handleFillPointerDown(pointerId, x, y),
  onFillPointerMove: (pointerId, x, y) => this.runtime.handleFillPointerMove(pointerId, x, y),
  onFillPointerUp: (pointerId) => this.runtime.handleFillPointerUp(pointerId),
})
this.fillHandleLayer.attach()
```

Pass to runtime:

```ts
fillLayer: this.fillHandleLayer,
```

- [ ] **Step 7: Run runtime tests**

```bash
bun test packages/web/tests/runtime/WebGridRuntime.fill.test.ts packages/web/tests/runtime/WebGridRuntime.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/web/src/runtime/WebGridRuntime.ts packages/web/src/backends/Canvas2DBackend.ts packages/web/tests/runtime/WebGridRuntime.fill.test.ts
git commit -m "feat(web): wire fill handle drag runtime"
```

---

## Task 7: Public API 与 Storybook

**Files:**

- Modify: `packages/web/src/grid/GridController.ts`
- Modify: `packages/web/src/Grid.ts`
- Modify: `packages/web/src/index.ts`
- Create: `apps/storybook/src/stories/FillHandle.stories.ts`
- Create: `apps/storybook/src/stories/snippets/fill-handle.basic.snippet.ts`
- Modify: `README.md`

- [ ] **Step 1: Add facade tests or extend existing Grid tests**

Append to `packages/web/tests/Grid.undo.test.ts` or create `packages/web/tests/Grid.fill.test.ts`:

```ts
import { describe, expect, it, mock } from 'bun:test'
import { Grid } from '../src/Grid'
import { InMemoryDataSource } from '@novasheet/core'

describe('Grid facade — fill event', () => {
  it('onFill returns an unsubscribe function', () => {
    const container = document.createElement('div')
    const grid = new Grid(container, {
      data: new InMemoryDataSource({
        schema: { fields: [{ id: 'a', name: 'A', type: 'text', width: 80 }] },
        rows: [{ a: 'x' }],
      }),
    })
    const off = grid.onFill(mock(() => {}))
    expect(typeof off).toBe('function')
    off()
    grid.destroy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test packages/web/tests/Grid.fill.test.ts
```

Expected: FAIL because `Grid.onFill` is not implemented.

- [ ] **Step 3: Add public API plumbing**

Modify `packages/web/src/grid/GridController.ts`:

```ts
import type { FillEvent } from '../runtime/WebGridRuntime'

onFill(handler: (event: FillEvent) => void): () => void
```

Modify `Canvas2DBackend` constructor options:

```ts
onFill?: (event: FillEvent) => void
```

After runtime creation:

```ts
if (gridOptions?.onFill) this.runtime.setOnFill(gridOptions.onFill)
```

Add method:

```ts
onFill(handler: (event: FillEvent) => void): () => void {
  this.runtime.setOnFill(handler)
  return () => this.runtime.setOnFill(() => {})
}
```

Modify `packages/web/src/Grid.ts`:

```ts
import type { FillEvent } from './runtime/WebGridRuntime'

onFill(handler: (event: FillEvent) => void): () => void {
  return this.delegate.onFill(handler)
}
```

Export type from `packages/web/src/index.ts`:

```ts
export type { FillEvent } from './runtime/WebGridRuntime'
```

- [ ] **Step 4: Create Storybook story**

Create `apps/storybook/src/stories/snippets/fill-handle.basic.snippet.ts`:

```ts
import { Grid } from '@novasheet/web'
import { InMemoryDataSource } from '@novasheet/core'

const grid = new Grid(document.getElementById('grid')!, {
  data: new InMemoryDataSource({ schema, rows }),
  onFill: (event) => console.log('[fill]', event.direction, event.fill),
})
```

Create `apps/storybook/src/stories/FillHandle.stories.ts` following the existing `Undo.stories.ts` shape. Use rows with:

```ts
;[
  { task: 'Item 001', count: 1, due: new Date('2026-01-01T00:00:00Z'), done: false },
  { task: 'Item 002', count: 3, due: new Date('2026-01-03T00:00:00Z'), done: true },
  { task: null, count: null, due: null, done: null },
  { task: null, count: null, due: null, done: null },
]
```

The story should mount a `Grid`, display a small status element, and update it from `grid.onFill((e) => { status.textContent = ... })`.

- [ ] **Step 5: Update README**

Modify Phase 4 table row:

```md
| Phase 4.3 ✅ | 填充柄 | 选区右下角 DOM fill handle；支持向下/上/右/左拖拽；单值复制、数字等差、文本尾号、Date 序列；拖拽 preview；一次 fill 进 undo/redo；`Grid.onFill()` 事件。 |
```

Add design link:

```md
- [Phase 4.3 填充柄](docs/superpowers/specs/2026-05-21-fill-handle-design.md)
```

- [ ] **Step 6: Run web tests and typecheck**

```bash
bun test packages/web/tests/interaction/RangeOverlayRects.test.ts packages/web/tests/interaction/DomFillHandleLayer.test.ts packages/web/tests/runtime/WebGridRuntime.fill.test.ts packages/web/tests/Grid.fill.test.ts
bun run --filter @novasheet/web typecheck
```

Expected: PASS and typecheck exits 0.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/grid/GridController.ts packages/web/src/Grid.ts packages/web/src/index.ts packages/web/tests/Grid.fill.test.ts apps/storybook/src/stories/FillHandle.stories.ts apps/storybook/src/stories/snippets/fill-handle.basic.snippet.ts README.md
git commit -m "feat(web): expose fill handle API and story"
```

---

## Task 8: 最终验证

**文件:**

- 除非验证暴露 bug,否则不新增文件。

- [ ] **Step 1: Run full test suite**

```bash
bun test
```

预期:所有测试通过。

- [ ] **Step 2: Run typecheck**

```bash
bun run typecheck
```

预期:所有 packages exit 0。

- [ ] **Step 3: Run lint**

```bash
bun run lint
```

预期:无 lint errors。

- [ ] **Step 4: Build storybook**

```bash
bun run build-storybook
```

预期:Storybook build 成功。

- [ ] **Step 5: 提交验证过程中发现的问题修复**

当验证命令暴露真实问题时,用聚焦的 commit message 和精确文件列表提交修复:

```bash
git add packages/core/src packages/core/tests packages/web/src packages/web/tests apps/storybook/src README.md
git commit -m "fix: stabilize fill handle verification"
```

如果没有文件变化,在最终交接中记录验证输出,不要创建空 commit。

---

## Spec 覆盖清单

- Fill handle UI: Tasks 5 and 6.
- Four directions: Tasks 1, 2, 3, and 6.
- Preview: Tasks 5 and 6.
- Number/date/text-tail/copy rules: Task 2.
- Undo/redo: Task 3.
- Public `onFill`: Task 7.
- Storybook/manual verification: Task 7.
- Full verification: Task 8.
