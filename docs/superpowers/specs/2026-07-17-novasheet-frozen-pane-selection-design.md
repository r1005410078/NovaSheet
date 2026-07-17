# NovaSheet 冻结窗格选择语义设计

- **日期**：2026-07-17
- **状态**：已实现
- **分支**：`main`
- **范围**：Core 选择命中策略、DOM runtime、React props 转发；不改 Canvas2D 绘制协议或业务数据模型

## 1. 问题

冻结列通常承载行标识，冻结行通常承载列标识。某些矩阵、监控表和交叉表希望把这些窗格用作行/列选择器：点击左冻结窗格的任一数据格选中整行，点击顶部冻结窗格的任一数据格选中整列。

不能把该行为绑定到 `pointName` 等业务字段，也不能让冻结自动改变默认单元格选择语义：冻结仅是布局，用户仍可能冻结普通可编辑数据。

冻结行与冻结列的交集（`topLeft` / `topRight`）是一个真实的数据矩形，不是电子表格中单一的左上角表头按钮。因此它不能在一次点击中同时触发行选择和列选择。

## 2. 目标

1. 调用方可按冻结窗格边界显式启用行或列选择，无业务字段、行号或数据值耦合。
2. 默认行为保持当前语义：所有冻结数据格仍按普通单元格选择。
3. 左/右冻结窗格可配置为整行选择；顶部冻结窗格可配置为整列选择。
4. 交叉数据区有唯一、显式的选择意图；默认仍为单元格选择。
5. Excel 行头与列表头的非数据交叉角可作为标准的全表选择入口，但仅在调用方启用时生效，避免改变已有自定义角标点击语义。
6. 单击、Shift 扩选和拖拽均保持同一选择轴；普通区域、单元格 action、编辑和 resize 行为不回归。
7. `Grid`、`NovaSheetGrid` 与 `NovaExcel` 均能声明该构造期配置，且 React 不把它泄漏为 DOM attribute。

## 3. 非目标

| 非目标 | 原因 |
| --- | --- |
| 按业务字段或数据值决定选择行为 | 会让排序、重排和业务 schema 影响基础交互语义 |
| 将“第 N 行/列”作为选择器配置 | view index 会随排序、筛选变化，不是稳定通用契约 |
| 默认把冻结数据格变成选择器 | 破坏冻结可编辑列/行的既有单元格选择语义 |
| 多段非连续选择 | 当前 `GridSelection` 只表达一个连续矩形，本次不扩张数据模型 |
| 新增 Canvas hover、图标或主题 token | 本次只改变选择命中和已有选区绘制；视觉 affordance 后续独立设计 |
| 把 `点号名称` 迁移为业务数据列 | 这是调用方的数据/schema 改造，可在使用该组件时独立完成 |

## 4. 公开 API

新增纯配置类型，名称强调它是**选择行为**而非冻结配置：

```ts
export interface FrozenPaneSelectionBehavior {
  /** 左冻结数据窗格；缺省为 cell。 */
  readonly left?: 'cell' | 'row'
  /** 右冻结数据窗格；缺省为 cell。 */
  readonly right?: 'cell' | 'row'
  /** 顶部冻结数据窗格；缺省为 cell。 */
  readonly top?: 'cell' | 'column'
  /** 顶部 × 左冻结的真实数据交叉区；缺省为 cell。 */
  readonly topLeft?: 'cell' | 'row' | 'column'
  /** 顶部 × 右冻结的真实数据交叉区；缺省为 cell。 */
  readonly topRight?: 'cell' | 'row' | 'column'
}

export interface GridSelectionBehavior {
  readonly frozenPanes?: FrozenPaneSelectionBehavior
  /** 行头与列表头的非数据角块；缺省 none。 */
  readonly headerCorner?: 'none' | 'all'
}

export interface GridOptions {
  readonly selectionBehavior?: GridSelectionBehavior
}
```

示例：将左冻结窗格视为行标签、顶部冻结窗格视为列标签；交集仍可选单元格。

```ts
new Grid(container, {
  data,
  frozen: { leftCols: 1, topRows: 1 },
  selectionBehavior: {
    frozenPanes: {
      left: 'row',
      top: 'column',
      topLeft: 'cell',
    },
    headerCorner: 'all',
  },
  backend,
})
```

`selectionBehavior` 与当前 `interactions` 一样是构造期配置；变更它需 remount。后续若出现运行时切换真实用例，再单独增加 setter，不在本次预置 API。

## 5. 命中与选择规则

### 5.1 选择意图

命中链路收敛成一次纯解析，任何 pointer 起点只产生一个结果：

```text
pointer point
  -> header corner / RenderRegion 命中
  -> resolveSelectionIntent(frame, point, selectionBehavior)
  -> cell | row | column | all | none
  -> SelectionDrag 固化该 intent，完成 click / Shift / drag
```

`RenderRegion` 是唯一的冻结分区真相，按其 `rowBand` / `colBand` 归类：

| Render region | 配置键 | 可选 intent | 缺省 |
| --- | --- | --- | --- |
| `middleLeft` | `left` | `cell` / `row` | `cell` |
| `middleRight` | `right` | `cell` / `row` | `cell` |
| `topCenter` | `top` | `cell` / `column` | `cell` |
| `topLeft` | `topLeft` | `cell` / `row` / `column` | `cell` |
| `topRight` | `topRight` | `cell` / `row` / `column` | `cell` |
| `main` | — | `cell` | `cell` |

表头左上角角块 rect = `rowHeaderWidth × viewport.headerHeight`（总高，含列组表头层；有 `columnGroups` 时角块随总高变高）。仅在两者均 > 0、pointer 位于该 rect 内且 `headerCorner: 'all'` 时返回 `all`。它不同于 `topLeft`：前者没有数据单元格，后者是冻结数据区。

resolver 的求值域封闭：仅对 header corner 命中与数据 region 命中求值。corner 命中且 `headerCorner: 'none'` 时返回 `none`（点击被吞掉、无选择动作，即现状）；非 corner 的表头带与空白区不进入 resolver，交回 §5.2 既有链路。`none` 只有这一个来源。

### 5.2 Pointer 优先级

既有高优先级交互保持不变；只有它们未消费事件时才解析选择意图：

1. resize / fill DOM handle；
2. renderer `CellActionHit`；
3. 列头菜单与列组表头；
4. 列头、行头拖拽/选择；
5. 冻结窗格或表头角块的选择意图；
6. 普通单元格选择。

因此，冻结窗格内的按钮仍执行 button action，而不会被整行/整列选择吞掉。

### 5.3 手势

| intent | 单击 | Shift+单击 / 拖拽 |
| --- | --- | --- |
| `cell` | 现有单元格选择 | 现有矩形扩选 |
| `row` | 当前行的全列范围 | anchor 行到命中行的连续全行范围 |
| `column` | 当前列的全行范围 | anchor 列到命中列的连续整列范围 |
| `all` | 全部 view 行 × 全部 view 列 | 不启动拖拽；保持全表选区 |
| `none` | no-op | no-op |

拖拽起点决定意图；拖入其它窗格时不切换轴。`activeCell`、`anchorCell`、`extentCell` 与 `selectedRange` 继续使用现有连续矩形表达，无需新选择状态。

### 5.4 activeCell、编辑与键盘

- `row` / `column` intent 的选区构造与 `activeCell` 锚定与现有 `InputController.selectWholeRowRange()` / `selectWholeColumnRange()` 完全一致：`row` 的 activeCell 在行首（col 0），`column` 的在列首（row 0）。
- 选择器窗格不禁用编辑：双击、F2、type-to-edit 仍按现有编辑入口作用于 activeCell。只读是独立关切（全局只读开关见 backlog），本设计不越界。
- 行/列选中后的方向键与 Shift+方向键行为与现有行头/列头选择后一致；本设计不新增键盘语义。

## 6. 架构

### 6.1 Kernel interaction

在 `kernel/interaction/` 增加纯类型与 resolver。现有 `hitTestCell()` 扩展为可返回命中的 `RenderRegion` 的内部/伴随 API，避免 resolver 复制 `FrozenRegions` 的坐标和 z-index 逻辑。

`resolveSelectionIntent()` 只读取 `RenderFrame`、point 和归一化配置；不读取 `GridEngine`、DOM 或业务数据。它返回带 view 坐标的意图：

```ts
type SelectionIntent =
  | { readonly kind: 'cell'; readonly cell: CellAddress }
  | { readonly kind: 'row'; readonly rowIndex: number }
  | { readonly kind: 'column'; readonly colIndex: number }
  | { readonly kind: 'all' }
  | { readonly kind: 'none' }
```

### 6.2 DOM runtime

`SelectionDrag` 由当前的 `dragging` 布尔状态升级为“已锁定的 selection intent + anchor”。它通过现有 `GridEngine.setSelection()` 写入全行/全列矩形，普通 cell 仍使用 `selectCell()`，保留合并格吸附。

`DragCoordinator` 向 `SelectionDrag` 注入行、列、全表选择 helper；行头与列头继续复用当前 `InputController.selectWholeRowRange()` / `selectWholeColumnRange()`，防止两处构造 `GridSelection` 漂移。

`GridRuntime` 在构造时归一化 `selectionBehavior`，并经 `DragCoordinator` 下传。该配置不进入 `DefaultGridEngine`、`RenderFrame` 或 Canvas2DRenderer。

### 6.3 Public facade 与 React

`GridOptions` 把 `selectionBehavior` 传给 `GridControllerImpl`，再传入 `GridRuntime`。`NovaSheetGrid` 与 `useNovaSheetGrid` 必须显式解构、转发该 prop；`NovaExcel` 通过现有 props 继承自然支持。

## 7. 错误与边界

| 情况 | 行为 |
| --- | --- |
| 未冻结对应边 | 配置无命中，普通区保持 `cell` |
| 空行或空列 | `row` / `column` / `all` no-op，不产生非法范围；由复用的 `selectWhole*Range` 既有 guard 保证，无需另写防御 |
| 只冻结列、未冻结行 | 不存在 `topLeft` / `topRight`，只应用 `left` / `right` |
| 多个冻结行或列 | 整个对应窗格适用同一 intent；交集由 `topLeft` / `topRight` 单独决定 |
| 排序、筛选、列重排 | 行列选择使用命中时的 view index；不依赖业务字段或固定 index |
| 合并格 | `cell` 保留既有合并吸附；`row` / `column` 与现有行头/列头点击的合并格行为一致 |
| 自定义 cell action | action 优先，选择不执行 |
| header corner 有自定义文字 | 仅 `headerCorner: 'all'` 时点击全选；默认 `none` 保持旧行为 |

## 8. BDD 与 TDD

### 8.1 BDD 外环

新增 Core L2 场景 `core.L2.grid-frozen-pane-selection`：

- Given：`Grid` 配置左列、顶部行冻结，并启用 `left: 'row'`、`top: 'column'`、`topLeft: 'cell'`；
- When：用户分别点击左冻结区、顶部冻结区与其交叉数据区；
- Then：选区分别覆盖整行、整列与单元格，且 `onSelectionChange` 获得对应连续范围。

再覆盖 `headerCorner: 'all'`：点击非数据 header corner 后选中当前 view 的全行全列。

新增 React L3 场景 `excel.L3a.frozen-pane-selection-prop`：配置被传到 Grid 构造链，不落到宿主 DOM。

### 8.2 TDD 内环

| 层 | 失败测试先行 |
| --- | --- |
| Kernel | region-aware hit test 与各 region→intent 的纯 resolver；缺省和交叉区规则 |
| DOM drag | 单击、Shift、拖拽锁轴；起点跨窗格不切换轴；cell action 优先 |
| Runtime | 配置从 Grid facade 到 `SelectionDrag`，header corner `all` |
| React | `selectionBehavior` 转发且不成为 DOM attribute |
| Regression | 行头/列头选择、普通冻结格 cell 选择、合并格 cell 选择、空表 no-op、选择器窗格双击仍进编辑、行/列选中后键盘行为不回归 |

## 9. 兼容性

| 现有用法 | 结果 |
| --- | --- |
| 不传 `selectionBehavior` | 所有冻结数据格继续普通单元格选择 |
| 现有行头 / 列头 | 继续分别选择整行 / 整列 |
| 现有 `rowHeaderCornerLabel` | 点击仍无动作，除非显式 `headerCorner: 'all'` |
| 现有 `frozen` 动态变更 | 区域由当前 frame 解析；配置按边界自动适用或失效，无需重配 |
| Canvas2D / 未来后端 | 不依赖 Canvas 实现，只消费既有 `RenderFrame` 与 DOM input |

## 10. ADR

### ADR-A：按冻结边界配置，而不是 `fieldId` / row index

采纳边界配置。`fieldId` 会把基础组件耦合到业务 schema，row index 会在排序/筛选后漂移；`RenderRegion` 的 left/right/top 边界是当前可见布局的稳定语义。

另评估了通用表格常见的列级配置（如 `column.selectionRole`——组件 schema 层属性，非业务 fieldId 耦合，二者不应混同）：因列 reorder 跨冻结边界后的语义归属问题被**推迟而非否决**，与边界配置不互斥，出现真实用例时可叠加。

### ADR-B：交集使用独立配置，而不是叠加两个规则

采纳独立的 `topLeft` / `topRight`。叠加会令一次点击同时产生行与列意图，当前连续矩形选择模型无法表达且用户不可预测。缺省 `cell` 保留真实数据格能力。

### ADR-C：表头角块 opt-in 全选，而非默认启用

采纳 `headerCorner: 'none'` 缺省。组件已有 `rowHeaderCornerLabel` 自定义文字能力；默认增加点击全选会改变已有使用方的交互。需要 Sheets/Excel 行为时显式声明 `all`。

### ADR-D：不把配置放进 `interactions`

`interactions` 是 menu/resize/reorder 的开关；本功能定义的是命中后的选择**语义**，应该独立为 `selectionBehavior`，避免 `interactions` 成为无关策略的杂项容器。

### ADR-E：未冻结对应边时配置静默失效，而非 fail-loud

采纳静默失效。`setFrozen` 支持运行时变更，配置按当前 frame 边界自动适用或失效（§9）；若 fail-loud，每次 `setFrozen` 都可能把原本合法的配置变成错误。与 column groups 的 fail-loud 校验文化差异是有意为之：组树是静态结构契约，冻结边界是动态布局状态。

## 11. 实现切片

1. 写 L2/L3 场景并验证 manifest，建立外环红灯。
2. 为 `RenderRegion` 命中补纯 resolver 和 kernel 单测。
3. 将 `SelectionDrag` 改为 intent 状态机，复用整行/整列 helper，完成 DOM/runtime TDD。
4. 在 `Grid` / controller / React 接线 `selectionBehavior`，补 prop 泄漏回归。
5. 运行场景覆盖、定向测试、四门验证与代码审查。
