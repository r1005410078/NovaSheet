# Date-as-Serial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 NovaSheet 的日期值模型从 `CellValue` 的 `Date` 分支重构为 Excel/Google serial number(1899-12-30 起,小数=时间),日期性改由类型判定,可观测行为不变。

**Architecture:** 新增单一序列↔Date 转换器(`serial.ts`,纪元 1899-12-30、连续无 1900 闰 bug、时区中性 UTC)。**消费者优先**迁移各点为 serial 语义(逐点红→绿可编译可提交),**最后**才从 `CellValue` 删 `Date` 并由编译器清扫残余 `instanceof Date` 死分支与跨包/测试 churn。此顺序较 spec §10 的"CellValue 先删"更利于每 task 绿提交,终态一致(hard-break)。

**Tech Stack:** TypeScript(strict + `noUncheckedIndexedAccess` + `verbatimModuleSyntax`)、bun workspaces、`bun:test`(`RecordingContext2D` 测 canvas)。

**Spec:** `docs/superpowers/specs/2026-06-14-novasheet-date-as-serial-design.md`
**Roadmap:** `docs/superpowers/plans/2026-06-14-novasheet-cell-type-override-roadmap.md`(本 plan 是其 Spec 1)

---

## File Map

| 文件 | 职责 | 动作 |
|---|---|---|
| `packages/core/src/kernel/protocol/serial.ts` | serial↔Date 转换器(纪元/UTC 不变量) | **新建** |
| `packages/core/src/kernel/protocol/formatValue.ts` | date kind 用 serial + UTC token | 改 |
| `packages/core/src/engine/FrameAssembler.ts` | date 类型无 format 注入默认 pattern | 改 |
| `packages/core/src/features/view/SortLayer.ts` | date 排序按 serial 数值 | 改 |
| `packages/core/src/features/view/FilterLayer.ts` | `date-between` operand 改 serial | 改 |
| `packages/core/src/dom/overlay/FilterPopover.ts` | 日期输入 ↔ serial | 改 |
| `packages/core/src/features/fill/FillSeries.ts` | 删 `inferDateProjector` / 简化 `cloneCellValue` | 改 |
| `packages/core/src/features/clipboard/TsvFormat.ts` | 序列化按列类型 date→ISO | 改 |
| `packages/core/src/features/clipboard/ApplyPaste.ts` | `coerceForType` 加 date 分支 | 改 |
| `packages/core/src/features/cell-types/CellTypes.ts` | `builtInCellTypes` 加 `date` | 改 |
| `packages/core/src/kernel/data/Schema.ts` | `CellValue` 删 `Date`(终态 hard-break) | 改 |
| canvas2d `CellPainter.ts` / `AutofitRowHeights.ts` / 跨包测试/story | 清扫死 `instanceof Date` + serial 化数据 | 改 |

---

## Task 1: serial.ts 转换核心

**Files:**
- Create: `packages/core/src/kernel/protocol/serial.ts`
- Test: `packages/core/tests/kernel/protocol/serial.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// packages/core/tests/kernel/protocol/serial.test.ts
import { describe, expect, it } from 'bun:test'
import { dateToSerial, serialToDate, SERIAL_EPOCH_MS } from '../../../src/kernel/protocol/serial'

describe('serial', () => {
  it('纪元锚点：1899-12-30 = 0', () => {
    expect(dateToSerial(new Date(Date.UTC(1899, 11, 30)))).toBe(0)
  })
  it('1899-12-31 = 1', () => {
    expect(dateToSerial(new Date(Date.UTC(1899, 11, 31)))).toBe(1)
  })
  it('1900-01-01 = 2（不复刻 Excel 1900 闰 bug）', () => {
    expect(dateToSerial(new Date(Date.UTC(1900, 0, 1)))).toBe(2)
  })
  it('Unix 纪元 1970-01-01 = 25569（公认常数）', () => {
    expect(dateToSerial(new Date(Date.UTC(1970, 0, 1)))).toBe(25569)
  })
  it('小数 = 日内时间：正午 = .5', () => {
    const s = dateToSerial(new Date(Date.UTC(2000, 0, 1, 12, 0, 0)))
    expect(s % 1).toBe(0.5)
  })
  it('round-trip 保真', () => {
    const d = new Date(Date.UTC(2025, 5, 9, 8, 5, 3))
    expect(serialToDate(dateToSerial(d)).getTime()).toBe(d.getTime())
  })
  it('时区中性：UTC 午夜恒为整数（本地方法会在 DST 区漂移）', () => {
    expect(Number.isInteger(dateToSerial(new Date(Date.UTC(2025, 6, 1))))).toBe(true)
    expect(Number.isInteger(dateToSerial(new Date(Date.UTC(2025, 0, 1))))).toBe(true)
  })
  it('serialToDate(0) 的 UTC 字段为 1899-12-30', () => {
    const d = serialToDate(0)
    expect(d.getUTCFullYear()).toBe(1899)
    expect(d.getUTCMonth()).toBe(11)
    expect(d.getUTCDate()).toBe(30)
  })
  it('SERIAL_EPOCH_MS 导出供消费者复用', () => {
    expect(SERIAL_EPOCH_MS).toBe(Date.UTC(1899, 11, 30))
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test packages/core/tests/kernel/protocol/serial.test.ts`
Expected: FAIL（`Cannot find module '.../serial'`）

- [ ] **Step 3: 实现**

```ts
// packages/core/src/kernel/protocol/serial.ts
/**
 * Excel/Google 序列日期 ↔ Date 转换器。
 *
 * 不变量（ADR-A/B/C）：
 * - 纪元 1899-12-30 = serial 0；连续 proleptic Gregorian，**不复刻 Excel 1900 闰 bug**（对齐 Google）。
 * - 整数 = 自纪元天数；小数 = 日内时间（0.5 = 12:00:00）。
 * - **时区中性**：仅用 UTC 毫秒做算术，调用方须以 UTC 语义构造/读取 Date，否则跨时区差一天。
 */
const MS_PER_DAY = 86_400_000

/** 纪元 1899-12-30T00:00:00Z 的 UTC 毫秒。供 formatValue 等消费者复用，避免重复字面量。 */
export const SERIAL_EPOCH_MS = Date.UTC(1899, 11, 30)

/** Date（按其 UTC 瞬时）→ serial。前置条件：`d` 为有效 Date。 */
export function dateToSerial(d: Date): number {
  return (d.getTime() - SERIAL_EPOCH_MS) / MS_PER_DAY
}

/** serial → Date（UTC 瞬时）。前置条件：`serial` 为有限数（调用点先 guard）。 */
export function serialToDate(serial: number): Date {
  return new Date(SERIAL_EPOCH_MS + serial * MS_PER_DAY)
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test packages/core/tests/kernel/protocol/serial.test.ts`
Expected: PASS（9 tests）

- [ ] **Step 5: commit**

```bash
git add packages/core/src/kernel/protocol/serial.ts packages/core/tests/kernel/protocol/serial.test.ts
git commit -m "feat(core): 新增 Excel/Google 序列日期转换器 serial.ts"
```

---

## Task 2: formatValue date kind → serial + UTC token

**Files:**
- Modify: `packages/core/src/kernel/protocol/formatValue.ts:32-40`（`formatDatePattern` 转 UTC）、`:82-86`（date kind）
- Test: `packages/core/tests/kernel/protocol/formatValue.test.ts:23-26`（改 serial 输入）

- [ ] **Step 1: 改测试为 serial 输入(先红)**

把 [formatValue.test.ts:23-26](packages/core/tests/kernel/protocol/formatValue.test.ts#L23) 的 date 用例替换为:

```ts
  it('date: serial + UTC token 替换', () => {
    const serial = dateToSerial(new Date(Date.UTC(2024, 5, 9, 8, 5, 3))) // 2024-06-09 08:05:03Z
    expect(formatValue(serial, { kind: 'date', pattern: 'YYYY-MM-DD HH:mm:ss' }, ctx, noReg)).toBe(
      '2024-06-09 08:05:03',
    )
  })
  it('date: 非数字 → undefined（painter 兜底）', () => {
    expect(formatValue('not-a-date', { kind: 'date', pattern: 'YYYY-MM-DD' }, ctx, noReg)).toBeUndefined()
  })
```

并在文件顶部 import 区加:

```ts
import { dateToSerial } from '../../../src/kernel/protocol/serial'
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test packages/core/tests/kernel/protocol/formatValue.test.ts`
Expected: FAIL（旧实现把 serial 当 epoch ms，输出年份错乱）

- [ ] **Step 3: 实现**

`formatValue.ts` 顶部 import 加:

```ts
import { serialToDate } from './serial'
```

把 `formatDatePattern`（[:32-40](packages/core/src/kernel/protocol/formatValue.ts#L32)）的本地方法全改 UTC:

```ts
/** v1 固定 token 子集；未识别 token 原样保留。**UTC 读取**以匹配 serial 的时区中性。 */
function formatDatePattern(d: Date, pattern: string): string {
  return pattern
    .replace(/YYYY/g, String(d.getUTCFullYear()))
    .replace(/MM/g, pad(d.getUTCMonth() + 1))
    .replace(/DD/g, pad(d.getUTCDate()))
    .replace(/HH/g, pad(d.getUTCHours()))
    .replace(/mm/g, pad(d.getUTCMinutes()))
    .replace(/ss/g, pad(d.getUTCSeconds()))
}
```

把 date kind（[:82-86](packages/core/src/kernel/protocol/formatValue.ts#L82)）替换为:

```ts
    case 'date': {
      const n = asFiniteNumber(value)
      if (n === null) return undefined
      return formatDatePattern(serialToDate(n), format.pattern)
    }
```

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test packages/core/tests/kernel/protocol/formatValue.test.ts`
Expected: PASS

- [ ] **Step 5: commit**

```bash
git add packages/core/src/kernel/protocol/formatValue.ts packages/core/tests/kernel/protocol/formatValue.test.ts
git commit -m "fix(core): formatValue date kind 改用 serial + UTC token"
```

---

## Task 3: FrameAssembler 默认 date pattern 注入

date 类型列无显式 valueFormat 时,注入默认 `YYYY-MM-DD`,避免裸序列号露出。

**Files:**
- Modify: `packages/core/src/engine/FrameAssembler.ts:19-33`（`buildFormatCell`）
- Test: `packages/core/tests/engine/FrameAssembler.test.ts`（无则新建）

- [ ] **Step 1: 写失败测试**

```ts
// packages/core/tests/engine/FrameAssembler.test.ts
import { describe, expect, it } from 'bun:test'
import { buildFormatCell } from '../../src/engine/FrameAssembler'
import type { Field } from '../../src/kernel/data/Schema'
import { dateToSerial } from '../../src/kernel/protocol/serial'

const dateField: Field = { id: 'd', name: 'D', type: 'date', width: 100 }
const numField: Field = { id: 'n', name: 'N', type: 'number', width: 100 }

describe('buildFormatCell — date 默认 pattern', () => {
  it('date 列无 valueFormat → 默认 YYYY-MM-DD', () => {
    const fc = buildFormatCell([], {}, 'en-US')
    const serial = dateToSerial(new Date(Date.UTC(2025, 0, 15)))
    expect(fc(0, 0, dateField, serial)).toBe('2025-01-15')
  })
  it('非 date 列无 valueFormat → undefined（painter 兜底）', () => {
    const fc = buildFormatCell([], {}, 'en-US')
    expect(fc(0, 0, numField, 42)).toBeUndefined()
  })
  it('date 列有显式 field.format → 用显式 pattern 覆盖默认', () => {
    const f: Field = { ...dateField, format: { kind: 'date', pattern: 'DD/MM/YYYY' } }
    const fc = buildFormatCell([], {}, 'en-US')
    const serial = dateToSerial(new Date(Date.UTC(2025, 0, 15)))
    expect(fc(0, 0, f, serial)).toBe('15/01/2025')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test packages/core/tests/engine/FrameAssembler.test.ts`
Expected: FAIL（date 列无 format 现返回 undefined，期望 '2025-01-15'）

- [ ] **Step 3: 实现**

`FrameAssembler.ts` 顶部加常量,改 `buildFormatCell` 的 resolve 行:

```ts
/** date 类型列无显式 valueFormat 时的默认显示 pattern（date-only；datetime 须显式配 time token）。 */
const DEFAULT_DATE_PATTERN = 'YYYY-MM-DD'
```

把 [:29](packages/core/src/engine/FrameAssembler.ts#L29) 起的闭包体替换:

```ts
  return (rowIndex, colIndex, field, value) => {
    const explicit = cellMap.get(`${rowIndex}:${colIndex}`) ?? field.format
    const format =
      explicit ?? (field.type === 'date' ? { kind: 'date', pattern: DEFAULT_DATE_PATTERN } : undefined)
    if (!format) return undefined
    return formatValue(value, format, { field, locale }, formatters)
  }
```

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test packages/core/tests/engine/FrameAssembler.test.ts`
Expected: PASS（3 tests）

- [ ] **Step 5: commit**

```bash
git add packages/core/src/engine/FrameAssembler.ts packages/core/tests/engine/FrameAssembler.test.ts
git commit -m "feat(core): date 列无 valueFormat 时注入默认显示 pattern"
```

---

## Task 4: SortLayer date → serial 数值排序

**Files:**
- Modify: `packages/core/src/features/view/SortLayer.ts:330,339,399-404`
- Test: `packages/core/tests/features/view/SortLayer.test.ts`

- [ ] **Step 1: 写/改失败测试**

在 `SortLayer.test.ts` 加（或替换原 Date-based date 排序用例）:

```ts
  it('date 列按 serial 升序；空值殿后', () => {
    const layer = makeSortLayer([
      { d: 45000 }, { d: null }, { d: 44000 }, { d: 46000 },
    ], { id: 'd', name: 'D', type: 'date', width: 100 })
    layer.setSort({ fieldId: 'd', direction: 'asc' })
    expect(orderedValues(layer, 'd')).toEqual([44000, 45000, 46000, null])
  })
```

> 注：`makeSortLayer` / `orderedValues` 沿用该测试文件既有 helper；若签名不同，按文件内既有 date 用例的构造方式替换即可（保持把 date 值由 `new Date(...)` 改为 serial 数字）。

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test packages/core/tests/features/view/SortLayer.test.ts`
Expected: FAIL 或既有 date 用例因输入类型变化而红

- [ ] **Step 3: 实现**

`SortLayer.ts` 把 `dateValue`（[:399-404](packages/core/src/features/view/SortLayer.ts#L399)）整段删除,并把 date 分支改用 `numberValue`:

[:330](packages/core/src/features/view/SortLayer.ts#L330) 改为:
```ts
  if (type === 'date') return compareNullable(numberValue(left), numberValue(right), compareNumbers)
```

[:339](packages/core/src/features/view/SortLayer.ts#L339) 改为:
```ts
  if (field.type === 'date') return numberValue(value) == null
```

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test packages/core/tests/features/view/SortLayer.test.ts`
Expected: PASS

- [ ] **Step 5: commit**

```bash
git add packages/core/src/features/view/SortLayer.ts packages/core/tests/features/view/SortLayer.test.ts
git commit -m "refactor(core): SortLayer date 按 serial 数值排序"
```

---

## Task 5: FilterLayer date-between → serial operand

**Files:**
- Modify: `packages/core/src/features/view/FilterLayer.ts:18`（FilterOp）、`:348-352`（sameOp）、`:403-409`（predicate）、`:463-474`（helpers）
- Test: `packages/core/tests/features/view/FilterLayer.test.ts`

- [ ] **Step 1: 写/改失败测试**

```ts
  it('date-between 按 serial 区间过滤', () => {
    const layer = makeFilterLayer([{ d: 44000 }, { d: 45000 }, { d: 46000 }],
      { id: 'd', name: 'D', type: 'date', width: 100 })
    layer.setFilter({ fieldId: 'd', op: { kind: 'date-between', start: 44500, end: 45500 } })
    expect(visibleValues(layer, 'd')).toEqual([45000])
  })
```

> helper 沿用文件既有；要点是 `date-between` 的 `start/end` 现为 serial 数字、cell 值也为 serial。

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test packages/core/tests/features/view/FilterLayer.test.ts`
Expected: FAIL（`start: number` 与现 `Date | null` 类型冲突）

- [ ] **Step 3: 实现**

[:18](packages/core/src/features/view/FilterLayer.ts#L18) 改:
```ts
  | { kind: 'date-between'; start: number | null; end: number | null }
```

`dateValue`（[:463-468](packages/core/src/features/view/FilterLayer.ts#L463)）与 `dateTime`（[:470-474](packages/core/src/features/view/FilterLayer.ts#L470)）整段删除。

predicate date-between（[:403-409](packages/core/src/features/view/FilterLayer.ts#L403)）改:
```ts
    case 'date-between':
      return (value) => {
        const serial = numberValue(value)
        return (
          serial != null &&
          (op.start == null || serial >= op.start) &&
          (op.end == null || serial <= op.end)
        )
      }
```

sameOp date-between（[:348-352](packages/core/src/features/view/FilterLayer.ts#L348)）改为直接比数字:
```ts
    case 'date-between':
      return (
        right.kind === left.kind && left.start === right.start && left.end === right.end
      )
```

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test packages/core/tests/features/view/FilterLayer.test.ts`
Expected: PASS

- [ ] **Step 5: commit**

```bash
git add packages/core/src/features/view/FilterLayer.ts packages/core/tests/features/view/FilterLayer.test.ts
git commit -m "refactor(core): FilterLayer date-between operand 改 serial"
```

---

## Task 6: FilterPopover 日期输入 ↔ serial

**Files:**
- Modify: `packages/core/src/dom/overlay/FilterPopover.ts:354-362`（`dateOrNull`/`dateInputValue`）
- Test: `packages/core/tests/dom/overlay/FilterPopover.test.ts`（若存在 date 用例则改；否则在本任务靠 typecheck 保障）

- [ ] **Step 1: 写/改失败测试（若该测试文件已存在）**

若 `FilterPopover.test.ts` 已有 date 用例,改为断言 `toFilterOp()` 产出 serial(用 `dateToSerial(new Date(Date.UTC(...)))` 比对);无则跳到 Step 3,靠 typecheck（Task 5 已把 `date-between` operand 改 number,本文件不改会编译失败）。

- [ ] **Step 2: 跑 typecheck 确认失败**

Run: `bun run --filter @novasheet/core typecheck`
Expected: FAIL（`dateOrNull` 返回 `Date` 与 `date-between.start: number` 冲突）

- [ ] **Step 3: 实现**

`FilterPopover.ts` 顶部 import 加:
```ts
import { dateToSerial, serialToDate } from '../../kernel/protocol/serial'
```

`dateOrNull`（[:354-358](packages/core/src/dom/overlay/FilterPopover.ts#L354)）改:
```ts
/** "YYYY-MM-DD"（date input 值，UTC 语义）→ serial；空/非法 → null。 */
function dateOrNull(value: string): number | null {
  if (value.trim() === '') return null
  const date = new Date(value) // date-only ISO 按 UTC 午夜解析
  return Number.isNaN(date.getTime()) ? null : dateToSerial(date)
}
```

`dateInputValue`（[:360-362](packages/core/src/dom/overlay/FilterPopover.ts#L360)）改:
```ts
/** serial → "YYYY-MM-DD"（date input 值，UTC 读取）。 */
function dateInputValue(serial: number | null): string {
  return serial == null ? '' : serialToDate(serial).toISOString().slice(0, 10)
}
```

`draftFromOp` date-between（[:334](packages/core/src/dom/overlay/FilterPopover.ts#L334)）的 `op.start`/`op.end` 现为 `number | null`,直接传入新 `dateInputValue` 即可,无需再改。

- [ ] **Step 4: 跑 typecheck + 相关测试确认通过**

Run: `bun run --filter @novasheet/core typecheck && bun test packages/core/tests/dom/overlay/`
Expected: PASS

- [ ] **Step 5: commit**

```bash
git add packages/core/src/dom/overlay/FilterPopover.ts packages/core/tests/dom/overlay/
git commit -m "refactor(core): FilterPopover 日期输入 ↔ serial 转换"
```

---

## Task 7: FillSeries 删 inferDateProjector + 简化 cloneCellValue

date 值已是 number → 等差日期序列天然落进 `inferNumberProjector`;`inferDateProjector` 成死码,`cloneCellValue` 的 Date 分支无意义。

**Files:**
- Modify: `packages/core/src/features/fill/FillSeries.ts:116-117,140-154,192-194`
- Test: `packages/core/tests/features/fill/FillSeries.test.ts`

- [ ] **Step 1: 写/改失败测试**

把该文件中以 `new Date(...)` 为样本的日期填充用例改为 serial,并断言线性递增由通用数值投影器接管:

```ts
  it('date 列等差 serial → 线性日填充（通用数值投影器）', () => {
    const writes = computeFillWrites({
      data: makeData([{ d: 45000 }, { d: 45001 }], { id: 'd', name: 'D', type: 'date', width: 100 }),
      source: range(0, 1, 0, 0),
      fill: range(2, 3, 0, 0),
      direction: 'down',
    })
    expect(writes.map((w) => w.value)).toEqual([45002, 45003])
  })
```

> `makeData`/`range` 沿用文件既有 helper。

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test packages/core/tests/features/fill/FillSeries.test.ts`
Expected: FAIL 或既有 Date-based 用例红

- [ ] **Step 3: 实现**

删除 `inferProjector` 中对 date 的调用（[:116-117](packages/core/src/features/fill/FillSeries.ts#L116)）:
```ts
  const numberProjector = inferNumberProjector(samples)
  if (numberProjector) return numberProjector

  const textProjector = inferTextTailProjector(samples)
  if (textProjector) return textProjector

  return (offset) => samples[positiveModulo(offset, samples.length)]!
```

删除整个 `inferDateProjector` 函数（[:140-154](packages/core/src/features/fill/FillSeries.ts#L140)）。

删除 `cloneCellValue` 函数（[:192-194](packages/core/src/features/fill/FillSeries.ts#L192)）,并把其两处调用改为直接取值:
- [:111](packages/core/src/features/fill/FillSeries.ts#L111) `return () => cloneCellValue(samples[0]!)` → `return () => samples[0]!`

> 删 `cloneCellValue` 的依据:序列只剩 number/string/boolean/`readonly string[]`,均不可变,共享引用安全。

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test packages/core/tests/features/fill/FillSeries.test.ts`
Expected: PASS

- [ ] **Step 5: commit**

```bash
git add packages/core/src/features/fill/FillSeries.ts packages/core/tests/features/fill/FillSeries.test.ts
git commit -m "refactor(core): FillSeries date 填充并入数值投影器，删死码"
```

---

## Task 8: TsvFormat 序列化按列类型 date→ISO

date 值已是 number,复制时须凭列类型把 date 列序列化为 ISO 串(人类可读 / Excel 互操作)。

**Files:**
- Modify: `packages/core/src/features/clipboard/TsvFormat.ts:27-47,56-68`
- Modify: `packages/core/src/dom/runtime/GridRuntime.ts:945`（调用方传 schema）
- Test: `packages/core/tests/features/clipboard/TsvFormat.test.ts`

- [ ] **Step 1: 写/改失败测试**

```ts
  it('date 列序列化为 ISO（凭 schema 类型）', () => {
    const schema = { fields: [{ id: 'd', name: 'D', type: 'date', width: 100 }] }
    const serial = dateToSerial(new Date(Date.UTC(2025, 0, 15)))
    expect(serializeRowsToTsv([{ d: serial }], ['d'], schema)).toBe('2025-01-15T00:00:00.000Z')
  })
  it('number 列序列化为数字串（非 date 不转）', () => {
    const schema = { fields: [{ id: 'n', name: 'N', type: 'number', width: 100 }] }
    expect(serializeRowsToTsv([{ n: 45000 }], ['n'], schema)).toBe('45000')
  })
```

文件顶部 import 加 `import { dateToSerial } from '../../../src/kernel/protocol/serial'`。

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test packages/core/tests/features/clipboard/TsvFormat.test.ts`
Expected: FAIL（`serializeRowsToTsv` 现仅两参，且 date 列输出 '45000'）

- [ ] **Step 3: 实现**

`TsvFormat.ts` 顶部 import 加:
```ts
import { serialToDate } from '../../kernel/protocol/serial'
```

`serializeValue`（[:27-47](packages/core/src/features/clipboard/TsvFormat.ts#L27)）改为带类型,删 `instanceof Date` 分支:
```ts
function serializeValue(v: CellValue | undefined, type: string | undefined): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return ''
    return type === 'date' ? serialToDate(v).toISOString() : String(v)
  }
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (Array.isArray(v)) return v.join(',')
  return String(v)
}
```

`serializeRowsToTsv`（[:56-68](packages/core/src/features/clipboard/TsvFormat.ts#L56)）加 `schema` 参,建 typeMap:
```ts
export function serializeRowsToTsv(
  rows: readonly Row[],
  fieldIds: readonly string[],
  schema: Schema,
): string {
  if (rows.length === 0) return ''
  const typeMap = new Map(schema.fields.map((f) => [f.id, f.type]))
  return rows
    .map((row) =>
      fieldIds
        .map((fieldId) => escapeTsvField(serializeValue(row[fieldId], typeMap.get(fieldId))))
        .join('\t'),
    )
    .join('\n')
}
```

更新唯一调用方 [GridRuntime.ts:945](packages/core/src/dom/runtime/GridRuntime.ts#L945)（该方法上下文已有 schema；若无则 `this.engine.getSchema()` / 既有 schema 取法）:
```ts
    return { range, rows, tsv: serializeRowsToTsv(rows, fieldIds, schema) }
```

- [ ] **Step 4: 跑测试 + typecheck 确认通过**

Run: `bun test packages/core/tests/features/clipboard/TsvFormat.test.ts && bun run --filter @novasheet/core typecheck`
Expected: PASS

- [ ] **Step 5: commit**

```bash
git add packages/core/src/features/clipboard/TsvFormat.ts packages/core/src/dom/runtime/GridRuntime.ts packages/core/tests/features/clipboard/TsvFormat.test.ts
git commit -m "feat(core): TsvFormat 按列类型把 date 序列化为 ISO"
```

---

## Task 9: ApplyPaste coerceForType date 分支

粘贴到 date 列:ISO 串 → serial(转不动 skip)。

**Files:**
- Modify: `packages/core/src/features/clipboard/ApplyPaste.ts:98-119`
- Test: `packages/core/tests/features/clipboard/ApplyPaste.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
  it('粘贴 ISO 串到 date 列 → serial', () => {
    const data = makeMutable([{ d: 0 }], { id: 'd', name: 'D', type: 'date', width: 100 })
    applyPaste(
      { cells: [['2025-01-15']], sourceFieldIds: ['d'], typed: false },
      { startRow: 0, endRow: 0, startCol: 0, endCol: 0, tile: { rows: 1, cols: 1 } },
      data.getSchema(), ['d'], data,
    )
    expect(data.getCell(0, 'd')).toBe(dateToSerial(new Date(Date.UTC(2025, 0, 15))))
  })
  it('粘贴非法日期到 date 列 → skip', () => {
    const skipped: unknown[] = []
    const data = makeMutable([{ d: 0 }], { id: 'd', name: 'D', type: 'date', width: 100 })
    applyPaste(
      { cells: [['not-a-date']], sourceFieldIds: ['d'], typed: false },
      { startRow: 0, endRow: 0, startCol: 0, endCol: 0, tile: { rows: 1, cols: 1 } },
      data.getSchema(), ['d'], data, (c) => skipped.push(...c),
    )
    expect(skipped.length).toBe(1)
    expect(data.getCell(0, 'd')).toBe(0)
  })
```

> `makeMutable` 沿用文件既有 helper;`dateToSerial` 从 serial 模块 import。

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test packages/core/tests/features/clipboard/ApplyPaste.test.ts`
Expected: FAIL（date 列现走 string 分支，返回 '2025-01-15' 而非 serial）

- [ ] **Step 3: 实现**

`ApplyPaste.ts` 顶部 import 加:
```ts
import { dateToSerial } from '../../kernel/protocol/serial'
```

在 `coerceForType` 的 number 分支后(checkbox 前)插入 date 分支:
```ts
  if (type === 'date') {
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : SKIP
    if (typeof raw === 'string') {
      if (raw.trim() === '') return null
      const d = new Date(raw.trim()) // ISO（date-only 按 UTC 午夜）
      return Number.isNaN(d.getTime()) ? SKIP : dateToSerial(d)
    }
    return SKIP
  }
```

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test packages/core/tests/features/clipboard/ApplyPaste.test.ts`
Expected: PASS

- [ ] **Step 5: commit**

```bash
git add packages/core/src/features/clipboard/ApplyPaste.ts packages/core/tests/features/clipboard/ApplyPaste.test.ts
git commit -m "feat(core): ApplyPaste date 列 ISO→serial 强转"
```

---

## Task 10: edit builtInCellTypes 加 date

date 单元格编辑:打开显示 ISO 串,提交 ISO/日期串 → serial。

**Files:**
- Modify: `packages/core/src/features/cell-types/CellTypes.ts:48-67,104-109`
- Test: `packages/core/tests/features/cell-types/CellTypes.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
  it('date: formatForEdit serial → YYYY-MM-DD', () => {
    const f = { id: 'd', name: 'D', type: 'date', width: 100 } as const
    const serial = dateToSerial(new Date(Date.UTC(2025, 0, 15)))
    expect(formatCellForEditWithTypes(serial, f)).toBe('2025-01-15')
  })
  it('date: parseEditInput 日期串 → serial', () => {
    const f = { id: 'd', name: 'D', type: 'date', width: 100 } as const
    expect(parseCellEditInputWithTypes('2025-01-15', f)).toBe(
      dateToSerial(new Date(Date.UTC(2025, 0, 15))),
    )
  })
  it('date: parseEditInput 非法 → SKIP', () => {
    const f = { id: 'd', name: 'D', type: 'date', width: 100 } as const
    expect(parseCellEditInputWithTypes('xxx', f)).toBe(SKIP_CELL_VALUE)
  })
```

import 加 `import { dateToSerial } from '../../../src/kernel/protocol/serial'`。

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test packages/core/tests/features/cell-types/CellTypes.test.ts`
Expected: FAIL（date 无注册，走 fallback）

- [ ] **Step 3: 实现**

`CellTypes.ts` 顶部 import 加:
```ts
import { dateToSerial, serialToDate } from '../../kernel/protocol/serial'
```

在 `builtInCellTypes`（[:48-67](packages/core/src/features/cell-types/CellTypes.ts#L48)）的 `number` 后加 `date`:
```ts
  date: {
    editable: true,
    formatForEdit: (value) => {
      if (typeof value !== 'number' || !Number.isFinite(value)) return ''
      return serialToDate(value).toISOString().slice(0, 10)
    },
    parseEditInput: (input) => {
      const trimmed = input.trim()
      if (trimmed === '') return null
      const d = new Date(trimmed) // ISO（date-only 按 UTC 午夜）
      return Number.isNaN(d.getTime()) ? SKIP_CELL_VALUE : dateToSerial(d)
    },
  },
```

把 `formatBuiltInEditValue`（[:104-109](packages/core/src/features/cell-types/CellTypes.ts#L104)）的 `instanceof Date` 分支删除（date 现走上面专用定义,fallback 不再需要 Date 处理）:
```ts
function formatBuiltInEditValue(value: CellValue | undefined): string {
  if (value === undefined || value === null) return ''
  if (Array.isArray(value)) return value.join(', ')
  return String(value)
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test packages/core/tests/features/cell-types/CellTypes.test.ts`
Expected: PASS

- [ ] **Step 5: commit**

```bash
git add packages/core/src/features/cell-types/CellTypes.ts packages/core/tests/features/cell-types/CellTypes.test.ts
git commit -m "feat(core): builtInCellTypes 加 date 编辑解析（serial）"
```

---

## Task 11: CellValue 删 Date + 编译器清扫死码与跨包/测试 churn

终态 hard-break。改 `CellValue` 后由 typecheck 暴露全部残余站点,机械清扫。

**Files:**
- Modify: `packages/core/src/kernel/data/Schema.ts:58`
- Modify: `packages/core/src/features/cell-types/CellTypes.ts:40`（`sortValue` 返回类型去 `Date`）
- Modify: `packages/canvas2d/src/painters/CellPainter.ts:204,303`、`packages/core/src/features/row/AutofitRowHeights.ts:157`（删死 `instanceof Date` 分支）
- Modify: 全仓测试/story 中以 `new Date(...)` 作 cell 值处 → serial

- [ ] **Step 1: 改 CellValue 删 Date**

[Schema.ts:58](packages/core/src/kernel/data/Schema.ts#L58):
```ts
export type CellValue = string | number | boolean | null | readonly string[]
```
并删除其上方注释里关于 `Date` 的行。

- [ ] **Step 2: 跑 typecheck 暴露全部站点**

Run: `bun run --filter '*' typecheck`
Expected: FAIL，列出所有引用 `Date` 作 `CellValue` 之处

- [ ] **Step 3: 机械清扫(对每个 typecheck 报错点)**

按以下规则逐点修,直到 typecheck 全绿:
- **死 `instanceof Date` 分支**(已迁移消费者残留):删该分支。具体:
  - [CellPainter.ts:204](packages/canvas2d/src/painters/CellPainter.ts#L204)、[:303](packages/canvas2d/src/painters/CellPainter.ts#L303):删 `if (value instanceof Date) ...` 行（date 现经 `formatCell` + 默认 pattern 渲染）。
  - [AutofitRowHeights.ts:157](packages/core/src/features/row/AutofitRowHeights.ts#L157):删 `instanceof Date` 行(date 列量宽退化为 serial 串宽——已知 minor,date 通常不 wrap)。
- **`sortValue` 返回类型** [CellTypes.ts:40](packages/core/src/features/cell-types/CellTypes.ts#L40):去掉 `| Date` → `string | number | boolean | null`。
- **测试/story 数据** `new Date(...)` 作 cell 值:改 `dateToSerial(new Date(Date.UTC(...)))` 或字面 serial(从 `@novasheet/core` 或相对路径 import `dateToSerial`)。

每修一簇可分多次 commit(同包内逻辑相关的一起)。

- [ ] **Step 4: 全量 typecheck 绿**

Run: `bun run --filter '*' typecheck`
Expected: PASS（0 error）

- [ ] **Step 5: commit**

```bash
git add -A
git commit -m "refactor!: CellValue 删 Date 分支，清扫死码与测试数据 serial 化"
```

---

## Task 12: BDD 外环场景更新 + 四绿收尾

**Files:**
- Modify: `packages/core/tests/acceptance/e2e/grid/scenarios/L2-grid-format-value-number-currency-date.md`
- Modify: `packages/core/tests/acceptance/interaction/editing/scenarios/L0-fill-series-projection-matrix.md`、`L2-grid-fill-series-down-right.md`
- Modify: `packages/core/tests/acceptance/contract/file-format/scenarios/L0-clipboard-tsv-roundtrip.md`
- Modify: `packages/react/tests/excel/scenarios/L3b-value-format.md`
- Modify: 上述场景对应的 `bdd.test.ts` glue（如 `packages/core/tests/acceptance/functional/data-ops/bdd.test.ts`、`interaction/editing/bdd.test.ts`）

- [ ] **Step 1: 更新场景 MD 的 Given/期望**

把各场景里以 `Date`/日期对象表述的 cell 输入改为 serial(或在 G/W/T 文字里用 ISO + 注明底层 serial),保持期望显示文本不变(date→serial 是已批准契约变更,非静默漂移)。glue 测试同步改 serial 输入。

- [ ] **Step 2: mbd validate + 覆盖率不退化**

Run: `bun run --filter @novasheet/mbd validate` 等价命令（见 `packages/mbd/`），及 `@novasheet/react` 的 `lint:scenario-coverage`
Expected: PASS，覆盖率不降

- [ ] **Step 3: 全量四绿**

Run（逐条须绿）:
```bash
bun test
bun run --filter '*' typecheck
bun run lint
bun run --filter @novasheet/core build && bun run --filter @novasheet/canvas2d build
```
Expected: 全 PASS（0 error/warning）

- [ ] **Step 4: commit**

```bash
git add -A
git commit -m "test(core): date-as-serial 行为场景更新 + 四绿收尾"
```

- [ ] **Step 5: 里程碑 code review**

按 CLAUDE.md「里程碑收尾 dispatch code-reviewer」,即便四绿亦走 self-review(plan + spec)与 code-reviewer。

---

## Plan-Risk 提醒(subagent 须 STOP+ASK)

1. **时区**:任何本地 Date 方法(`getFullYear`/`getHours`/`new Date("...T...")` 无 tz)→ 差一天。全程 UTC。
2. **1900 闰 bug**:不复刻;参考期望 Excel 序列时在 1900-03 前会分歧,锚点规避。
3. **TsvFormat copy 需 schema**:确认所有 copy 入口能拿到 schema。
4. **默认 pattern**:date 列无 valueFormat 不得露裸序列(Task 3 保障)。
5. **测试期望与 plan 矛盾**:STOP+ASK,先修 plan/spec 再继续(CLAUDE.md)。
