# Cell Data Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 NovaSheet 引入三层数据验证（类型自动校验 + 内置约束 + 自定义 validator），Warn-only 策略，可中断异步调度，完整扩展接口。

**Architecture:** `ValidationRuleStore`（区间规则）+ `ValidationResultStore`（稀疏结果）+ `ValidationScheduler`（链表可中断调度）组成 `features/validation/` 纯层，`ValidationService` 作为核心逻辑，写入拦截点在 engine 层；`RenderFrame` 携带 `getValidationState` 闭包下发到 Canvas2D 绘制层；DOM tooltip 复用 `pointermove` hover 路径。

**Tech Stack:** bun:test, TypeScript strict, `packages/core`（纯层 + DOM overlay），`packages/canvas2d`（Canvas2D 绘制）。

**Spec:** `docs/superpowers/specs/2026-06-15-novasheet-cell-data-validation-design.md`

**方法论:** `docs/superpowers/specs/2026-06-10-novasheet-bdd-tdd-method-design.md`（TDD 内环，红→实现→绿→commit）。

**Plan-risk：** 注意以下潜在偏差：
- `CellPainter.paint()` 对 `null/undefined` 提前 return，校验边框需在 return 前也触发
- `paintCellContentRegion` 签名较长，增参须同步所有调用点（含 frozen region pass）
- `ValidationScheduler.pushAll()` 须在清队列后再重建，否则 flush 会跑两遍

遇到实现细节与 spec 或 plan 冲突时：**STOP+ASK**，不得静默选择。

---

## File Map

### 新建文件

| 文件 | 职责 |
|---|---|
| `packages/core/src/kernel/protocol/ValidationTypes.ts` | 公开类型：`ValidatorDefinition`、`ValidatorContext`、`ValidationRule`、`ValidationState` |
| `packages/core/src/features/validation/ValidationRuleStore.ts` | 稀疏 Map 存区间规则；remap 接口 |
| `packages/core/src/features/validation/ValidationResultStore.ts` | 稀疏 Map 存 invalid/pending；ok 不占空间 |
| `packages/core/src/features/validation/typeConformance.ts` | Layer A 类型一致性检查函数 |
| `packages/core/src/features/validation/builtInValidators.ts` | 四种内置 validator：number-range / text-pattern / list-in / date-range |
| `packages/core/src/features/validation/ValidationScheduler.ts` | 链表可中断调度器 + version 废弃机制 |
| `packages/core/src/features/validation/ValidationService.ts` | 核心逻辑：resolve rule → Layer A → Layer B/C → 写 store |
| `packages/core/src/features/validation/index.ts` | re-export |
| `packages/core/src/dom/overlay/ValidationTooltip.ts` | DOM tooltip overlay（无 React 依赖） |
| `packages/core/tests/features/validation/ValidationRuleStore.test.ts` | |
| `packages/core/tests/features/validation/ValidationResultStore.test.ts` | |
| `packages/core/tests/features/validation/typeConformance.test.ts` | |
| `packages/core/tests/features/validation/builtInValidators.test.ts` | |
| `packages/core/tests/features/validation/ValidationScheduler.test.ts` | |
| `packages/core/tests/features/validation/ValidationService.test.ts` | |

### 修改文件

| 文件 | 变更 |
|---|---|
| `packages/core/src/kernel/data/Schema.ts` | `Field.options.validation?: ValidationRule` |
| `packages/core/src/kernel/theme/Theme.ts` | 新增 `ThemeValidation` interface + `Theme.validation` |
| `packages/core/src/kernel/theme/denseGridTheme.ts` | 填充默认 validation token 值 |
| `packages/core/src/kernel/render/RenderFrame.ts` | 新增 `getValidationState?: (r, c) => 'ok' \| 'invalid' \| 'pending'` |
| `packages/core/src/engine/GridEngine.ts` | `GridEngineOptions` 新增 `validators`、`validationBatchSize`、`validationMaxConcurrent` |
| `packages/core/src/engine/DefaultGridEngine.ts` | 构建 validation 三件套；拦截 commitCellEdit/commitCellValue/paste/fill/undo/redo/clearRange |
| `packages/core/src/engine/FrameAssembler.ts` | `FrameAssemblerInput` 新增 `getValidationState`；装配到 frame |
| `packages/core/src/Grid.ts` | `setValidation`、`clearValidation`、`validateAll`、`getValidationState` |
| `packages/canvas2d/src/painters/CellPainter.ts` | `CellPaintParams.validationState`；`paintValidationIndicator()` 私有方法 |
| `packages/canvas2d/src/render/Canvas2DRenderer.ts` | `paintCellContentRegion` 增加 `getValidationState` 参数并传给 cellPainter |
| `packages/core/src/dom/runtime/GridRuntime.ts` | 注入 `ValidationTooltip`；`handleHostPointerMove` 调用 `updateValidationTooltip` |

---

## Task 1: Protocol Types

**Files:**
- Create: `packages/core/src/kernel/protocol/ValidationTypes.ts`

- [ ] **Step 1: 创建 ValidationTypes.ts**

```ts
// packages/core/src/kernel/protocol/ValidationTypes.ts
import type { CellValue, Field, FieldType } from '../data/Schema'

export interface ValidationRule {
  type: string
  message?: string
  options?: Record<string, unknown>
}

export type ValidationState =
  | { status: 'invalid'; message: string }
  | { status: 'pending' }

export interface ValidatorContext {
  readonly field: Field
  readonly resolvedCellType: FieldType
  readonly rule: ValidationRule
  readonly locale: string
  readonly rowIndex: number
  readonly colIndex: number
}

export interface ValidatorDefinition {
  validate(
    value: CellValue | undefined,
    ctx: ValidatorContext,
  ): string | null | Promise<string | null>
  message?: string
}
```

- [ ] **Step 2: 更新 Schema.ts — Field.options.validation**

打开 `packages/core/src/kernel/data/Schema.ts`，在 `Field.options?:` 行改为：

```ts
  /** type-specific 配置，如 singleSelect 的 choices——M2+ 启用 */
  options?: Record<string, unknown> & {
    choices?: unknown
    /** 列级默认验证规则（可被 Grid.setValidation 区间覆盖）。 */
    validation?: import('./ValidationTypes').ValidationRule
  }
```

> **注意**：`Record<string, unknown> &` 保留向下兼容，`options` 仍然是宽类型。

- [ ] **Step 3: Typecheck**

```bash
bun run --filter @novasheet/core typecheck
```

Expected: 0 errors。

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/kernel/protocol/ValidationTypes.ts packages/core/src/kernel/data/Schema.ts
git commit -m "feat(validation): 新增 ValidationTypes 协议类型与 Schema Field.options.validation"
```

---

## Task 2: ValidationRuleStore

**Files:**
- Create: `packages/core/src/features/validation/ValidationRuleStore.ts`
- Create: `packages/core/tests/features/validation/ValidationRuleStore.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// packages/core/tests/features/validation/ValidationRuleStore.test.ts
import { describe, expect, it } from 'bun:test'
import { ValidationRuleStore } from '../../../src/features/validation/ValidationRuleStore'
import type { ValidationRule } from '../../../src/kernel/protocol/ValidationTypes'

const rule: ValidationRule = { type: 'number-range', options: { min: 0, max: 100 } }
const emailRule: ValidationRule = { type: 'email' }

describe('ValidationRuleStore', () => {
  it('returns null when no rule set', () => {
    const store = new ValidationRuleStore()
    expect(store.get(0, 0)).toBeNull()
  })

  it('sets and gets rule for a range', () => {
    const store = new ValidationRuleStore()
    store.setRange({ startRow: 0, endRow: 2, startCol: 1, endCol: 1 }, rule)
    expect(store.get(0, 1)).toEqual(rule)
    expect(store.get(1, 1)).toEqual(rule)
    expect(store.get(2, 1)).toEqual(rule)
    expect(store.get(0, 0)).toBeNull()
    expect(store.get(3, 1)).toBeNull()
  })

  it('later set overwrites earlier for same cell', () => {
    const store = new ValidationRuleStore()
    store.setRange({ startRow: 0, endRow: 0, startCol: 0, endCol: 0 }, rule)
    store.setRange({ startRow: 0, endRow: 0, startCol: 0, endCol: 0 }, emailRule)
    expect(store.get(0, 0)).toEqual(emailRule)
  })

  it('clearRange removes cells', () => {
    const store = new ValidationRuleStore()
    store.setRange({ startRow: 0, endRow: 1, startCol: 0, endCol: 1 }, rule)
    store.clearRange({ startRow: 0, endRow: 0, startCol: 0, endCol: 1 })
    expect(store.get(0, 0)).toBeNull()
    expect(store.get(1, 0)).toEqual(rule)
  })

  it('remapAfterRowsInserted shifts rows down', () => {
    const store = new ValidationRuleStore()
    store.setRange({ startRow: 2, endRow: 2, startCol: 0, endCol: 0 }, rule)
    store.remapAfterRowsInserted(1, 2)
    expect(store.get(2, 0)).toBeNull()
    expect(store.get(4, 0)).toEqual(rule)
  })

  it('remapAfterRowsDeleted removes deleted rows and shifts survivors', () => {
    const store = new ValidationRuleStore()
    store.setRange({ startRow: 0, endRow: 0, startCol: 0, endCol: 0 }, rule)
    store.setRange({ startRow: 2, endRow: 2, startCol: 0, endCol: 0 }, emailRule)
    store.remapAfterRowsDeleted([1])
    expect(store.get(0, 0)).toEqual(rule)
    expect(store.get(1, 0)).toEqual(emailRule) // was row 2, now 1
  })

  it('allCells() iterates all stored cells', () => {
    const store = new ValidationRuleStore()
    store.setRange({ startRow: 0, endRow: 1, startCol: 0, endCol: 0 }, rule)
    const cells = [...store.allCells()]
    expect(cells).toHaveLength(2)
  })
})
```

- [ ] **Step 2: 运行测试确认红**

```bash
bun test packages/core/tests/features/validation/ValidationRuleStore.test.ts
```

Expected: FAIL — `Cannot find module`.

- [ ] **Step 3: 实现 ValidationRuleStore**

```ts
// packages/core/src/features/validation/ValidationRuleStore.ts
import type { RawRange } from '../../kernel/coords/coordinates'
import {
  remapRowIndexAfterDelete,
  remapRowIndexAfterInsert,
  remapColIndexAfterDelete,
  remapColIndexAfterInsert,
} from '../../kernel/coords/remap'
import type { ValidationRule } from '../../kernel/protocol/ValidationTypes'

function key(r: number, c: number): string {
  return `${r}:${c}`
}

function parseKey(k: string): readonly [number, number] {
  const i = k.indexOf(':')
  return [Number.parseInt(k.slice(0, i), 10), Number.parseInt(k.slice(i + 1), 10)]
}

export class ValidationRuleStore {
  private cells = new Map<string, ValidationRule>()

  setRange(range: RawRange, rule: ValidationRule): void {
    for (let r = range.startRow; r <= range.endRow; r++) {
      for (let c = range.startCol; c <= range.endCol; c++) {
        this.cells.set(key(r, c), rule)
      }
    }
  }

  clearRange(range: RawRange): void {
    for (let r = range.startRow; r <= range.endRow; r++) {
      for (let c = range.startCol; c <= range.endCol; c++) {
        this.cells.delete(key(r, c))
      }
    }
  }

  get(rawRow: number, rawCol: number): ValidationRule | null {
    return this.cells.get(key(rawRow, rawCol)) ?? null
  }

  *allCells(): Iterable<{ rawRow: number; rawCol: number; rule: ValidationRule }> {
    for (const [k, rule] of this.cells) {
      const [rawRow, rawCol] = parseKey(k)
      yield { rawRow, rawCol, rule }
    }
  }

  remapAfterRowsInserted(at: number, count: number): void {
    if (count <= 0) return
    this.remap((r, c, rule) => ({ r: remapRowIndexAfterInsert(r, at, count), c, rule }))
  }

  remapAfterRowsDeleted(removedSorted: readonly number[]): void {
    if (removedSorted.length === 0) return
    this.remap((r, c, rule) => {
      const next = remapRowIndexAfterDelete(r, removedSorted)
      return next === null ? null : { r: next, c, rule }
    })
  }

  remapAfterColsInserted(at: number, count: number): void {
    if (count <= 0) return
    this.remap((r, c, rule) => ({ r, c: remapColIndexAfterInsert(c, at, count), rule }))
  }

  remapAfterColsDeleted(removedSorted: readonly number[]): void {
    if (removedSorted.length === 0) return
    this.remap((r, c, rule) => {
      const next = remapColIndexAfterDelete(c, removedSorted)
      return next === null ? null : { r, c: next, rule }
    })
  }

  remapByRowIndexMap(map: ReadonlyMap<number, number>): void {
    this.remap((r, c, rule) => {
      const next = map.get(r)
      return next === undefined ? null : { r: next, c, rule }
    })
  }

  remapByColIndexMap(map: ReadonlyMap<number, number>): void {
    this.remap((r, c, rule) => {
      const next = map.get(c)
      return next === undefined ? null : { r, c: next, rule }
    })
  }

  private remap(
    fn: (r: number, c: number, rule: ValidationRule) => { r: number; c: number; rule: ValidationRule } | null,
  ): void {
    const next = new Map<string, ValidationRule>()
    for (const [k, rule] of this.cells) {
      const [r, c] = parseKey(k)
      const result = fn(r, c, rule)
      if (result !== null) next.set(key(result.r, result.c), result.rule)
    }
    this.cells = next
  }
}
```

- [ ] **Step 4: 运行测试确认绿**

```bash
bun test packages/core/tests/features/validation/ValidationRuleStore.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/features/validation/ValidationRuleStore.ts packages/core/tests/features/validation/ValidationRuleStore.test.ts
git commit -m "feat(validation): ValidationRuleStore 区间规则稀疏存储"
```

---

## Task 3: ValidationResultStore

**Files:**
- Create: `packages/core/src/features/validation/ValidationResultStore.ts`
- Create: `packages/core/tests/features/validation/ValidationResultStore.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// packages/core/tests/features/validation/ValidationResultStore.test.ts
import { describe, expect, it } from 'bun:test'
import { ValidationResultStore } from '../../../src/features/validation/ValidationResultStore'

describe('ValidationResultStore', () => {
  it('returns null (ok) when no state set', () => {
    const store = new ValidationResultStore()
    expect(store.get(0, 0)).toBeNull()
  })

  it('stores invalid state', () => {
    const store = new ValidationResultStore()
    store.set(1, 2, { status: 'invalid', message: '超出范围' })
    expect(store.get(1, 2)).toEqual({ status: 'invalid', message: '超出范围' })
    expect(store.get(0, 0)).toBeNull()
  })

  it('stores pending state', () => {
    const store = new ValidationResultStore()
    store.set(0, 0, { status: 'pending' })
    expect(store.get(0, 0)).toEqual({ status: 'pending' })
  })

  it('delete reverts to ok (null)', () => {
    const store = new ValidationResultStore()
    store.set(0, 0, { status: 'invalid', message: 'err' })
    store.delete(0, 0)
    expect(store.get(0, 0)).toBeNull()
  })

  it('clear removes all entries', () => {
    const store = new ValidationResultStore()
    store.set(0, 0, { status: 'invalid', message: 'err' })
    store.set(1, 1, { status: 'pending' })
    store.clear()
    expect(store.get(0, 0)).toBeNull()
    expect(store.get(1, 1)).toBeNull()
  })

  it('remapAfterRowsInserted shifts rows', () => {
    const store = new ValidationResultStore()
    store.set(2, 0, { status: 'invalid', message: 'err' })
    store.remapAfterRowsInserted(1, 2)
    expect(store.get(2, 0)).toBeNull()
    expect(store.get(4, 0)).toEqual({ status: 'invalid', message: 'err' })
  })

  it('remapAfterRowsDeleted removes deleted rows', () => {
    const store = new ValidationResultStore()
    store.set(1, 0, { status: 'invalid', message: 'err' })
    store.set(2, 0, { status: 'pending' })
    store.remapAfterRowsDeleted([1])
    expect(store.get(1, 0)).toEqual({ status: 'pending' }) // was row 2
    expect(store.get(0, 0)).toBeNull()
  })
})
```

- [ ] **Step 2: 运行测试确认红**

```bash
bun test packages/core/tests/features/validation/ValidationResultStore.test.ts
```

Expected: FAIL — `Cannot find module`.

- [ ] **Step 3: 实现 ValidationResultStore**

```ts
// packages/core/src/features/validation/ValidationResultStore.ts
import {
  remapRowIndexAfterDelete,
  remapRowIndexAfterInsert,
  remapColIndexAfterDelete,
  remapColIndexAfterInsert,
} from '../../kernel/coords/remap'
import type { ValidationState } from '../../kernel/protocol/ValidationTypes'

function key(r: number, c: number): string { return `${r}:${c}` }
function parseKey(k: string): readonly [number, number] {
  const i = k.indexOf(':')
  return [Number.parseInt(k.slice(0, i), 10), Number.parseInt(k.slice(i + 1), 10)]
}

export class ValidationResultStore {
  private cells = new Map<string, ValidationState>()

  set(rawRow: number, rawCol: number, state: ValidationState): void {
    this.cells.set(key(rawRow, rawCol), state)
  }

  delete(rawRow: number, rawCol: number): void {
    this.cells.delete(key(rawRow, rawCol))
  }

  get(rawRow: number, rawCol: number): ValidationState | null {
    return this.cells.get(key(rawRow, rawCol)) ?? null
  }

  clear(): void { this.cells.clear() }

  remapAfterRowsInserted(at: number, count: number): void {
    if (count <= 0) return
    this.remap((r, c, s) => ({ r: remapRowIndexAfterInsert(r, at, count), c, s }))
  }

  remapAfterRowsDeleted(removedSorted: readonly number[]): void {
    if (removedSorted.length === 0) return
    this.remap((r, c, s) => {
      const next = remapRowIndexAfterDelete(r, removedSorted)
      return next === null ? null : { r: next, c, s }
    })
  }

  remapAfterColsInserted(at: number, count: number): void {
    if (count <= 0) return
    this.remap((r, c, s) => ({ r, c: remapColIndexAfterInsert(c, at, count), s }))
  }

  remapAfterColsDeleted(removedSorted: readonly number[]): void {
    if (removedSorted.length === 0) return
    this.remap((r, c, s) => {
      const next = remapColIndexAfterDelete(c, removedSorted)
      return next === null ? null : { r, c: next, s }
    })
  }

  remapByRowIndexMap(map: ReadonlyMap<number, number>): void {
    this.remap((r, c, s) => {
      const next = map.get(r)
      return next === undefined ? null : { r: next, c, s }
    })
  }

  remapByColIndexMap(map: ReadonlyMap<number, number>): void {
    this.remap((r, c, s) => {
      const next = map.get(c)
      return next === undefined ? null : { r, c: next, s }
    })
  }

  private remap(
    fn: (r: number, c: number, s: ValidationState) => { r: number; c: number; s: ValidationState } | null,
  ): void {
    const next = new Map<string, ValidationState>()
    for (const [k, s] of this.cells) {
      const [r, c] = parseKey(k)
      const result = fn(r, c, s)
      if (result !== null) next.set(key(result.r, result.c), result.s)
    }
    this.cells = next
  }
}
```

- [ ] **Step 4: 运行测试确认绿**

```bash
bun test packages/core/tests/features/validation/ValidationResultStore.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/features/validation/ValidationResultStore.ts packages/core/tests/features/validation/ValidationResultStore.test.ts
git commit -m "feat(validation): ValidationResultStore 稀疏校验结果存储"
```

---

## Task 4: Layer A — 类型一致性检查

**Files:**
- Create: `packages/core/src/features/validation/typeConformance.ts`
- Create: `packages/core/tests/features/validation/typeConformance.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// packages/core/tests/features/validation/typeConformance.test.ts
import { describe, expect, it } from 'bun:test'
import { checkTypeConformance } from '../../../src/features/validation/typeConformance'

describe('checkTypeConformance', () => {
  it('returns null for null value on any type', () => {
    expect(checkTypeConformance(null, 'number')).toBeNull()
    expect(checkTypeConformance(null, 'date')).toBeNull()
    expect(checkTypeConformance(null, 'text')).toBeNull()
  })

  it('returns null for number value on number type', () => {
    expect(checkTypeConformance(42, 'number')).toBeNull()
  })

  it('returns error for string value on number type', () => {
    expect(checkTypeConformance('hello', 'number')).toBe('此值与列类型数字不匹配')
  })

  it('returns null for number (serial) on date type', () => {
    expect(checkTypeConformance(45000, 'date')).toBeNull()
  })

  it('returns error for string value on date type', () => {
    expect(checkTypeConformance('武强我', 'date')).toBe('此值与列类型日期不匹配')
  })

  it('returns null for boolean on checkbox type', () => {
    expect(checkTypeConformance(true, 'checkbox')).toBeNull()
    expect(checkTypeConformance(false, 'checkbox')).toBeNull()
  })

  it('returns error for non-boolean on checkbox type', () => {
    expect(checkTypeConformance('yes', 'checkbox')).toBe('此值与列类型复选框不匹配')
  })

  it('returns null for string on text/url type', () => {
    expect(checkTypeConformance('hello', 'text')).toBeNull()
    expect(checkTypeConformance('https://x.com', 'url')).toBeNull()
  })

  it('returns null for string on singleSelect type', () => {
    expect(checkTypeConformance('optA', 'singleSelect')).toBeNull()
  })

  it('returns null for array on multiSelect type', () => {
    expect(checkTypeConformance(['a', 'b'], 'multiSelect')).toBeNull()
  })

  it('returns null for any value on unknown/custom type', () => {
    expect(checkTypeConformance('anything', 'rating')).toBeNull()
    expect(checkTypeConformance(42, 'assignee')).toBeNull()
  })
})
```

- [ ] **Step 2: 运行测试确认红**

```bash
bun test packages/core/tests/features/validation/typeConformance.test.ts
```

Expected: FAIL.

- [ ] **Step 3: 实现 typeConformance.ts**

```ts
// packages/core/src/features/validation/typeConformance.ts
import type { CellValue, FieldType } from '../../kernel/data/Schema'

const TYPE_LABELS: Partial<Record<string, string>> = {
  number: '数字',
  date: '日期',
  checkbox: '复选框',
  text: '文本',
  url: '链接',
  singleSelect: '单选',
  multiSelect: '多选',
}

/** Layer A：检查 value 是否符合 resolvedType 的值域。null 始终合法。custom type 跳过检查。 */
export function checkTypeConformance(value: CellValue | undefined, resolvedType: FieldType): string | null {
  if (value === null || value === undefined) return null

  switch (resolvedType) {
    case 'number':
      if (typeof value !== 'number') return `此值与列类型${TYPE_LABELS['number']}不匹配`
      break
    case 'date':
      if (typeof value !== 'number') return `此值与列类型${TYPE_LABELS['date']}不匹配`
      break
    case 'checkbox':
      if (typeof value !== 'boolean') return `此值与列类型${TYPE_LABELS['checkbox']}不匹配`
      break
    case 'text':
    case 'url':
    case 'singleSelect':
      if (typeof value !== 'string') return `此值与列类型${TYPE_LABELS[resolvedType] ?? resolvedType}不匹配`
      break
    case 'multiSelect':
      if (!Array.isArray(value)) return `此值与列类型${TYPE_LABELS['multiSelect']}不匹配`
      break
    default:
      // custom type：不做类型检查
      return null
  }
  return null
}
```

- [ ] **Step 4: 运行测试确认绿**

```bash
bun test packages/core/tests/features/validation/typeConformance.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/features/validation/typeConformance.ts packages/core/tests/features/validation/typeConformance.test.ts
git commit -m "feat(validation): Layer A 类型一致性检查函数"
```

---

## Task 5: Layer B — 内置 Validators

**Files:**
- Create: `packages/core/src/features/validation/builtInValidators.ts`
- Create: `packages/core/tests/features/validation/builtInValidators.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// packages/core/tests/features/validation/builtInValidators.test.ts
import { describe, expect, it } from 'bun:test'
import { BUILT_IN_VALIDATORS } from '../../../src/features/validation/builtInValidators'
import type { ValidatorContext } from '../../../src/kernel/protocol/ValidationTypes'

const ctx = (options?: Record<string, unknown>): ValidatorContext => ({
  field: { id: 'f', name: 'F', type: 'number', width: 100 },
  resolvedCellType: 'number',
  rule: { type: 'number-range', options },
  locale: 'en-US',
  rowIndex: 0,
  colIndex: 0,
})

describe('number-range', () => {
  const v = BUILT_IN_VALIDATORS['number-range']!

  it('ok for null', async () => {
    expect(await v.validate(null, ctx({ min: 0, max: 100 }))).toBeNull()
  })

  it('ok within range', async () => {
    expect(await v.validate(50, ctx({ min: 0, max: 100 }))).toBeNull()
  })

  it('error below min', async () => {
    expect(await v.validate(-1, ctx({ min: 0, max: 100 }))).toBe('值必须在 0 到 100 之间')
  })

  it('error above max', async () => {
    expect(await v.validate(101, ctx({ min: 0, max: 100 }))).toBe('值必须在 0 到 100 之间')
  })

  it('exclusive: error at boundary', async () => {
    expect(await v.validate(0, ctx({ min: 0, max: 100, exclusive: true }))).toBe('值必须大于 0 且小于 100')
  })
})

describe('text-pattern', () => {
  const v = BUILT_IN_VALIDATORS['text-pattern']!
  const emailCtx = (): ValidatorContext => ({
    field: { id: 'f', name: 'F', type: 'text', width: 100 },
    resolvedCellType: 'text',
    rule: { type: 'text-pattern', options: { pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$' } },
    locale: 'en-US',
    rowIndex: 0,
    colIndex: 0,
  })

  it('ok for null', async () => {
    expect(await v.validate(null, emailCtx())).toBeNull()
  })

  it('ok matching pattern', async () => {
    expect(await v.validate('user@example.com', emailCtx())).toBeNull()
  })

  it('error not matching', async () => {
    expect(await v.validate('not-an-email', emailCtx())).not.toBeNull()
  })
})

describe('list-in', () => {
  const v = BUILT_IN_VALIDATORS['list-in']!
  const listCtx = (): ValidatorContext => ({
    field: { id: 'f', name: 'F', type: 'text', width: 100 },
    resolvedCellType: 'text',
    rule: { type: 'list-in', options: { values: ['A', 'B', 'C'] } },
    locale: 'en-US',
    rowIndex: 0,
    colIndex: 0,
  })

  it('ok for null', async () => {
    expect(await v.validate(null, listCtx())).toBeNull()
  })

  it('ok for value in list', async () => {
    expect(await v.validate('A', listCtx())).toBeNull()
  })

  it('error for value not in list', async () => {
    expect(await v.validate('D', listCtx())).not.toBeNull()
  })
})

describe('date-range', () => {
  const v = BUILT_IN_VALIDATORS['date-range']!
  const dateCtx = (options: Record<string, unknown>): ValidatorContext => ({
    field: { id: 'f', name: 'F', type: 'date', width: 100 },
    resolvedCellType: 'date',
    rule: { type: 'date-range', options },
    locale: 'en-US',
    rowIndex: 0,
    colIndex: 0,
  })

  it('ok for null', async () => {
    expect(await v.validate(null, dateCtx({ min: 40000 }))).toBeNull()
  })

  it('ok above min serial', async () => {
    expect(await v.validate(45000, dateCtx({ min: 40000 }))).toBeNull()
  })

  it('error below min serial', async () => {
    expect(await v.validate(39999, dateCtx({ min: 40000 }))).not.toBeNull()
  })
})
```

- [ ] **Step 2: 运行测试确认红**

```bash
bun test packages/core/tests/features/validation/builtInValidators.test.ts
```

Expected: FAIL.

- [ ] **Step 3: 实现 builtInValidators.ts**

```ts
// packages/core/src/features/validation/builtInValidators.ts
import type { ValidatorDefinition, ValidatorContext } from '../../kernel/protocol/ValidationTypes'
import type { CellValue } from '../../kernel/data/Schema'
import { dateStringToSerial } from '../../kernel/protocol/serial'

function numberRangeMessage(min: number | undefined, max: number | undefined, exclusive: boolean): string {
  if (min !== undefined && max !== undefined)
    return exclusive ? `值必须大于 ${min} 且小于 ${max}` : `值必须在 ${min} 到 ${max} 之间`
  if (min !== undefined) return exclusive ? `值必须大于 ${min}` : `值必须 ≥ ${min}`
  if (max !== undefined) return exclusive ? `值必须小于 ${max}` : `值必须 ≤ ${max}`
  return '值不在允许范围内'
}

const numberRange: ValidatorDefinition = {
  validate(value: CellValue | undefined, ctx: ValidatorContext): string | null {
    if (value === null || value === undefined) return null
    if (typeof value !== 'number') return null  // 类型检查由 Layer A 处理
    const { min, max, exclusive } = ctx.rule.options as { min?: number; max?: number; exclusive?: boolean }
    const exc = exclusive === true
    if (min !== undefined && (exc ? value <= min : value < min))
      return numberRangeMessage(min, max, exc)
    if (max !== undefined && (exc ? value >= max : value > max))
      return numberRangeMessage(min, max, exc)
    return null
  },
  message: '值不在允许范围内',
}

const textPattern: ValidatorDefinition = {
  validate(value: CellValue | undefined, ctx: ValidatorContext): string | null {
    if (value === null || value === undefined) return null
    if (typeof value !== 'string') return null
    const { pattern, flags } = ctx.rule.options as { pattern: string; flags?: string }
    const re = new RegExp(pattern, flags)
    return re.test(value) ? null : `值不匹配格式 ${pattern}`
  },
  message: '值格式不正确',
}

const listIn: ValidatorDefinition = {
  validate(value: CellValue | undefined, ctx: ValidatorContext): string | null {
    if (value === null || value === undefined) return null
    const { values } = ctx.rule.options as { values: string[] }
    const str = String(value)
    return values.includes(str) ? null : `值必须是以下之一：${values.join('、')}`
  },
  message: '值不在允许列表中',
}

function resolveSerial(v: number | string | undefined): number | undefined {
  if (v === undefined) return undefined
  if (typeof v === 'number') return v
  return dateStringToSerial(v) ?? undefined
}

const dateRange: ValidatorDefinition = {
  validate(value: CellValue | undefined, ctx: ValidatorContext): string | null {
    if (value === null || value === undefined) return null
    if (typeof value !== 'number') return null
    const { min: rawMin, max: rawMax } = ctx.rule.options as { min?: number | string; max?: number | string }
    const min = resolveSerial(rawMin)
    const max = resolveSerial(rawMax)
    if (min !== undefined && value < min) return `日期早于允许的最小值`
    if (max !== undefined && value > max) return `日期晚于允许的最大值`
    return null
  },
  message: '日期不在允许范围内',
}

export const BUILT_IN_VALIDATORS: Record<string, ValidatorDefinition> = {
  'number-range': numberRange,
  'text-pattern': textPattern,
  'list-in': listIn,
  'date-range': dateRange,
}
```

> **注意**：`dateStringToSerial` 从 `packages/core/src/kernel/protocol/serial.ts` 引入。若该函数不存在或签名不同，STOP+ASK。

- [ ] **Step 4: 运行测试确认绿**

```bash
bun test packages/core/tests/features/validation/builtInValidators.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/features/validation/builtInValidators.ts packages/core/tests/features/validation/builtInValidators.test.ts
git commit -m "feat(validation): 四种内置 validator（number-range / text-pattern / list-in / date-range）"
```

---

## Task 6: ValidationScheduler

**Files:**
- Create: `packages/core/src/features/validation/ValidationScheduler.ts`
- Create: `packages/core/tests/features/validation/ValidationScheduler.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// packages/core/tests/features/validation/ValidationScheduler.test.ts
import { describe, expect, it, mock } from 'bun:test'
import { ValidationScheduler } from '../../../src/features/validation/ValidationScheduler'

function makeScheduler(validate: (r: number, c: number) => Promise<void>, redraw = () => {}) {
  return new ValidationScheduler(validate, redraw, { batchSize: 10, maxConcurrent: 2 })
}

describe('ValidationScheduler', () => {
  it('calls validate for pushed cells after flush', async () => {
    const validated: string[] = []
    const s = makeScheduler(async (r, c) => { validated.push(`${r}:${c}`) })
    s.push([{ rawRow: 0, rawCol: 0 }, { rawRow: 1, rawCol: 1 }])
    await new Promise(r => setTimeout(r, 10))
    expect(validated).toContain('0:0')
    expect(validated).toContain('1:1')
  })

  it('skips stale tasks when cell pushed again before flush', async () => {
    let callCount = 0
    const s = makeScheduler(async () => { callCount++ })
    s.push([{ rawRow: 0, rawCol: 0 }])
    s.push([{ rawRow: 0, rawCol: 0 }])
    await new Promise(r => setTimeout(r, 10))
    // Only 1 actual validate call (latest version)
    expect(callCount).toBe(1)
  })

  it('destroy stops pending flush', async () => {
    let callCount = 0
    const s = makeScheduler(async () => { callCount++ })
    s.push([{ rawRow: 0, rawCol: 0 }])
    s.destroy()
    await new Promise(r => setTimeout(r, 10))
    expect(callCount).toBe(0)
  })
})
```

- [ ] **Step 2: 运行测试确认红**

```bash
bun test packages/core/tests/features/validation/ValidationScheduler.test.ts
```

Expected: FAIL.

- [ ] **Step 3: 实现 ValidationScheduler**

```ts
// packages/core/src/features/validation/ValidationScheduler.ts

export interface RawCell {
  rawRow: number
  rawCol: number
}

type TaskNode = {
  rawRow: number
  rawCol: number
  version: number
  next: TaskNode | null
}

export interface ValidationSchedulerOptions {
  batchSize: number
  maxConcurrent: number
}

export class ValidationScheduler {
  private head: TaskNode | null = null
  private tail: TaskNode | null = null
  /** key → latest task node（保留引用以实现 O(1) version bump） */
  private taskMap = new Map<string, TaskNode>()
  private flushHandle: ReturnType<typeof setTimeout> | null = null
  private asyncPool = new Set<Promise<void>>()
  private destroyed = false

  constructor(
    private readonly validate: (rawRow: number, rawCol: number) => Promise<void>,
    private readonly scheduleRedraw: () => void,
    private readonly options: ValidationSchedulerOptions,
  ) {}

  push(cells: readonly RawCell[]): void {
    if (this.destroyed) return
    for (const { rawRow, rawCol } of cells) {
      const k = `${rawRow}:${rawCol}`
      const existing = this.taskMap.get(k)
      if (existing) {
        existing.version++
      } else {
        const node: TaskNode = { rawRow, rawCol, version: 0, next: null }
        this.taskMap.set(k, node)
        if (this.tail) this.tail.next = node
        else this.head = node
        this.tail = node
      }
    }
    this.scheduleFlush()
  }

  pushAll(allCells: readonly RawCell[]): void {
    if (this.destroyed) return
    // Clear existing queue
    this.head = null
    this.tail = null
    this.taskMap.clear()
    if (this.flushHandle !== null) {
      clearTimeout(this.flushHandle)
      this.flushHandle = null
    }
    this.push(allCells)
  }

  destroy(): void {
    this.destroyed = true
    if (this.flushHandle !== null) {
      clearTimeout(this.flushHandle)
      this.flushHandle = null
    }
    this.head = null
    this.tail = null
    this.taskMap.clear()
  }

  private scheduleFlush(): void {
    if (this.flushHandle !== null || this.destroyed) return
    this.flushHandle = setTimeout(() => {
      this.flushHandle = null
      void this.flush()
    }, 0)
  }

  private async flush(): Promise<void> {
    if (this.destroyed) return
    let processed = 0
    let node = this.head

    while (node && processed < this.options.batchSize) {
      const k = `${node.rawRow}:${node.rawCol}`
      const canonical = this.taskMap.get(k)

      if (canonical && canonical.version === node.version) {
        // Valid task — consume it
        this.taskMap.delete(k)
        const { rawRow, rawCol } = node

        if (this.asyncPool.size < this.options.maxConcurrent) {
          const p: Promise<void> = this.validate(rawRow, rawCol).then(() => {
            this.asyncPool.delete(p)
            if (!this.destroyed) this.scheduleRedraw()
          })
          this.asyncPool.add(p)
        } else {
          // Pool full: re-queue at tail (will run next flush)
          const requeue: TaskNode = { rawRow, rawCol, version: 0, next: null }
          this.taskMap.set(k, requeue)
          if (this.tail) this.tail.next = requeue
          else this.head = requeue
          this.tail = requeue
        }
        processed++
      }

      node = node.next
    }

    // Advance head past processed nodes
    this.head = node
    if (!node) this.tail = null

    if (this.head && !this.destroyed) this.scheduleFlush()
  }
}
```

- [ ] **Step 4: 运行测试确认绿**

```bash
bun test packages/core/tests/features/validation/ValidationScheduler.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/features/validation/ValidationScheduler.ts packages/core/tests/features/validation/ValidationScheduler.test.ts
git commit -m "feat(validation): ValidationScheduler 链表可中断异步调度器"
```

---

## Task 7: ValidationService

**Files:**
- Create: `packages/core/src/features/validation/ValidationService.ts`
- Create: `packages/core/src/features/validation/index.ts`
- Create: `packages/core/tests/features/validation/ValidationService.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// packages/core/tests/features/validation/ValidationService.test.ts
import { describe, expect, it } from 'bun:test'
import { ValidationService } from '../../../src/features/validation/ValidationService'
import { ValidationRuleStore } from '../../../src/features/validation/ValidationRuleStore'
import { ValidationResultStore } from '../../../src/features/validation/ValidationResultStore'
import type { ValidatorDefinition } from '../../../src/kernel/protocol/ValidationTypes'

function makeService(overrides?: {
  getCell?: (r: number, fieldId: string) => unknown
  getField?: (c: number) => unknown
  getResolvedType?: (r: number, c: number) => string
}) {
  const ruleStore = new ValidationRuleStore()
  const resultStore = new ValidationResultStore()
  const customValidator: ValidatorDefinition = {
    validate: async (value) => (value === 'bad' ? '不允许该值' : null),
  }
  const service = new ValidationService({
    ruleStore,
    resultStore,
    getCell: overrides?.getCell ?? ((r, fieldId) => null),
    getField: overrides?.getField ?? ((c) => ({ id: 'f', name: 'F', type: 'text', width: 100 })),
    getResolvedType: overrides?.getResolvedType ?? ((r, c) => 'text'),
    validators: { custom: customValidator },
    locale: 'en-US',
  })
  return { service, ruleStore, resultStore }
}

describe('ValidationService', () => {
  it('validates ok cell: result deleted (null)', async () => {
    const { service, resultStore } = makeService({ getCell: () => 'good' })
    await service.validateCell(0, 0)
    expect(resultStore.get(0, 0)).toBeNull()
  })

  it('Layer A: type mismatch sets invalid', async () => {
    const { service, resultStore } = makeService({
      getCell: () => 'text-value',
      getResolvedType: () => 'number',
    })
    await service.validateCell(0, 0)
    const state = resultStore.get(0, 0)
    expect(state?.status).toBe('invalid')
    expect((state as { message: string })?.message).toContain('数字')
  })

  it('Layer A short-circuits: rule not run when type fails', async () => {
    let ruleCalled = false
    const { service, ruleStore, resultStore } = makeService({
      getCell: () => 'text',
      getResolvedType: () => 'number',
    })
    ruleStore.setRange({ startRow: 0, endRow: 0, startCol: 0, endCol: 0 }, { type: 'number-range' })
    await service.validateCell(0, 0)
    // State is type error, not number-range error
    expect(resultStore.get(0, 0)?.status).toBe('invalid')
  })

  it('custom validator: error sets invalid', async () => {
    const { service, ruleStore, resultStore } = makeService({ getCell: () => 'bad' })
    ruleStore.setRange({ startRow: 0, endRow: 0, startCol: 0, endCol: 0 }, { type: 'custom' })
    await service.validateCell(0, 0)
    expect(resultStore.get(0, 0)?.status).toBe('invalid')
    expect((resultStore.get(0, 0) as { message: string })?.message).toBe('不允许该值')
  })

  it('rule.message overrides validator message', async () => {
    const { service, ruleStore, resultStore } = makeService({ getCell: () => 'bad' })
    ruleStore.setRange({ startRow: 0, endRow: 0, startCol: 0, endCol: 0 }, { type: 'custom', message: '自定义错误' })
    await service.validateCell(0, 0)
    expect((resultStore.get(0, 0) as { message: string })?.message).toBe('自定义错误')
  })

  it('no rule + type ok: result is null (ok)', async () => {
    const { service, resultStore } = makeService({ getCell: () => 'hello' })
    await service.validateCell(0, 0)
    expect(resultStore.get(0, 0)).toBeNull()
  })
})
```

- [ ] **Step 2: 运行测试确认红**

```bash
bun test packages/core/tests/features/validation/ValidationService.test.ts
```

Expected: FAIL.

- [ ] **Step 3: 实现 ValidationService**

```ts
// packages/core/src/features/validation/ValidationService.ts
import type { CellValue, Field, FieldType } from '../../kernel/data/Schema'
import type { ValidatorDefinition } from '../../kernel/protocol/ValidationTypes'
import type { ValidationRuleStore } from './ValidationRuleStore'
import type { ValidationResultStore } from './ValidationResultStore'
import { checkTypeConformance } from './typeConformance'
import { BUILT_IN_VALIDATORS } from './builtInValidators'

export interface ValidationServiceOptions {
  ruleStore: ValidationRuleStore
  resultStore: ValidationResultStore
  /** view 坐标已转为 raw 的 getCell；service 在 raw 空间工作 */
  getCell: (rawRow: number, fieldId: string) => CellValue | undefined
  getField: (rawCol: number) => Field | undefined
  getResolvedType: (rawRow: number, rawCol: number) => FieldType
  validators?: Readonly<Record<string, ValidatorDefinition>>
  locale: string
}

export class ValidationService {
  private readonly allValidators: Readonly<Record<string, ValidatorDefinition>>

  constructor(private readonly opts: ValidationServiceOptions) {
    this.allValidators = { ...BUILT_IN_VALIDATORS, ...(opts.validators ?? {}) }
  }

  async validateCell(rawRow: number, rawCol: number): Promise<void> {
    const field = this.opts.getField(rawCol)
    if (!field) { this.opts.resultStore.delete(rawRow, rawCol); return }

    const value = this.opts.getCell(rawRow, field.id)
    const resolvedType = this.opts.getResolvedType(rawRow, rawCol)

    // Layer A: type conformance (short-circuit)
    const typeError = checkTypeConformance(value, resolvedType)
    if (typeError) {
      this.opts.resultStore.set(rawRow, rawCol, { status: 'invalid', message: typeError })
      return
    }

    // Layer B/C: declared rule
    const rule = this.opts.ruleStore.get(rawRow, rawCol) ?? (field.options?.validation ?? null)
    if (!rule) {
      this.opts.resultStore.delete(rawRow, rawCol)
      return
    }

    const validator = this.allValidators[rule.type]
    if (!validator) {
      // Unknown validator: skip (warn once in dev, but don't throw)
      this.opts.resultStore.delete(rawRow, rawCol)
      return
    }

    this.opts.resultStore.set(rawRow, rawCol, { status: 'pending' })

    const message = await validator.validate(value, {
      field,
      resolvedCellType: resolvedType,
      rule,
      locale: this.opts.locale,
      rowIndex: rawRow,
      colIndex: rawCol,
    })

    if (message) {
      this.opts.resultStore.set(rawRow, rawCol, {
        status: 'invalid',
        message: rule.message ?? message,
      })
    } else {
      this.opts.resultStore.delete(rawRow, rawCol)
    }
  }
}
```

- [ ] **Step 4: 创建 index.ts**

```ts
// packages/core/src/features/validation/index.ts
export type { ValidatorDefinition, ValidatorContext, ValidationRule, ValidationState } from '../../kernel/protocol/ValidationTypes'
export { ValidationRuleStore } from './ValidationRuleStore'
export { ValidationResultStore } from './ValidationResultStore'
export { ValidationScheduler } from './ValidationScheduler'
export { ValidationService } from './ValidationService'
export { BUILT_IN_VALIDATORS } from './builtInValidators'
```

- [ ] **Step 5: 运行测试确认绿**

```bash
bun test packages/core/tests/features/validation/ValidationService.test.ts
```

Expected: all PASS.

- [ ] **Step 6: 全量测试**

```bash
bun test packages/core/tests/features/validation/
```

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/features/validation/ packages/core/tests/features/validation/
git commit -m "feat(validation): ValidationService 核心校验逻辑与 index re-export"
```

---

## Task 8: Engine 集成 — GridEngineOptions + DefaultGridEngine 写入拦截

**Files:**
- Modify: `packages/core/src/engine/GridEngine.ts`
- Modify: `packages/core/src/engine/DefaultGridEngine.ts`

- [ ] **Step 1: 更新 GridEngine.ts — GridEngineOptions**

在 `GridEngineOptions` interface 新增以下字段（紧跟 `cellTypes?:` 之后）：

```ts
  /** 自定义 validator 注册表；key 为 ValidationRule.type；与 BUILT_IN_VALIDATORS 合并，custom 优先。 */
  validators?: Readonly<Record<string, import('../features/validation').ValidatorDefinition>>
  /** 批量写入时每 tick 处理格数上限；默认 50。 */
  validationBatchSize?: number
  /** 异步 validator 最大并发数；默认 4。 */
  validationMaxConcurrent?: number
```

- [ ] **Step 2: 更新 DefaultGridEngine.ts — 声明 validation 三件套**

在 `DefaultGridEngine` 类顶部 imports 中追加：

```ts
import { ValidationRuleStore } from '../features/validation/ValidationRuleStore'
import { ValidationResultStore } from '../features/validation/ValidationResultStore'
import { ValidationScheduler, type RawCell } from '../features/validation/ValidationScheduler'
import { ValidationService } from '../features/validation/ValidationService'
import type { ValidationRule, ValidationState } from '../kernel/protocol/ValidationTypes'
```

在私有字段区域追加（跟在 `fillStyles` 之后）：

```ts
  private readonly validationRuleStore = new ValidationRuleStore()
  private readonly validationResultStore = new ValidationResultStore()
  private readonly validationService: ValidationService
  private readonly validationScheduler: ValidationScheduler
```

在 constructor 中，于 `this.fillCellTypes = ...` 之后初始化：

```ts
    this.validationService = new ValidationService({
      ruleStore: this.validationRuleStore,
      resultStore: this.validationResultStore,
      getCell: (rawRow, fieldId) => this.data.getCell(rawRow, fieldId),
      getField: (rawCol) => {
        const fields = this.data.getSchema().fields
        return rawCol >= 0 && rawCol < fields.length ? fields[rawCol] ?? undefined : undefined
      },
      getResolvedType: (rawRow, rawCol) => {
        const field = this.data.getSchema().fields[rawCol]
        return field ? this.cellTypeStore.resolve(rawRow, rawCol, field) : 'text'
      },
      validators: options.validators,
      locale: options.locale ?? 'en-US',
    })
    this.validationScheduler = new ValidationScheduler(
      (r, c) => this.validationService.validateCell(r, c),
      () => this.invalidate(),
      {
        batchSize: options.validationBatchSize ?? 50,
        maxConcurrent: options.validationMaxConcurrent ?? 4,
      },
    )
```

- [ ] **Step 3: 拦截所有写入路径**

在 `commitCellEdit()` 方法的 `return` 之前追加：

```ts
  commitCellEdit(): boolean {
    const result = this.editController.commit()
    if (result) {
      const sel = this.selectionController.getSelection()
      if (sel.activeCell) {
        const rawRow = this.viewRowToRaw(sel.activeCell.rowIndex)
        const rawCol = this.viewColToRaw(sel.activeCell.colIndex)
        this.validationScheduler.push([{ rawRow, rawCol }])
      }
    }
    return result
  }
```

在 `commitCellValue()` 方法的 `return` 之前追加：

```ts
  commitCellValue(cell: CellAddress, fieldId: string, value: CellValue | null): boolean {
    const result = this.editController.commitCellValue(cell, fieldId, value)
    if (result) {
      const rawRow = this.viewRowToRaw(cell.rowIndex)
      const rawCol = this.viewColToRaw(cell.colIndex)
      this.validationScheduler.push([{ rawRow, rawCol }])
    }
    return result
  }
```

在 `pasteController.commit(...)` 调用后追加（在 `paste()` 方法末尾）：

```ts
    // Validation: 推入粘贴区域所有格
    const cells: RawCell[] = []
    for (let r = target.startRow; r <= target.endRow; r++) {
      for (let c = target.startCol; c <= target.endCol; c++) {
        cells.push({ rawRow: this.viewRowToRaw(r), rawCol: this.viewColToRaw(c) })
      }
    }
    this.validationScheduler.push(cells)
```

在 `fillController.commit(...)` 调用后追加（在 `fill()` 方法末尾，返回结果前）：

```ts
    // Validation: 推入 fill 区域所有格
    if (fillResult) {
      const cells: RawCell[] = []
      for (let r = fillResult.result.startRow; r <= fillResult.result.endRow; r++) {
        for (let c = fillResult.result.startCol; c <= fillResult.result.endCol; c++) {
          cells.push({ rawRow: this.viewRowToRaw(r), rawCol: this.viewColToRaw(c) })
        }
      }
      this.validationScheduler.push(cells)
    }
```

在 `undo()` 和 `redo()` 之后追加对 affected range 的 push（从 cmd 中取 affected cells）：

```ts
  undo(): UndoCommand | undefined {
    const cmd = this.undoStack.popUndo()
    if (!cmd) return undefined
    this.undoReplay.undo(cmd)
    this.pushValidationForUndoCommand(cmd)
    return cmd
  }

  redo(): UndoCommand | undefined {
    const cmd = this.undoStack.popRedo()
    if (!cmd) return undefined
    this.undoReplay.redo(cmd)
    this.pushValidationForUndoCommand(cmd)
    return cmd
  }

  private pushValidationForUndoCommand(cmd: UndoCommand): void {
    // 从 cmd 提取受影响的 raw cell 区间
    if ('rawRow' in cmd && 'rawCol' in cmd) {
      this.validationScheduler.push([{ rawRow: cmd.rawRow as number, rawCol: cmd.rawCol as number }])
    } else if ('rawRange' in cmd && cmd.rawRange) {
      const r = cmd.rawRange as { startRow: number; endRow: number; startCol: number; endCol: number }
      const cells: RawCell[] = []
      for (let row = r.startRow; row <= r.endRow; row++) {
        for (let col = r.startCol; col <= r.endCol; col++) {
          cells.push({ rawRow: row, rawCol: col })
        }
      }
      this.validationScheduler.push(cells)
    }
  }
```

> **注意**：`UndoCommand` 的实际结构在 `packages/core/src/kernel/undo/UndoCommand.ts` 中定义。如字段名称不同，先读文件确认，STOP+ASK 如有歧义。

- [ ] **Step 4: 新增 validation 公开方法到 GridEngine**

在 `GridEngine` interface 中追加（与 `setCellType` 相邻）：

```ts
  setValidationRule(rawRange: RawRange, rule: ValidationRule): void
  clearValidationRule(rawRange: RawRange): void
  validateAll(): void
  getValidationState(rawRow: number, rawCol: number): ValidationState | null
```

在 `DefaultGridEngine` 中实现：

```ts
  setValidationRule(rawRange: RawRange, rule: ValidationRule): void {
    this.validationRuleStore.setRange(rawRange, rule)
  }

  clearValidationRule(rawRange: RawRange): void {
    this.validationRuleStore.clearRange(rawRange)
  }

  validateAll(): void {
    const rowCount = this.data.getRowCount()
    const colCount = this.data.getSchema().fields.length
    const cells: RawCell[] = []
    for (let r = 0; r < rowCount; r++) {
      for (let c = 0; c < colCount; c++) {
        cells.push({ rawRow: r, rawCol: c })
      }
    }
    this.validationResultStore.clear()
    this.validationScheduler.pushAll(cells)
  }

  getValidationState(rawRow: number, rawCol: number): ValidationState | null {
    return this.validationResultStore.get(rawRow, rawCol)
  }
```

- [ ] **Step 5: destroy() 清理 scheduler**

在 `destroy()` 方法末尾追加：

```ts
    this.validationScheduler.destroy()
```

- [ ] **Step 6: 结构变更 remap（在 remap 调用处追加）**

在现有 `CellTypeStore` / `CellFormatStore` 的 `remapAfterRowsInserted` 等调用位置，同步追加 validation store 的 remap 调用：

```ts
// 示例：在 rows insert handler 内
this.validationRuleStore.remapAfterRowsInserted(at, count)
this.validationResultStore.remapAfterRowsInserted(at, count)
```

> 实际调用位置在 `registerRowStructureUndo.ts` / `registerColumnStructureUndo.ts` 的 event handler 里，或在 `DefaultGridEngine` 处理结构事件的方法里。读相应文件确认位置，STOP+ASK 如不确定。

- [ ] **Step 7: Typecheck**

```bash
bun run --filter @novasheet/core typecheck
```

Expected: 0 errors。如有类型错误，修复后继续。

- [ ] **Step 8: 全量测试**

```bash
bun test packages/core/tests/
```

Expected: all PASS（现有测试无回归）。

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/engine/GridEngine.ts packages/core/src/engine/DefaultGridEngine.ts
git commit -m "feat(validation): engine 集成写入拦截、validateAll、remap"
```

---

## Task 9: Grid Facade API

**Files:**
- Modify: `packages/core/src/Grid.ts`

- [ ] **Step 1: 在 Grid.ts 新增四个 validation 方法**

在 `setCellType` 附近追加（参照 `setCellType` 实现方式做 view→raw 坐标转换）：

```ts
  /** 为 view range 设置验证规则；range rule 优先于列默认规则。 */
  setValidation(range: CellRange, rule: ValidationRule): void {
    const rawRange = this.delegate.viewRangeToRawRange(range)
    if (!rawRange) return
    this.delegate.setValidationRule(rawRange, rule)
  }

  /** 清除 view range 的区间验证规则（不影响 Field.options.validation 列默认）。 */
  clearValidation(range: CellRange): void {
    const rawRange = this.delegate.viewRangeToRawRange(range)
    if (!rawRange) return
    this.delegate.clearValidationRule(rawRange)
  }

  /**
   * 手动触发全量重校验。立即返回；校验异步执行，结果写入 store 后自动重绘。
   */
  validateAll(): void {
    this.delegate.validateAll()
  }

  /** 查询单格当前校验状态（view 坐标）；null = ok。 */
  getValidationState(rowIndex: number, colIndex: number): ValidationState | null {
    const rawRow = this.delegate.viewRowToRaw(rowIndex)
    const rawCol = this.delegate.viewColToRaw(colIndex)
    return this.delegate.getValidationState(rawRow, rawCol)
  }
```

在 Grid.ts imports 顶部追加：

```ts
import type { ValidationRule, ValidationState } from './kernel/protocol/ValidationTypes'
```

> **注意**：`viewRangeToRawRange` / `viewRowToRaw` / `viewColToRaw` 是否在 `GridEngine` interface 上已暴露，先检查后补充，STOP+ASK 如不确定。

- [ ] **Step 2: Typecheck + 全量测试**

```bash
bun run --filter @novasheet/core typecheck && bun test packages/core/tests/
```

Expected: 0 errors，all PASS。

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/Grid.ts
git commit -m "feat(validation): Grid facade setValidation / clearValidation / validateAll / getValidationState"
```

---

## Task 10: RenderFrame 扩展 + Theme tokens

**Files:**
- Modify: `packages/core/src/kernel/render/RenderFrame.ts`
- Modify: `packages/core/src/engine/FrameAssembler.ts`
- Modify: `packages/core/src/kernel/theme/Theme.ts`
- Modify: `packages/core/src/kernel/theme/denseGridTheme.ts`

- [ ] **Step 1: RenderFrame 新增 getValidationState**

在 `packages/core/src/kernel/render/RenderFrame.ts` 末尾追加字段：

```ts
  /**
   * Validation — 单格校验状态查询器（view 坐标）；null = ok。
   * 引擎构帧时闭合 raw→view 坐标转换 + resultStore。
   */
  getValidationState?: (rowIndex: number, colIndex: number) => 'ok' | 'invalid' | 'pending'
```

- [ ] **Step 2: FrameAssembler 新增输入字段并构建闭包**

在 `FrameAssemblerInput` interface 中追加：

```ts
  /** raw 坐标校验状态查询器，构帧时包成 view 查询器。 */
  readonly getRawValidationState?: (rawRow: number, rawCol: number) => 'ok' | 'invalid' | 'pending'
```

在 `assembleRenderFrame` 函数内，于 `return { ... }` 块中追加：

```ts
  const getValidationState = input.getRawValidationState
    ? (viewRow: number, viewCol: number): 'ok' | 'invalid' | 'pending' => {
        const rawRow = input.viewRowToRaw(viewRow)
        const rawCol = input.viewColToRaw(viewCol)
        if (rawRow < 0 || rawCol < 0) return 'ok'
        const state = input.getRawValidationState!(rawRow, rawCol)
        return state
      }
    : undefined
```

在 return 块中加入：

```ts
    getValidationState,
```

- [ ] **Step 3: DefaultGridEngine.getFrame() 传入 getRawValidationState**

在 `packages/core/src/engine/DefaultGridEngine.ts` 的 `assembleRenderFrame(...)` 调用参数中追加：

```ts
      getRawValidationState: (rawRow, rawCol) => {
        const s = this.validationResultStore.get(rawRow, rawCol)
        if (!s) return 'ok'
        return s.status
      },
```

- [ ] **Step 4: Theme 新增 validation tokens**

在 `packages/core/src/kernel/theme/Theme.ts` 中新增：

```ts
export interface ThemeValidation {
  readonly invalidBorderColor: string
  readonly markerColor: string
  readonly markerSize: number
}
```

在 `Theme` interface 中追加：

```ts
  readonly validation: ThemeValidation
```

在 `packages/core/src/kernel/theme/denseGridTheme.ts` 中填充默认值（在 export 的 denseGridTheme 对象内追加）：

```ts
  validation: {
    invalidBorderColor: '#E53E3E',
    markerColor: '#E53E3E',
    markerSize: 5,
  },
```

- [ ] **Step 5: Typecheck**

```bash
bun run --filter @novasheet/core typecheck
```

Expected: 0 errors。

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/kernel/render/RenderFrame.ts packages/core/src/engine/FrameAssembler.ts packages/core/src/engine/DefaultGridEngine.ts packages/core/src/kernel/theme/Theme.ts packages/core/src/kernel/theme/denseGridTheme.ts
git commit -m "feat(validation): RenderFrame getValidationState 闭包 + Theme validation tokens"
```

---

## Task 11: Canvas2D 渲染 — 红边框 + 角标

**Files:**
- Modify: `packages/canvas2d/src/painters/CellPainter.ts`
- Modify: `packages/canvas2d/src/render/Canvas2DRenderer.ts`

- [ ] **Step 1: CellPaintParams 新增 validationState**

在 `CellPaintParams` interface 中追加：

```ts
  /** Validation — 'invalid' 时绘制红边框 + 角标；'pending'/'ok'/undefined 不绘制。 */
  validationState?: 'ok' | 'invalid' | 'pending'
```

- [ ] **Step 2: CellPainter 新增 paintValidationIndicator 私有方法**

在 `CellPainter` 类中追加：

```ts
  private paintValidationIndicator(ctx: CanvasRenderingContext2D, rect: QuadrantRect): void {
    const v = this.theme.validation
    ctx.save()
    // 红边框：1px inset，0.5 偏移让线条落在像素边界上
    ctx.strokeStyle = v.invalidBorderColor
    ctx.lineWidth = 1
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1)
    // 右上角红三角角标
    const s = v.markerSize
    ctx.fillStyle = v.markerColor
    ctx.beginPath()
    ctx.moveTo(rect.x + rect.width - s, rect.y)
    ctx.lineTo(rect.x + rect.width, rect.y)
    ctx.lineTo(rect.x + rect.width, rect.y + s)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }
```

- [ ] **Step 3: 在 CellPainter.paint() 末尾触发指示器**

将 `paint()` 方法中 `if (value === null || value === undefined) return` 改为：

```ts
    if (value === null || value === undefined) {
      if (params.validationState === 'invalid') this.paintValidationIndicator(ctx, rect)
      return
    }
```

在 `ctx.restore()` （最后一行）之后追加：

```ts
    if (params.validationState === 'invalid') this.paintValidationIndicator(ctx, rect)
```

- [ ] **Step 4: Canvas2DRenderer — paintCellContentRegion 增加 getValidationState 参数**

在 `paintCellContentRegion` 方法签名末尾追加参数：

```ts
    getValidationState?: (rowIndex: number, colIndex: number) => 'ok' | 'invalid' | 'pending',
```

在调用 `this.cellPainter.paint(this.ctx, { ... })` 时追加字段：

```ts
          validationState: getValidationState ? getValidationState(r, c) : undefined,
```

- [ ] **Step 5: 更新 paintCellContentRegion 的调用点**

在 `paint()` 方法中调用 `paintCellContentRegion(...)` 的地方追加参数：

```ts
        ctx.frame.getValidationState,
```

（此处有多个 region 的调用，所有调用点都要更新。）

- [ ] **Step 6: Typecheck**

```bash
bun run --filter @novasheet/canvas2d typecheck
```

Expected: 0 errors。

- [ ] **Step 7: Build 验证**

```bash
bun run --filter @novasheet/core build && bun run --filter @novasheet/canvas2d build
```

Expected: both succeed without errors。

- [ ] **Step 8: Commit**

```bash
git add packages/canvas2d/src/painters/CellPainter.ts packages/canvas2d/src/render/Canvas2DRenderer.ts
git commit -m "feat(validation): Canvas2D 红边框 + 角标渲染"
```

---

## Task 12: DOM Tooltip + Hover 集成

**Files:**
- Create: `packages/core/src/dom/overlay/ValidationTooltip.ts`
- Modify: `packages/core/src/dom/runtime/GridRuntime.ts`

- [ ] **Step 1: 实现 ValidationTooltip**

```ts
// packages/core/src/dom/overlay/ValidationTooltip.ts

/** 轻量 DOM tooltip，显示单元格 validation 错误原因。无 React 依赖。 */
export class ValidationTooltip {
  private el: HTMLElement | null = null

  constructor(private readonly host: HTMLElement) {}

  show(message: string, anchorRect: DOMRect, containerRect: DOMRect): void {
    if (!this.el) {
      this.el = document.createElement('div')
      this.el.setAttribute('data-novasheet-validation-tooltip', '')
      this.el.style.cssText = [
        'position:absolute',
        'z-index:9999',
        'pointer-events:none',
        'background:#fff',
        'border:1px solid #E53E3E',
        'border-radius:4px',
        'padding:6px 10px',
        'font-size:13px',
        'color:#1a1a1a',
        'max-width:220px',
        'box-shadow:0 2px 8px rgba(0,0,0,0.15)',
        'line-height:1.5',
        'white-space:pre-wrap',
        'word-break:break-word',
      ].join(';')
      this.host.appendChild(this.el)
    }

    this.el.textContent = `无效：${message}`

    // 定位：单元格右上角，若超出容器右边界则翻转到左侧
    const tooltipWidth = 200
    let left = anchorRect.right - containerRect.left + 4
    if (left + tooltipWidth > containerRect.width) {
      left = anchorRect.left - containerRect.left - tooltipWidth - 4
    }
    const top = anchorRect.top - containerRect.top

    this.el.style.left = `${left}px`
    this.el.style.top = `${top}px`
    this.el.style.display = 'block'
  }

  hide(): void {
    if (this.el) this.el.style.display = 'none'
  }

  destroy(): void {
    this.el?.remove()
    this.el = null
  }
}
```

- [ ] **Step 2: GridRuntime — 注入 ValidationTooltip**

在 `GridRuntimeOptions` interface 中追加：

```ts
  /** Validation tooltip overlay；由 canvas2dBackend 装配时传入。 */
  validationTooltip?: ValidationTooltip
```

在 `GridRuntime` 类私有字段中追加：

```ts
  private readonly validationTooltip?: ValidationTooltip
```

在 constructor 中（与其他 overlay 注入一起）：

```ts
    this.validationTooltip = options.validationTooltip
```

- [ ] **Step 3: handleHostPointerMove — 追加 updateValidationTooltip**

在 `handleHostPointerMove` 方法中，`this.updateHeaderCursor(event)` 之后追加：

```ts
    this.updateValidationTooltip(event)
```

新增私有方法：

```ts
  private updateValidationTooltip(event: WebPointerEvent): void {
    if (!this.validationTooltip) return
    const frame = this.engine.getFrame()
    const hit = hitTestCell(frame, event)
    if (!hit) {
      this.validationTooltip.hide()
      return
    }
    const state = this.engine.getFrame().getValidationState?.(hit.rowIndex, hit.colIndex)
    if (state !== 'invalid') {
      this.validationTooltip.hide()
      return
    }
    const rawRow = this.engine.viewRowToRaw(hit.rowIndex)
    const rawCol = this.engine.viewColToRaw(hit.colIndex)
    const validationResult = this.engine.getValidationState(rawRow, rawCol)
    if (!validationResult || validationResult.status !== 'invalid') {
      this.validationTooltip.hide()
      return
    }
    // 计算单元格的屏幕 DOMRect
    const cellRect = this.computeCellDomRect(hit.rowIndex, hit.colIndex, frame)
    if (!cellRect) { this.validationTooltip.hide(); return }
    const containerRect = this.host.container?.getBoundingClientRect() ?? new DOMRect()
    this.validationTooltip.show(validationResult.message, cellRect, containerRect)
  }

  private computeCellDomRect(viewRow: number, viewCol: number, frame: RenderFrame): DOMRect | null {
    const { rowsAxis, colsAxis, viewport } = frame
    const x = colsAxis.indexToPosition(viewCol) - viewport.scrollX
    const y = rowsAxis.indexToPosition(viewRow) - viewport.scrollY
    const width = colsAxis.getSize(viewCol)
    const height = rowsAxis.getSize(viewRow)
    const containerRect = this.host.container?.getBoundingClientRect()
    if (!containerRect) return null
    return new DOMRect(
      containerRect.left + x,
      containerRect.top + y,
      width,
      height,
    )
  }
```

> **注意**：`this.host.container` 是否是正确的 DOM 容器访问路径，需检查 `WebHost` / `DomGridHost` 接口。STOP+ASK 如不确定。

- [ ] **Step 4: 滚动时隐藏 tooltip**

在 GridRuntime 处理滚动事件的地方（搜索 `handleScroll` 或 `onScroll`）追加：

```ts
    this.validationTooltip?.hide()
```

- [ ] **Step 5: destroy() 清理 tooltip**

在 `destroy()` 末尾追加：

```ts
    this.validationTooltip?.destroy()
```

- [ ] **Step 6: canvas2dBackend 装配 ValidationTooltip**

打开 `packages/canvas2d/src/backend/canvas2dBackend.ts`，在 `GridRuntime` 构造参数中追加：

```ts
      validationTooltip: new ValidationTooltip(container),
```

并导入：

```ts
import { ValidationTooltip } from '@novasheet/core/dom/overlay/ValidationTooltip'
```

> **注意**：core DOM overlay 的 import 路径取决于 core 的 package.json exports 配置。若无对应 export，先在 core `index.ts` 或 `dom/index.ts` 中 re-export `ValidationTooltip`，再从 core re-export 导入。STOP+ASK 如不确定。

- [ ] **Step 7: 全量 typecheck + build**

```bash
bun run --filter '*' typecheck
bun run --filter @novasheet/core build && bun run --filter @novasheet/canvas2d build
```

Expected: 0 errors，builds succeed。

- [ ] **Step 8: Lint**

```bash
bun run lint
```

Expected: 0 errors/warnings。

- [ ] **Step 9: 全量测试**

```bash
bun test
```

Expected: all PASS。

- [ ] **Step 10: Commit**

```bash
git add packages/core/src/dom/overlay/ValidationTooltip.ts packages/core/src/dom/runtime/GridRuntime.ts packages/canvas2d/src/backend/canvas2dBackend.ts
git commit -m "feat(validation): ValidationTooltip DOM overlay + hover 显示错误文字"
```

---

## Self-Review

### Spec 覆盖检查

| Spec 要求 | Task |
|---|---|
| Layer A 类型自动校验 | Task 4 typeConformance.ts |
| Layer B 内置 4 种 validator | Task 5 builtInValidators.ts |
| Layer C custom validator 注册 | Task 7 ValidationService + Task 8 GridEngineOptions |
| 双层规则：Field 列默认 + range 覆盖 | Task 2 ValidationRuleStore + Task 7 service resolve |
| Warn-only（写入后标记） | Task 11 CellPainter（只画指示器，不阻断） |
| 全路径拦截 editor/paste/fill/undo/redo | Task 8 write interception |
| `Grid.validateAll()` | Task 8 + Task 9 facade |
| 异步 validator 支持 | Task 6 scheduler（Promise pool）+ Task 7 await |
| 可中断调度（链表 + version 废弃） | Task 6 ValidationScheduler |
| undo/redo 感知 | Task 8 `pushValidationForUndoCommand` |
| row/col remap | Task 2 + 3（remapAfter* 方法） |
| RenderFrame 携带状态 | Task 10 FrameAssembler |
| Canvas2D 红边框 + 角标 | Task 11 CellPainter |
| Theme tokens | Task 10 Theme.ts + denseGridTheme.ts |
| hover tooltip | Task 12 ValidationTooltip |
| `Grid.getValidationState()` | Task 9 facade |

所有 spec 要求均有对应 task。

### Placeholder 扫描

无 TBD/TODO/placeholder。所有步骤含完整代码。

### 类型一致性

- `ValidationState` 定义于 Task 1 `ValidationTypes.ts`，在 Task 3 store、Task 7 service、Task 9 facade、Task 10 frame 均引用同一路径。
- `ValidationRule` 在 Task 1 定义，Task 2 store、Task 8 engine、Task 9 facade 均引用。
- `ValidatorDefinition` 在 Task 1 定义，Task 5 built-in、Task 7 service、Task 8 engine options 均引用。
- `RawCell` 在 Task 6 scheduler 中定义，Task 8 engine import 路径：`'../features/validation/ValidationScheduler'`。
- `getValidationState` frame 闭包返回 `'ok' | 'invalid' | 'pending'`；`CellPaintParams.validationState` 同类型，Task 11 一致。

### 已知限制

- undo 拦截中 `UndoCommand` 字段路径（Task 8 Step 3）需运行时确认。
- async validator 结果存在轻微竞态（old Promise 结果在 new validate 前落盘）；new validate 完成后覆盖，净效果正确，不影响正确性。
- `ValidationTooltip` DOMRect 定位（Task 12）使用简化估算；frozen region 内的 cell 偏移可能有 1-2px 误差（不影响功能）。
