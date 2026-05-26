# NovaSheet DOM Selection Overlay 设计

- **日期**：2026-05-26
- **范围**：把当前 Canvas 绘制的单元格选区视觉迁移到 DOM overlay。
- **状态**：待实现

## 1. 背景

NovaSheet 当前选区模型在 `@novasheet/core` 内维护，Canvas2DRenderer 在 overlay layer 绘制：

- `selectedRange` 的浅色填充与边框
- `activeCell` 的强边框
- Excel 门面下的列头/行头选中态

Phase 4.3 以后，填充柄已经是 DOM layer；Phase 4.7 的列/行拖拽预览也已经是 DOM overlay。选区视觉继续留在 Canvas，会让同一类交互反馈分散在 Canvas 与 DOM 两套层级里，后续要贴近 Google Sheets 的拖选、拖拽、边框和光标细节时成本偏高。

## 2. 目标

1. 使用 DOM `div` overlay 表达 body 区域的选区视觉。
2. 保持 `@novasheet/core` 的 `GridSelection`、导航、拖选、整行/整列选择语义不变。
3. 复用现有 `RenderFrame`、`ViewportRegion` 与 `computeRangeOverlayRects()`，正确处理冻结区拆分。
4. 降低 Canvas overlay layer 职责，让 Canvas 专注背景、内容、网格线、表头文字与必要的 header chrome。
5. 为后续 Google Sheets-like 视觉细节提供统一 DOM 层级。

## 3. 非目标

- 不重写 selection model。
- 不改变复制、粘贴、填充、undo/redo 的选区语义。
- 不在本阶段迁移单元格内容、网格线或表头文字到 DOM。
- 不引入 React/Vue wrapper。
- 不新增 WebGL/WebGPU 路径。

## 4. 推荐方案

新增 `SelectionOverlay` DOM layer，由 `@novasheet/web` 在每次 render flush 后同步。

### 4.1 层级

`SelectionOverlay` 挂在 grid container 下，与现有 handle/reorder/fill overlay 同级：

| Layer | 职责 |
| --- | --- |
| Canvas | 背景、单元格内容、网格线、表头文字、行头文字 |
| SelectionOverlay | body 选区填充、range 边框、active cell 边框 |
| FillHandleLayer | 填充柄 |
| ReorderOverlay | 行/列拖拽预览 |
| Resize/Hide handles | resize hit-zone 与隐藏指示操作点 |
| Cell editor / popover | 编辑器与菜单弹层 |

`SelectionOverlay` 使用 `pointer-events: none`，不参与 hit test，不抢拖选、resize、reorder、contextmenu 事件。

### 4.2 同步时机

在 `WebGridRuntime.invalidate()` 与 `paintSync()` 的 renderer render 之后同步：

1. `const frame = getRenderFrame()`
2. `renderer.render(frame)`
3. `syncSelectionOverlay(frame)`
4. 同步 resize/fill/hide/editor 等现有 DOM 层

这样 Canvas 和 DOM overlay 使用同一份 `RenderFrame`，避免滚动或 resize 后视觉错一帧。

### 4.3 矩形计算

Body 选区复用 `computeRangeOverlayRects(frame, range)`：

- 普通区域返回一个 rect。
- 冻结行/列存在时按可见 region 拆成多个 rect。
- 行尾/列尾尺寸必须通过 `Axis.getSize(index)`，不使用 `indexToPosition(i + 1) - indexToPosition(i)`。

Active cell 使用相同算法计算单格 range，再选择可见 rect 绘制强边框。

### 4.4 Canvas 退场范围

第一阶段只让 body 选区从 Canvas 退场：

- Canvas 不再绘制 `selectedRange` body 填充。
- Canvas 不再绘制 body active cell 边框。
- Canvas 暂时保留列头/行头选中态绘制，因为 header text、网格线和强选中背景当前由 painter 一次合成，迁移收益低于 body 选区。

后续如果要进一步贴近 Google Sheets，可以单独把 header/row header 的选中覆盖层 DOM 化。

## 5. 视觉规则

所有颜色、边框宽度、z-index 基准和尺寸来自 theme token 或现有 overlay token，不在 painter/render 中硬编码视觉值。

| 状态 | DOM 表达 |
| --- | --- |
| Range fill | 半透明填充 div，覆盖可见 body rect |
| Range border | 独立 border div，贴合 range 可见边界 |
| Active cell | 强边框 div，优先高于 range border |
| 无选区 / 编辑中需要隐藏 | overlay 清空或隐藏 |

当拖选、滚动、resize 同时发生时，以最新 `RenderFrame` 为准重建/复用 DOM rect。

## 6. 测试策略

| 层级 | 测试 |
| --- | --- |
| `SelectionOverlay` 单测 | attach/sync/destroy、空选区清空、多个 rect 渲染、theme CSS 变量 |
| `RangeOverlayRects` 单测 | 已有测试继续覆盖冻结区拆 rect；必要时补 active cell 单格案例 |
| `WebGridRuntime` 单测 | render 后同步 selection overlay；拖选/键盘导航/滚动后更新 |
| `Canvas2DRenderer` 单测 | body selection 绘制调用消失；header/row header 选中态仍保留 |

验收门禁：

- `bun run lint`
- `bun run --filter '*' typecheck`
- `bun test`
- `bun run --filter @novasheet/web build && bun run --filter @novasheet/web-canvas2d build && bun run --filter @novasheet/core build`

## 7. 风险与约束

| 风险 | 处理 |
| --- | --- |
| DOM overlay 与 Canvas 错位 | 同步时使用 renderer 同一份 `RenderFrame`；scroll/resize 后统一 flush |
| 冻结区重复边框 | 先按 region 拆 rect，边框允许 per-region 绘制；若视觉重复明显，再增加边界裁剪 |
| DOM 节点过多 | 选区 rect 数量由可见 region 决定，通常 1 到 6 个，不随选中单元格数量增长 |
| 层级抢事件 | `pointer-events: none`，交互继续走现有 hit test |
| 与 fill handle 重叠 | fill handle 继续独立 layer，z-index 高于 selection overlay |

## 8. 决策

采用 DOM `SelectionOverlay` 迁移 body 选区视觉。第一阶段不迁移 header/row header 选中态，避免扩大改动面。
