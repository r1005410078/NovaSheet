# Phase 4.3 — Fill Handle 设计

**日期:** 2026-05-21
**所属阶段:** Phase 4.3(剪贴板与结构操作 / 填充柄)
**前置:** Phase 3.1-3.5(选择 / 拖选 / 键盘 / resize / 编辑)、Phase 4.1(剪贴板)、Phase 4.2(Undo / Redo)

---

## 1. 目标与范围

提供 Sheets/Excel 风格的填充柄:选区右下角出现小手柄,用户拖拽后把当前选区填充到相邻目标区域。Phase 4.3 交付 **基础复制 + 序列外推**,不交付公式语义。

| 能力 | 是否交付 | 说明 |
| --- | --- | --- |
| 选区右下角 fill handle | 是 | DOM overlay,不在 canvas 上接 pointer |
| 向下 / 向右 / 向上 / 向左拖拽填充 | 是 | 只允许沿一个主方向扩展,与表格软件一致 |
| 拖拽目标区域预览 | 是 | 用 DOM overlay 框显示即将写入的 fill range |
| 单值复制 | 是 | 单格或单样本无法推导序列时复制 |
| 数字等差序列 | 是 | `1,2 -> 3,4`;单个数字默认复制 |
| 文本尾号序列 | 是 | `Item 1, Item 2 -> Item 3`;单个文本默认复制 |
| Date 按天差序列 | 是 | 两个 Date 可推导天差;单个 Date 默认复制 |
| checkbox / select / array / url / 普通文本复制 | 是 | 不做语义外推 |
| Undo / Redo | 是 | 一次拖拽提交为一条 undo 命令 |
| 公式引用外推 | 否 | 当前没有公式模型/解析器,避免假支持 |
| 非相邻区域填充 / Ctrl modifier 复制切换 | 否 | 后续增强 |
| 双击 fill handle 自动填充到数据末尾 | 否 | 后续增强 |

### 1.1 术语

- **source range:** 拖拽开始时的 `selectedRange`。
- **fill range:** 选区外、即将写入的新区域,不包含 source range。
- **preview range:** 拖拽中显示的目标区域;若拖回 source 内或没有新增格子,为空。
- **primary axis:** 拖拽主方向。水平拖拽使用列方向,垂直拖拽使用行方向。

---

## 2. 用户交互

### 2.1 手柄显示

- 当存在非空 `selectedRange`,且没有 cell edit / resize drag / selection drag / context menu open 时显示 fill handle。
- 手柄锚在选区右下角,大小 7x7 px,使用 `theme.colors.selectionBorder`。
- 手柄位于 DOM overlay 层,`pointer-events: auto`;其它 overlay 区域保持 `pointer-events: none`。
- source range 的右下角不可见时不显示手柄。冻结区和普通区都可能绘制同一个选区边界;DOM layer 只选择当前 frame 中可见的那个右下角位置。

### 2.2 拖拽状态机

```text
idle -> pointerdown(handle) -> dragging -> pointermove -> dragging
dragging -> pointerup/pointercancel -> idle(commit or cancel)
```

进入 `dragging`:

- 记录 `sourceRange`,pointerId,起始 pointer 坐标。
- 关闭 context menu。
- 若正在编辑,先 blur commit;提交失败则不进入拖拽。
- 取消普通 drag-select,避免两套选择状态机同时运行。

拖拽中:

- 根据 pointer 命中的 cell 计算 preview range。
- 若 pointer 落在 source range 内,preview 为空。
- 若水平和垂直都超出 source,按移动距离较大的轴决定主方向;另一轴保持 source 的跨度。
- 更新 DOM preview 框并请求重绘。
- 靠近容器边缘时复用 drag-select 的 auto-scroll 策略;滚动后重新 hit-test。

提交:

- preview 为空时取消。
- preview 非空时调用 `engine.commitFill(sourceRange, fillRange, direction)`。
- 提交后 selection 变成 source + fill 的联合矩形,active cell 保持 source 左上角。
- 发 `onFill` 事件,然后 `afterEngineMutation()`。

---

## 3. 填充目标计算

### 3.1 `computeFillTarget`

新增 core 纯函数:

```ts
export type FillDirection = 'down' | 'up' | 'right' | 'left'

export interface FillTarget {
  readonly source: CellRange
  readonly fill: CellRange
  readonly result: CellRange
  readonly direction: FillDirection
}

export function computeFillTarget(
  source: CellRange,
  hover: CellAddress,
  dims: { rowCount: number; colCount: number },
): FillTarget | null
```

规则:

- `hover` 在 source 内:返回 `null`。
- 向下:`hover.rowIndex > source.endRow`,fill 为 `{ startRow: source.endRow + 1, endRow: hover.rowIndex, startCol: source.startCol, endCol: source.endCol }`。
- 向上:`hover.rowIndex < source.startRow`,fill 为 `{ startRow: hover.rowIndex, endRow: source.startRow - 1, startCol: source.startCol, endCol: source.endCol }`。
- 向右:`hover.colIndex > source.endCol`,fill 为 `{ startRow: source.startRow, endRow: source.endRow, startCol: source.endCol + 1, endCol: hover.colIndex }`。
- 向左:`hover.colIndex < source.startCol`,fill 为 `{ startRow: source.startRow, endRow: source.endRow, startCol: hover.colIndex, endCol: source.startCol - 1 }`。
- 若同时越过行和列,比较 pointer/hover 相对 source 边界的距离;距离更大的一轴胜出。相等时垂直优先,匹配用户从右下角拖动时更常见的下拉填充。
- 所有坐标 clamp 到 `0..rowCount-1` / `0..colCount-1`;clamp 后没有新增格子则返回 `null`。

---

## 4. 填充值计算

### 4.1 `computeFillWrites`

新增 core 纯函数:

```ts
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

export function computeFillWrites(input: ComputeFillWritesInput): readonly FillWrite[]
```

该函数只读数据,不写入。engine 负责把 writes 应用到 `MutableDataSource`。

### 4.2 轴向样本

- 向下 / 向上:按列独立推导序列。每个目标 cell 使用同一列 source 样本。
- 向右 / 向左:按行独立推导序列。每个目标 cell 使用同行 source 样本。
- 多列向下填充时,每列各自推导;多行向右填充时,每行各自推导。

### 4.3 序列规则

推导优先级:

1. **number 等差:** source 在轴向上至少 2 个有限 number,且相邻差值稳定。向下/向右延续正方向;向上/向左反向延续。
2. **Date 等差天数:** source 在轴向上至少 2 个有效 Date,相邻毫秒差稳定。按毫秒差延续,常见日期表现为按天填充。
3. **文本尾号:** source 在轴向上至少 2 个 string,且每个值都匹配同一前缀/后缀与尾部整数,整数差值稳定。例如 `Q1`, `Q2`;`Item 001`, `Item 002`。保留数字宽度。
4. **复制:** 任一规则不匹配时,按 source pattern 循环复制。

单个样本永远复制,不猜测 `1 -> 2` 或 `Item 1 -> Item 2`。这避免用户只想复制编号时被意外改写。未来可用 modifier 或设置切换。

### 4.4 类型边界

- number 字段只写 number 或 null;文本序列不会写入 number 字段。
- date 字段只写 Date 或 null;非 Date 字符串不做日期解析。
- checkbox 字段复制 boolean/null。
- array、select、url、普通文本都走复制,除非值本身符合文本尾号序列且字段类型不是 number/date/checkbox。
- 如果 source 中含 `undefined`(异步未加载),按 `null` 处理,但不推导序列。

---

## 5. Engine 与 Undo 集成

### 5.1 UndoCommand 扩展

```ts
export type UndoCommand =
  | { kind: 'editCell'; rowIndex: number; fieldId: string; before: CellValue; after: CellValue }
  | { kind: 'clearRange'; range: CellRange; before: ReadonlyArray<CellWrite> }
  | { kind: 'paste'; target: CellRange; before: ReadonlyArray<CellWrite>; after: ReadonlyArray<CellWrite> }
  | { kind: 'resizeRow'; rowIndex: number; before: number; after: number }
  | { kind: 'resizeColumn'; colIndex: number; before: number; after: number }
  | {
      kind: 'fill'
      source: CellRange
      fill: CellRange
      result: CellRange
      before: ReadonlyArray<CellWrite>
      after: ReadonlyArray<CellWrite>
    }
```

`before` 与 `after` 只包含实际写入的 fill range cell,不包含 source range。

### 5.2 GridEngine API

```ts
commitFill(source: CellRange, fill: CellRange, direction: FillDirection): FillCommitResult | null
```

```ts
export interface FillCommitResult {
  readonly source: CellRange
  readonly fill: CellRange
  readonly result: CellRange
  readonly writes: readonly CellWrite[]
}
```

行为:

- 非 `MutableDataSource`:返回 `null`,不 push undo。
- `computeFillWrites()` 返回空:返回 `null`,不 push undo。
- 写入前收集 `before`,写入后 push `fill` command。
- 提交后 selection 设为 `result`,active/anchor 为 `source.startRow/startCol`,extent 为 `result.endRow/endCol`。向上/向左时 result 归一化后仍是联合矩形。

### 5.3 Undo / Redo

- undo `fill`:遍历 `before` 恢复 fill range;selection 还原为 `source`。
- redo `fill`:遍历 `after` 写回;selection 设为 `result`。
- 内部直接调用 `data.updateCell`,不经过 `commitFill`,避免递归 push。

---

## 6. Web 层接入

### 6.1 DOM Fill Handle Layer

新增 `DomFillHandleLayer`:

- attach/destroy 生命周期与 `DomHandleLayer` 类似。
- `sync(handleRect | null)` 更新手柄位置。
- `showPreview(rangeRects)` / `hidePreview()` 显示拖拽预览。冻结区下同一个 range 可能被拆成多个 visible rect,layer 接收 rect 数组。
- callbacks:`onFillPointerDown/Move/Up`。

手柄层与 resize handle 同级,但 z-index 高于 resize handles。resize handles 位于表头/行头边界;fill handle 位于 body selection 角落,命中区不会冲突。

### 6.2 Runtime 状态

新增状态:

```ts
private fillDrag: {
  pointerId: number
  source: CellRange
  target: FillTarget | null
  lastPointer: WebPointerEvent | null
} | null
```

新增方法:

- `handleFillPointerDown(pointerId, clientX, clientY)`
- `handleFillPointerMove(pointerId, clientX, clientY)`
- `handleFillPointerUp(pointerId)`

`invalidate()` / `paintSync()` 后同步 fill handle 位置。cell edit、resize drag、drag selection、context menu open 时隐藏。

### 6.3 Range Rect 计算

core 已有 `computeCellRect(frame, cell)` 可计算单格。web 新增 `computeRangeRects(frame, range)`:

- 遍历 viewport regions,求 range 与 region 的交集。
- 对每个交集生成 DOM rect。
- 用于 fill handle 锚点和 preview 框。

该函数放在 `@novasheet/web` runtime/interaction 层,因为它输出 DOM overlay rect,不属于 core 数据逻辑。

### 6.4 事件与公共 API

新增事件:

```ts
export type FillEvent = {
  source: CellRange
  fill: CellRange
  result: CellRange
  direction: FillDirection
}

grid.onFill(handler: (e: FillEvent) => void): () => void
```

事件在成功 commit 后触发。没有写入(非 mutable、目标为空、全跳过)不触发。

---

## 7. 测试计划

### 7.1 Core 单元测试

`packages/core/tests/fill/FillTarget.test.ts`

- hover 在 source 内返回 null。
- 向下/上/右/左目标计算正确。
- 同时越过行列时主轴选择正确。
- 边界 clamp 后无新增格子返回 null。

`packages/core/tests/fill/FillSeries.test.ts`

- 单值复制。
- 数字等差向下/向右/向上/向左。
- 文本尾号保留宽度。
- Date 按差值延续。
- 混合类型 / 非稳定差值回退复制。
- 多列向下、多行向右各自独立推导。

`packages/core/tests/engine/DefaultGridEngine.fill.test.ts`

- `commitFill` 写入 fill range 且不改 source。
- 成功 commit push 一条 undo;undo 恢复;redo 写回。
- 非 mutable 不写入不 push。
- selection commit/undo/redo 恢复符合 §5。

### 7.2 Web 单元测试

`packages/web/tests/interaction/DomFillHandleLayer.test.ts`

- attach/sync/destroy。
- pointerdown/move/up 回调与 pointer capture。
- preview 显示与隐藏。

`packages/web/tests/runtime/WebGridRuntime.fill.test.ts`

- selection 后 sync 出 fill handle。
- pointer drag 调 `engine.commitFill`。
- preview range 更新。
- cell editing/resize dragging/drag selecting 时隐藏或不进入 fill drag。
- 成功 fill 后触发 `onFill`。

### 7.3 Storybook

新增 `apps/storybook/src/stories/FillHandle.stories.ts`:

- 表格含 number/date/text-tail/checkbox 混合列。
- 说明通过外部状态面板展示最近一次 fill direction 与 range。
- 鼓励用户手动验证:单格复制、两格序列、向上/向左填充、undo/redo。

---

## 8. 文件清单

**新增:**

- `packages/core/src/fill/FillTarget.ts`
- `packages/core/src/fill/FillSeries.ts`
- `packages/core/tests/fill/FillTarget.test.ts`
- `packages/core/tests/fill/FillSeries.test.ts`
- `packages/core/tests/engine/DefaultGridEngine.fill.test.ts`
- `packages/web/src/interaction/DomFillHandleLayer.ts`
- `packages/web/tests/interaction/DomFillHandleLayer.test.ts`
- `packages/web/tests/runtime/WebGridRuntime.fill.test.ts`
- `apps/storybook/src/stories/FillHandle.stories.ts`

**修改:**

- `packages/core/src/undo/UndoCommand.ts` — 新增 `fill` command。
- `packages/core/src/engine/GridEngine.ts` — 新增 `commitFill`。
- `packages/core/src/engine/DefaultGridEngine.ts` — 实现 commit/undo/redo。
- `packages/core/src/index.ts` — 导出 fill 类型与函数。
- `packages/web/src/runtime/WebGridRuntime.ts` — fill drag 状态机。
- `packages/web/src/backends/Canvas2DBackend.ts` — 装配 `DomFillHandleLayer`。
- `packages/web/src/Grid.ts` / `GridController.ts` — `onFill` public API。
- `packages/web/src/index.ts` — re-export 事件类型。
- `README.md` — Phase 4.3 状态更新。

---

## 9. 风险与取舍

- **公式外推不做:** 当前没有公式 engine。把 `=A1` 当文本处理会误导用户,因此公式保持复制语义。
- **单样本数字复制而非递增:** 这是保守选择,避免意外改写数据。需要递增时用户选中两个样本。
- **日期只识别 Date:** 不解析任意字符串日期,避免 locale 与歧义问题。
- **DOM overlay 复杂度:** fill handle 与 resize handle 都是 DOM layer。为降低耦合,新增独立 `DomFillHandleLayer`,runtime 统一调度。
- **Undo command 体积:** 大范围 fill 会记录 before/after 两份值。与 paste 一致,后续如需超大表格优化可加 command 压缩。

---

## 10. 验收标准

- 用户能在选区右下角看到并拖拽 fill handle。
- 单格复制、数字序列、文本尾号序列、Date 序列均按设计工作。
- 向下/上/右/左填充均可提交。
- 拖拽中有清晰 preview,拖回 source 内不提交。
- 一次 fill 是一步 undo,undo/redo 后数据与选区正确。
- 非 mutable DataSource 上 fill silent no-op。
- Core/Web 单元测试通过,Storybook 可手动验证。
