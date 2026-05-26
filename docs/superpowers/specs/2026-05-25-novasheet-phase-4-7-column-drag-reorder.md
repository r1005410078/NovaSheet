# NovaSheet Phase 4.7 — 列拖拽重排

- **Date**: 2026-05-25
- **Status**: Approved for implementation
- **Scope**: Google Sheets-style selected-column drag reorder（A+）：先选中列，再从已选列头拖动；拖动中仅显示 DOM 预览；松手一次性提交 schema reorder；支持连续多列。
- **Out of scope**:
  - hidden col gap 作为拖拽对象或 drop 目标
  - 列块/ghost header 跟手移动
  - 拖拽 freeze divider 或高级 frozen 语义
  - 非连续多选列
  - 跨表 / 跨 grid 拖拽

---

## 1. Problem

Phase 4.6 已交付列 insert / delete / hide / unhide / resize，列结构能力只缺 Sheets 用户最常用的「拖动列头改变列顺序」。

NovaSheet 现有渲染与交互分层决定 4.7 不应把列拖拽预览画进 canvas：

- Canvas 负责稳定绘制表格、列头、网格线、选区。
- DOM overlay / handle layer 负责临时交互状态：resize handle、hide toggle、popover、cell editor。
- 列重排拖动中不需要数据变化；松手时才改变 schema。

因此 4.7 采用 **DOM preview overlay + engine schema reorder** 的分层。

---

## 2. Goals

1. 支持从列头拖拽重排列。
2. 支持连续多列一起移动：先选 D:E，再在 D/E 列头内按下拖动。
3. 拖动中列本身不跟手、不 ghost、不实时重排 canvas。
4. 拖动预览贴近 Google Sheets：原选区保持蓝色；灰色半透明列带跟随拖动中的列组；深色竖向 drop line 吸附到目标插入边界。
5. 松手时一次性提交 `moveCols(fieldIds, beforeFieldId | null)`，进入 undo/redo。
6. 与现有 drag-select / resize / hidden col toggle / contextmenu 不冲突。
7. hidden cols 继续按 fieldId 锚定；drop 只落到可见列边界。
8. frozen counts 保持数量语义：reorder 后仍冻结最左 `leftCols` 与最右 `rightCols` 个可见列，不因移动自动增减。
9. Storybook 增加可手测列拖拽重排 story。

---

## 3. UX Contract

### 3.1 先选后拖

| 用户操作 | 行为 |
| --- | --- |
| 左键点击列头 D | 选中整列 D |
| 先选 D，再 Shift + 点击列头 G | 选中连续整列 D:G；本次不进入 reorder |
| 从未选列头 D pointerdown 并横向拖到 G | 选中连续整列 D:G；本次不进入 reorder |
| hover 已选列头 D/E | cursor 显示 `grab` |
| 在已选列头 D/E 内 pointerdown | 立即显示 DOM 预览列带，cursor 切到 `grabbing`；未超过阈值不提交 reorder |
| pointerdown 后移动超过阈值 | 进入 active column reorder drag，drop line 按目标边界吸附 |
| 普通单元格选区覆盖 D，但不是整列 D | 列头 pointerdown 先选中整列 D；本次不进入 reorder |
| 在未选列头 F pointerdown | 先选中 F；本次不进入多列拖拽 |
| 在列 resize handle pointerdown | resize 优先，不进入 reorder |
| 在 hidden col triangle pointerdown | unhide 优先，不进入 reorder |
| 右键列头 | contextmenu 优先，不进入 reorder |

拖拽阈值：`COLUMN_REORDER_DRAG_THRESHOLD_PX = 6`。小于阈值仍视为点击/选列，pointerup 不提交 reorder；但已选列头 pointerdown 后应立即显示灰色预览列带，提供“已抓取”的反馈。

“已选列头”必须是整列选区：`selectedRange.startRow = 0` 且 `selectedRange.endRow = rowCount - 1`。普通 cell/range selection 不能作为 column reorder 的 drag seed。

列多选仅支持连续整列选区。4.7 不做 Cmd/Ctrl 非连续列集合；这与 `moveCols` 的连续列组约束一致。

整列选中时，列头必须有强选中态：选中列头背景使用 `selectionBorder`，列头文字使用 `selectionText`，与 body 区域浅色选区形成层次差异。普通 cell/range selection 不触发列头强选中态。

### 3.2 拖动预览

预览由 DOM `ColumnReorderOverlay` 渲染，挂在现有 grid container 的 overlay/handle 层之上：

- `dragBand`: 灰色半透明矩形，宽度 = 被移动列组总宽度，高度覆盖 header + body viewport；水平位置跟随 pointer delta，而不是吸附到目标列。
- `dropLine`: 深灰竖线，active drag 中吸附到目标插入边界，覆盖 header + body viewport。
- `pointer-events: none`，不参与命中。
- 原选区继续由 canvas overlay 绘制蓝色选区，不被 DOM preview 覆盖语义替代。

pointerdown 即时预览使用被选列组当前 viewport x 作为 `dragBandX`，`dropLine` 可先落在列组起始边界；超过阈值后 `dragBandX = startBandX + pointerDeltaX`，`dropLine` 改由 drop target 计算。

Google 参考效果对应：原列 D 保持蓝色；灰色投影随 D 的拖动位置移动；E/F 边界有深色竖线表示松手后的插入点。

### 3.3 Drop Target

drop target 只按 **可见列边界** 计算：

| 指针位置 | beforeFieldId |
| --- | --- |
| 在可见列 A 左半边 | `A.id` |
| 在可见列 A 右半边 | 下一可见列 id；若 A 是最后可见列则 `null` |
| 在表格最后一列右侧空白但仍在 header 高度内 | `null` |
| 在 row header / hidden gap handle / body | 不更新 target 或取消（见测试） |

hidden col gap 不作为拖拽起点，也不作为独立 drop target。若可见边界两侧存在 hidden cols，`beforeFieldId` 仍指向下一可见字段；hidden cols 按 schema 顺序保留在原 fieldId 相对位置，后续 unhide 后自然出现。

### 3.4 有效 / 无效 drop

| 选区 | drop target | 结果 |
| --- | --- | --- |
| D:E | G 前 | D:E 移到 G 前 |
| D:E | 末尾 | D:E 移到最后 |
| D:E | pointer 仍在 D:E 内 | no-op；预览列带保持显示，不隐藏，不移动到末尾 |
| D:E | D 前 / E 后（选区内部等价位置） | no-op，不入 undo |
| D:E | E/F 之间（删除 D:E 后等价仍在原位） | no-op，不入 undo |
| D:E | hidden gap | 不可 drop |

内部实现使用 `normalizeMoveCols(fieldIds, beforeFieldId)` 判断 no-op，避免 UI 与 engine 各算一套。
`targetBeforeFieldId = null` 只能表示明确 drop-to-end；当前无有效 target / self drop 必须单独表达，不能复用 `null`，否则 pointerup 会误执行 move-to-end。

---

## 4. Engine / Data Model

### 4.1 MutableDataSource 扩展

```ts
export interface MutableDataSource extends DataSource {
  moveFields?(fieldIds: readonly string[], beforeFieldId: string | null): void
}
```

语义：

- `fieldIds` 必须按当前 schema 顺序传入；非连续输入由 engine 排序后只移动存在的字段。
- `beforeFieldId === null` 表示移动到末尾。
- `beforeFieldId` 若属于 `fieldIds` 移动集合，归一化后视为 no-op。
- 只移动 `schema.fields` 顺序；row cell 值按 fieldId 存储，不需要改 row object。
- emit `{ type: 'colsMoved', fieldIds, beforeFieldId }`。

### 4.2 DataSourceEvent 扩展

```ts
export type DataSourceEvent =
  | ...
  | { type: 'colsMoved'; fieldIds: readonly string[]; beforeFieldId: string | null }
```

SortLayer / FilterLayer 对 `colsMoved` 不需要 invalidate spec，因为 spec 按 fieldId 引用字段；只需要 passthrough / rebuild wrapper order，避免行视图数据引用旧 schema 顺序。

### 4.3 DefaultGridEngine 新 API

```ts
moveCols(fieldIds: readonly string[], beforeFieldId: string | null): boolean
```

返回值：

- `true`: schema 顺序实际变化，已入 undo 栈。
- `false`: DataSource 不支持、无有效字段、目标 no-op、目标非法。

内部序列：

1. `finishActiveEdit()`
2. 从 raw schema 按当前顺序过滤 `fieldIds`，得到 `movingFieldIds`
3. 调 `normalizeMoveCols(schema.fields, movingFieldIds, beforeFieldId)`
4. snapshot：`fieldsBefore`, `selectionBefore`, `hiddenBefore`
5. `rawData.moveFields(movingFieldIds, normalizedBeforeFieldId)`
6. 依据 `fieldsBefore → fieldsAfter` 重建 `rawColsAxis`，保留每个 fieldId 的宽度
7. `hiddenColIds` 不变（fieldId set）
8. `rebuildViewColsAxis()`
9. selection 按 fieldId 锚定 remap：原选区对应移动列组时，选区跟随到新位置；否则按原 active fieldId 尽量恢复
10. push undo command

### 4.4 UndoCommand

```ts
{
  readonly kind: 'moveCols'
  readonly fieldIds: readonly string[]
  readonly beforeFieldId: string | null
  readonly afterFieldIds: readonly string[]
  readonly inverseBeforeFieldId: string | null
  readonly selectionBefore: GridSelection
  readonly selectionAfter: GridSelection
}
```

Undo / redo 都调用同一个 engine 内部 move helper，但不再新增 undo command。

---

## 5. Web Runtime

### 5.1 新 DOM overlay

`packages/web/src/overlay/ColumnReorderOverlay.ts`

API：

```ts
export interface ColumnReorderPreview {
  readonly lineX: number
  readonly dragBandX: number
  readonly bandWidth: number
  readonly height: number
}

export class ColumnReorderOverlay {
  show(preview: ColumnReorderPreview): void
  hide(): void
  destroy(): void
}
```

样式：

- drag band: `background: rgba(60, 64, 67, 0.12)`
- drop line: `background: rgba(60, 64, 67, 0.72)`，宽 3px
- z-index 高于 canvas，低于 context menu / popover

颜色后续可抽 theme token；4.7 先与现有 overlay hardcoded CSS 同层处理，不进入 canvas painter。

### 5.2 Runtime 状态机

```ts
type ColumnReorderDrag =
  | {
      readonly pointerId: number
      readonly startClientX: number
      readonly startClientY: number
      readonly selectedFieldIds: readonly string[]
      readonly selectedRange: CellRange
      readonly totalWidth: number
      active: boolean
      targetBeforeFieldId: string | null
    }
```

事件：

- `handleHostPointerDown`: header + left button + selected header hit → seed `columnReorderDrag`，但不立即 active。
- `handleHostPointerMove`: hover 已选列头时设置 `grab` cursor；已 seed 的 reorder drag 更新 preview；超阈值后 active 并更新 target；不触发 body drag-select。
- `handleHostPointerUp`: active 且 target 有效 → `moveCols`; hide overlay; refresh。
- `pointercancel` / `Escape`: hide overlay; clear drag。

### 5.3 与既有交互的优先级

| 优先级 | 交互 |
| --- | --- |
| 1 | resize handle DOM pointerdown |
| 2 | hide col toggle DOM pointerdown |
| 3 | contextmenu / right click |
| 4 | column reorder drag seed（header + selected cols） |
| 5 | column header click selection |
| 6 | body drag-select |

---

## 6. Public API

`Grid` facade 新增：

```ts
moveCols(fieldIds: readonly string[], beforeFieldId: string | null): boolean
```

回调：

```ts
onColumnsMoved?: (event: {
  fieldIds: readonly string[]
  beforeFieldId: string | null
}) => void
```

`Grid.moveCols` 返回 `true` 时触发 `onColumnsMoved`。

---

## 7. Tests

| 文件 | 覆盖 |
| --- | --- |
| `packages/core/tests/data/InMemoryDataSource.moveField.test.ts` | `moveFields` 重排 schema + emit `colsMoved` |
| `packages/core/tests/engine/DefaultGridEngine.col-reorder.test.ts` | `moveCols` 单列/多列/no-op/width/hidden/selection remap |
| `packages/core/tests/undo/UndoStack.col-reorder.test.ts` | `moveCols` undo/redo |
| `packages/web/tests/overlay/ColumnReorderOverlay.test.ts` | DOM band + line show/hide/destroy |
| `packages/web/tests/runtime/WebGridRuntime.col-reorder.test.ts` | 先选后拖、多列、阈值、resize/body/contextmenu 不冲突 |
| `packages/web/tests/Grid.col-reorder.test.ts` | facade + callback |
| `packages/web/tests/integration/Phase47.scenarios.test.ts` | E2E：D:E 拖到 G 前；hidden cols 不漂移；undo/redo |

---

## 8. Storybook

新增 `apps/storybook/src/stories/ColumnReorder.stories.ts`：

- **Default**：提示用户点击列头选择，再拖动已选列头到新位置。
- **MultiColumn**：按钮预选 D:E，用户可直接拖动 D/E 列头。
- **HiddenCols**：预隐藏一列，验证 drop 只按可见边界且 unhide 后 fieldId 顺序稳定。

---

## 9. Invariants

1. 拖动中不 mutate engine / data；只有 pointerup 才提交。
2. Canvas 不绘制 reorder preview；预览全走 DOM overlay。
3. DataSource cell values 按 fieldId 锚定，move fields 只改 schema 顺序。
4. hidden cols 不作为拖拽起点或 drop target。
5. frozen counts 保持数量语义，不因 reorder 自动增减。
6. resize handle / hide toggle 的 DOM pointerdown 必须 stopPropagation，优先于 reorder。
7. `moveCols` no-op 不入 undo 栈，不触发 `onColumnsMoved`。
8. 多列拖拽只支持连续矩形 selection；非连续多选继续 out of scope。
9. Excel 门面中行头选择与列头选择保持对称：左键行头选中整行，Shift/拖动行头连续多选整行；整行选中时行头使用强选中态，普通 cell/range selection 只同步浅色行头高亮。
10. 行拖拽重排采用列拖拽的最小镜像：必须先选中连续整行，再从已选行头拖动；拖动中只显示 DOM 横向行带 + 吸附横线，pointerup 才提交连续 row block move。当前只支持连续 view 行映射到连续 underlying 行；非连续 hidden/sort 复杂场景不在本 follow-up 内。

---

## 10. Spec Self-Review

- [x] 采用用户确认的 A+，B/C 明确 out of scope
- [x] 先选后拖、多列、阈值、no-op、drop target 都有规则
- [x] Google 参考效果拆成 DOM drag band + drop line
- [x] 与现有 resize / hide toggle / contextmenu / body drag-select 优先级明确
- [x] Engine / DataSource / Undo / Web Runtime / Grid facade / Storybook / tests 都有覆盖
- [x] 不改变 Canvas 单画布架构，不引入列块跟手或 ghost
