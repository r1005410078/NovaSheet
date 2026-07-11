# NovaSheet 列组表头（Column Groups）设计

- **状态：** 设计定稿，待 plan
- **日期：** 2026-07-12
- **驱动用例：** `~/www/scada-console-web/src/pages/monitor/index/panels/SlickBmsTablePanel.vue` 替换（BMS 堆/簇实时监视表：两层组头 堆→簇、组级选中高亮与定位 `locateStack`、无组冻结指标列）。CLAUDE.md Backlog ① 唯一硬阻塞项。
- **切片决策：** column groups 单独一个 spec；host-integration API（cellClick/值读写/只读/选择糖）另行第二个 spec。

## 1. 目标与范围

**目标**：Schema 声明式列组树 → engine 解析布局随 frame 下发 → canvas2d 绘制多行组头；组头点击选整组；程序化定位/选中/读取 API。

**In scope：**

- 任意深度嵌套组树（BMS 只用两层，模型与渲染按任意深度实现）
- 组头点击 = 选中组下全部可见叶列的整列范围 + 组头派生高亮
- `getColumnGroups()` / `selectGroup(groupId)` / `scrollToGroup(groupId, align?)`
- 与 hide/insert/delete/moveCols/冻结/列宽 resize 的一致性语义

**Out of scope（明确不做，勿顺带加）：**

- 组折叠 collapse
- 组级右键/hover 菜单（`ContextMenuTargetKind` 不加 `'columnGroup'`）
- 组头拖拽扩选、Shift 组点击、组整体拖拽重排
- 表头组区的键盘导航

## 2. 数据模型与一致性规则

### 2.1 Schema 扩展（`kernel/data/Schema.ts`）

```ts
/** 列组树节点。叶子层永远是 fields 中的列；组可嵌套任意深。 */
export interface ColumnGroup {
  readonly id: string // 稳定 id：scrollToGroup/selectGroup 定位用
  readonly label: string // 组头显示文本
  readonly children: readonly (ColumnGroup | { readonly fieldId: string })[]
}

export interface Schema {
  readonly fields: readonly Field[]
  /** 可选。缺省 = 无组头，行为与现状完全一致（零成本路径）。 */
  readonly columnGroups?: readonly (ColumnGroup | { readonly fieldId: string })[]
}
```

### 2.2 单一真相与校验（构造 / `setData` 时，违反即 throw）

列顺序权威永远是 `fields`；`columnGroups` 只是分组标注。三条校验：

1. **连续性**：任一组的叶子 fieldId 集合在 `fields` 中占据连续区间；
2. **顺序一致**：组树深度优先叶序与 `fields` 顺序一致；
3. **引用完整 + 不重复 + 非空**：fieldId 必须存在于 `fields`，至多归属一条叶路径；组 `children` 不得为空；组 `id` 全树唯一。

顶层允许 `{ fieldId }` 与组混排 = 无组列（BMS 冻结指标列形态）。校验失败是开发期配置错误，fail loud（throw），不静默降级。

### 2.3 运行时一致性（engine 维护的不变量）

结构 mutation 后 `columnGroups` 引用永远指向存在且连续的列：

| mutation                | 组树语义                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| `deleteCols`            | 同步剔除叶引用；组叶子删空则组移除并级联向上；undo 双向恢复 fields 与组树                              |
| `insertCols`            | 插入点两侧同组 → 新列归该组；组边界/组外 → 不归组                                                      |
| `moveCols`              | **跨组边界保守 no-op 返 `false`**（与 sort/filter 打散哲学一致）；同组内部允许，组树叶序随 fields 同步 |
| `hideCols`/`unhideCols` | view 层概念，**不改组树**；组头按可见叶列收缩，全隐则该组头从 frame 消失                               |
| 列宽 resize             | 组头宽度跟随叶列合计宽                                                                                 |

## 3. 渲染契约与布局

### 3.1 RenderFrame 扩展（engine 解析，painter 只吃结果——不变量 #1）

```ts
// RenderFrame 新增（view 坐标，hidden 已剔除）
columnGroupHeader?: {
  readonly depth: number                                    // 组头行数 = 树最大深度
  readonly rows: readonly (readonly GroupHeaderCell[])[]    // rows[0] = 最顶层
  /** 按 view col 索引：该列叶头的起始表头行（无组列 = 0，向上伸满）。 */
  readonly leafTopRowByViewCol: readonly number[]
}
interface GroupHeaderCell {
  readonly groupId: string
  readonly label: string
  readonly startViewCol: number    // 闭区间，按可见叶列收缩后
  readonly endViewCol: number
  readonly selected: boolean       // 派生高亮，规则见 §4.2
}
```

`leafTopRowByViewCol` 给出每列叶头的起始表头行：无组列/浅组列的叶头**向上伸满**（ag-Grid 式一根到底），painter 从该行画到表头底。

### 3.2 表头高度模型（本设计最大横切回归面）

- 表头总高 = `depth × theme.metrics.groupHeaderRowHeight + headerHeight`。
- Theme 只新增 **`groupHeaderRowHeight`** 一个 token；颜色/字体/分隔线全部复用现有 header 系 token（不变量 #4 零硬编码）。
- **`viewport.headerHeight` 语义升级为表头总高**（engine 计算后下发）；另给 `viewport.leafHeaderHeight` 表示叶头行高。ScrollMapper、editor/handle/overlay 定位、行头 hit-test 等"表头总高"消费方**不用改**；只有表头内部绘制与表头内 hit-test 需要区分两者。plan 中须点名此处为回归重点，逐个消费点核对。

### 3.3 组头适配既有冻结分区绘制 + 布局缓存

- **冻结列功能本身不动**。本节只定义组头如何适配现有的分区（quadrant）绘制：冻结左区与滚动主区分开画、各有 x 偏移与 clip，组头长条若横跨冻结边界（部分叶列冻结、部分滚动），须在两区各画自己的可见段，label 各画一次（左对齐 + clip）——否则组头会随主区滚动滑走或被裁掉。BMS 场景不会触发（冻结指标列无组，组全在滚动区），但引擎通用行为须有定义。
- 组头布局仅依赖 schema + hidden 集 + 列宽：engine 侧缓存 + 脏标记失效，帧路径 O(可见组数)。

## 4. 交互与选择模型

### 4.1 Hit-test 与点击

`hitTestColumnHeader` 按 y 拆两层：组头行区 → 解析命中 `GroupHeaderCell`，点击走与 `selectGroup` 同一路径；叶头行区 → 现有语义不变（排序图标、hover 菜单按钮、列宽 resize 命中区照旧，y 偏移下移）。

### 4.2 选择模型：零改动 + 派生高亮（已决策，见 §8）

组选中 = 覆盖组内全部可见叶列的**整列 range**（`GridSelection` 类型不动，undo/结构 remap/clipboard/fill 全部免费）。组头 `selected` 派生规则：

> `selectedRange` 覆盖整列（`0..rowCount-1`）**且** 列区间 ⊇ 该组全部可见叶列 → `selected: true`。

用 ⊇ 而非相等：框选相邻两组则两组头都亮；父组在其全部子叶被覆盖时自动亮，递归向上零额外状态。"点组头"与"恰好框选同范围"语义视觉等价，不区分。

## 5. 公开 API（`Grid` facade → `GridControllerImpl`）

```ts
getColumnGroups(): readonly ColumnGroup[]        // schema 组树快照（读方法直调 engine）
selectGroup(groupId: string): boolean            // 整列 range 选中组可见叶列；组不存在/全隐藏 → false 不动选区
scrollToGroup(groupId: string, align?: 'start' | 'center' | 'end'): void  // 滚到组首个可见叶列
```

BMS `locateStack` 等价物 = `scrollToGroup(id, 'start')` + `selectGroup(id)`。

## 6. 错误处理

| 场景                                           | 行为                                   |
| ---------------------------------------------- | -------------------------------------- |
| 组树校验失败（§2.2）                           | 构造/`setData` throw，开发期 fail loud |
| `selectGroup`/`scrollToGroup` 不存在的 groupId | 返 `false` / no-op，不 throw           |
| `selectGroup` 组内叶列全隐藏                   | 返 `false`，不动选区                   |
| 空 `children` 的组 / 重复组 id                 | 构造/`setData` 校验拒绝（§2.2 规则 3） |

## 7. 测试策略

- **kernel 白盒 TDD**：树校验（三条规则 × 违例矩阵）、布局解析（depth/收缩/`leafTopRowByViewCol`）、派生高亮判定纯函数。
- **Core L0–L2 BDD 场景**（`packages/core/tests/acceptance/**/scenarios/*.md`）：带组 schema → `getFrame().columnGroupHeader` 结构；`selectGroup` → `getSelection()` 整列 range；`scrollToGroup` → viewport 位置；insert/delete/move/hide 后 `getColumnGroups()` 与 frame 一致性；moveCols 跨组 no-op。
- **canvas2d**：`RecordingContext2D` 测组头绘制、叶头伸满、冻结分段。
- **冒烟**：一条 BMS 形态场景（两层组 + 无组冻结列 + 组选中/定位）+ Storybook story（每个 Grid 配置加 story 的既有约定）。

## 8. 决策记录（ADR）

| #   | 决策                                    | 备选与理由                                                                                                                                                                |
| --- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | 任意深度嵌套（用户定）                  | vs 固定 2 层：一步到位，渲染/hit-test 按递归实现                                                                                                                          |
| B   | `Schema.columnGroups` 组树              | vs `Field.groupPath` 推导（组无稳定 id）、运行时 `setColumnGroups()`（生命周期复杂，BMS 换 sheet 走 setData 重建用不到）；组需稳定 id 供定位/选中，BMS 结构接口天然是树形 |
| C   | 选择模型零改动 + 派生高亮               | vs `GridSelection` 新变体：核心类型被 clipboard/fill/菜单/painter/undo 全量消费，爆炸半径大；整列选择本就无专门状态，先例一致                                             |
| D   | `viewport.headerHeight` 语义升级为总高  | vs 新增独立字段保持旧义：绝大多数消费方要的就是总高，升级后它们零改动；区分需求方少数                                                                                     |
| E   | `moveCols` 跨组保守 no-op               | 与 format/merge 域"sort/filter 打散时返 `false`"哲学一致                                                                                                                  |
| F   | collapse / 组菜单 / 组拖拽 out of scope | YAGNI；驱动用例不需要，模型不封死未来                                                                                                                                     |

## 9. 风险

1. **headerHeight 横切回归**（§3.2）——plan 须列出全部消费点逐一核对，行为测试罩住 editor/handle/overlay 定位。
2. **组树 × 结构 mutation 的 undo 恢复**——deleteCols/insertCols 的 undo command 需扩展携带组树增量，JSON 往返约定不破（22 种 UndoCommand 纯数据先例）。
3. **hit-test y 分层 off-by-one**——组头行区与叶头行区边界、DPR 缩放下的取整，须有专门单测。
