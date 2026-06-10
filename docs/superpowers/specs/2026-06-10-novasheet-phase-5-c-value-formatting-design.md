# NovaSheet Phase 5-C — 单元格值格式化（Value Formatting）— 设计

- **日期**：2026-06-10
- **状态**：设计（已评审决策；待 user 复审 → writing-plans）
- **分支**：`refactor-default-grid-engine-decomposition`（功能线开发前确认基线分支）
- **定位**：吸收原 Phase 5-C「number/date/currency format」+ 集成方**自定义 formatter 命名注册表**。本 spec 只做 **formatter 轴**；显示 paint 轴（星级/进度条等）、editor 轴（下拉/日期选择器）、Excel 式 pattern 格式码留后续 spec。
- **前置**：
  - [`2026-05-28-novasheet-phase-5-merge-range-formatting.md`](./2026-05-28-novasheet-phase-5-merge-range-formatting.md)（5-A 格式管线，本 spec 复用）
  - [`2026-06-10-novasheet-bdd-tdd-method-design.md`](./2026-06-10-novasheet-bdd-tdd-method-design.md)（开发方法；本 feature 走该管线，dogfood）
- **Backlog 来源**：CLAUDE.md「单元格自定义类型扩展 API」三轴之一

---

## 1. 背景与目标

`CellPainter` 当前把 raw value 内联格式化（`number`→`toLocaleString('en-US')` 千分位、`Date`→`toISOString()`、其余 `String(value)`），**硬编码、不可配置、不可扩展**。`FieldType` 是闭合 union，Theme 用 `Record<FieldType,…>` 键控。

**目标**：把「raw value → 显示文本」的规则**外置为可配置 + 可扩展的 formatter**，且：

1. **raw value 不变**——排序/筛选/计算/编辑/复制导出仍用底层值；只有绘制文本变
2. **内置声明式 descriptor**（number/currency/percent/date）——可序列化、随文档持久化
3. **集成方自定义 formatter**——命名注册表，文档只存 `formatterId`，函数 Grid init 注册
4. **core 纯层**——解析是纯函数、零 DOM、backend-neutral；painter 只画字符串
5. **复用 5-A 格式管线**——cell 级 format 走现有 `RangeStyleStore` / `FormatLayer` / undo / 结构 remap

---

## 2. 非目标

1. **不做显示 paint 轴**——星级/进度条/tag/头像/mini-chart（自定义 canvas 视觉）是独立 spec
2. **不做 editor 轴**——下拉/日期选择器等自定义编辑器是独立 spec
3. **不做 Excel 式 pattern 格式码**（`#,##0.00`）——终端用户敲格式码的解析器超出 v1
4. **不做条件格式**（5-D）
5. **不改 raw value / 排序语义**——formatter 永不污染数据
6. **formatter 不返回视觉**——只返回 `string`；要颜色/图标走 paint 轴
7. **不开放 `FieldType` union / `cellType`**——渲染类型解耦是 paint 轴的事，本 spec 只加 `Field.format`

---

## 3. 设计原则

1. **formatter 属 frame 装配，不属 painter**——`getFrame()` 阶段解析，painter 消费结果
2. **稀疏优先**——不预枚举每可见格的 dense displayText（分配过重）；用 frame 上的**纯解析器闭包**，painter 按格调用
3. **声明式优先、函数兜底**——descriptor 覆盖 ~95% 且可持久化；自定义函数留逃生口
4. **复用而非新建**——cell 级 format 进 `CellFormat`，自动沿用 5-A 全套管线
5. **错误隔离**——单格 formatter 抛错时 fallback 内置，绝不炸整帧

---

## 4. 数据模型（`kernel`）

### 4.1 ValueFormat（`kernel/protocol/FormatTypes.ts`）

```ts
export type ValueFormat =
  | { readonly kind: 'number';   readonly decimals?: number; readonly thousands?: boolean }
  | { readonly kind: 'currency'; readonly currency: string; readonly decimals?: number; readonly locale?: string }
  | { readonly kind: 'percent';  readonly decimals?: number }
  | { readonly kind: 'date';     readonly pattern: string }   // v1：固定 token 子集（见 §5.4）
  | { readonly kind: 'custom';   readonly formatterId: string }
```

### 4.2 挂载点

| 层 | 字段 | 说明 |
| --- | --- | --- |
| **cell 级** | `CellFormat.valueFormat?: ValueFormat` | 进 5-A 现有 `CellFormat`；自动走 `FormatLayer.patch` → `RangeStyleStore`（raw 键控）→ `ResolvedCellFormat` → frame |
| **列级默认** | `Field.format?: ValueFormat` | schema 声明，列内无 cell 级覆盖时生效 |

> `CellFormat` 现有 `fillColor`/`borders`/`textWrap`，加 `valueFormat` 后**无需新管线**——`FormatLayer`/`resolveCell`/undo/结构 remap 全复用。

### 4.3 Formatter 注册表

```ts
export interface FormatContext {
  readonly field: Field
  readonly locale: string
}
export type CellFormatter = (value: CellValue, ctx: FormatContext) => string
```

- `GridOptions.formatters?: Readonly<Record<string, CellFormatter>>` —— Grid init 注册
- `GridOptions.locale?: string` —— 默认 `'en-US'`（沿用当前 `toLocaleString` 行为）
- 文档/schema 只存 `{ kind: 'custom', formatterId }`（可序列化）；函数不持久化

**自定义 formatter 硬约束**（跑在帧装配热路径）：

| 约束 | 原因 |
| --- | --- |
| 纯 + 同步 + 快 | 帧装配按可见格调用；不能 async / 碰 DOM / 副作用；慢则自行 memoize |
| 只返回 `string` | 视觉（颜色/图标/星级）走 paint 轴 |
| 不改 raw | 本质 `(raw) => string` |
| 抛错隔离 | catch → fallback 内置 + 一次 dev warn（不整帧抛） |

---

## 5. 解析（`kernel` 纯函数）

### 5.1 入口

```ts
export function formatValue(
  value: CellValue,
  format: ValueFormat | undefined,
  ctx: FormatContext,
  registry: Readonly<Record<string, CellFormatter>>,
): string
```

### 5.2 优先级

```
cell.valueFormat（已解析，view→raw 由 5-A 管线给出）
  → Field.format（列级默认）
  → 内置 toDisplayString（现有行为）
```

`custom` kind → 查 `registry[formatterId]`；命中则 `fn(value, ctx)`，未命中或抛错 → fallback 内置 + `console.warn` 一次（按 formatterId 去重）。

### 5.3 内置 descriptor 语义（v1）

| kind | 输入 | 输出示例 | 实现 |
| --- | --- | --- | --- |
| `number` | `1234567` | `1,234,567` | `Intl.NumberFormat(locale, { useGrouping: thousands ?? true, minimumFractionDigits/maximumFractionDigits: decimals })` |
| `currency` | `1234.5` | `¥1,234.50` | `Intl.NumberFormat(currency.locale ?? ctx.locale, { style:'currency', currency })`（descriptor 级 `locale` 优先于 `ctx.locale`） |
| `percent` | `0.1357` | `13.57%` | `Intl.NumberFormat(locale, { style:'percent', maximumFractionDigits: decimals ?? 0 })` |
| `date` | `Date`/epoch | `2024-06-09` | v1 固定 token 子集，见 §5.4 |

**数字解析 + 类型兜底**：number/currency/percent 经 `asFiniteNumber` 解析——`number` 原样、**数字字符串**（如文本工作区 `type:'text'` 字段输入的 `"1234"`）解析为有限数后格式化（修订 2026-06-10：out-of-the-box 文本工作区输入的数字是字符串，不解析则套格式无效，实测 bug）。空白 / 非数字 / `Infinity` / `NaN` → `undefined` 回退默认显示（不抛）。`null`/`undefined` 仍在 painter 最前短路（不绘制）。date 仍只接受 `Date`/epoch `number`（字符串日期解析有 TZ 歧义，留后续）。

### 5.4 date pattern（v1 封闭 token）

v1 **不**实现完整 Intl pattern，仅支持固定 token：`YYYY`、`MM`、`DD`、`HH`、`mm`、`ss`。例：`YYYY-MM-DD`、`YYYY/MM/DD HH:mm`。未识别 token 原样输出。完整 locale-aware 日期留后续。

---

## 6. Frame 集成（`engine`）

### 6.1 RenderFrame 新增

```ts
// kernel/render/RenderFrame.ts
formatCell?: (rowIndex: number, fieldId: string, value: CellValue) => string
```

纯解析器闭包，FrameAssembler 构帧时生成，闭合：

- 已解析 cell 级 `valueFormat`（view 空间，来自现有 `cellFormats` 解析的同一 `ResolvedCellFormat`）
- 列级 `Field.format` 默认
- `formatters` 注册表 + `locale`

### 6.2 装配

`FrameAssembler` 已解析 `cellFormats`（含 `valueFormat`）。扩展为额外产出 `formatCell` 闭包：按 `(rowIndex, fieldId)` 查 cell 级 valueFormat（稀疏 Map）→ 无则查列默认 → 调 `formatValue`。无任何 format 的网格 `formatCell` 仍返回内置结果（行为不变）。

### 6.3 Painter 消费（`canvas2d`，改动极小）

`CellPainter` 把两处 `toDisplayString(value)` 改为：

```ts
const text = params.formatCell?.(params.rowIndex, params.field.id, value)
  ?? this.toDisplayString(value)
```

- `CellPaintParams` 增 `rowIndex` + `formatCell`（renderer 遍历可见格时透传 frame 的闭包）
- number 右对齐仍按 `field.type`（formatter 只改文本，不改对齐）
- `paintNumber` 的内联千分位：当该格有 `valueFormat` 时改用 `formatCell` 结果（避免双重格式化）

---

## 7. 写入门面 + undo

- 新 API `Grid.setValueFormat(range: CellRange, valueFormat: ValueFormat)` —— 经 `FormatController` 出 `FormatLayer{ patch: { valueFormat } }`，复用 5-A 写入路径
- **undo/redo**：复用 5-A 格式 undo 快照（`valueFormat` 是 `CellFormat` 一字段，自动纳入）
- **结构 remap**：复用 5-A（raw 键控随 insert/delete/move 重映射）
- **sort/filter 散射冲突**：复用 5-A 保守语义（`viewRangeToRawRange` 非连续 → no-op）
- 列级 `Field.format` 是 schema 声明，v1 不提供运行时 mutation（由数据定义给出）；运行时改列默认留后续

---

## 8. raw 不变性矩阵

| 操作 | 用 raw 还是 display |
| --- | --- |
| 排序 / 筛选 | **raw**（currency 列按 `1234.5` 数值排，不按 `¥1,234.50`） |
| 编辑态输入框 | **raw**（双击显示 `1234.5`，提交仍存 number；对齐 Google Sheets） |
| 复制 / TSV 导出 | **raw**（v1；display 导出留后续选项） |
| 计算 / 公式（未来） | **raw** |
| 绘制文本 | **display**（唯一变化点） |

---

## 9. 分层与测试（dogfood BDD×TDD 方法）

按 [开发方法](./2026-06-10-novasheet-bdd-tdd-method-design.md)：formatter 是 **core 纯层**，主要 **TDD 内环**驱动；Phase 0 active 层为 excel L3，core 行为层暂缓，故外环仅一条可选 excel 触点。

| 单元 | 层 | 测试 |
| --- | --- | --- |
| `formatValue` + 4 descriptor + custom/fallback | kernel 纯层 | **TDD**（每 kind 红→绿；类型不匹配兜底；miss warn 去重） |
| `FrameAssembler.formatCell` 闭包（稀疏/列默认/优先级） | engine | **TDD** |
| `CellPainter` swap（fillText 文本 = formatted；number 对齐不变） | canvas2d | **TDD**（`RecordingContext` 断言 `fillText` args） |
| `setValueFormat` + undo + 结构 remap | features/format | **TDD**（复用 5-A 测式样） |
| **外环（可选）**：currency 列在 NovaExcel 显示 `¥…` | excel L3 | **BDD 场景**（`scenarios/*.md`，Phase 0 主战场；标 optional） |

> kernel 算法 / painter 白盒按方法**不强套 BDD 场景**；外环只罩用户可观测的 excel 显示。

---

## 10. 公开 API 变更汇总

| 位置 | 变更 | 兼容性 |
| --- | --- | --- |
| `kernel/protocol/FormatTypes.ts` | 新增 `ValueFormat`；`CellFormat.valueFormat?` | additive |
| `kernel/data/Schema.ts` | `Field.format?: ValueFormat` | additive |
| `kernel` 新增 | `CellFormatter` / `FormatContext` / `formatValue` | additive |
| `kernel/render/RenderFrame.ts` | `formatCell?` | additive（painter `?? toDisplayString` 兜底） |
| `Grid` / `GridOptions` | `formatters?`、`locale?`、`setValueFormat()` | additive |
| `canvas2d` `CellPainter` | `CellPaintParams` 增 `rowIndex` + `formatCell`；swap 文本来源 | 内部 |

全部 additive，无 breaking。

---

## 11. ADR

### ADR-A：formatter 在 frame 装配 vs 在 painter
**决策**：frame 装配（core 纯层 resolver 闭包）。painter 保持 backend-neutral，格式化逻辑可单测、跨 backend 复用。

### ADR-B：dense displayText 数组 vs 解析器闭包
| 方案 | 优点 | 缺点 |
| --- | --- | --- |
| dense displayText[] | painter 极简 | 每可见格分配字符串，热路径过重 |
| **解析器闭包（采纳）** | 稀疏、零额外分配、dense 迭代友好 | painter 需透传 `rowIndex` |

### ADR-C：自定义 formatter — 内联函数 vs 命名注册表
**决策**：命名注册表。文档存 `formatterId`（可序列化），函数 Grid init 注册——工作簿可持久化。

### ADR-D：cell 级挂载 — 新管线 vs 复用 5-A CellFormat
**决策**：进 `CellFormat.valueFormat`，复用 5-A 全套（`FormatLayer`/`RangeStyleStore`/undo/remap）。零新管线。

### ADR-E：date v1 — 完整 Intl vs 固定 token
**决策**：v1 固定 token 子集（`YYYY/MM/DD/HH/mm/ss`）。完整 locale-aware 留后续，避免 v1 膨胀。

---

## 12. 实现计划入口

复审通过后撰写：`docs/superpowers/plans/2026-06-10-novasheet-phase-5-c-value-formatting.md`

任务骨架（一 task 一 commit，TDD 红先行）：

1. `ValueFormat` 类型 + `CellFormat.valueFormat` + `Field.format`（kernel，type-only `tsc` 验失败）
2. `formatValue` + 4 内置 descriptor（kernel TDD，每 kind 红→绿）
3. `CellFormatter`/`FormatContext` + 注册表解析 + custom fallback/warn（kernel TDD）
4. `FrameAssembler.formatCell` 闭包（engine TDD）
5. `CellPainter` swap + `CellPaintParams` 透传（canvas2d TDD，RecordingContext）
6. `Grid.setValueFormat` + `GridOptions.formatters/locale` + undo（features/format TDD，复用 5-A）
7. 可选 excel L3 场景 + manifest（Phase 0 主战场）
8. 里程碑收尾 code-reviewer
