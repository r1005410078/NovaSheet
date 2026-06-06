# Engine Composer 第二阶段 — 设计

- **日期**：2026-06-07
- **状态**：设计（**已确认**，2026-06-07）
- **分支**：`refactor-default-grid-engine-decomposition`（延续 decomposition 分支；**暂不合 `main`**）
- **前置**：Engine 重构 7 步 ✅（kernel/features 三层、`DefaultFormatState` 等）；`DefaultGridEngine` ~1118 行
- **相关**：`packages/core/src/engine/README.md`、`docs/architecture-review-2026-05-31.md` §R1–R3

---

## 1. 背景

| 现状 | 问题 |
| --- | --- |
| 7 步 plan 已完成：域状态、写入门面（format/selection）、undo 派发、事件 remap 已收口 | **不是**「features 没拆完」，而是 composer **编排层**仍厚 |
| `insertRows`/`deleteRows`/…/`moveCols` 等 ~10 个方法 | 重复模板：`selectionBefore` + 可选 `format/merge/frozen` 快照 → `command.execute` → `layout.rebuild*` → `undoStack.push`（~25–40 行/方法，合计 ~350 行） |
| `beginCellEdit`/`commitCellEdit`/`clearRange` | 算法在 `features/edit`，**编排 + undo 入栈**仍在 engine（无 `EditController`） |
| `commitPaste`/`commitFill` | `applyPaste`/`computeFillWrites` 在 features，**merge 守卫 + view↔raw + undo** 仍在 engine |
| `getFrame` ~50 行 | 合理但可抽 `FrameAssembler` 纯函数，engine 只 delegate |

**决策前提（与 architecture-review 一致）**

- **不做**脱离功能的大 bang 拆分（不引入 `FormatCoordinator`/`MergeCoordinator` 等泛化 mixin 全家桶）。
- **做** 3 个可独立 merge、零行为变化的 composer 收口 slice；每个 slice 单独 spec 子节 + 后续 plan task + commit。
- 目标：**调用链更清晰 + engine 行数可控下降**，不是追求「engine 只剩 200 行」。

---

## 2. 目标 / 非目标

### 目标

1. 消除行/列结构 mutation 的 **重复 undo 编排模板**（最大 fat 块）。
2. 为 **edit / paste / fill** 建立与 `FormatController` 同形的 **写入门面**，engine 仅 `finishActiveEdit()` + 一行 delegate。
3. （可选 slice）`getFrame` 装配抽到 `FrameAssembler`，engine 保留 `getFrame(): RenderFrame` 入口。
4. 全程 **零行为变化**：`bun test` 全绿；`GridEngine` 公共 API 不变；undo kind / payload 不变。

### 非目标

- 不改 row/column **聚合根** 或 `*CommandHandler` 语义；不新增 `GridDomainEvent` kind。
- 不迁移 `ViewPipeline`/sort/filter（已在 web/runtime，归属正确）。
- 不把 `CoordinateSpace` 并入 layout 或 format（另议）。
- 不拆 `UndoCommand` union 文件（可选后续，与本阶段正交）。
- 不把结构 undo 的 **restore 逻辑** 从现有 `RowStructureUndoHandler`/`ColumnStructureUndoHandler` 迁回 engine（M4 已完成）。

---

## 3. 交付切片（推荐顺序）

| Slice | 名称 | 预估 engine −行 | 依赖 | 可独立 merge |
| --- | --- | --- | --- | --- |
| **2-A** | 结构 mutation 复合 undo 协调器 | ~280–320 | 无 | ✅ |
| **2-B** | `EditController` 写入门面 | ~60–80 | 无 | ✅ |
| **2-C** | `PasteController` + `FillController` | ~90–110 | 无 | ✅ |
| **2-D** | `FrameAssembler`（可选） | ~45–55 | 无 | ✅ |

**推荐顺序：2-A → 2-B → 2-C → 2-D**。2-A 收益最大；2-B/2-C 互不依赖；2-D 纯可读性，可跳过或最后做。

**Phase 2 完成后 engine 形态（估）**：~650–750 行（constructor/undo 注册 ~100 + 薄 facade ~200 + wiring ~150 + 剩余跨域 glue ~200）。

---

## 4. Slice 2-A：结构 mutation 复合 undo 协调器

### 4.1 问题

下列 engine 方法共享同一骨架，仅 **command 类型、rebuild 轴、undo payload、是否含 format/merge/frozen 快照** 不同：

- Row：`insertRows`、`deleteRows`、`moveRows`（含 format/merge）；`hideRows`、`unhideRows`、`setRowHeights`（无 format）
- Col：`insertCols`、`deleteCols`、`moveCols`（含 format/merge + frozen）；`hideCols`、`unhideCols`、`setColumnWidths`（无 format 或仅 selection）

### 4.2 模块

**路径**：`packages/core/src/engine/StructuralMutationCoordinator.ts`（**composer 层**，不放 `features/`，因跨 row/column/layout/format/selection/undo）。

```typescript
/** 协调器注入：只暴露 composer 已有能力，禁止传入完整 engine。 */
export interface StructuralMutationContext {
  getSelection(): GridSelection
  pushUndo(command: UndoCommand): void
  rebuildRows(): void   // () => layout.rebuildRows(rowStructure.getViewRowsAxis())
  rebuildCols(): void
  snapshotFormatMerge(): { formatBefore: FormatLayer[]; mergeBefore: MergeRegion[] }
  getFrozenConfig(): FrozenConfig
  remapFrozenAfterColInsert(at: number, count: number, oldTotalCols: number): void
  // deleteCols 专用：remapFrozenAfterColDelete — 由 engine 在 execute 前/后按现序内联或注入 callback
}

export class StructuralMutationCoordinator {
  constructor(private readonly ctx: StructuralMutationContext) {}

  /** 执行 command；null → 早退 false/[]；否则 rebuild + push undo + 返回 event。 */
  runRowStructural<TEvent>(params: RowStructuralRun<TEvent>): ... 
  runColStructural<TEvent>(params: ColStructuralRun<TEvent>): ...
}
```

**设计选择（ADR）**

| 选项 | 结论 |
| --- | --- |
| 一个大 `switch(kind)` | ❌ 与 undo 拆解方向相反 |
| 每 operation 一个 `*Facade` 类 | ❌ 文件碎、仍重复 |
| **泛型 `run*Structural` + 声明式 params** | ✅ 推荐：params 含 `execute`、`rebuildAxis`、`undoKind`、`buildUndoPayload(event, snapshots)` |

**快照规则（须与现 engine 逐字一致）**

| mutation 类 | format/merge 快照 | frozen 快照 | rebuild |
| --- | --- | --- | --- |
| insert/delete/move row | before + after | — | rows |
| hide/unhide/resize rows multi | — | — | rows |
| insert/delete/move col | before + after | before + after（insert/delete/move 现逻辑） | cols + engine 侧 frozen remap |
| hide/unhide/resize cols multi | — | — | cols |

`moveRows`/`moveCols` 前置条件（`isMutableDataSource`、`getRowCount` 对齐、`finishActiveEdit`）**仍留 engine 方法入口**，协调器只包「execute 成功后」段。

### 4.3 `DefaultGridEngine` 调整后（示例）

```typescript
insertRows(beforeUnderlyingRow: number, count: number): readonly number[] {
  return this.structural.runRowStructural({
    execute: () => this.insertRowsCommand.execute({ kind: 'insertRows', at: beforeUnderlyingRow, count }),
    rebuild: 'rows',
    withFormatMerge: true,
    buildUndo: (event, sel, snap) => ({ kind: 'insertRows', at: event.at, ... snap, selectionBefore: sel.before, selectionAfter: sel.after }),
  }).newRowIds ?? []
}
```

### 4.4 测试

| 层 | 文件 | 覆盖 |
| --- | --- | --- |
| 协调器单测 | `tests/engine/StructuralMutationCoordinator.test.ts` | mock ctx：execute 返回 null 不入栈；withFormatMerge 快照 before/after 顺序；rebuild 被调用 |
| 回归 | 现有 `tests/engine/DefaultGridEngine.*structural*.test.ts` | 全绿即验收 |

---

## 5. Slice 2-B：`EditController` 写入门面

### 5.1 对称参照

`FormatController`：view→raw 翻译、store 写入、undo 入栈、选区联动。Edit 域无 domain event，同 **selection** 形（写入门面，非 `*CommandHandler`）。

### 5.2 模块

**路径**：`packages/core/src/features/edit/EditController.ts`

```typescript
export interface EditControllerContext {
  getData(): DataSource
  isMutable(): boolean
  resolveEditCell(cell: CellAddress): CellAddress | null  // merge anchor 解析，engine 注入 resolveViewMergeRegion
  viewRowToRaw(viewRow: number): number
  rawRowToView(rawRow: number): number
  pushUndo(command: UndoCommand): void
}

export class EditController {
  constructor(
    private readonly model: CellEditModel,
    private readonly ctx: EditControllerContext,
  ) {}

  beginCellEdit(cell: CellAddress): boolean
  updateDraft(draft: string): void
  cancel(): void
  commit(): boolean
  isEditing(): boolean
  clearRange(range: CellRange): void  // 现 clearRange 逻辑整体迁入
}
```

**engine 保留**：`cellEdit` 字段可改为 `private readonly edit = new EditController(new CellEditModel(), ctx)`；`getFrame` 仍读 `edit.getSession()`（或 `model` 经 controller 暴露）。

**不变量**

- `commit`：`parseCellEditInput` 非法 → `false`；undo `editCell` payload 仍用 **raw** `rowIndex`（`viewRowToRaw`）。
- `clearRange`：undo `clearRange` 的 `range` 仍为 **view** 坐标（与现一致）；`before` 条目用 raw rowIndex。

### 5.3 测试

| 层 | 文件 |
| --- | --- |
| 单测 | `tests/features/edit/EditController.test.ts`（merge anchor、commit undo、clearRange） |
| 回归 | `tests/engine/DefaultGridEngine.edit*.test.ts`、web runtime edit 测试 |

---

## 6. Slice 2-C：`PasteController` + `FillController`

### 6.1 模块

**Paste** — `packages/core/src/features/clipboard/PasteController.ts`

```typescript
export interface PasteControllerContext {
  isMutable(): boolean
  viewRangeToRaw(range: CellRange): RawRange | null
  getMergeSnapshot(): readonly MergeRegion[]
  getSchema(): Schema
  getData(): DataSource
  viewRowToRaw(viewRow: number): number
  pushUndo(command: UndoCommand): void
}

export class PasteController {
  commit(source, target, fieldIdsAtCols, onSkipped?): void
}
```

逻辑 = 现 `commitPaste` 整体下移；merge 冲突守卫、`applyPaste` 回调收集 before/after **不变**。

**Fill** — `packages/core/src/features/fill/FillController.ts`

```typescript
export interface FillControllerContext {
  isMutable(): boolean
  getData(): DataSource
  viewRowToRaw(viewRow: number): number
  pushUndo(command: UndoCommand): void
  propagateFillStyles(source, fill, direction): void  // 委托 FillStylePropagator
}

export class FillController {
  commit(source, fill, direction): FillCommitResult | null
}
```

逻辑 = 现 `commitFill`（`computeFillWrites` + 写 cell + `fillStyles.propagate` + format/merge 快照 undo）整体下移。

**engine**：`commitPaste`/`commitFill`/`getFillMergeSnap` 保留为 GridEngine API；`getFillMergeSnap` 可留 engine（10 行）或迁 fill 域 — **本 slice 非必须**。

### 6.2 测试

| 层 | 文件 |
| --- | --- |
| 单测 | `tests/features/clipboard/PasteController.test.ts`、`tests/features/fill/FillController.test.ts` |
| 回归 | `DefaultGridEngine.fill*.test.ts`、clipboard 相关 engine/web 测试 |

---

## 7. Slice 2-D（可选）：`FrameAssembler`

### 7.1 模块

**路径**：`packages/core/src/engine/FrameAssembler.ts`（纯函数 + 只读输入）

```typescript
export interface FrameAssemblerInput {
  data: DataSource
  theme: Theme
  layout: Pick<LayoutState, 'getRowsAxis' | 'getColsAxis' | 'getViewport'>
  rowStructure: Pick<DefaultRowStructure, 'getCollapsedGaps'>
  columnStructure: Pick<DefaultColumnStructure, 'getCollapsedColGaps'>
  frameFormat: VisibleFormatResolver
  selection: GridSelection
  cellEdit?: CellEditSession
}

export function assembleRenderFrame(input: FrameAssemblerInput): RenderFrame
```

`getFrame()` → `return assembleRenderFrame({ ... })`。

### 7.2 测试

- `tests/engine/FrameAssembler.test.ts`：collapsed gaps 像素偏移、visible range 裁剪、merge/format 字段透传。

---

## 8. Phase 2 完成后 engine 仍保留什么（有意）

| 职责 | 原因 |
| --- | --- |
| 构造：聚合根、command handler、event pipeline、undo 注册 | 组合根本职 |
| `rebuildData` / `setData` / `setViewData` | 跨 row+column+layout+selection 编排 |
| `finishActiveEdit` + 各 mutation 入口 guard | 跨 edit 与 mutation 的横切 |
| `applyMoveRowsCommand` / `applyMoveColsCommand`（undo redo 回放） | 与 pipeline double-remap + restore 文档化约定 |
| `restoreSelectionForWrites` / `applyEditCellWrite` | undo handler ctx 注入 |
| 薄 getter / `setTheme` / viewport mutator | GridEngine facade |

---

## 9. 测试与验收门禁

每个 slice 合并前：

```bash
bun test
bun run --filter '*' typecheck
bun run lint
```

**基线**：1031 pass / 0 fail（decomposition 分支当前）；不得回归。

**重点回归集**

| Slice | 重点 |
| --- | --- |
| 2-A | `DefaultGridEngine.format-merge-structural*.test.ts`、row/column structure undo |
| 2-B | edit、clearRange undo |
| 2-C | fill-styles、paste merge skip |
| 2-D | `getFrame` snapshot 测试（若有） |

---

## 10. 风险

| 风险 | 缓解 |
| --- | --- |
| 协调器抽象掩盖 insert/delete 细微差异（frozen remap 时序） | 2-A 先写 **characterization test** 拷现 engine 行为；plan 每 method 一行对照表 |
| Edit/Paste 迁移时 view/raw 混用 | 单测显式 assert undo payload 坐标空间 |
| 「抽太狠」导致 debug 栈变深 | 每 slice 独立 commit；协调器日志/方法名保留 operation 名 |
| 与 5-C number format 冲突 | 5-C 应接 `EditController.formatForEdit` 扩展点；2-B 先落地 raw edit，5-C 只加 display 管道 |

---

## 11. 文档收尾（每 slice 或 Phase 2 末）

- `engine/README.md`：增「Composer 第二阶段」表；删 stale「ColumnStructureContext 中间态」句；修正 FormatController undo 注释类 drift。
- `CLAUDE.md` Current state：Phase 2 slice 进度（可选，合并 slice 时更新）。
- `features/edit/README.md`、`clipboard/README.md`、`fill/README.md`（新建简短）：写入门面说明。

---

## 12. 自检（spec self-review）

| 检查 | 结果 |
| --- | --- |
| Placeholder scan | 无 TBD；slice 可选仅 2-D 标明 |
| 与 7 步 plan 关系 | 不重复 format/layout 聚合；补 composer 层 |
| 范围 | 4 slice 可拆 4 个 plan task / 4 commit |
| 行为不变 | 明确 undo payload、坐标空间、rebuild 顺序不变 |
| STOP 点 | 2-A 若某 col mutation frozen remap 无法纳入 params 而不改序 → **STOP+ASK**，勿 silent 改 |

---

## 13. 下一步

1. 用户评审本 spec。
2. 通过后 invoke **writing-plans** → `docs/superpowers/plans/2026-06-07-novasheet-engine-composer-phase-2.md`（每 slice 一 task，TDD + grep 门 + commit 中文说明）。
