# Phase 5-C 单元格值格式化（Value Formatting）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把单元格 raw value → 显示文本的规则外置为可配置 descriptor（number/currency/percent/date）+ 集成方自定义 formatter 命名注册表，raw value 不变。

**Architecture:** cell 级 `CellFormat.valueFormat` 复用 5-A 格式管线（`FormatLayer`/`RangeStyleStore`/undo/remap）；列级 `Field.format` 默认；`getFrame()` 装配阶段产纯解析器闭包 `RenderFrame.formatCell`，返回 `string | undefined`（无显式 format 返回 `undefined`，painter 保持现有未格式化行为，零回归）；painter `formatCell?.() ?? 现有路径`。解析纯函数 `formatValue` 在 kernel 纯层。

**Tech Stack:** TypeScript（strict + verbatimModuleSyntax + noUncheckedIndexedAccess）、bun:test、Intl.NumberFormat、canvas2d RecordingContext。

**Spec:** `docs/superpowers/specs/2026-06-10-novasheet-phase-5-c-value-formatting-design.md`

**已锁决策（spec §11 ADR）:** frame 闭包非 dense 数组；命名注册表（文档存 formatterId）；cell 级复用 5-A；date v1 固定 token；编辑态显示 raw（本 plan 不改编辑器，编辑器本就读 raw，无需改动）。

**与 spec 的一处精化:** spec §6.1 闭包签名示意为 `(rowIndex, fieldId, value) => string`；本 plan 落地为 `(rowIndex, colIndex, field, value) => string | undefined`——painter 已持 `field`，cell 覆盖按 view 坐标查，列默认按 `field.format`；返回 `undefined` 让 painter `??` 兜底，保证未格式化格行为不变（消除 number 千分位回归风险）。

---

## File Structure

| 文件 | 责任 | 动作 |
| --- | --- | --- |
| `packages/core/src/kernel/protocol/FormatTypes.ts` | `ValueFormat` / `CellFormatter` / `FormatContext` 类型；`CellFormat.valueFormat?` | 改 |
| `packages/core/src/kernel/data/Schema.ts` | `Field.format?: ValueFormat` | 改 |
| `packages/core/src/kernel/protocol/formatValue.ts` | 纯解析函数 `formatValue` + date token + warnOnce | 建 |
| `packages/core/src/features/format/RangeStyleStore.ts` | `resolveCell` 累积 `valueFormat`（last-wins） | 改 |
| `packages/core/src/kernel/render/RenderFrame.ts` | `formatCell?` 字段 | 改 |
| `packages/core/src/engine/FrameAssembler.ts` | 构 `formatCell` 闭包 | 改 |
| `packages/core/src/engine/GridEngine.ts` | `GridEngineOptions.formatters?` / `locale?` | 改 |
| `packages/core/src/engine/DefaultGridEngine.ts` | 存 formatters/locale，传入 assembleFrame；`setValueFormat` | 改 |
| `packages/core/src/features/format/FormatController.ts` | `setValueFormat`（mirror `setTextWrap`） | 改 |
| `packages/core/src/dom/runtime/{GridRuntime,GridControllerImpl,GridController}.ts` | `setValueFormat` 转发 | 改 |
| `packages/core/src/Grid.ts` | `setValueFormat` + `GridOptions` 透传 formatters/locale | 改 |
| `packages/canvas2d/src/painters/CellPainter.ts` | `CellPaintParams` 增 `rowIndex`/`colIndex`/`formatCell`；文本来源 swap | 改 |
| `packages/canvas2d/src/render/Canvas2DRenderer.ts` | 两处 `cellPainter.paint` threading | 改 |

---

### Task 1: 类型 — ValueFormat / CellFormatter / FormatContext / 挂载点

**Files:**
- Modify: `packages/core/src/kernel/protocol/FormatTypes.ts`
- Modify: `packages/core/src/kernel/data/Schema.ts`

- [ ] **Step 1: 在 FormatTypes.ts 顶部加 import + 类型**

在 `import type { CellRange } from '../coords/SelectionTypes'` 下加：

```ts
import type { CellValue, Field } from '../data/Schema'

/** 值格式化描述符（可序列化）。`custom` 指向 GridOptions.formatters 注册表。 */
export type ValueFormat =
  | { readonly kind: 'number'; readonly decimals?: number; readonly thousands?: boolean }
  | { readonly kind: 'currency'; readonly currency: string; readonly decimals?: number; readonly locale?: string }
  | { readonly kind: 'percent'; readonly decimals?: number }
  | { readonly kind: 'date'; readonly pattern: string }
  | { readonly kind: 'custom'; readonly formatterId: string }

/** 自定义 formatter 上下文（纯、同步、无 DOM）。 */
export interface FormatContext {
  readonly field: Field
  readonly locale: string
}

/** 集成方自定义 formatter：raw value → 显示文本。必须纯 + 同步 + 快 + 只返 string。 */
export type CellFormatter = (value: CellValue, ctx: FormatContext) => string
```

- [ ] **Step 2: 给 CellFormat 加 valueFormat**

```ts
export interface CellFormat {
  readonly fillColor?: string
  readonly borders?: CellBorders
  readonly textWrap?: TextWrapMode
  readonly valueFormat?: ValueFormat
}
```

- [ ] **Step 3: 给 Field 加 format（列级默认）**

在 `packages/core/src/kernel/data/Schema.ts` 的 `Field` 接口（`wrap?: boolean` 附近）加：

```ts
  /** 列级默认值格式（Phase 5-C）；被 cell 级 CellFormat.valueFormat 覆盖。 */
  readonly format?: import('../protocol/FormatTypes').ValueFormat
```

> 用 inline `import('…')` 避免 Schema → FormatTypes 的循环 import（FormatTypes 已 import Schema 的 `Field`/`CellValue`）。

- [ ] **Step 4: typecheck 验证类型闭合**

Run: `bun run --filter @novasheet/core typecheck`
Expected: PASS（纯类型新增，无使用点，应通过）

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/kernel/protocol/FormatTypes.ts packages/core/src/kernel/data/Schema.ts
git commit -m "feat(core): 加 ValueFormat 类型与 CellFormat.valueFormat / Field.format 挂载点"
```

---

### Task 2: formatValue 纯解析函数 + 内置 descriptor + 注册表

**Files:**
- Create: `packages/core/src/kernel/protocol/formatValue.ts`
- Test: `packages/core/tests/kernel/protocol/formatValue.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'bun:test'
import { formatValue } from '../../../src/kernel/protocol/formatValue'
import type { Field } from '../../../src/kernel/data/Schema'
import type { CellFormatter, FormatContext } from '../../../src/kernel/protocol/FormatTypes'

const field: Field = { id: 'a', name: 'A', type: 'number', width: 100 }
const ctx: FormatContext = { field, locale: 'en-US' }
const noReg: Record<string, CellFormatter> = {}

describe('formatValue', () => {
  it('number: 千分位', () => {
    expect(formatValue(1234567, { kind: 'number' }, ctx, noReg)).toBe('1,234,567')
  })
  it('number: decimals + 无千分位', () => {
    expect(formatValue(1234.5, { kind: 'number', decimals: 2, thousands: false }, ctx, noReg)).toBe('1234.50')
  })
  it('currency: ¥ + descriptor locale 优先', () => {
    expect(formatValue(1234.5, { kind: 'currency', currency: 'CNY', locale: 'zh-CN' }, ctx, noReg)).toBe('¥1,234.50')
  })
  it('percent: 0.1357 → 13.57%', () => {
    expect(formatValue(0.1357, { kind: 'percent', decimals: 2 }, ctx, noReg)).toBe('13.57%')
  })
  it('date: token 替换', () => {
    const d = new Date(2024, 5, 9, 8, 5, 3) // 2024-06-09 08:05:03 本地
    expect(formatValue(d, { kind: 'date', pattern: 'YYYY-MM-DD HH:mm:ss' }, ctx, noReg)).toBe('2024-06-09 08:05:03')
  })
  it('类型不匹配 → undefined（painter 兜底）', () => {
    expect(formatValue('x', { kind: 'number' }, ctx, noReg)).toBeUndefined()
  })
  it('custom: 命中注册表', () => {
    const reg = { kb: (v) => `${v} KB` } satisfies Record<string, CellFormatter>
    expect(formatValue(12, { kind: 'custom', formatterId: 'kb' }, ctx, reg)).toBe('12 KB')
  })
  it('custom: 未注册 → undefined', () => {
    expect(formatValue(12, { kind: 'custom', formatterId: 'missing' }, ctx, noReg)).toBeUndefined()
  })
  it('custom: 抛错隔离 → undefined', () => {
    const reg = { boom: () => { throw new Error('x') } } satisfies Record<string, CellFormatter>
    expect(formatValue(12, { kind: 'custom', formatterId: 'boom' }, ctx, reg)).toBeUndefined()
  })
})
```

- [ ] **Step 2: 跑测试看失败**

Run: `bun test packages/core/tests/kernel/protocol/formatValue.test.ts`
Expected: FAIL（`formatValue` 不存在 / 模块未找到）

- [ ] **Step 3: 写实现**

`packages/core/src/kernel/protocol/formatValue.ts`：

```ts
import type { CellValue } from '../data/Schema'
import type { CellFormatter, FormatContext, ValueFormat } from './FormatTypes'

const warned = new Set<string>()
function warnOnce(msg: string): void {
  if (warned.has(msg)) return
  warned.add(msg)
  console.warn(`[novasheet] ${msg}`)
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** v1 固定 token 子集；未识别 token 原样保留。使用本地时间。 */
function formatDatePattern(d: Date, pattern: string): string {
  return pattern
    .replace(/YYYY/g, String(d.getFullYear()))
    .replace(/MM/g, pad(d.getMonth() + 1))
    .replace(/DD/g, pad(d.getDate()))
    .replace(/HH/g, pad(d.getHours()))
    .replace(/mm/g, pad(d.getMinutes()))
    .replace(/ss/g, pad(d.getSeconds()))
}

/**
 * raw value + ValueFormat → 显示文本。纯函数，跑在帧装配热路径。
 * 返回 `undefined` 表示"无法格式化"（类型不匹配 / custom 未注册或抛错）——
 * 调用方（frame formatCell / painter）据此回退到默认显示路径。
 */
export function formatValue(
  value: CellValue,
  format: ValueFormat,
  ctx: FormatContext,
  registry: Readonly<Record<string, CellFormatter>>,
): string | undefined {
  switch (format.kind) {
    case 'number':
      if (typeof value !== 'number') return undefined
      return new Intl.NumberFormat(ctx.locale, {
        useGrouping: format.thousands ?? true,
        minimumFractionDigits: format.decimals,
        maximumFractionDigits: format.decimals,
      }).format(value)
    case 'currency':
      if (typeof value !== 'number') return undefined
      return new Intl.NumberFormat(format.locale ?? ctx.locale, {
        style: 'currency',
        currency: format.currency,
        minimumFractionDigits: format.decimals,
        maximumFractionDigits: format.decimals,
      }).format(value)
    case 'percent':
      if (typeof value !== 'number') return undefined
      return new Intl.NumberFormat(ctx.locale, {
        style: 'percent',
        minimumFractionDigits: format.decimals ?? 0,
        maximumFractionDigits: format.decimals ?? 0,
      }).format(value)
    case 'date': {
      const d = value instanceof Date ? value : typeof value === 'number' ? new Date(value) : null
      if (!d || Number.isNaN(d.getTime())) return undefined
      return formatDatePattern(d, format.pattern)
    }
    case 'custom': {
      const fn = registry[format.formatterId]
      if (!fn) {
        warnOnce(`formatter '${format.formatterId}' 未注册`)
        return undefined
      }
      try {
        return fn(value, ctx)
      } catch (e) {
        warnOnce(`formatter '${format.formatterId}' 抛错: ${String(e)}`)
        return undefined
      }
    }
  }
}
```

- [ ] **Step 4: 跑测试看通过**

Run: `bun test packages/core/tests/kernel/protocol/formatValue.test.ts`
Expected: PASS（9 it 全绿）

- [ ] **Step 5: 从 index re-export（公开 API）**

在 `packages/core/src/index.ts` 加（找到 FormatTypes re-export 处附近）：

```ts
export { formatValue } from './kernel/protocol/formatValue'
export type { ValueFormat, CellFormatter, FormatContext } from './kernel/protocol/FormatTypes'
```

> 若 `ValueFormat` 等已随 FormatTypes 批量 re-export，则只加 `formatValue`。先 `grep -n "FormatTypes\|ValueFormat" packages/core/src/index.ts` 确认，避免重复导出（verbatimModuleSyntax 下重复会报错）。

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/kernel/protocol/formatValue.ts packages/core/tests/kernel/protocol/formatValue.test.ts packages/core/src/index.ts
git commit -m "feat(core): formatValue 纯解析（number/currency/percent/date + custom 注册表）"
```

---

### Task 3: RangeStyleStore.resolveCell 累积 valueFormat

**Files:**
- Modify: `packages/core/src/features/format/RangeStyleStore.ts`
- Test: `packages/core/tests/features/format/RangeStyleStore.test.ts`

- [ ] **Step 1: 写失败测试（追加到现有 describe）**

```ts
it('resolveCell 累积 valueFormat（last-wins）', () => {
  const store = new RangeStyleStore()
  const range = { startRow: 0, endRow: 0, startCol: 0, endCol: 0 }
  store.apply(range, { valueFormat: { kind: 'number' } })
  store.apply(range, { valueFormat: { kind: 'currency', currency: 'CNY' } })
  expect(store.resolveCell(0, 0)?.valueFormat).toEqual({ kind: 'currency', currency: 'CNY' })
})

it('valueFormat-only 单元格 resolveCell 不返回 undefined', () => {
  const store = new RangeStyleStore()
  store.apply({ startRow: 1, endRow: 1, startCol: 1, endCol: 1 }, { valueFormat: { kind: 'percent' } })
  expect(store.resolveCell(1, 1)?.valueFormat).toEqual({ kind: 'percent' })
  expect(store.resolveCell(0, 0)).toBeUndefined()
})
```

> import 若缺：`import { RangeStyleStore } from '../../../src/features/format/RangeStyleStore'`（按文件现有风格）。

- [ ] **Step 2: 跑测试看失败**

Run: `bun test packages/core/tests/features/format/RangeStyleStore.test.ts`
Expected: FAIL（`valueFormat` 为 undefined / cell 被判空返回 undefined）

- [ ] **Step 3: 改 resolveCell**

在 `resolveCell` 顶部累积变量区（`let textWrap` 附近）加：

```ts
    let valueFormat: CellFormat['valueFormat']
```

在累积循环 `else` 分支内（`if (layer.patch.textWrap !== undefined) textWrap = layer.patch.textWrap` 后）加：

```ts
        if (layer.patch.valueFormat !== undefined) valueFormat = layer.patch.valueFormat
```

把空判断那行：

```ts
    if (!fillActive && !hasBorders && textWrap === undefined) return undefined
```

改为：

```ts
    if (!fillActive && !hasBorders && textWrap === undefined && valueFormat === undefined) return undefined
```

并把结果对象（`const result: CellFormat = {`）补上 valueFormat 字段——参照该文件现有按需赋值风格（如 `...(textWrap !== undefined ? { textWrap } : {})`）加：

```ts
      ...(valueFormat !== undefined ? { valueFormat } : {}),
```

> 实现者先读 `resolveCell` 末尾 result 组装的真实写法，按同款条件展开补 `valueFormat`，保持风格一致。

- [ ] **Step 4: 跑测试看通过**

Run: `bun test packages/core/tests/features/format/RangeStyleStore.test.ts`
Expected: PASS（含新 2 it 与原有全绿）

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/features/format/RangeStyleStore.ts packages/core/tests/features/format/RangeStyleStore.test.ts
git commit -m "feat(core): RangeStyleStore.resolveCell 累积 valueFormat（last-wins）"
```

---

### Task 4: RenderFrame.formatCell 闭包 + FrameAssembler + engine 透传

**Files:**
- Modify: `packages/core/src/kernel/render/RenderFrame.ts`
- Modify: `packages/core/src/engine/FrameAssembler.ts`
- Modify: `packages/core/src/engine/GridEngine.ts`
- Modify: `packages/core/src/engine/DefaultGridEngine.ts`
- Test: `packages/core/tests/engine/FrameAssembler.test.ts`

- [ ] **Step 1: RenderFrame 加 formatCell 字段**

在 `RenderFrame` 接口加（import `CellValue`、`Field` from '../data/Schema'）：

```ts
  /**
   * Phase 5-C — 值格式化解析器闭包。返回 `undefined` 表示该格无显式 valueFormat，
   * painter 应回退默认显示路径。引擎构帧时闭合 cell 级 valueFormat + 列默认 + 注册表 + locale。
   */
  formatCell?: (rowIndex: number, colIndex: number, field: Field, value: CellValue) => string | undefined
```

- [ ] **Step 2: GridEngineOptions 加 formatters/locale**

`packages/core/src/engine/GridEngine.ts` 的 `GridEngineOptions` 加（import `CellFormatter` from '../kernel/protocol/FormatTypes'）：

```ts
  /** Phase 5-C — 自定义 formatter 命名注册表（custom kind 查此表）。 */
  formatters?: Readonly<Record<string, import('../kernel/protocol/FormatTypes').CellFormatter>>
  /** Phase 5-C — formatter locale；默认 'en-US'。 */
  locale?: string
```

- [ ] **Step 3: 写失败测试（FrameAssembler 闭包）**

在 `packages/core/tests/engine/FrameAssembler.test.ts`（无则新建，参照同目录现有 engine 测的 import 风格）：

```ts
import { describe, expect, it } from 'bun:test'
import { buildFormatCell } from '../../src/engine/FrameAssembler'
import type { ResolvedCellFormat } from '../../src/kernel/protocol/FormatTypes'
import type { Field } from '../../src/kernel/data/Schema'

const numField: Field = { id: 'a', name: 'A', type: 'number', width: 100 }

describe('buildFormatCell', () => {
  it('cell 级 valueFormat 覆盖列默认', () => {
    const cellFormats: ResolvedCellFormat[] = [
      { rowIndex: 0, colIndex: 0, format: { valueFormat: { kind: 'currency', currency: 'CNY' } } },
    ]
    const field: Field = { ...numField, format: { kind: 'number' } }
    const fc = buildFormatCell(cellFormats, {}, 'en-US')
    expect(fc(0, 0, field, 1234.5)).toBe('¥1,234.50')    // cell 级 currency 胜；货币符号不加国家缩写
    expect(fc(1, 0, field, 1234)).toBe('1,234')          // 无 cell 级 → 列默认 number
  })
  it('无任何 format → undefined', () => {
    const fc = buildFormatCell([], {}, 'en-US')
    expect(fc(0, 0, numField, 5)).toBeUndefined()
  })
})
```

- [ ] **Step 4: 跑测试看失败**

Run: `bun test packages/core/tests/engine/FrameAssembler.test.ts`
Expected: FAIL（`buildFormatCell` 未导出）

- [ ] **Step 5: 实现 buildFormatCell 并接入 assembleFrame**

在 `packages/core/src/engine/FrameAssembler.ts` 顶部加 import：

```ts
import type { CellValue, Field } from '../kernel/data/Schema'
import type { CellFormatter, ResolvedCellFormat, ValueFormat } from '../kernel/protocol/FormatTypes'
import { formatValue } from '../kernel/protocol/formatValue'
```

加导出函数：

```ts
/**
 * 构 RenderFrame.formatCell 闭包。闭合可见区已解析的 cell 级 valueFormat（VIEW 坐标）
 * + 列默认（field.format）+ 注册表 + locale。无显式 format 的格返回 undefined。
 */
export function buildFormatCell(
  cellFormats: readonly ResolvedCellFormat[],
  formatters: Readonly<Record<string, CellFormatter>>,
  locale: string,
): (rowIndex: number, colIndex: number, field: Field, value: CellValue) => string | undefined {
  const cellMap = new Map<string, ValueFormat>()
  for (const cf of cellFormats) {
    if (cf.format.valueFormat) cellMap.set(`${cf.rowIndex}:${cf.colIndex}`, cf.format.valueFormat)
  }
  return (rowIndex, colIndex, field, value) => {
    const format = cellMap.get(`${rowIndex}:${colIndex}`) ?? field.format
    if (!format) return undefined
    return formatValue(value, format, { field, locale }, formatters)
  }
}
```

在 `assembleFrame` 的 `FrameAssemblerInput` 类型加字段：

```ts
  formatters: Readonly<Record<string, CellFormatter>>
  locale: string
```

在 `cellFormats` 计算后、`return {` 前加：

```ts
  const formatCell = buildFormatCell(cellFormats, input.formatters, input.locale)
```

并在返回对象加 `formatCell,`。

- [ ] **Step 6: DefaultGridEngine 存 formatters/locale 并传入**

`packages/core/src/engine/DefaultGridEngine.ts`：构造函数（`constructor(options: GridEngineOptions)`）内存字段：

```ts
  private readonly formatters: Readonly<Record<string, CellFormatter>>
  private readonly locale: string
```

构造体内：

```ts
    this.formatters = options.formatters ?? {}
    this.locale = options.locale ?? 'en-US'
```

（import `CellFormatter` from '../kernel/protocol/FormatTypes'）

在调用 `assembleFrame({ … })`（getFrame 内）的 input 对象补：

```ts
      formatters: this.formatters,
      locale: this.locale,
```

- [ ] **Step 7: 跑测试 + typecheck**

Run: `bun test packages/core/tests/engine/FrameAssembler.test.ts && bun run --filter @novasheet/core typecheck`
Expected: PASS（2 it 绿；typecheck 通过）

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/kernel/render/RenderFrame.ts packages/core/src/engine/FrameAssembler.ts packages/core/src/engine/GridEngine.ts packages/core/src/engine/DefaultGridEngine.ts packages/core/tests/engine/FrameAssembler.test.ts
git commit -m "feat(core): RenderFrame.formatCell 闭包 + engine 透传 formatters/locale"
```

---

### Task 5: CellPainter 文本来源 swap + 渲染器 threading

**Files:**
- Modify: `packages/canvas2d/src/painters/CellPainter.ts`
- Modify: `packages/canvas2d/src/render/Canvas2DRenderer.ts`
- Test: `packages/canvas2d/tests/painters/CellPainter.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'bun:test'
import { CellPainter } from '../../src/painters/CellPainter'
import { RecordingContext2D } from '../helpers/recording-context'
import { denseGridTheme } from '@novasheet/core'
import type { Field } from '@novasheet/core'

const field: Field = { id: 'a', name: 'A', type: 'number', width: 100 }
const rect = { x: 0, y: 0, width: 100, height: 24 }

describe('CellPainter formatCell', () => {
  it('formatCell 命中时画格式化文本', () => {
    const ctx = new RecordingContext2D()
    const painter = new CellPainter(denseGridTheme)
    painter.paint(ctx as unknown as CanvasRenderingContext2D, {
      value: 1234.5, rect, field, rowIndex: 0, colIndex: 0,
      formatCell: () => '¥1,234.50',
    })
    const texts = ctx.calls.filter((c) => c.op === 'fillText').map((c) => c.args[0])
    expect(texts).toContain('¥1,234.50')
  })
  it('formatCell 返回 undefined 时退回默认（number 千分位）', () => {
    const ctx = new RecordingContext2D()
    const painter = new CellPainter(denseGridTheme)
    painter.paint(ctx as unknown as CanvasRenderingContext2D, {
      value: 1234, rect, field, rowIndex: 0, colIndex: 0,
      formatCell: () => undefined,
    })
    const texts = ctx.calls.filter((c) => c.op === 'fillText').map((c) => c.args[0])
    expect(texts).toContain('1,234')
  })
})
```

> RecordingContext 的 `.calls`/`.op`/`.args` 字段名以 `packages/canvas2d/tests/helpers/recording-context.ts` 实际为准，实现者先读该文件对齐断言写法。

- [ ] **Step 2: 跑测试看失败**

Run: `bun test packages/canvas2d/tests/painters/CellPainter.test.ts`
Expected: FAIL（`CellPaintParams` 无 `rowIndex`/`colIndex`/`formatCell`，类型错或文本不含 `¥1,234.50`）

- [ ] **Step 3: 扩 CellPaintParams**

`CellPainter.ts` 的 `CellPaintParams` 接口加：

```ts
  /** view 坐标，供 formatCell 查 cell 级 valueFormat。 */
  rowIndex?: number
  colIndex?: number
  /** Phase 5-C — frame 的值格式化解析器；返回 undefined 时回退默认显示。 */
  formatCell?: (rowIndex: number, colIndex: number, field: Field, value: CellValue) => string | undefined
```

- [ ] **Step 4: 在 paint() 解析格式化文本并下传**

在 `paint()` 内、`null/undefined` 短路之后、分支绘制之前，计算：

```ts
    const formatted =
      params.rowIndex !== undefined && params.colIndex !== undefined
        ? params.formatCell?.(params.rowIndex, params.colIndex, field, value)
        : undefined
```

把分支改为优先用 `formatted`：
- `paintNumber` 路径：若 `formatted !== undefined`，走文本绘制（右对齐）画 `formatted`；否则维持现有 `this.paintNumber(ctx, value, rect)`。最小改法——给 `paintNumber` 加可选预格式化串参数：

```ts
    if (field.type === 'number' && typeof value === 'number') {
      this.paintNumber(ctx, value, rect, formatted)
    } else if (mode === 'wrap' && field.type !== 'number' && this.measurer) {
      this.paintWrapped(ctx, formatted ?? this.toDisplayString(value), rect)
    } else if (field.type === 'text' && typeof value === 'string') {
      this.paintLines(ctx, formatted ?? value, rect)
    } else {
      this.paintFallback(ctx, value, rect, field, formatted)
    }
```

`paintNumber(ctx, value, rect, preformatted?: string)`：把内部生成显示串的那行改为 `const text = preformatted ?? <现有 toLocaleString 串>`，其余右对齐/截断逻辑不变。
`paintFallback(ctx, value, rect, field, preformatted?: string)`：把 `this.toDisplayString(value)` 改为 `preformatted ?? this.toDisplayString(value)`。

> 实现者读 `paintNumber`/`paintFallback` 现有实现，仅替换"显示串来源"一行，不动对齐/截断/clip。

- [ ] **Step 5: 跑测试看通过**

Run: `bun test packages/canvas2d/tests/painters/CellPainter.test.ts`
Expected: PASS（2 新 it 绿 + 原有 CellPainter 测全绿）

- [ ] **Step 6: 渲染器 threading（两处 cellPainter.paint）**

`Canvas2DRenderer.ts`：两处 `this.cellPainter.paint(this.ctx, { … })`（约 L665 merge anchor、L742 主网格循环）的 params 各加：

```ts
        rowIndex: <该处的 view 行索引>,
        colIndex: <该处的 view 列索引>,
        formatCell: frame.formatCell,
```

- L665 区（merge anchor 循环）：用该处的 `ar` / `ac`。
- L742 区（主网格循环）：用该循环的 view 行/列索引变量（实现者读循环上下文确认变量名，通常即遍历 `rowRange`/`colRange` 的 `r`/`c`）。

> `frame` 在 paint 路径可达（renderer 持当前帧）；若该方法签名未透传 `frame.formatCell`，沿现有 `frame` 取用即可。

- [ ] **Step 7: 跑 canvas2d 全量 + 集成回归**

Run: `bun test packages/canvas2d`
Expected: PASS（无回归；未格式化格行为不变）

- [ ] **Step 8: Commit**

```bash
git add packages/canvas2d/src/painters/CellPainter.ts packages/canvas2d/src/render/Canvas2DRenderer.ts packages/canvas2d/tests/painters/CellPainter.test.ts
git commit -m "feat(canvas2d): CellPainter 经 frame.formatCell 取显示文本，未命中回退默认"
```

---

### Task 6: setValueFormat 写入门面全链 + GridOptions 透传 + undo

**Files:**
- Modify: `packages/core/src/features/format/FormatController.ts`
- Modify: `packages/core/src/engine/DefaultGridEngine.ts`
- Modify: `packages/core/src/dom/runtime/GridRuntime.ts`
- Modify: `packages/core/src/dom/runtime/GridControllerImpl.ts`
- Modify: `packages/core/src/dom/runtime/GridController.ts`
- Modify: `packages/core/src/Grid.ts`
- Test: `packages/core/tests/features/format/FormatController.test.ts`

- [ ] **Step 1: 写失败测试（mirror setTextWrap 测式样）**

在 `FormatController.test.ts` 追加（参照文件现有 `setTextWrap` 测的 ctx/store 搭建）：

```ts
it('setValueFormat 写入 valueFormat 并入栈 undo', () => {
  // 复用本文件现有 makeController/ctx helper（与 setTextWrap 测同款）
  const { controller, formatState, pushed } = makeController()
  const range = { startRow: 0, endRow: 0, startCol: 0, endCol: 0 }
  const ok = controller.setValueFormat(range, { kind: 'percent' })
  expect(ok).toBe(true)
  expect(formatState.formatStore.resolveCell(0, 0)?.valueFormat).toEqual({ kind: 'percent' })
  expect(pushed.length).toBe(1)
})

it('setValueFormat: view→raw 非连续 → false 不入栈', () => {
  const { controller, pushed } = makeController({ translateRange: () => null })
  expect(controller.setValueFormat({ startRow: 0, endRow: 0, startCol: 0, endCol: 0 }, { kind: 'number' })).toBe(false)
  expect(pushed.length).toBe(0)
})
```

> 若文件无 `makeController` helper，按现有 `setTextWrap`/`setFillColor` 测里搭 `FormatController` 的真实写法照抄一份，仅把动作换成 `setValueFormat`。

- [ ] **Step 2: 跑测试看失败**

Run: `bun test packages/core/tests/features/format/FormatController.test.ts`
Expected: FAIL（`setValueFormat` 不存在）

- [ ] **Step 3: FormatController.setValueFormat（mirror setTextWrap）**

在 `FormatController` 加（import `ValueFormat` from '../../kernel/protocol/FormatTypes'）：

```ts
  /** 设置 view `range` 值格式（Phase 5-C）。复用 5-A 写入/undo 路径。 */
  setValueFormat(range: CellRange, valueFormat: ValueFormat): boolean {
    const rawRange = this.ctx.translateRange(range)
    if (!rawRange) return false
    const selectionBefore = this.ctx.getSelection()
    const before = this.formatState.formatStore.snapshot()
    this.formatState.formatStore.apply(rawRange, { valueFormat })
    return this.commitFormatChange(before, selectionBefore)
  }
```

- [ ] **Step 4: 逐层转发（mirror setTextWrap 每一处）**

每个文件找到 `setTextWrap` 那行，紧邻加 `setValueFormat`：

`DefaultGridEngine.ts`（约 L854 `setTextWrap` 处）：
```ts
  setValueFormat(range: CellRange, valueFormat: ValueFormat): boolean {
    return this.formatController.setValueFormat(range, valueFormat)
  }
```
（import `ValueFormat`；若 engine 有 GridEngine 接口声明，同步加签名）

`GridRuntime.ts`（约 L674 `setTextWrap` 处，mirror 其 invalidate 写法）：
```ts
  setValueFormat(range: CellRange, valueFormat: ValueFormat): boolean {
    const changed = this.engine.setValueFormat(range, valueFormat)
    // …复制 setTextWrap 紧随其后的 invalidate/refresh 行（保持一致）
    return changed
  }
```

`GridController.ts`（接口，L129 `setTextWrap` 处）：
```ts
  setValueFormat(range: CellRange, valueFormat: ValueFormat): boolean
```

`GridControllerImpl.ts`（L501 处）：
```ts
  setValueFormat(range: CellRange, valueFormat: ValueFormat): boolean {
    return this.runtime.setValueFormat(range, valueFormat)
  }
```

`Grid.ts`（L336 `setTextWrap` 处）：
```ts
  /** 设置 view range 值格式（Phase 5-C）。 */
  setValueFormat(range: CellRange, valueFormat: ValueFormat): boolean {
    return this.delegate.setValueFormat(range, valueFormat)
  }
```
（各文件按需 `import type { ValueFormat } from '…/FormatTypes'` 或从 `@novasheet/core` 公开类型）

- [ ] **Step 5: GridOptions 透传 formatters/locale 到 engine**

`Grid.ts` 构造里组装 `GridEngineOptions` 处（`theme: options.theme` 附近）加：

```ts
      formatters: options.formatters,
      locale: options.locale,
```

`GridOptions extends GridEngineOptions`，故 `formatters?`/`locale?` 已随 Task 4 的 `GridEngineOptions` 继承，无需在 `GridOptions` 重复声明。确认 `grep -n "formatters\|locale" packages/core/src/Grid.ts`。

- [ ] **Step 6: 跑 FormatController 测 + core typecheck**

Run: `bun test packages/core/tests/features/format/FormatController.test.ts && bun run --filter @novasheet/core typecheck`
Expected: PASS

- [ ] **Step 7: undo 回归（setValueFormat 后 undo 还原）**

确认现有 format undo 测覆盖通用 `CellFormat` 快照即可（valueFormat 是其一字段，自动纳入）。若想显式锁定，在 format undo 测追加一条 `setValueFormat → undo → resolveCell valueFormat undefined`。

Run: `bun test packages/core/tests/features/format`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/features/format/FormatController.ts packages/core/src/engine/DefaultGridEngine.ts packages/core/src/dom/runtime/GridRuntime.ts packages/core/src/dom/runtime/GridControllerImpl.ts packages/core/src/dom/runtime/GridController.ts packages/core/src/Grid.ts packages/core/tests/features/format/FormatController.test.ts
git commit -m "feat(core): Grid.setValueFormat 全链 + GridOptions 透传 formatters/locale"
```

---

### Task 7（可选，Phase 0 外环触点）: excel L3 场景 + manifest

**Files:**
- Create: `packages/react/tests/excel/scenarios/L3c-currency-display.md`
- Modify: `packages/react/tests/excel/scenarios.manifest.json`（经 mbd 生成，勿手改）
- Test: `packages/react/tests/excel/`（手写 `it('excel.L3c.currency-display …')`）

- [ ] **Step 1: 写场景 MD**

```markdown
---
id: excel.L3c.currency-display
layer: L3c
tags: [format, currency]
summary: currency 列在 NovaExcel 显示 ¥ 格式
status: draft
---

## User Story
作为表格用户，当某列是金额时，我希望单元格直接显示 ¥1,234.50 这样的货币格式，而底层数据仍是数字，方便我继续排序与计算。

## Given
- NovaExcel 挂载，某列设 `format: { kind:'currency', currency:'CNY' }`

## When
- 渲染完成

## Then
- 该列单元格显示文本含 `¥`（canvas 文本或可观测探针）
```

- [ ] **Step 2: 生成 manifest**

Run: `bun run sync:mbd-manifest`
Expected: `scenarios.manifest.json` 含 `excel.L3c.currency-display`

- [ ] **Step 3: 手写测试 + 覆盖率**

按 `titleConvention` 写 `it('excel.L3c.currency-display …')`（断言仅 excel 可观测面，依 Phase 0 边界，不断言引擎深层）。

Run: `bun run --filter @novasheet/react lint:scenario-coverage && bun test packages/react`
Expected: PASS（covered 含该 id）

- [ ] **Step 4: Commit**

```bash
git add packages/react/tests/excel/
git commit -m "test(react): excel L3c currency 显示场景 + manifest"
```

> 若 canvas 文本在 happy-dom 下不可观测，降级为「列配置 currency format 后 grid 可用 + 不报错」的浅断言，或标 `it.todo` 计入结构覆盖（依 mbd §7.3）。

---

### Task 8: 收尾 — 全量门禁 + code-reviewer

- [ ] **Step 1: 四门禁全绿**

Run:
```bash
bun run lint && bun run --filter '*' typecheck && bun test && bun run --filter @novasheet/core build && bun run --filter @novasheet/canvas2d build
```
Expected: 全 PASS（lint 0/0，typecheck 通过，test 全绿，build 成功）

- [ ] **Step 2: dispatch code-reviewer subagent**

按 CLAUDE.md「不跳过 self-review」+ 里程碑收尾要求，dispatch 一个 code-reviewer 复审本分支 diff：重点查 raw 不变性（排序/编辑仍用 raw）、formatCell 未命中回退是否零回归、跨域 ctx（FrameAssembler/painter 坐标空间一致）。

- [ ] **Step 3: 按反馈修正后最终 commit**

---

## Self-Review

**Spec coverage:**
- §4 数据模型 → Task 1 ✅
- §5 解析 formatValue → Task 2 ✅
- §6 frame 集成（formatCell 闭包 + painter swap）→ Task 4 + 5 ✅
- §7 写入门面 setValueFormat + undo → Task 6 ✅
- §8 raw 不变性 → 设计层保证（painter 仅改文本；排序/编辑/导出未触）+ Task 8 reviewer 校验 ✅
- §9 测试分层 → 每 Task TDD + Task 7 可选外环 ✅
- §10 API 变更 additive → Task 1/4/6 ✅
- cell 级累积（resolveCell valueFormat）→ Task 3 ✅（spec §4.2 复用 5-A 的落地点）

**Placeholder scan:** 无 TBD/TODO；"实现者读现有写法对齐"处均给了精确锚点（行号/方法名）与改动范围，非空泛占位。

**Type consistency:**
- `formatCell` 签名 `(rowIndex, colIndex, field, value) => string | undefined` 在 RenderFrame（T4）、CellPaintParams（T5）、buildFormatCell（T4）一致。
- `setValueFormat(range, valueFormat)` 在 FormatController / engine / runtime / controller / Grid 五层签名一致。
- `formatValue(value, format, ctx, registry)` 在 T2 定义、T4 调用一致。
- `ValueFormat` 字段（kind union）T1 定义，T2/T4 消费一致。

精化记录：spec §6.1 闭包示意签名 `(rowIndex, fieldId, value)` → plan 落地 `(rowIndex, colIndex, field, value) => string | undefined`（已在 plan 头「与 spec 的一处精化」标注，理由：painter 已持 field、cell 覆盖按坐标查、undefined 兜底零回归）。
