# NovaSheet 分组表头连续拖选设计

日期：2026-07-17
状态：已批准，待实现计划

## 1. 背景与问题

NovaSheet 当前有两条不同的列表头选择路径：

- 叶列表头由 `ColumnHeaderDrag` 处理，支持点击、`Shift + 点击` 和横向拖动形成连续整列选区。
- 分组表头由 `InputController.handleHostPointerDown()` 直接调用
  `selectColumnGroup(groupId)`，随后短路返回，不会建立活动 Drag。

因此，带 `columnGroups` 的业务表中，用户点击“堆1”可以选中该组，但从“堆1”横向拖到
“堆3”时，后续 `pointermove` 没有活动手势接收，选区不会扩展。这与
`interactions.reorder` 无关：`reorder: false` 只关闭列换位，不应关闭列表头连续拖选。

## 2. 目标与非目标

### 2.1 目标

- 分组表头支持同层级连续拖选。
- 从“堆1”拖到“堆3”时，选中两者之间所有组覆盖的连续叶列。
- 支持从右向左拖选。
- 手势开始后锁定起始组头层级；指针纵向偏移到其它表头层或 body 时，仍按起始层级的横向位置解析目标组。
- `Shift + 点击` 分组表头时，从已有整列选区的 anchor 连续扩展到目标组边界。
- `interactions.reorder` 只控制列换位，不影响组头连续选择。
- 复用现有单矩形 `GridSelection.selectedRange`，不改变公开 SelectionModel。

### 2.2 非目标

- 不支持 `Ctrl/Cmd + 点击` 形成非连续多选区。
- 不支持分组表头换位、跨层拖动或改变 column group 树结构。
- 不支持从组头拖入叶头后切换为逐叶列选择。
- 不修改 SCADA 业务组件配置或数据结构。
- 不改变普通叶列表头、行头、冻结窗格和列 resize 行为。

## 3. 交互语义

| 操作 | 结果 |
| --- | --- |
| 点击组头“堆1” | 选择“堆1”覆盖的全部可见叶列 |
| 从“堆1”拖到同层“堆3” | 选择“堆1”到“堆3”之间全部连续可见叶列 |
| 从“堆3”向左拖到“堆1” | 得到与正向拖选相同的规范化选区 |
| 从“堆1”开始后纵向移入“簇”层 | 继续按“堆”层和当前横坐标解析目标组 |
| 从“堆1”开始后纵向移入 body | 继续按“堆”层和当前横坐标解析目标组 |
| 已有整列选区后 `Shift + 点击` “堆3” | 保留既有 anchor，扩展到“堆3”的远端边界 |
| 普通点击/拖动“簇”叶头 | 继续走现有 `ColumnHeaderDrag` |
| `reorder: false` | 仅禁止换位，以上选择行为保持可用 |

连续选区按列边界计算：

```text
startCol = min(anchorGroup.startViewCol, targetGroup.startViewCol)
endCol   = max(anchorGroup.endViewCol, targetGroup.endViewCol)
```

拖选跨过同层未分组空隙或不对称树分支时，选区仍保持单个连续矩形；空隙内的叶列自然被包含。

## 4. 方案比较

| 方案 | 优点 | 缺点 | 结论 |
| --- | --- | --- | --- |
| 新增 `ColumnGroupHeaderDrag` | 组头层级、命中与状态独立；符合现有 Drag 架构 | 新增一个类和协调器接线 | 采用 |
| 扩展 `ColumnHeaderDrag` | 文件数量少 | 叶列选择、组选择、列换位三套状态耦合 | 不采用 |
| 在 `InputController` 内维护 pointer 状态 | 表面改动少 | 绕过 `DragCoordinator`，破坏统一 commit/cancel/auto-scroll 生命周期 | 不采用 |

## 5. 架构设计

### 5.1 组头命中结果

将 `InputController.hitTestGroupHeader()` 的结果从仅含 `groupId` 扩展为：

```ts
interface ColumnGroupHeaderHit {
  readonly groupId: string
  readonly level: number
  readonly startViewCol: number
  readonly endViewCol: number
}
```

这些字段全部来自 `RenderFrame.columnGroupHeader.rows[level]`，保持 view 坐标语义。Drag 不读取
schema group tree，也不自行做 raw/view 转换。

另提供按锁定层级和横坐标命中的窄 helper。它只要求横坐标仍落在有效列宽内，纵坐标不参与
move 阶段目标解析，从而实现“起点层级锁定”。

### 5.2 `ColumnGroupHeaderDrag`

新增 `packages/core/src/dom/interaction/drag/ColumnGroupHeaderDrag.ts`，实现现有 `Drag` 接口。

状态保存：

```ts
interface ColumnGroupSelectState {
  readonly level: number
  readonly anchorStartCol: number
  readonly anchorEndCol: number
}
```

生命周期：

1. `tryStart(pointerdown)` 命中组头后，记录层级和组区间。
2. 普通 pointerdown 调用 `selectWholeColumnRange(startViewCol, endViewCol)`。
3. `Shift` pointerdown 若当前是整列选区，则保留现有 `anchorCell.colIndex`；目标边界按 anchor
   与目标组的相对方向选择，建立连续整列选区。
4. `move(pointer)` 使用锁定的 `level` 和当前 `x` 命中该层目标组，计算 anchor 组与目标组的
   并集边界，调用 `selectWholeColumnRange()` 并刷新。
5. `commit()`、`cancel()` 清空状态并停止自动滚动，不产生结构 mutation。

组头拖选仅产生 selection mutation，因此不调用 `afterEngineMutation()`，也不进入 undo 栈。

### 5.3 拖拽路由与优先级

`DragCoordinator` 创建 `ColumnGroupHeaderDrag`，并将通用 pointerdown 顺序调整为：

```text
ColumnGroupHeaderDrag
→ ColumnHeaderDrag
→ RowHeaderDrag
→ SelectionDrag
```

`InputController.handleHostPointerDown()` 保留 cell action 和列头菜单按钮优先级，但移除当前
“组头点击后直接选择并 return”的分支；组头点击和拖选统一由 `DragCoordinator` 管理。

resize handle 和 hidden-column handle 仍位于独立 DOM handle layer，优先级不受影响。

### 5.4 自动滚动

`ColumnGroupHeaderDrag.autoScrollAxis = 'horizontal'`，复用 `DragCoordinator` 现有横向边缘自动
滚动。每次滚动 tick 后，以最后 pointer 的 `x` 和锁定 `level` 重新命中目标组并更新选区。

### 5.5 SelectionModel 与渲染

本功能仍写入一个连续的整列 `selectedRange`：

```ts
{
  startRow: 0,
  endRow: rowCount - 1,
  startCol,
  endCol,
}
```

现有 `resolveColumnGroupLayout` 会把完全包含于 `selectedRange` 的组标记为 `selected`，Canvas
无需新增绘制逻辑或主题 token。

## 6. 边界与失败处理

- 数据行数为 0 时沿用现有整列选择约定，不建立非空 selection。
- pointer 横向移出首列左侧时，目标钳到该层第一个可见组；移出末列右侧时钳到最后一个可见组，
  与现有列头边缘自动滚动方向一致。
- 锁定层级没有可见组时保持上一次有效选区，不清空 selection。
- group 因隐藏列在 frame 中消失时，move 使用最新 frame 重新命中；无法命中则保持上一次有效状态。
- `Escape` 取消手势只停止继续拖选，不回滚 pointerdown 已建立的选区，与现有选择 Drag 一致。
- `destroy()` 必须通过 `DragCoordinator.cancelActiveDrag()` 清理状态，保持幂等。

## 7. 测试策略

严格 TDD，先新增失败测试，再实现。

### 7.1 单元测试

新增 `ColumnGroupHeaderDrag.test.ts`：

- pointerdown 选择单组。
- 同层左到右、右到左连续拖选。
- pointer 的 `y` 进入叶头/body 后仍按起始 level 命中。
- `Shift + 点击` 从现有整列 anchor 扩展。
- 横向边缘自动滚动请求和 commit/cancel 清理。
- 非组头命中返回 `false`。

更新 `InputController.column-groups.test.ts`：

- 组头 pointerdown 不再直接调用 `selectColumnGroup()`，而是进入 `tryStartDrag()`。
- 列头菜单按钮仍优先于组头手势。
- 组头 hit 返回完整的 `groupId/level/startViewCol/endViewCol`。

更新 `DragCoordinator` 测试：

- 组头 Drag 优先于叶列表头 Drag。
- `reorder: false` 不关闭组头拖选。

### 7.2 行为测试

在 Core L2 selection acceptance 场景中增加可观察行为：两层 column groups 下从同层组头
拖动形成连续整列范围，并验证 `onSelectionChange`/`getSelection()` 结果。该行为属于公开 Grid
交互，不只依赖白盒单元测试。

### 7.3 回归验证

- 现有叶列表头 Shift/拖选测试继续通过。
- 现有 column reorder 测试继续通过。
- column group 点击选组、隐藏收缩和 selected 派生测试继续通过。
- `bun run lint`
- `bun run --filter '*' typecheck`
- `bun test`
- core → canvas2d 顺序构建。

## 8. 影响范围

| 范围 | 修改 |
| --- | --- |
| Core DOM interaction | 新增 `ColumnGroupHeaderDrag` |
| `InputController` | 扩展 group hit，移除组头点击短路 |
| `DragCoordinator` | 构造、排序并驱动组头 Drag |
| Selection engine | 不修改数据结构，复用 `selectWholeColumnRange` |
| Canvas2D | 无逻辑修改 |
| SCADA | 无配置或代码修改 |

## 9. 验收标准

- SCADA 两级表头中，从“堆1”横向拖到“堆3”会连续选中三个堆覆盖的全部叶列。
- 反向拖动结果一致。
- 拖动时纵向偏离组头仍锁定起始层级。
- `Shift + 点击` 组头可连续扩选。
- `reorder: false` 下组头和叶头连续拖选均可用，列换位仍禁用。
- 普通列头、行头、resize、冻结窗格选择和现有组头单击行为无回归。
