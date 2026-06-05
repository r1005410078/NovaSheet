# Selection 聚合根内化设计（删除 SelectionModel 中间状态机）

- 日期：2026-06-05
- 状态：设计已确认，待 writing-plans
- 作者：rongtaosheng + Codex
- 前置：`docs/superpowers/specs/2026-06-05-selection-domain-remap-design.md`
- 关联代码：`packages/core/src/engine/selection/`

## 背景与问题

第 4 步已经把 selection remap 接入 `engine/selection/`，但当前状态所有权仍分裂：

```txt
DefaultGridEngine
  -> DefaultSelectionState
       -> interaction/SelectionModel
       -> engine/selection/SelectionRules
```

`DefaultSelectionState` 名义上是 selection 聚合根，但真正的 selection 状态
`activeCell / anchorCell / extentCell / selectedRange` 仍由 `interaction/SelectionModel`
持有。这与 row/column 终态不一致：row/column 聚合根都自持本领域状态，而不是包一层旧状态机。

另外，`SelectionNavigation.ts` 与 `SelectionModel.ts` 互相依赖，且都位于 `interaction/`。
对 selection 而言，`interaction/` 已不再是合适边界；selection 状态与导航规则应收敛到
`engine/selection/`。

## 目标

让 `DefaultSelectionState` 成为真正的 selection 聚合根：

- 直接持有 `GridSelection` 状态。
- 直接实现 `setSelection` 校验、`selectCell`、`clear`、`setSelectedRange`、insert/delete 行列 remap。
- 迁入 selection 类型与导航规则到 `engine/selection/`。
- 删除 `interaction/SelectionModel.ts` 与 `interaction/SelectionNavigation.ts`。
- 保持 `CellAddress` / `CellRange` / `GridSelection` / `SelectCellOptions` 等公共类型从
  `@novasheet/core` 可导入。

### 非目标

- 不迁移整个 `interaction/` 目录。
- 不迁移 `CellEdit.ts` / `CellEditModel.ts`；它们属于 edit 领域，后续可单独建 `engine/edit/`。
- 不迁移 `HitTest`、`CellLayout`、`HandleLayout`、`ContextMenuModel`、`scrollCellIntoView`。
- 不改变 selection 外部行为：矩形 selection、active/anchor/extent、键盘导航、结构 remap 语义保持。
- 不进入 undo replay 第 5 步。

## 现状关键事实（实现约束）

- `SelectionModel` 目前只在源码中由 `DefaultSelectionState` 直接实例化；其余直接实例化主要在 tests。
- `CellAddress` / `CellRange` / `GridSelection` / `SelectCellOptions` 被大量 core/web/canvas 代码引用；
  迁移必须通过 `SelectionTypes.ts` 稳定承接。
- `@novasheet/core` 当前公开导出 `SelectionModel`。CLAUDE.md 说明不在 `index.ts` 的符号才不是半稳定契约；
  因此删除 `SelectionModel` 导出属于 API 收缩，需要明确接受。推荐做法：不再导出 `SelectionModel` 类，
  只保留 selection 类型与 navigation 函数导出。
- `SelectionNavigation` 依赖 `SelectionNavigationTarget`（`getSelection` + `selectCell`），这正好可由
  `DefaultSelectionState` 实现。
- `DefaultSelectionState` 现已是 engine 内唯一 selection 领域入口，适合吸收旧状态机方法。

## 设计

### 目标模块

```txt
packages/core/src/engine/selection/
  SelectionTypes.ts
  DefaultSelectionState.ts
  SelectionState.ts
  SelectionRules.ts
  SelectionNavigation.ts
  SelectionEventHandler.ts
  README.md
```

| 文件 | 职责 |
| --- | --- |
| `SelectionTypes.ts` | `CellAddress` / `CellRange` / `GridSelection` / `SelectCellOptions`。 |
| `DefaultSelectionState.ts` | selection 聚合根；直接持有 `selection` 与 `visibleFieldIdsBefore`。 |
| `SelectionNavigation.ts` | 键盘导航 parse/apply 纯规则，只依赖 `SelectionTypes` 和 `SelectionNavigationTarget`。 |
| `SelectionRules.ts` | 结构变化后的 remap 纯算法。 |
| `SelectionState.ts` | 聚合根富接口 + event handler 窄接口。 |
| `SelectionEventHandler.ts` | 响应 row/column domain event。 |

### 状态所有权

迁移后：

```ts
const EMPTY_SELECTION: GridSelection = {
  activeCell: null,
  anchorCell: null,
  extentCell: null,
  selectedRange: null,
}

export class DefaultSelectionState implements SelectionState {
  private selection: GridSelection = EMPTY_SELECTION
  private visibleFieldIdsBefore: readonly string[] | null = null
}
```

`DefaultSelectionState` 直接承接旧 `SelectionModel` 的基础方法：

| 旧方法 | 新归属 |
| --- | --- |
| `getSelection` | `DefaultSelectionState` |
| `setSelection` | `DefaultSelectionState` |
| `selectCell` | `DefaultSelectionState` |
| `clear` | `DefaultSelectionState` |
| `setSelectedRange` | `DefaultSelectionState` |
| `navigate` | `DefaultSelectionState` 调 `applySelectionNavigation(this, ...)` |
| `remapAfterRowsInserted/Deleted` | `DefaultSelectionState` |
| `remapAfterColsInserted/Deleted` | `DefaultSelectionState` |

旧 `SelectionModel` 文件删除。

### 类型导出

`packages/core/src/index.ts` 改为：

```ts
export type {
  CellAddress,
  CellRange,
  GridSelection,
  SelectCellOptions,
} from './engine/selection/SelectionTypes'
export {
  applySelectionNavigation,
  parseSelectionNavigationKey,
} from './engine/selection/SelectionNavigation'
export type {
  GridIndexBounds,
  SelectionNavigationIntent,
  SelectionNavigationTarget,
} from './engine/selection/SelectionNavigation'
```

不再公开导出 `SelectionModel` 类。若必须保留兼容，可临时导出别名，但本设计推荐删除，保持聚合根唯一状态机。

### import 迁移规则

| 旧路径 | 新路径 |
| --- | --- |
| `../interaction/SelectionModel` type imports | `../engine/selection/SelectionTypes` |
| `../../interaction/SelectionModel` type imports | `../selection/SelectionTypes` 或相对新路径 |
| `../interaction/SelectionNavigation` | `../engine/selection/SelectionNavigation` |
| tests 中 `new SelectionModel()` | `new DefaultSelectionState()` |

`interaction/` 下仍保留的文件若需要 selection 类型，改为从 `../engine/selection/SelectionTypes`
导入。例如 `CellEditModel.ts`、`CellLayout.ts`、`ContextMenuModel.ts`、`HitTest.ts`。

## 错误处理与边界

- `setSelection` 的错误信息可保留旧前缀 `SelectionModel.setSelection`，也可改为
  `DefaultSelectionState.setSelection`。推荐改为后者，并同步测试。
- 空 selection 必须保持四个字段全为 `null`；非空 selection 必须有 active/anchor/extent/range 全量字段。
- `selectedRange` 必须等于 anchor/extent normalize 后的矩形。
- insert/delete 行列 remap 行为保持不变。
- navigation 行为保持不变：无 selection 从 `{ rowIndex: 0, colIndex: 0 }` 起步，Shift 使用 extent，Tab/Enter 与边界 clamp 不变。

## 测试策略

- 把 `packages/core/tests/interaction/SelectionModel.test.ts` 迁到
  `packages/core/tests/engine/selection/DefaultSelectionState.basic.test.ts`，断言聚合根基础状态机行为。
- 把 `packages/core/tests/interaction/SelectionModel.remap.test.ts` 迁到
  `packages/core/tests/engine/selection/DefaultSelectionState.remap.test.ts`。
- 把 `packages/core/tests/interaction/SelectionNavigation.test.ts` 迁到
  `packages/core/tests/engine/selection/SelectionNavigation.test.ts`，测试目标改用 `DefaultSelectionState`。
- 保留现有 `SelectionRules` / `SelectionEventHandler` / engine regression tests。
- 验收：
  - `rg "SelectionModel" packages/core/src packages/web/src packages/web-canvas2d/src apps` 无结果。
  - `rg "interaction/Selection" packages/core/src packages/web/src packages/web-canvas2d/src apps` 无结果。
  - `bun run lint`
  - `bun run --filter '*' typecheck`
  - `bun test`
  - `bun run --filter @novasheet/web build && bun run --filter @novasheet/web-canvas2d build && bun run --filter @novasheet/core build`

## 影响面汇总

- `engine/selection/DefaultSelectionState.ts` 会变大，但职责更聚焦：它成为唯一 selection 状态聚合根。
- `interaction/SelectionModel.ts` 和 `interaction/SelectionNavigation.ts` 删除，`interaction/` 目录只保留非 selection 交互工具。
- 多个 core 内部文件要更新 type import，但公共类型仍从 `@novasheet/core` 导出。
- 若外部消费者直接 import `SelectionModel`，会受影响；本仓库内公共 facade 不需要该类。

## 任务分解（writing-plans 细化）

1. 新建 `SelectionTypes.ts` 并迁移类型导入，保持行为不变。
2. 迁移 `SelectionNavigation.ts` 到 `engine/selection/`，更新调用点与测试。
3. 把 `SelectionModel` 状态与方法内化到 `DefaultSelectionState`，迁移基础/结构 remap 测试。
4. 删除 `interaction/SelectionModel.ts` 与旧 tests，更新 public barrel。
5. 更新 docs/spec/plan/README，跑四项 gate。

## Spec 自检

| 检查项 | 结果 |
| --- | --- |
| Placeholder scan | 无 `TBD` / `TODO` / 未决占位。 |
| Internal consistency | 目标结构、import 迁移、测试迁移与第 4 步 selection 领域化保持一致。 |
| Scope check | 只处理 selection 聚合根内化；不迁移 edit/context menu/hit test，不进入 undo replay。 |
| Ambiguity check | 明确删除 `SelectionModel` 类导出，保留 selection 类型与 navigation 函数导出。 |
