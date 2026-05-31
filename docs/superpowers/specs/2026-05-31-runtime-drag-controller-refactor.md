# WebGridRuntime 拖拽重构 — DragController（R1 / 架构 review A）

- **Date**: 2026-05-31
- **Status**: 设计待确认 → plan
- **类型**: 重构（不加功能、不改行为）
- **依据**: `docs/architecture-review-2026-05-31.md` R1（god object）；`WebGridRuntime` 2736 行是最大的 god object。
- **范围**: P1 = 把 4 个「表头/host-pointer 系」拖拽抽成 `Drag` 状态机 + 统一派发；P2（选区/填充柄/resize）后续。

---

## 1. 动机 / 受益

把分散在 2736 行里的拖拽状态机收成「一个拖拽 = 一个内聚类」，统一派发。

**核心受益（可量化）**：今天加一个新拖拽要动 **~7 处**散点——
1. 加 `private xxxDrag` 字段；2. `tryHandleXxxPointerDown` + 接 `handleHostPointerDown`；
3. `updateXxxDrag` + 接 `handleHostPointerMove` 的 if 链；4. `commitXxxDrag`/`cancelXxxDrag` + 接 `handleHostPointerUp`；
5. 改 `activeAutoScrollDrag()`；6. 改 `reevaluateDragAfterAutoScroll`；7. `handleKeyDown` Escape。

漏改 5/6 → 新拖拽的边缘自动滚动失效（本会话加自动滚动时逐个接 6 个拖拽即此类痛）。

**重构后**：写 `class XxxDrag implements Drag` + 注册一行；派发循环与自动滚动 tick **自动认它**。**~7 处散点 → 1 类 + 1 行**。

**非受益（诚实）**：不加功能、不修当前 bug；红利从「下一个拖拽起」摊销，首次（重构本身）反而动更多代码；交互重构有回归风险。

---

## 2. 现状

| 拖拽 | 状态字段 | 入口 | 模型 | P1? |
|------|---------|------|------|-----|
| 列 reorder | `columnReorderDrag` | 表头 pointerdown | host pointer | ✅ |
| 行 reorder | `rowReorderDrag` | 行表头 pointerdown | host pointer | ✅ |
| 列表头拖选 | `columnHeaderSelectDrag` | 表头 pointerdown | host pointer | ✅ |
| 行表头拖选 | `rowHeaderSelectDrag` | 行表头 pointerdown | host pointer | ✅ |
| 选区拖选 | `draggingSelection` | body + move 兜底 | host（fall-through） | ❌ P2 |
| 填充柄 | `fillDrag` | `handleFillPointer*` | 独立 DOM 层 | ❌ P2 |
| resize | `resizeDrag` | DOM handle 层 | 独立 DOM 层 | ❌ P2 |

派发：`handleHostPointerMove` 一串 `if (updateXxx(e)) return`；`handleHostPointerUp` 按字段 commit/cancel；自动滚动 `activeAutoScrollDrag()` 挨个 inspect 全部字段，`reevaluateDragAfterAutoScroll` 挨个 dispatch。

---

## 3. 目标设计

### 3.1 `Drag` 接口

```ts
export interface Drag {
  /** pointerdown 尝试起拖；消费事件返回 true。 */
  tryStart(event: WebPointerEvent): boolean
  /** pointermove；正在拖返回 true（消费，阻断后续派发）。 */
  move(event: WebPointerEvent): boolean
  /** pointerup 提交。 */
  commit(): void
  /** Escape / 中断取消。 */
  cancel(): void
  /** 是否处于活跃拖拽（越过阈值）。 */
  readonly active: boolean
  /** 边缘自动滚动轴向；null 表示不自动滚动。 */
  readonly autoScrollAxis: 'both' | 'horizontal' | 'vertical' | null
  /** 自动滚动一帧后按新 pointer 重算落点。 */
  reevaluate(pointer: WebPointerEvent): void
}
```

### 3.2 `DragContext`（共享依赖，构造时注入每个 Drag）

```ts
export interface DragContext {
  readonly engine: GridEngine
  readonly host: WebHost
  refresh(): void
  paintSync(): void
  afterEngineMutation(): void
  // 各 drag 按需取自己的 overlay（columnReorderOverlay / rowReorderOverlay）
  readonly columnReorderOverlay?: ColumnReorderOverlay
  readonly rowReorderOverlay?: RowReorderOverlay
}
```

### 3.3 runtime 派发（P1 后）

```ts
private drags: Drag[] = [columnReorder, rowReorder, columnHeaderSelect, rowHeaderSelect]
private activeDrag: Drag | null = null

handleHostPointerDown(e) {
  for (const d of this.drags) if (d.tryStart(e)) { this.activeDrag = d; return }
  /* …落到既有 selection/cell 逻辑（P1 不动）… */
}
handleHostPointerMove(e) {
  if (this.activeDrag?.move(e)) return
  /* …既有 header-select fall-through 之后的 selection 逻辑… */
}
handleHostPointerUp() {
  if (this.activeDrag) { this.activeDrag.commit(); this.activeDrag = null; return }
  /* …既有 selection 收尾… */
}
```

自动滚动：`activeAutoScrollDrag()` 先看 `this.activeDrag?.autoScrollAxis`，无则回退既有 `draggingSelection/fillDrag` 判断（P1 过渡态）；tick 的 reevaluate → `this.activeDrag.reevaluate(pointer)`。

---

## 4. 迁移计划（P1，每任务一 commit、每步全绿）

> 顺序：先立接口 + 抽 1 个样板（列 reorder）跑通含自动滚动，再逐个迁，最后清理派发。

- **T1 — 立 `Drag` / `DragContext` + 抽列 reorder 样板**
  - 新 `interaction/drag/Drag.ts`（接口）、`interaction/drag/ColumnReorderDrag.ts`。
  - 搬 `columnReorderDrag` 状态 + `tryHandleColumnHeaderPointerDown` 的列分支 + `updateColumnReorderDrag` + `commit/cancelColumnReorderDrag` + `computeColumnReorderTarget`。
  - runtime 持有 `activeDrag`，down/move/up 先走它；自动滚动接 `autoScrollAxis='horizontal'` + `reevaluate`。
  - 跑 `WebGridRuntime.col-reorder.test.ts` + auto-scroll 测试保绿。

- **T2 — 抽行 reorder**（`RowReorderDrag`，`autoScrollAxis='vertical'`）。跑 row-reorder 测试。

- **T3 — 抽列表头拖选**（`ColumnHeaderSelectDrag`，横向）。

- **T4 — 抽行表头拖选**（`RowHeaderSelectDrag`，纵向）。

- **T5 — 清理派发 + 自动滚动**
  - `handleHostPointerMove/Up` 的 4 段 if 链 → `activeDrag` 单点。
  - `activeAutoScrollDrag` / `reevaluateDragAfterAutoScroll` 去掉对 4 个旧字段的 inspect，仅保留 `activeDrag` + 未迁的 selection/fill 过渡分支。
  - `handleKeyDown` Escape → `activeDrag?.cancel()`。

P1 完成后：4 个表头系拖拽各自内聚成类；runtime 拖拽派发收敛为多态。预计削数百行。

---

## 5. 硬点 / 风险

1. **自动滚动过渡态**：P1 期间「4 个已抽 + selection/fill 未抽」并存，`activeAutoScrollDrag` 要同时认 `activeDrag` 与旧字段——过渡丑，P2 完成后干净。
2. **填充柄/resize 不套 `tryStart(hostEvent)`**：独立 DOM 层驱动、签名不同（`handleFillPointer(pointerId,x,y)`）→ P2 单独处理（可能 `Drag` 留一个 pointer-capture 变体）。
3. **选区是兜底而非抢占**：P1 不动 selection；派发顺序「4 个 drag 优先，未消费再走 selection」与现状一致。
4. **交互回归**：拖拽 happy-dom 测不了真实指针。回归网 = 既有 col/row-reorder + drag-auto-scroll 的 mock host/engine + raf-stub 测试（本会话补强过）。每个任务必须保这些绿。
5. **`lastDragPointer` 归属**：现为 runtime 共享字段（自动滚动用）。P1 期间保留在 runtime（各 drag 的 reevaluate 由 runtime 传 pointer）；P2 收尾再定是否下沉。

---

## 6. 不在本切片

- P2：选区拖拽、填充柄、resize 的 Drag 化（各 bespoke）。
- 不改任何拖拽的**行为**（纯结构重构）。
- 不动引擎侧（R1 引擎协调器已判定边际递减，不做）。

---

## 7. 验收

- 四道门全绿；既有 reorder + auto-scroll 测试零改动通过（行为不变的证据）。
- runtime 行数显著下降；新增 4 个 `*Drag` 类各带（或复用既有）测试。
- 完成后更新架构 review 文档的 R1 状态。
