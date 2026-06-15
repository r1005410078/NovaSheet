# NovaSheet 单元格数据验证 — 设计

- **日期**：2026-06-15
- **状态**：设计（待 user 复审 → BDD gate → writing-plans）
- **分支**：`main`（功能线开发前确认基线分支）
- **定位**：为 NovaSheet 引入单元格数据验证能力：三层规则体系（类型自动校验 + 内置约束 + 自定义 validator）、Warn-only 策略、可中断异步调度、完整扩展接口。行为参考 Google Sheets，优先服务 NovaSheet 作为高级组件的可扩展性。
- **前置**：
  - [`2026-06-14-novasheet-cell-level-type-override-design.md`](./2026-06-14-novasheet-cell-level-type-override-design.md)（`resolveCellType` 是 Layer A 的基础）
  - [`2026-06-12-novasheet-cell-extension-api-design.md`](./2026-06-12-novasheet-cell-extension-api-design.md)（`validators` 注册表与 `cellTypes`/`formatters` 对称）
  - [`2026-06-10-novasheet-bdd-tdd-method-design.md`](./2026-06-10-novasheet-bdd-tdd-method-design.md)（开发方法；本 feature 必须先过 BDD gate）

---

## 1. 背景与目标

### 1.1 背景

NovaSheet 当前无数据验证层：值写入后无法标记"与列类型不匹配"或"违反业务约束"。作为高级组件，NovaSheet 需要为上层产品提供完整的 validation 扩展接口，而不仅仅是内置规则。

### 1.2 目标

| # | 能力 |
|---|---|
| 1 | **Layer A 类型自动校验**：值与 resolved cell type 不匹配自动 warn，无需声明规则 |
| 2 | **Layer B 内置约束规则**：`number-range`、`text-pattern`（正则）、`list-in`（成员表）、`date-range` |
| 3 | **Layer C 自定义 validator**：`validators: { myRule: { validate(value, ctx) } }` 构造期注册 |
| 4 | **双层规则挂载**：`Field.options.validation` 做列默认；`Grid.setValidation(range, rule)` 做区间覆盖；range rule 优先 |
| 5 | **Warn-only**：值始终写入；invalid 格标红边框 + 右上角红角标；hover 显示错误文字 |
| 6 | **全路径覆盖**：editor commit（Enter/Tab/blur/arrow/程序化）+ paste + fill + `Grid.setCell()` + undo/redo 全部触发校验 |
| 7 | **增量更新**：每次写入只重算受影响单元格，稀疏存结果 |
| 8 | **异步 validator**：`validate()` 可返回 `string \| null \| Promise<string \| null>`；result store 持有 `pending` / `ok` / `invalid` 三态 |
| 9 | **可中断批量调度**：写入后受影响格入验证任务链表；调度器每 tick 取一批跑完后 yield（`setTimeout(0)` 或 `requestIdleCallback`）；新写入可抢占冲掉旧任务 |
| 10 | **`Grid.validateAll()`**：手动触发全量重校验，将所有单元格推入验证队列 |
| 11 | **undo/redo 感知**：undo/redo 后重新校验受影响区间，result store 同步更新 |
| 12 | **row/col insert/delete 重映射**：ValidationRuleStore 与 ValidationResultStore 随结构变更重映射 raw 坐标 |

### 1.3 非目标

- 不做 Reject 策略（不阻断写入，不回退值）
- 不做编辑器内实时校验（仅 commit 后标记）
- 不做公式/表达式 validator（无公式引擎）
- 不做 validation 设置 UI（配置由 DataSource schema + Grid API 完成）
- 不做跨单元格依赖的 validator（`validate()` 只拿 `value + field + ctx`，不访问其他格）
- 不做 `singleSelect`/`multiSelect` 的 choices 约束 validation（choices 约束由 cell-type 层处理）
- 不做 `pending` 状态的 loading 视觉指示（保留状态，本期渲染与 ok 相同）

---

## 2. 规则模型

### 2.1 ValidatorDefinition（扩展接口）

`packages/core/src/kernel/protocol/ValidationTypes.ts`（新建）：

```ts
export interface ValidatorDefinition {
  /**
   * 校验函数。null = ok；string = 错误文字。支持异步。
   * 同一格的新写入会取消已入队的旧 task，不会竞态覆盖结果。
   */
  validate(
    value: CellValue | undefined,
    ctx: ValidatorContext,
  ): string | null | Promise<string | null>

  /** validator 级默认错误文字；ValidationRule.message 可在规则声明层覆盖 */
  message?: string
}

export interface ValidatorContext {
  readonly field: Field
  readonly resolvedCellType: FieldType   // 含 cell-level type override 后的 resolved type
  readonly rule: ValidationRule          // 当前 rule 及其 options
  readonly locale: string
  readonly rowIndex: number              // view 坐标
  readonly colIndex: number             // view 坐标
}
```

### 2.2 ValidationRule（规则声明）

```ts
export interface ValidationRule {
  /** 内置 validator key 或 GridOptions.validators 里的 custom key */
  type: string
  /** 覆盖 ValidatorDefinition.message；优先级最高 */
  message?: string
  /** 传给 validator 的参数；各内置类型有强类型 options */
  options?: Record<string, unknown>
}
```

### 2.3 内置 validator 类型（Layer B）

| key | options | 空值策略 |
|---|---|---|
| `number-range` | `{ min?: number, max?: number, exclusive?: boolean }` | null/undefined → ok（不视为越界） |
| `text-pattern` | `{ pattern: string, flags?: string }` | null/undefined/非 string → ok |
| `list-in` | `{ values: string[] }` | null/undefined → ok |
| `date-range` | `{ min?: number \| string, max?: number \| string }` | null/undefined → ok；string 按 `yyyy-mm-dd` 解析为 serial |

`exclusive: true` 时区间端点不含（`<` 而非 `<=`）。

### 2.4 Layer A 类型一致性校验的位置

- **无 rule 声明**：自动跑类型一致性检查（value 与 resolved cell type 是否匹配）
- **有 rule 声明**：先跑类型检查；类型检查失败则短路，不再跑 Layer B/C rule

短路保证错误信息准确：date 列填文字永远显示"类型不匹配"而非"不在日期区间"。

各 resolved type 的合法值域：

| type | 合法值 |
|---|---|
| `text` / `url` | string \| null |
| `number` | number \| null |
| `date` | number（serial）\| null |
| `checkbox` | boolean \| null |
| `singleSelect` | string \| null |
| `multiSelect` | readonly string[] \| null |
| custom type | 任意（Layer A 跳过） |

### 2.5 规则 resolve 优先级

```
ValidationRuleStore.get(rawRow, rawCol)   // range rule（最高）
  ?? field.options?.validation             // 列默认 rule
  ?? null                                  // 只跑 Layer A
```

---

## 3. 存储层

### 3.1 ValidationRuleStore

`packages/core/src/features/validation/ValidationRuleStore.ts`：

矩形区间列表，resolve 时从后往前遍历（后设覆盖先设，语义与 `CellTypeStore` 一致）。

```ts
class ValidationRuleStore {
  setRange(rawRange: RawRange, rule: ValidationRule): void
  clearRange(rawRange: RawRange): void
  get(rawRow: number, rawCol: number): ValidationRule | null
  remap(event: StructuralEvent): void   // row/col insert/delete/move 重映射
}
```

### 3.2 ValidationResultStore

`packages/core/src/features/validation/ValidationResultStore.ts`：

稀疏存储；ok 的格不占空间。

```ts
export type ValidationState =
  | { status: 'invalid'; message: string }
  | { status: 'pending' }

class ValidationResultStore {
  set(rawRow: number, rawCol: number, state: ValidationState): void
  delete(rawRow: number, rawCol: number)   // ok 时清除
  get(rawRow: number, rawCol: number): ValidationState | null   // null = ok
  remap(event: StructuralEvent): void
}
```

### 3.3 ValidationScheduler（可中断调度器）

`packages/core/src/features/validation/ValidationScheduler.ts`：

#### 任务链表结构

```ts
type TaskNode = {
  rawRow: number
  rawCol: number
  version: number     // 废弃标记；cell 重入队时 taskMap[key].version++
  next: TaskNode | null
}
```

#### 调度流程

```
写入 / validateAll()
  → pushTasks(cells[])
      若 cell 已在 taskMap：version++ (标记废弃，不移除节点)
      否则：append 到链表尾，写入 taskMap
  → scheduleFlush()（幂等，已调度则 no-op）

flush tick（setTimeout(0) 或 requestIdleCallback）
  取链表头 BATCH_SIZE 个节点
    若 node.version !== taskMap[key].version → skip（已废弃）
    sync validator → 直接写 resultStore
    async validator → Promise pool（maxConcurrent 限制）
  → scheduleRedraw()
  → 有剩余节点 → scheduleFlush() 继续
```

#### 废弃机制

`taskMap: Map<string, TaskNode>`（key = `${rawRow}:${rawCol}`）。新写入时 `taskMap[key].version++`；flush 时节点 version 不匹配即跳过。O(1) 废弃，链表不移除节点（GC 自然回收）。

#### 接口

```ts
class ValidationScheduler {
  push(cells: readonly RawCell[]): void    // 写入后调用
  pushAll(): void                          // validateAll() 调用
  destroy(): void                          // Grid.destroy() 时清理，取消所有 pending Promise
}
```

`pushAll()` 实现：清空 `ValidationResultStore` → 重置链表和 `taskMap` → 遍历全部 raw cell 入队 → `scheduleFlush()`。

---

## 4. 写入拦截 & 公开 API

### 4.1 写入拦截点

所有路径写值后调用 `ValidationScheduler.push(affectedCells)`：

| 写入路径 | 拦截位置 | push 粒度 |
|---|---|---|
| Editor commit（Enter/Tab/blur/arrow/API） | `DefaultGridEngine.commitEdit()` 完成后 | 1 cell |
| Paste | `DefaultGridEngine.paste()` 完成后 | pasted range 所有格 |
| Fill handle | `DefaultGridEngine.fill()` 完成后 | filled range 所有格 |
| `Grid.setCell(row, col, value)` | facade 层 | 1 cell |
| Undo / Redo | `CommandDispatcher.dispatch()` 完成后 | event 里的 affected range |
| `Grid.validateAll()` | facade 层 | `scheduler.pushAll()` |

拦截在 **engine / facade 层**，editor 层不感知 validation。

### 4.2 公开 API

`Grid` facade 新增：

```ts
class Grid {
  /** 为 view range 设置验证规则；range rule 优先于列默认 */
  setValidation(range: CellRange, rule: ValidationRule): void

  /** 清除 view range 的区间规则（不影响列默认规则） */
  clearValidation(range: CellRange): void

  /**
   * 手动触发全量重校验。
   * 立即返回；校验异步执行，结果写入 store 后自动重绘。
   */
  validateAll(): void

  /** 查询单格当前校验状态（view 坐标）；null = ok */
  getValidationState(rowIndex: number, colIndex: number): ValidationState | null
}
```

`GridOptions` 新增：

```ts
interface GridOptions {
  /** 自定义 validator 注册表；key 即 ValidationRule.type 引用的名称 */
  validators?: Record<string, ValidatorDefinition>

  /** 批量写入时每 tick 处理的格数上限；默认 50 */
  validationBatchSize?: number

  /** 异步 validator 最大并发数；防止网络类 validator 爆并发；默认 4 */
  validationMaxConcurrent?: number
}
```

`Field.options` 新增：

```ts
interface Field {
  options?: {
    choices?: unknown         // singleSelect 现有
    validation?: ValidationRule   // 列级默认规则
    // ...其他现有字段...
  }
}
```

### 4.3 ValidationService 核心逻辑

```ts
class ValidationService {
  async validateCell(rawRow: number, rawCol: number): Promise<void> {
    const field = resolveField(rawCol)
    const value = dataSource.getCell(rawRow, field.id)
    const resolvedType = resolveCellType(rawRow, rawCol, field)

    // Layer A：类型一致性（短路）
    const typeError = checkTypeConformance(value, resolvedType)
    if (typeError) {
      resultStore.set(rawRow, rawCol, { status: 'invalid', message: typeError })
      return
    }

    // Layer B/C：声明规则
    const rule = ruleStore.get(rawRow, rawCol) ?? field.options?.validation
    if (!rule) {
      resultStore.delete(rawRow, rawCol)  // ok
      return
    }

    const validator = resolveValidator(rule.type)  // built-in or custom
    resultStore.set(rawRow, rawCol, { status: 'pending' })
    scheduleRedraw()

    const message = await validator.validate(value, buildCtx(rule, field, resolvedType))

    if (message) {
      resultStore.set(rawRow, rawCol, {
        status: 'invalid',
        message: rule.message ?? message,
      })
    } else {
      resultStore.delete(rawRow, rawCol)
    }
    scheduleRedraw()
  }
}
```

---

## 5. 渲染集成

### 5.1 RenderFrame

`RenderCell` 新增：

```ts
interface RenderCell {
  // ...现有字段...
  validation: 'ok' | 'invalid' | 'pending'
}
```

`getFrame()` 对可见区每格读 `ValidationResultStore.get(rawRow, rawCol)`，映射为三态。`pending` 与 `ok` 渲染相同（本期不做 loading 角标）。

### 5.2 Canvas2D 渲染

`CellPainter` 在现有绘制末尾追加 validation layer：

```
paintCell(cell, rect, ctx)
  1. 背景 / 值 / 格式 / 边框（现有）
  2. if cell.validation === 'invalid'
     → 红边框：1px solid theme.validation.invalidBorderColor（四边）
     → 右上角三角角标：fillPath，size = theme.validation.markerSize
```

**Theme 新增 token**（`denseGridTheme.ts`）：

```ts
validation: {
  invalidBorderColor: '#E53E3E',
  markerColor: '#E53E3E',
  markerSize: 5,   // px
}
```

Painter 零硬编码，全从 theme 读。

### 5.3 Tooltip（hover 显示错误文字）

复用现有 hover overlay 机制：

```
HoverController.onCellHover(viewRow, viewCol)
  → getValidationState(viewRow, viewCol)
  → status === 'invalid'
    → 显示 ValidationTooltip（DOM overlay，与 FilterPopover/ContextMenu 同层）
    → 内容：「无效：{message}」
    → 定位：单元格右上角，随滚动跟随
  → 移动 / 滚动 / 聚焦其他格 → 关闭
```

`ValidationTooltip` 是轻量 DOM overlay，不依赖 React。样式走 theme token。

### 5.4 渲染层级

invalid 红边框在**选区蓝色高亮下层**绘制，选区覆盖其上。invalid 角标在**选区上层**绘制（选中格仍可见角标）。现有渲染层级不变。

---

## 6. 架构分层

```
Grid (facade)
  └─ DefaultGridEngine
       ├─ ValidationService          // 校验逻辑
       │    ├─ ValidationRuleStore   // 区间规则
       │    ├─ ValidationResultStore // 稀疏结果
       │    └─ ValidationScheduler  // 可中断调度
       └─ (写入拦截点：commitEdit / paste / fill / setCell / undo/redo)

RenderFrame
  └─ RenderCell.validation          // 可见区三态快照

Canvas2DRenderer
  └─ CellPainter                    // 红边框 + 角标（从 theme 读颜色）

DOM Runtime
  └─ HoverController
       └─ ValidationTooltip         // hover 错误文字 overlay
```

**边界约束**：
- `ValidationService` / `ValidationRuleStore` / `ValidationResultStore` / `ValidationScheduler` 归 `features/validation/`，纯层，不 import DOM。
- `ValidationTooltip` 归 `dom/overlay/`，不 import canvas2d。
- Canvas2D painter 只读 `RenderCell.validation`，不直接访问 store。

---

## 7. Google Sheets Parity 对照

| 行为 | Google Sheets | NovaSheet 本 spec |
|---|---|---|
| 规则类型 | 列表/数字/文本/日期/自定义公式 | A+B+C（类型/内置/custom；无公式） |
| 验证失败策略 | 可选拒绝或警告 | 仅警告（Warn-only） |
| 规则作用域 | 任意 range | 列默认 + 区间覆盖 |
| 错误提示 | 红角标 + hover tooltip | 红边框 + 红角标 + hover tooltip |
| 批量写入校验 | paste 触发 | paste / fill / setCell 全触发 |
| 全量重校验 | 修改规则后自动 | `validateAll()` 手动触发 |
| 异步 validator | 不支持（仅公式） | 支持（Promise，maxConcurrent 限流） |

---

## 8. 示例用法

```ts
// 内置规则：age 列值 0–150
grid.setValidation({ startRow: 0, endRow: 999, startCol: 2, endCol: 2 }, {
  type: 'number-range',
  message: '年龄必须在 0 到 150 之间',
  options: { min: 0, max: 150 },
})

// 自定义异步 validator（如远程校验唯一性）
new Grid(container, {
  data,
  backend: canvas2dBackend(),
  validators: {
    'unique-email': {
      message: '该邮箱已被注册',
      async validate(value, ctx) {
        if (value == null || value === '') return null
        const taken = await checkEmailExists(String(value))
        return taken ? `邮箱 ${value} 已存在` : null
      },
    },
  },
})

// 列默认规则（在 schema 里声明）
const schema: Schema = {
  fields: [
    {
      id: 'email',
      name: 'Email',
      type: 'text',
      width: 200,
      options: {
        validation: { type: 'unique-email' },
      },
    },
  ],
}
```
