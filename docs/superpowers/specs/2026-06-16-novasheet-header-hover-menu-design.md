# NovaSheet 列头 Hover 菜单入口 — 设计

- **日期**：2026-06-16
- **状态**：设计（待 user 复审 → writing-plans）
- **分支**：`main`
- **定位**：为列头增加 Google Sheets 风格的 hover 操作入口：鼠标停在某个列头时，在该列右侧显示一个可点击的下三角按钮；点击后打开现有列头操作菜单。

---

## 1. 背景与目标

### 1.1 背景

NovaSheet 当前已有列头右键菜单，菜单能力包括筛选、排序、插入列、删除列、隐藏列、调整列宽等。但这些能力需要用户知道右键入口，可发现性弱。Google Sheets 在列头 hover 时会显示一个轻量的下三角操作入口，用户可以直接点击打开列级菜单。

### 1.2 目标

| # | 能力 |
|---|---|
| 1 | 列头默认保持干净，不为每列常驻显示操作按钮 |
| 2 | 鼠标 hover 到某个列头时，仅该列头右侧显示下三角菜单入口 |
| 3 | 下三角按钮可点击，点击后打开现有 column header context menu |
| 4 | 按钮视觉参考 Google Sheets：小下三角；hover/active 时有浅灰圆形底 |
| 5 | 右键列头菜单原行为保持不变 |
| 6 | 已有排序/筛选状态 icon 与菜单入口共存，不重叠 |
| 7 | 冻结列、横向滚动、Excel column letters 模式下仍正确定位 |

### 1.3 非目标

- 不新增菜单项；菜单内容复用现有列头菜单模型
- 不改变行头菜单
- 不做移动端触摸长按入口
- 不做菜单项图标化
- 不做表头永久显示按钮的配置项

---

## 2. 交互设计

### 2.1 状态

| 状态 | 表现 |
|---|---|
| 默认 | 列头只显示字段名与已有排序/筛选状态 icon |
| hover 列头 | 当前列右侧显示下三角菜单按钮 |
| hover 按钮 | 按钮出现浅灰圆形底，鼠标 cursor 为 pointer |
| 点击按钮 | 打开现有 column header menu，菜单锚点位于按钮附近 |
| 鼠标离开 header/body | 菜单按钮隐藏；若菜单已打开，菜单保持打开直到现有关闭逻辑触发 |

### 2.2 命中范围

菜单按钮命中区固定在列头右侧，建议使用 `24px × 24px` 的可点击区域。视觉三角居中绘制，圆形 hover 背景直径约 `24px`。

当列宽不足时：

| 列宽 | 行为 |
|---|---|
| `< 32px` | 不显示菜单按钮，避免遮挡列头与 resize handle |
| `>= 32px` | 显示按钮，字段名最大宽度扣除按钮保留位 |

### 2.3 与已有状态 icon 的关系

排序/筛选状态 icon 继续由 `HeaderPainter` 绘制。hover 菜单按钮固定在最右侧；排序/筛选 icon 向左让位，顺序为：

```
字段名 | sort/filter icons | hover menu button
```

如果空间不足，字段名优先被截断；icon 与按钮不重叠。

---

## 3. 架构设计

### 3.1 状态来源

`GridRuntime` 维护当前 hover 的列头坐标：

```ts
type HoveredHeaderMenuButton =
  | { readonly viewCol: number; readonly pressed: boolean }
  | null
```

第一版只需要 `viewCol`；`pressed` 可由菜单打开状态或 pointer down 状态扩展。

### 3.2 渲染路径

`RenderFrame` 增加列头 hover 菜单状态：

```ts
interface RenderFrame {
  hoveredColumnHeaderMenu?: {
    readonly colIndex: number
  }
}
```

`Canvas2DRenderer` 将该状态传给 `HeaderPainter`。`HeaderPainter` 在指定列右侧绘制菜单按钮，并为字段名与状态 icon 保留宽度。

### 3.3 点击路径

`GridRuntime` 增加 header menu button hit-test：

```ts
private hitTestColumnHeaderMenuButton(event: WebPointerEvent): { colIndex: number } | null
```

命中后复用现有列头菜单生成与执行逻辑：

- 构造 `ColumnHeaderMenuContext`
- 调用 `getColumnHeaderContextMenuItems(ctx, this.viewPipeline)`
- 用 `contextMenuLayer.open({ x, y, items })` 打开
- 设置 `lastContextMenuContext` 与 `lastContextMenuPoint`

右键列头路径继续走 `handleHostContextMenu`，不复用 pointer click 事件，避免改变原语义。

### 3.4 坐标系统

命中测试使用 view 坐标，因为 header 当前绘制与 selection 都以 view col 为准。菜单 context 中的 `field` 来自当前 view schema，`colIndex` 为 view col。

冻结列和横向滚动下，`Canvas2DRenderer` 已按 region 分段绘制 header。按钮绘制与 hit-test 必须使用与 header cell 相同的几何：

```
buttonX = headerSegmentX + colsAxis.indexToPosition(viewCol) - scrollOffsetX + colWidth - padX - buttonSize
```

---

## 4. 文件边界

| 文件 | 职责 |
|---|---|
| `packages/core/src/kernel/render/RenderFrame.ts` | 增加 frame 中的 hover header menu 状态 |
| `packages/core/src/engine/DefaultGridEngine.ts` | 保存 runtime 设置的 hover header menu 状态，并在 `getFrame()` 时传给 frame assembler |
| `packages/core/src/engine/GridEngine.ts` | 增加 engine 内部方法用于设置 hover header menu 状态 |
| `packages/core/src/engine/FrameAssembler.ts` | 将 engine 输入中的 hover 状态写入 `RenderFrame` |
| `packages/core/src/dom/runtime/GridRuntime.ts` | 监听 pointer move/click，维护 hover 状态，点击打开列头菜单 |
| `packages/canvas2d/src/render/Canvas2DRenderer.ts` | 将 frame hover 状态传给 header painter |
| `packages/canvas2d/src/painters/HeaderPainter.ts` | 绘制 hover 菜单按钮并调整 icon/text 保留空间 |
| `packages/canvas2d/tests/painters/HeaderPainter.test.ts` | 验证按钮绘制与状态 icon 让位 |
| `packages/core/tests/dom/runtime/GridRuntime.test.ts` | 验证点击按钮打开列头菜单；右键行为不退化 |

hover 状态虽然由 DOM/runtime 输入产生，但第一版明确走 `engine.getFrame()` 契约下发到 renderer，保持 renderer 只消费 `RenderFrame` 的既有架构。

---

## 5. 测试策略

| 层级 | 测试 |
|---|---|
| Painter | hover col 绘制下三角；非 hover col 不绘制；sort/filter icon 与按钮不重叠 |
| Runtime | pointer move 到列头后刷新；点击按钮打开 column header menu |
| Runtime | 右键列头菜单仍打开同一组菜单项 |
| Runtime | body 区点击不触发 header menu button |
| Integration | canvas renderer 将 hover 状态传到 HeaderPainter |

所有测试使用 `bun:test`。Canvas painter 测试使用 `RecordingContext2D`。

---

## 6. 决策记录

| 决策 | 结论 | 原因 |
|---|---|---|
| 显示策略 | 仅 hover 当前列显示 | 对齐 Google Sheets，表头更干净 |
| 菜单内容 | 复用现有 column header menu | 避免重复菜单模型和行为分叉 |
| 视觉形态 | 下三角 + hover 圆形浅灰底 | 对齐用户截图 |
| 坐标 | view col | 当前 header、selection、view pipeline 都在 view 空间工作 |
| 窄列 | `< 32px` 不显示 | 避免遮挡 resize handle 与列头内容 |
