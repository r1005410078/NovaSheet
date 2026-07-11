# `@novasheet/core`

[English README](README.md)

NovaSheet 的平台无关引擎——一个面向大数据量、Canvas-first 的表格引擎。`core` 持有全部状态与行为（数据、viewport、选区、编辑、格式化、合并、填充、剪贴板、undo/redo、校验），自身不渲染任何像素。`RenderBackend` 在构造时由调用方注入（如 [`@novasheet/canvas2d`](../canvas2d)），因此 `core` 对 Canvas/DOM 渲染器零依赖，可在 worker 或不画一笔的测试环境中独立使用。

下文每一条行为保证都对应一条 BDD 验收场景，见 [`tests/acceptance/**/scenarios/*.md`](tests/acceptance)；如何浏览这些场景见文末 [测试](#测试)。

## 安装

```bash
bun add @novasheet/core @novasheet/canvas2d
```

## 快速开始

```ts
import { Grid, InMemoryDataSource, denseGridTheme } from '@novasheet/core'
import { canvas2dBackend } from '@novasheet/canvas2d'

const data = new InMemoryDataSource({
  schema: {
    fields: [
      { id: 'name', name: 'Name', type: 'text', width: 160 },
      { id: 'revenue', name: 'Revenue', type: 'number', width: 120 },
      { id: 'joined', name: 'Joined', type: 'date', width: 120 },
    ],
  },
  rows: [
    { name: 'Alice', revenue: 12000, joined: 45123 },
    { name: 'Bob', revenue: 8400, joined: 45200 },
  ],
})

const container = document.getElementById('app')!
const grid = new Grid(container, {
  backend: canvas2dBackend(),
  data,
  theme: denseGridTheme,
  frozen: { topRows: 1, leftCols: 1 },
})

grid.scrollToCell(1, 'revenue')
grid.setColumnWidth('revenue', 140)
```

`Grid.destroy()` 完全幂等——可安全用于 React `StrictMode` 的 mount/unmount/remount 循环。

## 组件

| 组件                                                                                               | 是什么                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Grid`（[`Grid.ts`](src/Grid.ts)）                                                                 | 公开门面。每个挂载容器对应一个实例；下面所有方法都挂在它上面。                                                                                                                                                                                                                                                           |
| `DataSource`（`InMemoryDataSource`、`SparseExcelDataSource`、`WindowedDataSource`）                | 行存储层。`InMemoryDataSource` 持有纯数组（约 30 万行 × 50 列）；`SparseExcelDataSource` 是稀疏、自增长的 Excel 风格工作区；`WindowedDataSource` 针对可视区域滑动窗口做拉取/订阅，背后是一个传输无关的 `WindowedDataProvider` 端口（HTTP + WebSocket）。三者都实现同一个同步 `DataSource` 接口——需要分页实现可自行接入。 |
| `RenderBackend` / `RenderBackendFactory`（[`ports/RenderBackend.ts`](src/ports/RenderBackend.ts)） | `core` 渲染所经过的端口。`@novasheet/canvas2d` 是已交付实现；任何实现该端口的后端（WebGL、WebGPU、测试 stub）都可作为 `GridOptions.backend` 传入。                                                                                                                                                                       |
| `Theme`（`denseGridTheme`）                                                                        | painter 使用的所有颜色/字体/间距 token 的唯一来源。用 `grid.setTheme(theme)` 替换。                                                                                                                                                                                                                                      |
| `CellTypeRegistry`                                                                                 | 按 `Field.type` 定义的**业务**语义：值如何被编辑、解析、排序、过滤与剪贴板序列化。内置覆盖 `text`/`number`/`date`；其余类型（如 `rating`）自行注册。作用域是整列。                                                                                                                                                       |
| `CellTypeStore`（`setCellType`/`clearCellType`/`getCellType`）                                     | 对单个**单元格**覆盖其 resolved 标量类型（`text`/`number`/`date`/`checkbox`），独立于该列的 `Field.type`——即"一列多类型"。以 raw 坐标索引，可 undo，结构变更后能正确重映射。                                                                                                                                             |
| `ValidatorDefinition`                                                                              | 每条规则的校验逻辑（同步或异步），自动接入所有写入路径。                                                                                                                                                                                                                                                                 |
| `CellAttachmentCodec`                                                                              | 不透明、按 namespace 隔离的单元格附加数据（如富文本 runs、评论），随复制/粘贴、填充与 undo 一起流转。                                                                                                                                                                                                                    |
| `CellEditorRegistry`                                                                               | 按 `Field.type` 注册的 DOM/overlay 编辑器，用于单个输入框表达不了的交互（日期选择器、下拉框）。                                                                                                                                                                                                                          |
| Canvas painter 注册表（`cellRenderers`）                                                           | **不属于 `core`**——`core` 不渲染任何东西，按类型分发的显示 painter 注册在渲染后端工厂上（如 `@novasheet/canvas2d` 的 `canvas2dBackend({ cellRenderers })`）。`core` 只保证 painter 需要的 resolved field/value/附件数据能经 frame 送达。                                                                                 |
| `ViewPipeline`（`SortLayer`、`FilterLayer`、`HideRowsLayer`）                                      | 叠加在 raw `DataSource` 上的可组合 view 坐标变换；`Grid` 暴露组合后的结果，所有 mutation 最终都解析回 raw 坐标。                                                                                                                                                                                                         |
| `RangeStyleStore` / `MergeStore`                                                                   | 按区域键控的格式与合并状态，以 raw 坐标索引，在结构变更与 undo 后仍能存活。                                                                                                                                                                                                                                              |

## 使用示例

### 选区与导航

```ts
const cell = { rowIndex: 2, colIndex: 1 }
grid.setSelection({ activeCell: cell, anchorCell: cell, extentCell: cell, selectedRange: null })
const { activeCell, selectedRange } = grid.getSelection()
```

插入/删除会自动重映射选区——在上方插入会让选区下移；删除永不会让选区悬空在已删除的行上。

没有专门的整行/整列选择方法——点击行头/列头是交互入口，程序化等价写法是一次覆盖整轴的 `setSelection`：

```ts
// 选中 colIndex 整列（等价于点击列头）
const rowCount = data.getRowCount()
grid.setSelection({
  activeCell: { rowIndex: 0, colIndex },
  anchorCell: { rowIndex: 0, colIndex },
  extentCell: { rowIndex: rowCount - 1, colIndex },
  selectedRange: { startRow: 0, endRow: rowCount - 1, startCol: colIndex, endCol: colIndex },
})
```

四个字段都要设——`anchorCell`/`extentCell` 决定后续 Shift+方向键从哪里扩展。整行选择是它的转置（列轴覆盖 `0..fields.length - 1`）。该范围是静态快照：之后追加行不会自动跟随扩大。

### 自定义单元格类型（列级 `CellTypeRegistry`）

按 `Field.type` 注册一个 `CellTypeDefinition`，一次性把编辑、剪贴板、排序、过滤与单元格 action 接到同一套业务类型语义上——作用于该列的每一格（除非被下文的单格覆盖打断）。

```ts
import { SKIP_CELL_VALUE, type CellTypeDefinition } from '@novasheet/core'

const ratingType: CellTypeDefinition = {
  editable: true,
  formatForEdit: (value) => String(value ?? ''),
  parseEditInput: (input) => {
    const n = Number(input)
    return Number.isNaN(n) ? SKIP_CELL_VALUE : Math.max(0, Math.min(5, n))
  },
  serializeClipboard: (value) => String(value ?? ''),
  parseClipboard: (text) => {
    const n = Number(text)
    return Number.isNaN(n) ? SKIP_CELL_VALUE : n
  },
  sortValue: (value) => (typeof value === 'number' ? value : null),
  isEmpty: (value) => value == null,
  filterOperators: [
    {
      id: 'rating-gte',
      label: 'Rating >=',
      matches: (value, operand) =>
        typeof value === 'number' && typeof operand === 'number' && value >= operand,
    },
  ],
  onAction: (ctx) => {
    // 自定义 cell-action 处理；调用 ctx.preventOpenEditor() 可跳过紧随其后的默认打开编辑器步骤
  },
}

new Grid(container, { backend: canvas2dBackend(), data, cellTypes: { rating: ratingType } })
```

每个 hook 都是可选的——按需接入即可。`parseEditInput` / `parseClipboard` 返回 `SKIP_CELL_VALUE` 哨兵值可以拒绝输入且不写入任何内容。一个**没有**匹配 registry 条目（也没有内置定义）的 `Field.type` 会回退到只读纯文本展示：绝不抛错，raw 值保持不变，双击/Enter/F2/直接键入都不会为它打开编辑器。

查表优先按单元格的**resolved type**（列默认，或经 `setCellType` 覆盖后的类型）。如果某格有显式覆盖，且该 resolved type 没有对应条目，查表**不会**回退去用该列原本 `Field.type` 的条目——这一格被当作"未注册"处理，而不是悄悄套用一个为另一种类型写的定义。

### 单元格级类型覆盖（`setCellType` / `clearCellType` / `getCellType`）

```ts
const range = { startRow: 0, endRow: 0, startCol: 2, endCol: 2 }
grid.setCellType(range, 'date') // 这个单元格此后按 date 读取/编辑/排序，与其所在列的 Field.type 无关
grid.getCellType(0, 2) // 'date'
grid.clearCellType(range) // 恢复为该列的默认类型
```

这是"一列多类型"的退路机制——与上面的 `CellTypeRegistry` 是两套不同机制，且只覆盖四种标量 resolved type：`text` / `number` / `date` / `checkbox`。已锁定、且全部有 BDD 覆盖的语义：

- **触发方式仅限显式操作**——`setCellType` 或拖拽填充传播。键入内容永不做类型推断；粘贴永远把值强转为**目标格**的 resolved type，而不会导入源格的覆盖。
- `setCellType` / `clearCellType` / `getCellType` 都使用**view 坐标**；底层 `CellTypeStore` 按**raw 坐标**键控、稀疏存储，并在行/列插入、删除、移动时正确重映射（被删除范围内的覆盖会被移除，不会变成孤儿数据）。非连续的 view range 会被拒绝（返回 `false`，不写入），而不是悄悄打散写到错误的 raw 单元格。
- **非法的既有值不会被改动**——`setCellType` 永不强转或清空底层值；如果该值按新 resolved type 无法解读，显示会走 fallback。
- **混合 resolved type 列排序**使用固定的跨类型次序，而不是隐式 JS 比较：`number`/`date` < `text` < `checkbox`（`false` < `true`） < 空。空值始终在最后，不随升降序翻转；降序只反转非空部分的次序；同类型内相等时按稳定的行序 tie-break。
- **筛选**的可用 operator 按该列的默认类型门控，而非单元格的覆盖类型；predicate 本身仍按 resolved value 执行。
- `setCellType`、`clearCellType` 都作为单一步骤可 undo/redo。

### 值格式化、填充色、边框、文本换行

```ts
const range = { startRow: 0, endRow: 9, startCol: 1, endCol: 1 }
grid.setValueFormat(range, { kind: 'currency', currency: 'USD', decimals: 2 })
grid.setValueFormat(range, { kind: 'percent', decimals: 1 })
grid.setValueFormat(range, { kind: 'date', pattern: 'YYYY-MM-DD' })
grid.setFillColor(range, '#fff2cc')
grid.setFillColor(range, null) // 清除
grid.setBorders(range, 'outer', { color: '#000', width: 'thin', lineStyle: 'solid' })
grid.setTextWrap(range, 'wrap') // 'overflow' | 'wrap' | 'clip'
```

格式在内部按 raw 坐标键控，所以排序之后 `getViewCellFormat` 仍能解析到正确的单元格。raw 值永不会被格式本身修改——`ValueFormat` 只改变显示文本。

### 合并单元格

```ts
grid.mergeCells(range) // 内部各格此后通过 getViewMergeRegion 解析到同一区域
grid.unmergeCells(range) // getViewMergeRegion(...) 再次返回 null
```

合并能在排序后存活（区域会重映射到新的 view 位置），也能与其上的格式一起经历结构性 undo/redo。

### 填充柄

```ts
grid.onFill((event) => console.log(event.fill, event.result))
```

拖动填充柄会投影等差/日期序列，或克隆单个样本，并把所有格式轴（`fillColor`、`borders`、`textWrap`、`valueFormat`）以及源格 resolved cell type 一并传播到目标——若源格在某个轴上没有值，目标该轴上的旧值会被清除（Sheets 风格的整体覆盖），整个操作作为一个单元一起 undo。

### 剪贴板

```ts
new Grid(container, {
  backend: canvas2dBackend(),
  data,
  onPasteSkipped: (cells) => cells.forEach((c) => console.log(c.reason)), // 如 'type'
})
await grid.copy() // 或 grid.cut()
await grid.paste()
```

粘贴会把传入值强转为**目标格**的 resolved type（不像填充那样导入源格的类型）；无法强转、或落在 read-only 类型上的单元格会被跳过，并通过 `onPasteSkipped` 上报，目标内容保持不变。`serializeRowsToTsv` / `parseTsvToCells` 也作为独立函数导出，可在未挂载 `Grid` 的场景下做 TSV 往返。

### 排序、过滤、隐藏（view pipeline）

```ts
grid.getSortLayer().setSpec({ fieldId: 'revenue', direction: 'desc' })
grid
  .getFilterLayer()
  .setSpec({ fieldId: 'name', op: { kind: 'text-contains', value: 'a', caseSensitive: false } })
grid.hideCols(['joined'])
grid.getHiddenCols() // ['joined']
```

三层会组合成同一个最终帧；所有 mutation API（`setCellType`、`setValueFormat` 等）始终使用**view** 坐标，内部再解析回 raw。

### 远程 / 滑动窗口数据（`WindowedDataSource`）

```ts
import { WindowedDataSource, type WindowedDataProvider } from '@novasheet/core'

const provider: WindowedDataProvider = {
  loadRange: (window, signal) =>
    fetch(`/api/rows?${toQuery(window)}`, { signal }).then((r) => r.json()),
  subscribe: (onEvent) => {
    const ws = new WebSocket('/api/rows/stream')
    ws.onmessage = (e) => onEvent(JSON.parse(e.data))
    return {
      setWindow: (window) => ws.send(JSON.stringify({ type: 'setWindow', window })),
      close: () => ws.close(),
    }
  },
}

const data = new WindowedDataSource({ schema, rowCount: 100_000, provider, preloadScreens: 2 })
const grid = new Grid(container, { backend: canvas2dBackend(), data })
```

`Grid` 在每一帧都会调用 `hintWindow(visibleWindow)`（窗口不变时是空操作）；`WindowedDataSource` 按 `preloadScreens` 屏数外扩这个窗口，与 LRU 块缓存去重后只拉取缺失的部分——在预取边界内滚动零请求。`loadRange` 响应与 `subscribe` 推送事件（`cells` / `rowCount` / `resync`）通过一套 stale-while-revalidate 的 epoch 机制对账：滚回已经访问过的区域时先用缓存旧值立即重绘，同时若判定为陈旧则在后台发起重新拉取并在落地后替换。`hintWindow` 会经 `SortLayer` / `FilterLayer` / `HideRowsLayer` / `VisibleColumnsDataSource` 转发，所以排序/筛选/隐藏可以透明地叠加在它之上。完整可运行示例（含模拟网络拉取与逐笔推送）见 [`apps/storybook/src/stories/WindowedDataSource.stories.ts`](../../apps/storybook/src/stories/WindowedDataSource.stories.ts)。

### 校验

```ts
import type { ValidatorDefinition } from '@novasheet/core'

const positiveNumber: ValidatorDefinition = {
  validate: (value) =>
    typeof value === 'number' && value >= 0 ? null : 'Must be a non-negative number',
}

new Grid(container, {
  backend: canvas2dBackend(),
  data,
  validators: { 'positive-number': positiveNumber },
})
grid.setValidation(range, { type: 'positive-number' })
grid.validateAll()
grid.getValidationState(rowIndex, colIndex) // null | { status: 'invalid', message } | { status: 'pending' }
```

validator 可以是同步函数，也可以返回 `Promise`；异步校验会按受限的批大小与并发数调度（`GridOptions` 上的 `validationBatchSize`、`validationMaxConcurrent`），且每条写入路径（编辑、粘贴、填充、undo、redo）都会自动重新排队校验。

### 单元格附件

```ts
import type { CellAttachmentCodec } from '@novasheet/core'

const richTextCodec: CellAttachmentCodec<{ runs: unknown[] }> = {
  namespace: 'rich-text',
  serialize: (data) => JSON.stringify(data),
  deserialize: (text) => JSON.parse(text),
}

new Grid(container, { backend: canvas2dBackend(), data, cellAttachments: [richTextCodec] })
grid.setCellAttachment('rich-text', rawRow, rawCol, { runs: [...] })
grid.getCellAttachment('rich-text', rawRow, rawCol)
```

附件按**raw** 坐标键控，结构性插入/删除时的重映射规则与单元格类型覆盖一致，会随复制/粘贴与填充一起流转，并与单元格值一起 undo。

### Undo / redo

```ts
grid.onUndo((event) => console.log(event))
grid.onRedo((event) => console.log(event))
grid.undo()
grid.redo()
grid.canUndo()
grid.canRedo()
```

每个会产生写入的门面方法（`insertRows`、`setCellType`、`mergeCells`、`setValueFormat`、粘贴、填充……）都会推入 22 种 `UndoCommand` 之一；每种都是纯数据，能精确 JSON 往返，宿主应用可以在 `Grid` 实例之外持久化/回放历史。

### 右键菜单扩展

```ts
new Grid(container, {
  backend: canvas2dBackend(),
  data,
  contextMenus: {
    cell: { mode: 'append', items: [{ id: 'copy-as-json', label: 'Copy as JSON' }] },
  },
  onContextMenuAction: (action, ctx) => {
    if (action === 'copy-as-json') {
      // 自定义 id 以纯字符串到达回调
    }
  },
})
```

内置的行/列头菜单（插入/删除/隐藏/取消隐藏等）有 golden-locked 的菜单项列表；`append`/`prepend`/`replace` 可以扩展它们，core 完全不需要识别你的自定义 action id。

### 自定义 DOM 单元格编辑器

```ts
import type { CellEditor } from '@novasheet/core'

const dateEditor: CellEditor = {
  open(ctx) {
    const input = document.createElement('input')
    input.type = 'date'
    input.style.position = 'absolute'
    Object.assign(input.style, { left: `${ctx.rect.x}px`, top: `${ctx.rect.y}px` })
    input.addEventListener('change', () => ctx.commit(input.value))
    ctx.container.appendChild(input)
  },
}

new Grid(container, { backend: canvas2dBackend(), data, cellEditors: { date: dateEditor } })
```

`ctx.trigger` 说明编辑器被打开的原因（`'double-click' | 'enter' | 'f2' | 'typing' | 'api' | 'cell-action'`）；由输入触发时，`ctx.initialInput` 携带第一个已输入的字符。与 `cellTypes` 一样，查表按**resolved type**，且一旦该格有显式覆盖就不回退到列类型条目（规则同上）。

### 自定义单元格显示（canvas painter）

`core` 自身不渲染任何东西，所以 `GridOptions` 上没有显示相关字段——按类型分发的 painter 注册表归渲染后端所有。对 `@novasheet/canvas2d` 而言就是 `canvas2dBackend({ cellRenderers })`：

```ts
import type { Canvas2DCellRenderer } from '@novasheet/canvas2d'

const ratingRenderer: Canvas2DCellRenderer = {
  paint(ctx, { value, rect, theme }) {
    const score = typeof value === 'number' ? value : 0
    for (let i = 0; i < 5; i += 1) {
      ctx.fillStyle = i < score ? theme.colors.selectionBorder : theme.colors.gridLineStrong
      ctx.fillRect(rect.x + i * 12, rect.y + 4, 10, 10)
    }
  },
}

new Grid(container, {
  data,
  cellTypes: { rating: ratingType }, // 来自上面小节——驱动编辑/排序/筛选
  backend: canvas2dBackend({ cellRenderers: { rating: ratingRenderer } }),
})
```

这个 renderer 同样按 `Field.type` 键控，但渲染器在调用 `paint(ctx, params)` 前，传入的 `field` 已经被换成该单元格的**resolved type**——`setCellType` 覆盖会自动选中匹配的 painter，"不回退到列 painter" 的规则与 `cellEditors`/`cellTypes` 一致。`params` 上还有 `getAttachment(namespace, viewRow, viewCol)`（读取 `cellAttachments` codec 为这一格写入的内容）和 `formatCell(...)`（resolved `ValueFormat` 的显示文本），自定义 renderer 不需要重新推导这两类数据。`Canvas2DCellRenderer` 由 `@novasheet/canvas2d` 导出，不属于 `core`——这个类型活在渲染发生的地方。

### 把一个自定义类型完整拼起来

一个完整的自定义单元格类型由四个注册点组成，其中三个在 `core`，一个在渲染后端：

| 轴                                | API                                  | 所属包     |
| --------------------------------- | ------------------------------------ | ---------- |
| 业务语义（编辑/排序/筛选/剪贴板） | `GridOptions.cellTypes`              | `core`     |
| 单元格附加数据                    | `GridOptions.cellAttachments`        | `core`     |
| DOM/overlay 编辑器                | `GridOptions.cellEditors`            | `core`     |
| Canvas painter                    | `canvas2dBackend({ cellRenderers })` | `canvas2d` |

```ts
new Grid(container, {
  data,
  cellTypes: { rating: ratingType },
  cellAttachments: [myCodec],
  cellEditors: { rating: ratingEditor },
  backend: canvas2dBackend({ cellRenderers: { rating: ratingRenderer } }),
})
```

这套模式已交付的参考实现是 `@novasheet/cell-kit` 里的 rich-text 单元格类型（codec + canvas renderer + inline contenteditable 编辑器 + 外部 React toolbar），完整接线见 [`apps/storybook/src/stories/RichText.stories.ts`](../../apps/storybook/src/stories/RichText.stories.ts)——超出本 README 篇幅的完整可运行示例都在那份文件里。

### 生命周期、布局、冻结区域

```ts
grid.setFrozen({ topRows: 1, leftCols: 1, rightCols: 1 })
grid.autofitRows({ rows: [0, 1, 2], maxHeight: 200 }) // 仅作用于开启 wrap 的列
grid.refresh()
grid.destroy() // 幂等——可安全多次调用
```

## 测试

```bash
bun test            # 单元测试 + 验收测试
bun run typecheck
```

行为先于实现被规格化：上面每一项能力都对应 `tests/acceptance/**/scenarios/*.md` 下的一条 Given/When/Then 场景（索引见 [`tests/acceptance/SCENARIOS.md`](tests/acceptance/SCENARIOS.md)），并用 `bun run lint:mbd` 校验场景与测试代码的一致性。源码布局与纯层/DOM 壳边界见 [`src/ARCHITECTURE.md`](src/ARCHITECTURE.md)。
