# NovaSheet Phase 1 · Canvas 渲染引擎设计

- **日期**：2026-05-13
- **范围**：NovaSheet 第一阶段——基于 Canvas 的高性能现代表格渲染引擎
- **产品形态**：类 Airtable / Notion Database（结构化字段为主）
- **架构目标**：1,000,000+ 行 × 500+ 列
- **Phase 1 验证规模**：1,000,000 行 × 10 列（本地内存 mock 数据，受 InMemoryDataSource 行式存储约束）。架构（ChunkedAxis、Viewport、Renderer、Scroller、DataSource 接口）必须对齐 1M+ × 500+，使后续阶段接入分页 DataSource 后无需重写

---

## § 1 范围与目标

第一阶段交付「NovaSheet 渲染引擎核心」——一个高性能 Canvas 表格的渲染地基。它能在浏览器里以 60fps 滚动 100 万行 × 500 列的数据，但只负责"看"，不负责"动"。

### In Scope

- Canvas 表格渲染
- **主题系统（Theme Token）**：所有视觉度量与色板从一个 `Theme` 对象注入。Phase 1 内置 `denseGridTheme`（紧凑网格 / Linear 风）为默认主题；Airtable / Notion 等主题留作后续独立包。
- 双轴虚拟化（仅绘制可见单元格）
- 冻结行 / 冻结列（任意行数 + 任意列数）
- 动态行高（程序化 + 拖拉调整列宽 / 行高）
- 原生滚动 + 非线性 scrollTop 映射
- DataSource 抽象层（Phase 1 内置 `InMemoryDataSource`，接口向未来分页数据源开放）
- React Wrapper 组件
- 列头基础渲染（字段名 + 类型占位图标）

### 主题扩展点（必须设计到位）

所有"硬编码会变成技术债"的视觉参数全部走 Theme：

```
Theme {
  metrics:   { rowHeight, headerHeight, cellPaddingX, cellPaddingY,
               fontSize, fontFamily, borderWidth }
  colors:    { background, headerBackground, text, headerText,
               gridLine, gridLineStrong, frozenShadow, hoverRowBg,
               selectionBg, selectionBorder }
  cell:      { textAlignByType, tagRadius, tagPaddingX, ... }
                                                  // Phase 1 仅消费 textAlignByType
  icons:     { byFieldType: Record<FieldType, IconDef> }
                                                  // Phase 1 用极简 16×16 矢量图标
  scrollbar: { trackWidth, thumbColor, ... }      // Phase 1 占位
}
```

**约定**：渲染引擎内部禁止出现任何硬编码 px / 颜色值。Theme 可在运行时替换（`grid.setTheme(theme)` 触发完整重绘）。Phase 2+ 可发布 `@novasheet/theme-airtable`、`@novasheet/theme-notion` 等独立 theme 包。

### Out of Scope（Phase 1 明确不做）

- 选区、键盘导航、复制粘贴
- 单元格编辑、字段类型专属编辑器
- 排序、筛选、分组、列拖拽重排、列隐藏
- 公式、引用、计算
- 多视图、视图配置持久化
- 协同、撤销重做、AI 能力
- 暗色主题成品（Phase 1 只保证架构能切换，不出货）

### 成功标准

- 1M 行 × 10 列 mock 数据，桌面 Chrome / Firefox / Safari、iOS Safari 均 60fps 滚动
- 初始挂载到首帧 < 100ms
- 内存占用（不含数据本身）< 50MB
- 渲染管线零硬编码视觉值（架构 lint 校验）

---

## § 2 模块架构

### 包结构（pnpm workspace monorepo）

```
novasheet/
├── packages/
│   ├── core/                @novasheet/core      — 纯 TS 渲染引擎，零框架依赖
│   └── react/               @novasheet/react     — React Wrapper（薄壳）
├── apps/
│   └── playground/          Vite + React 开发用 playground，含 1M 行 mock
├── pnpm-workspace.yaml
└── package.json
```

Theme 在 Phase 1 内置于 `core`（默认 `denseGridTheme`），Phase 2+ 再拆为独立包。

### `@novasheet/core` 内部分层

```
┌───────────────────────────────────────────────┐
│  Grid (facade)                                │  公共 API：mount/update/destroy/setTheme
└───────────────────┬───────────────────────────┘
                    │ 编排
       ┌────────────┼──────────────┐
       ▼            ▼              ▼
  ┌────────┐  ┌──────────┐   ┌──────────────┐
  │Renderer│  │ Scroller │   │ Interaction  │  Phase 1 仅含 column/row 拖拽 resize
  └───┬────┘  └────┬─────┘   └──────┬───────┘
      │           │                 │
      └───────┬───┴──────┬──────────┘
              ▼          ▼
         ┌────────┐  ┌───────┐
         │ Layout │  │ Theme │
         └───┬────┘  └───────┘
             ▼
         ┌────────┐
         │  Data  │
         └────────┘
```

### 源码目录

```
packages/core/src/
├── index.ts                  // 公共 export
├── Grid.ts                   // 主类，门面
├── types.ts                  // 跨模块共享类型
│
├── data/                     // ── 数据层 ──
│   ├── DataSource.ts         // interface
│   ├── InMemoryDataSource.ts
│   └── Schema.ts             // Field、FieldType
│
├── layout/                   // ── 布局/坐标层 ──
│   ├── ChunkedAxis.ts        // 分块累加偏移（行/列共用）
│   ├── FrozenRegions.ts      // 冻结象限切分
│   └── Viewport.ts           // 可见 row/col range 计算
│
├── scroll/                   // ── 滚动层 ──
│   ├── NativeScroller.ts     // 原生 overflow 容器 + 监听
│   └── ScrollMapper.ts       // 非线性 scrollTop ↔ 逻辑 y 映射
│
├── render/                   // ── 渲染层 ──
│   ├── Renderer.ts           // RAF 调度 + 脏标记 + 主重绘
│   ├── HighDPI.ts            // devicePixelRatio + canvas 尺寸管理
│   ├── GridLinesPainter.ts
│   ├── CellPainter.ts        // 按 FieldType 分派
│   ├── HeaderPainter.ts
│   └── FrozenPainter.ts      // 4 象限合成（含投影/分割线）
│
├── theme/                    // ── 主题层 ──
│   ├── Theme.ts              // Theme interface + token 集合
│   └── denseGridTheme.ts     // 默认主题
│
├── interaction/              // ── 交互层（Phase 1 极简，仅 resize）──
│   ├── HandleLayout.ts       // 真实 DOM handle 节点定位（每帧 flush 后调用）
│   ├── DragController.ts     // 共享 pointerdown/move/up 状态机
│   ├── ResizeColumn.ts       // 列宽 pointer + keyboard 处理
│   └── ResizeRow.ts          // 行高 pointer + keyboard 处理
│
└── util/
    ├── raf.ts                // FrameScheduler 单例（所有 RAF 来源共享）
    ├── BinarySearch.ts
    └── ChunkArray.ts
```

### `@novasheet/react`

```
packages/react/src/
├── index.ts
├── NovaSheet.tsx             // React 组件
└── useNovaSheet.ts           // 命令式 handle hook
```

Wrapper 的唯一职责：在 `useEffect` 里创建/销毁 Grid 实例，把 props 变化映射到 Grid 的 update 方法。**不参与渲染**（Canvas 在 div 内部由 core 接管）。

### 关键边界

| 模块 | 输入 | 输出 | 单测策略 |
|---|---|---|---|
| `data/` | 用户数据 | `getRow(i)`, `getCells(range)`, `schema` | 纯数据测试 |
| `layout/` | rowCount, defaultHeight, override map | `rowToY`, `yToRow`, `getVisibleRange` | 表格驱动数学测试 |
| `scroll/` | 容器尺寸, totalHeight | `scrollTop ↔ logicalY` | 数学函数测试 + 边界 case |
| `render/` | viewport + data + theme + ctx | 像素 | 屏快照（Playwright + 像素对比）+ 单 painter unit |
| `Grid` | 全部以上 | 公共 API | 集成测试（happy-dom + canvas mock） |

**核心原则**：渲染层只读 layout / data / theme 的快照；所有写操作走 Grid facade，由它通知各层。状态单一来源。

---

## § 3 核心类型与数据层接口

### 字段与 Schema

```ts
export type FieldType =
  | 'text'           // Phase 1 实绘（专门路径）
  | 'number'         // Phase 1 实绘（专门路径：右对齐 + 千分位）
  | 'singleSelect'   // Phase 1 走 fallback（toString → text）
  | 'multiSelect'    // Phase 1 走 fallback（数组 join(', ') → text）
  | 'date'           // Phase 1 走 fallback（Date → ISO 字符串 → text）
  | 'checkbox'       // Phase 1 走 fallback（boolean → 'true'/'false' → text）
  | 'url'            // Phase 1 走 fallback（按 text 绘）

export interface Field {
  readonly id: string                // 稳定 ID，重排不变
  readonly name: string
  readonly type: FieldType
  width: number                      // 受 ResizeColumn 影响
  hidden?: boolean                   // Phase 1 不暴露 UI，类型先留
  options?: Record<string, unknown>  // type-specific 配置
}

export interface Schema {
  readonly fields: readonly Field[]
}

export type CellValue = string | number | boolean | null | readonly string[] | Date
export type Row = Record<string /* fieldId */, CellValue>
```

**Phase 1 实现说明**：7 种 FieldType 全部声明并参与类型系统（headers 也会按 type 显示对应 icon），但 `CellPainter` 只为 `text` / `number` 实现专门绘制路径；其余 5 种类型在 Phase 1 全部走 fallback（`String(value)` 后按 text 路径绘制）。Phase 2 加专属编辑器与绘制时只需在 CellPainter 内补 case，无需改 Schema 类型与 FieldType 枚举。

### DataSource 接口

Phase 1 → Phase N 演进的最关键抽象。同步 + 异步双兼容、面向区间访问、可观察变更：

```ts
export interface DataSource {
  // 元信息
  getRowCount(): number
  getSchema(): Schema

  // —— 区间预热通道 ——
  // Renderer 在每帧开头调用一次：getRows(firstVisibleRow, lastVisibleRow)
  // 同步源直接返回数组并立即可用；异步源返回 Promise，Promise resolve 后会
  // emit rowsChanged 事件触发重绘
  getRows(startIndex: number, endIndex: number): Row[] | Promise<Row[]>

  // —— Paint hot path ——
  // CellPainter 对每个可见 cell 调用，必须同步 + 高吞吐
  // 若数据尚未加载（异步源未命中缓存），返回 undefined，由 Renderer 绘占位骨架
  getCell(rowIndex: number, fieldId: string): CellValue | undefined

  // 变更通知
  subscribe(listener: DataSourceListener): () => void
}

export type DataSourceEvent =
  | { type: 'reset' }
  | { type: 'rowsChanged'; startIndex: number; endIndex: number }
  | { type: 'schemaChanged' }
  | { type: 'rowCountChanged'; newCount: number }

export type DataSourceListener = (event: DataSourceEvent) => void
```

**为什么这个形状能撑到 Phase N**：

- **`getRows` 是预热入口**：Renderer 每帧只调一次，提示 DataSource"接下来要访问这个范围"。同步源原样返回；异步源用此机会触发 IO，把范围拉到本地缓存
- **`getCell` 是 paint hot path**：从已预热的缓存读，必须同步、零分配；异步源缓存未命中时返回 undefined → 绘占位骨架；缓存到位后 emit `rowsChanged` → 下一帧重绘
- 两者分工明确：getRows 写入缓存（may be async），getCell 读缓存（must be sync）
- `subscribe` 事件流 → 协同 / 实时更新 / 撤销重做都能挂上去

### Phase 1 实现：`InMemoryDataSource`

```ts
export class InMemoryDataSource implements DataSource {
  constructor(opts: { schema: Schema; rows: Row[] })

  // 全部同步
  getRowCount(): number
  getSchema(): Schema
  getRows(start: number, end: number): Row[]
  getCell(rowIndex: number, fieldId: string): CellValue | undefined
  subscribe(listener: DataSourceListener): () => void

  // Phase 1 最小写 API（给 playground / 测试用）
  updateCell(rowIndex: number, fieldId: string, value: CellValue): void
  setRows(rows: Row[]): void
}
```

**内部存储**：行式 `Row[]`，简单直接。

**推荐上限**取决于「行数 × 列数 × 平均值大小」三者乘积，而非纯行数。安全基线：
- 30 万行 × 10 列（平均每行 ~200 字节）→ ~60 MB 堆，OK
- 10 万行 × 50 列（平均每行 ~1 KB）→ ~100 MB 堆，临界
- 超过上述规模：使用 Phase 2 分页 DataSource

playground 的 1M 行 mock 数据走列式 TypedArray 生成器（playground 内部专用，**不通过 InMemoryDataSource**），由 Renderer 通过 DataSource 接口透明访问。

### Grid 公共 API

```ts
export interface GridOptions {
  data: DataSource
  theme?: Theme                // 缺省 = denseGridTheme
  frozenRows?: number          // 缺省 0；Header 行不算入 frozenRows
  frozenCols?: number          // 缺省 0
  defaultRowHeight?: number    // 优先级见下
}

export class Grid {
  constructor(container: HTMLElement, options: GridOptions)
  setData(data: DataSource): void
  setTheme(theme: Theme): void
  setFrozen(rows: number, cols: number): void
  setRowHeight(rowIndex: number, height: number): void
  setColumnWidth(fieldId: string, width: number): void
  scrollToRow(rowIndex: number, align?: 'start' | 'center' | 'end'): void
  scrollToCell(rowIndex: number, fieldId: string): void
  refresh(): void
  destroy(): void
}
```

**`defaultRowHeight` 优先级**：

- 用户**显式传入** `defaultRowHeight`（非 undefined）→ **sticky**，后续 `setTheme` 不会改变它
- 用户**未传**（undefined）→ 跟随 `theme.metrics.rowHeight`，`setTheme` 时同步更新

**边界与异常**：

- `rowCount = 0`：仍绘 header + 空背景；scrollHost 无可滚动空间
- `frozenRows > visibleFields.length` / `frozenCols > visibleFields.length`：内部 clamp 到上限，不抛错
- `Field.hidden = true`：Phase 1 仅作为类型声明的占位（前向兼容 Phase 3 列隐藏 UI）。运行时**忽略 hidden 字段**——既不算入列轴 layout 也不绘制；frozenCols 的"前 N 列"按可见列序列计算

---

## § 4 布局层：ChunkedAxis

`ChunkedAxis` 是引擎的算法核心，行轴和列轴各持一个实例。

### 数据结构

```ts
const CHUNK_SIZE = 1024  // 调优常量

interface Chunk {
  totalSize: number              // 本块所有项尺寸之和
  sizes: Float32Array | null     // 仅当本块有非默认项时分配；null = 全默认
}

class ChunkedAxis {
  private defaultSize: number
  private count: number
  private chunks: Chunk[]                // 长度 = ⌈count / CHUNK_SIZE⌉
  private chunkPrefixSum: Float64Array   // 长度 = chunks.length + 1
                                         // chunkPrefixSum[i] = 前 i 个 chunk 累计尺寸
  private totalSize: number              // = chunkPrefixSum[chunks.length]
  private version: number                // mutate 递增，供 Renderer 判脏
}
```

### 核心运算

**`indexToPosition(index)` — 索引→像素偏移**

```
chunkIdx = index >> 10
offsetInChunk = index & 1023
chunk = chunks[chunkIdx]
base = chunkPrefixSum[chunkIdx]

if (chunk.sizes === null):
    return base + offsetInChunk * defaultSize    // O(1) 快路径
else:
    return base + sum(chunk.sizes[0..offsetInChunk])  // O(CHUNK_SIZE) worst
```

**`positionToIndex(y)` — 像素偏移→索引**

```
1) 二分 chunkPrefixSum 找 chunkIdx                — O(log n_chunks)
2) yInChunk = y - chunkPrefixSum[chunkIdx]
3) if chunk.sizes === null:
      return chunkIdx * CHUNK_SIZE + ⌊yInChunk / defaultSize⌋   // O(1)
   else:
      在 chunk.sizes 上累加直到 ≥ yInChunk                       // O(CHUNK_SIZE)
```

**`getVisibleRange(yStart, yEnd)`** — 两次 `positionToIndex`。

**`setSize(index, size)` — 单项尺寸调整**

```
chunkIdx = index >> 10
offsetInChunk = index & 1023
chunk = chunks[chunkIdx]

if (chunk.sizes === null):
    if (size === defaultSize):  return              // 仍全默认，无操作
    chunk.sizes = new Float32Array(CHUNK_SIZE).fill(defaultSize)

delta = size - chunk.sizes[offsetInChunk]
chunk.sizes[offsetInChunk] = size
chunk.totalSize += delta

// 增量更新后续 chunkPrefixSum
for (i = chunkIdx + 1; i <= chunks.length; i++):
    chunkPrefixSum[i] += delta

totalSize += delta
version++
```

`setSize` 的 prefix sum 增量更新看似是 O(n_chunks)，但 n_chunks ≈ 977，纯 Float64 写入 ~3μs。用户单次拖拽 resize 触发一次，远低于 16ms 帧预算。

**`setDefaultSize(newDefault)`** — 整体放大 / 缩小默认尺寸。override 项的具体值不变；null chunk 的 totalSize 按新默认重算，O(n_chunks)。

### 复杂度总表（n = 1,000,000, n_chunks = 977）

| 操作 | Worst | Typical (chunk 全默认) | 单次实测目标 |
|---|---|---|---|
| `indexToPosition` | O(CHUNK_SIZE) | O(1) | < 1 μs |
| `positionToIndex` | O(log n_chunks + CHUNK_SIZE) | O(log n_chunks) | ~3 μs |
| `getVisibleRange` | 2 × positionToIndex | 2 × O(log n_chunks) | ~6 μs |
| `setSize` (mutate) | O(n_chunks) prefix 更新 | 同左 | ~3 μs |
| `setDefaultSize` | O(n_chunks) | O(n_chunks) | ~5 μs |
| 内存基线（全默认） | n_chunks × 16B + prefixSum | ~30 KB | — |
| 内存（每 100 chunk dirty） | + 100 × 4KB | ~430 KB | — |

每帧渲染调用：2 次 `getVisibleRange` + ~30 次 `indexToPosition` → 总开销 < 50 μs（< 0.3% 帧预算）。

### FrozenRegions

```ts
class FrozenRegions {
  constructor(rowsAxis: ChunkedAxis, colsAxis: ChunkedAxis,
              frozenRows: number, frozenCols: number)

  getQuadrants(viewportRect): {
    topLeft:    { rowRange, colRange, rect }  // 冻结行 ∩ 冻结列
    topRight:   { rowRange, colRange, rect }  // 冻结行 ∩ 滚动列
    bottomLeft: { rowRange, colRange, rect }  // 滚动行 ∩ 冻结列
    main:       { rowRange, colRange, rect }  // 滚动行 ∩ 滚动列
  }
}
```

绘制顺序：`main → bottomLeft → topRight → topLeft`（后绘覆盖前绘，并由 `FrozenPainter` 在边界绘投影）。

### Viewport

聚合 ChunkedAxis + FrozenRegions + 当前 scroll 状态，给 Renderer 提供"该绘什么"的最终视图：

```ts
class Viewport {
  constructor(rowsAxis, colsAxis, frozen, container)

  setScroll(logicalX: number, logicalY: number): void
  setSize(width: number, height: number): void

  snapshot(): ViewportSnapshot { quadrants, dpr, contentRect, version }
}
```

**Viewport 是渲染的唯一输入快照源**。Renderer 永远从 `snapshot()` 取数，不直接访问 axis / frozen 实例——保证渲染过程中状态不被并发修改。

---

## § 5 渲染管线

### 5.1 Canvas 与 DPR

```ts
class HighDPI {
  resize(cssWidth: number, cssHeight: number): void {
    const dpr = window.devicePixelRatio || 1
    canvas.style.width = cssWidth + 'px'
    canvas.style.height = cssHeight + 'px'
    canvas.width = Math.round(cssWidth * dpr)
    canvas.height = Math.round(cssHeight * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)  // 之后按 CSS 像素坐标
  }
}
```

- **DPR 变化监听**：必须用「自重注册」模式，因 matchMedia 只对**单一值**触发，跨显示器拖拽时 DPR 可变成任意值

```ts
let currentDpr = window.devicePixelRatio
function watchDpr(onChange: () => void) {
  const mq = matchMedia(`(resolution: ${currentDpr}dppx)`)
  const handler = () => {
    mq.removeEventListener('change', handler)
    currentDpr = window.devicePixelRatio
    onChange()                          // 触发 HighDPI.resize + Renderer.invalidate
    watchDpr(onChange)                  // 重新注册新 dppx 的 listener
  }
  mq.addEventListener('change', handler, { once: true })
}
```

- **容器尺寸变化**：`ResizeObserver` 监听 container（初始挂载用 `getBoundingClientRect()` 同步取首帧尺寸，避免空 Canvas 一帧）
- 单一 Canvas，与 container 同尺寸（viewport-sized）

### 5.2 渲染调度

**共享 RAF scheduler**（`util/raf.ts`）：所有需要 RAF 的子系统（Renderer、NativeScroller 等）共用单例 `FrameScheduler`，保证一帧内多个来源合并为一次 RAF。

```ts
// util/raf.ts
class FrameScheduler {
  private pendingTasks = new Map<string, () => void>()  // key 去重
  private rafHandle: number | null = null

  schedule(key: string, task: () => void): void {
    this.pendingTasks.set(key, task)                     // 同 key 后写覆盖
    if (this.rafHandle === null) {
      this.rafHandle = requestAnimationFrame(() => this.flush())
    }
  }

  cancel(key: string): void { this.pendingTasks.delete(key) }

  private flush(): void {
    const tasks = Array.from(this.pendingTasks.values())
    this.pendingTasks.clear()
    this.rafHandle = null
    for (const task of tasks) task()                     // 同帧执行所有任务
  }
}
export const frameScheduler = new FrameScheduler()
```

**Renderer.invalidate** 使用 scheduler：

```ts
invalidate(): void {
  frameScheduler.schedule('renderer:flush', () => this.flush())
}

private flush(): void {
  this.paint(this.viewport.snapshot())
}
```

`invalidate()` 触发来源：Scroller、ChunkedAxis 变更、DataSource 事件、Theme 切换、容器 resize、DPR 变化。同帧多次 invalidate 自动合并（map key 去重）。

**任务顺序**：scheduler 按插入顺序执行；约定 key 命名前缀决定阶段：
1. `scroll:read` — NativeScroller 读 scrollTop → Viewport.setScroll
2. `renderer:flush` — Renderer.paint
3. `handle:layout` — HandleLayout 更新 DOM handle 位置

**Phase 1 不做局部脏区**——全帧整片重绘（预算 < 5ms 足够）。脏区优化留到 Phase 2 选区/Hover 高频局部更新时。

### 5.3 一帧的绘制顺序

```
flush(snapshot) {
  // 1) 清屏（背景色）
  ctx.fillStyle = theme.colors.background
  ctx.fillRect(0, 0, w, h)

  // 2) 主区（bottomRight quadrant）
  drawCellsInQuadrant(snapshot.main)
  drawGridLinesInQuadrant(snapshot.main)

  // 3) 冻结左列（bottomLeft）
  drawCellsInQuadrant(snapshot.bottomLeft)
  drawGridLinesInQuadrant(snapshot.bottomLeft)
  drawFrozenColumnShadow()       // 右侧投影

  // 4) 冻结顶行（topRight）
  drawCellsInQuadrant(snapshot.topRight)
  drawGridLinesInQuadrant(snapshot.topRight)
  drawFrozenRowShadow()          // 底部投影

  // 5) 冻结左上 corner（topLeft）
  drawCellsInQuadrant(snapshot.topLeft)
  drawGridLinesInQuadrant(snapshot.topLeft)
  drawFrozenCorner()             // 两面投影

  // 6) 列头（永远在最顶）
  drawHeader(snapshot)
  drawHeaderFrozenColumnsCorner(snapshot)
}
```

### 5.4 CellPainter

```ts
class CellPainter {
  paint(ctx, value, rect, field, theme) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(rect.x, rect.y, rect.w, rect.h)
    ctx.clip()                          // 防止文本溢出

    switch (field.type) {
      case 'text':   this.paintText(...);   break
      case 'number': this.paintNumber(...); break   // 右对齐 + 千分位
      default:       this.paintFallback(...)        // toString 后按 text
    }

    ctx.restore()
  }
}
```

**文本绘制要点**：

- **省略号截断**：`measureText` 二分找到最长能放下的子串 + '…'，按 (fontKey, text) LRU 缓存（容量 ~10000，基线值）
- **垂直居中**：`ctx.textBaseline = 'middle'`，y = rect.y + rect.h / 2
- **字体设置**：每帧开头统一设置 `ctx.font`，绘制过程不变更

**性能预估**：30 行 × 20 列 = 600 cell，每个 ~5 μs（含缓存命中）= 3ms。可见区单帧 ~3ms。

**备选优化**：如果实测 `save/clip/restore` 总成本 > 2ms，可改为「不调 ctx.clip，painter 内部用 measureText + 手动裁剪字符串」。两条路径接口相同，可后期切换。

### 5.5 GridLinesPainter

合并同色线到一个 `Path2D`，一次 stroke：

```ts
const path = new Path2D()
for (rowIdx in visibleRows): path.moveTo + lineTo
for (colIdx in visibleCols): path.moveTo + lineTo
ctx.strokeStyle = theme.colors.gridLine
ctx.lineWidth = theme.metrics.borderWidth
ctx.stroke(path)
```

**亚像素对齐**：CSS 像素坐标 floor 后 + 0.5 偏移。

### 5.6 HeaderPainter

```ts
drawHeader(snapshot) {
  ctx.fillStyle = theme.colors.headerBackground
  ctx.fillRect(0, 0, width, theme.metrics.headerHeight)

  for col in visibleCols:
    drawFieldTypeIcon(field.type)              // 16x16 icon, theme.icons.byFieldType[field.type]
    drawFieldName(field.name)                  // 截断 + 省略号
    drawResizeHandle(col.x + col.w - 4, ...)   // 8px 透明命中区
}
```

冻结列的 header 段在主 header 之后再绘一次（覆盖滚动）。

### 5.7 FrozenPainter（投影）

用渐变填充而非 shadow（shadow 性能差）：

```ts
const gradient = ctx.createLinearGradient(x, y, x + 4, y)
gradient.addColorStop(0, theme.colors.frozenShadow)   // 'rgba(0,0,0,0.08)'
gradient.addColorStop(1, 'rgba(0,0,0,0)')
ctx.fillStyle = gradient
ctx.fillRect(...)
```

仅当对应方向滚动偏移 > 0 时绘制（贴边时不画）。

### 5.8 性能预算

| 阶段 | 预算 | 实测目标 |
|---|---|---|
| 清屏 | < 0.5 ms | ~0.2 ms |
| 600 cell 绘制（含 measureText 缓存命中） | < 4 ms | ~3 ms |
| Grid lines（合并 Path2D） | < 0.5 ms | ~0.3 ms |
| Header（~20 列） | < 0.5 ms | ~0.4 ms |
| Frozen 投影 + 边界 | < 0.5 ms | ~0.2 ms |
| **单帧总计** | **< 8 ms** | 留一半余量 |

---

## § 6 滚动系统

### 6.1 DOM 结构（"puppet scroll" + DOM handle 层）

```
<container>                              // 用户提供的宿主，position: relative
  <scroll-host>                          // overflow: auto，提供原生滚动条
    <scroll-spacer />                    // display: block，明确 width/height（非 min-*）
  </scroll-host>
  <canvas />                             // position: absolute，pointer-events: none
  <handle-layer>                         // position: absolute，pointer-events: none
    <handle role="separator" tabIndex=0 // ColumnResizeHandle × visibleColumns
            aria-orientation="vertical"
            data-col-id="..." />
    <handle role="separator" tabIndex=0  // RowResizeHandle × visibleRows
            aria-orientation="horizontal"
            data-row-index="..." />
  </handle-layer>
</container>
```

**层级与事件路由**

| 层 | pointer-events | 职责 |
|---|---|---|
| `<scroll-host>` | auto（默认） | 接收所有滚轮 / 触控板 / 触摸滚动；浏览器原生处理 |
| `<canvas>` | **none** | 纯绘制层，永不接收事件；滚动事件穿透到下层 scroll-host |
| `<handle-layer>` 容器 | **none** | 不阻挡滚动事件 |
| `<handle>` 单个节点 | **auto** | 仅在 handle 实际位置上接收 pointer 事件 + 键盘事件 |

**handle 节点定位**：每帧 Renderer.flush 后，按 visible columns/rows 的 layout 坐标更新 handle 的 `style.left/top/width/height`（CSS 变量批量设置）。8 CSS px 宽（列）或 8 CSS px 高（行）的不可见命中区。

**关键收益**

- ✅ 解决 hit-test 悖论：canvas 始终 `pointer-events: none`，handle 节点是真正的事件目标
- ✅ a11y 开箱可用：handle 是真实 DOM 节点，可获得焦点，可用 ←/→ ↑/↓ 键盘调整尺寸（步长 8px），有 `role="separator"` 与 `aria-orientation`
- ✅ 光标变化由 CSS 处理：`.handle[aria-orientation="vertical"] { cursor: col-resize }`，无需 JS 算
- 业内 AG-Grid / GlideDataGrid 同模式，唯一区别是 GlideDataGrid 用 canvas 自实现 hit-test（牺牲 a11y 换简单），我们选择 DOM handle 换 a11y

**spacer 元素细节**

- `display: block`、`width = ScrollMapper.computeSpacerSize(totalColsWidth)`、`height = ScrollMapper.computeSpacerSize(totalRowsHeight)`
- 不用 `min-width / min-height`（避免 grid/flex 容器下尺寸被压缩）

### 6.2 ScrollMapper（非线性映射）

```ts
class ScrollMapper {
  private SAFE_MAX = 6_000_000

  computeSpacerSize(contentSize: number): number {
    return Math.min(contentSize, this.SAFE_MAX)
  }

  // scrollTop ∈ [0, spacerSize - vp]  →  logicalY ∈ [0, contentSize - vp]
  scrollToLogical(scrollTop, spacerSize, contentSize, viewportSize) {
    const maxScroll = spacerSize - viewportSize
    const maxLogical = contentSize - viewportSize
    if (maxScroll <= 0) return 0
    const clamped = Math.max(0, Math.min(maxScroll, scrollTop))   // 防 iOS 橡皮筋/浮点越界
    if (contentSize <= spacerSize) return clamped                 // 直通（数据小）
    return (clamped / maxScroll) * maxLogical
  }

  logicalToScroll(logicalY, spacerSize, contentSize, viewportSize) {
    const maxScroll = spacerSize - viewportSize
    const maxLogical = contentSize - viewportSize
    if (maxLogical <= 0) return 0
    const clamped = Math.max(0, Math.min(maxLogical, logicalY))
    return (clamped / maxLogical) * maxScroll
  }
}
```

水平方向相同映射，spacer 宽度同样封顶 6M px（接口对齐）。

### 6.3 NativeScroller

```ts
class NativeScroller {
  attach(viewport, renderer): () => void {
    const onScroll = () => {
      // 走共享 scheduler，自动与 Renderer.invalidate 同帧合并
      frameScheduler.schedule('scroll:read', () => {
        const top = scrollHost.scrollTop
        const left = scrollHost.scrollLeft
        viewport.setScroll(
          mapper.scrollToLogical(left, ...),
          mapper.scrollToLogical(top, ...),
        )
        renderer.invalidate()           // 同帧 enqueue renderer:flush
      })
    }
    scrollHost.addEventListener('scroll', onScroll, { passive: true })
    return () => scrollHost.removeEventListener('scroll', onScroll)
  }

  scrollToLogical(logicalX, logicalY): void {
    scrollHost.scrollTo({
      left: mapper.logicalToScroll(logicalX, ...),
      top: mapper.logicalToScroll(logicalY, ...),
    })
  }
}
```

### 6.4 冻结区与滚动的关系

冻结行/列不响应滚动，始终钉在 Viewport 固定位置。视觉坐标：

- 冻结列 x = `[0, frozenColsWidth]`
- 主区列 x = `[frozenColsWidth - scrollX, viewportWidth]`
- Header y = `[0, headerHeight]`
- 冻结行 y = `[headerHeight, headerHeight + frozenRowsHeight]`
- 主区行 y = `[headerHeight + frozenRowsHeight - scrollY, viewportHeight]`

### 6.5 滚动条样式

Phase 1 使用浏览器原生滚动条（不做隐藏式 overlay）。Theme `scrollbar.*` 占位，Phase 2 可通过 `::-webkit-scrollbar` 与 `scrollbar-color` 自定义。

### 6.6 边界与极端 case

| Case | 行为 |
|---|---|
| scrollTop 超出 maxScroll | clamp 到 maxScroll |
| 数据集 rowCount 变小 | 重算 spacerSize，浏览器 clamp scrollTop，下帧重绘 |
| 容器尺寸变化 | ResizeObserver → viewport.setSize → recompute spacer + invalidate |
| DPR 变化 | HighDPI.resize + invalidate |
| iOS 橡皮筋越界 | 浏览器自处理，mapper 直通 clamp |
| 触控板 / 滚轮 | 浏览器原生处理 → scroll 事件 |
| 滚到底精确对齐 | logicalToScroll(maxLogical) = maxScroll，等价对齐 |

### 6.7 精度损失评估

- spacerSize = 6M，contentSize = 28M（1M 行 × 28px）
- 拇指拖 1px = `(28M / 6M) ≈ 4.67` 数据像素 ≈ 0.17 行
- 拖拽滚动条最小可见跳跃 < 1 行，可接受
- 滚轮 / 触控板：定量 px 增量，与 spacer 无关，0 精度损失

---

## § 6.5（追加）交互层：Resize（Phase 1 唯一交互）

Phase 1 整个交互范围只有两件事：拖动列分隔线调整列宽、拖动行分隔线调整行高。两者共享同一套 hit-test + drag 状态机。

### 6.5.1 命中目标

事件目标是 **真实 DOM handle 节点**（见 §6.1 `<handle-layer>`），不是 canvas 上的虚拟命中区。每帧 Renderer flush 后，`HandleLayout` 模块根据 visible columns / rows 的 layout 坐标重新定位 handle 节点：

- **列 handle**：位于列右边界，宽 8 CSS px、高 = headerHeight + frozenRowsHeight + viewportHeight（贯穿整列）
- **行 handle**：位于行下边界，高 8 CSS px、宽 = frozenColsWidth + viewportWidth

光标由 CSS 处理（`cursor: col-resize` / `cursor: row-resize`），无需 JS。handle 容器层 `pointer-events: none`，仅 handle 本身 `pointer-events: auto`，避免遮挡滚动事件。

### 6.5.2 拖拽状态机（鼠标 / 触控）

```
idle ──pointerdown on handle──▶ dragging ──pointermove──▶ dragging
                                    │
                                    │ pointerup / pointercancel
                                    ▼
                                  idle
```

进入 `dragging`：

- `handle.setPointerCapture(pointerId)` 防止指针移出 handle 后丢失事件
- 在 `<handle-layer>` 上叠绘一条 1px 虚线 indicator（独立 DOM 节点，不污染 canvas 渲染管线）
- 拖拽过程不触发滚动；指针越界时仅延伸 indicator

`pointermove` 计算新尺寸：

- 列：`newWidth = clamp(startWidth + (currentX - startX), MIN_SIZE, ∞)`
- 行：`newHeight = clamp(startHeight + (currentY - startY), MIN_SIZE, ∞)`
- `MIN_SIZE = 20 CSS px`
- Phase 1 不卡上限

`pointerup` 提交：

- 调用 `grid.setColumnWidth(fieldId, newWidth)` 或 `grid.setRowHeight(rowIndex, newHeight)`
- 这两个 API 内部走 `ChunkedAxis.setSize` → 触发 `Renderer.invalidate()`
- 释放 pointer capture，移除 indicator

### 6.5.3 键盘交互（a11y）

handle 节点 `tabIndex = 0`、`role="separator"`、`aria-orientation` 标注方向，可获得焦点。聚焦后：

- `←` / `→`（列 handle）调整列宽，步长 8 CSS px；`Shift +` 步长 32 px
- `↑` / `↓`（行 handle）调整行高，同上步长
- `Escape`：模糊焦点

每次键盘操作直接走 `grid.setColumnWidth` / `setRowHeight`，等价于一次完整拖拽 commit。

### 6.5.4 与滚动的关系

拖拽 / 键盘过程中**不滚动**。Phase 1 不实现"拖到边缘自动滚动"，留作 Phase 2 增强。

### 6.5.5 文件位置

- `interaction/HandleLayout.ts` — handle 节点定位与更新（每帧 RAF flush 后调用）
- `interaction/ResizeColumn.ts`、`interaction/ResizeRow.ts` — 各自的 pointer + keyboard 处理
- `interaction/DragController.ts` — 共享的 pointerdown/move/up 状态机

---

## § 7 React Wrapper API

文件总量 < 300 行。Wrapper 唯一职责：生命周期绑定 + 命令式 handle 转发。**不参与渲染**。

```tsx
export interface NovaSheetProps {
  data: DataSource
  theme?: Theme
  frozenRows?: number
  frozenCols?: number
  defaultRowHeight?: number
  className?: string
  style?: React.CSSProperties
}

export interface NovaSheetHandle {
  scrollToRow(rowIndex: number, align?: 'start' | 'center' | 'end'): void
  scrollToCell(rowIndex: number, fieldId: string): void
  refresh(): void
}

export const NovaSheet = forwardRef<NovaSheetHandle, NovaSheetProps>(
  function NovaSheet(props, ref) {
    const containerRef = useRef<HTMLDivElement>(null)
    const gridRef = useRef<Grid | null>(null)

    useEffect(() => {
      gridRef.current = new Grid(containerRef.current!, {
        data: props.data,
        theme: props.theme,
        frozenRows: props.frozenRows,
        frozenCols: props.frozenCols,
        defaultRowHeight: props.defaultRowHeight,
      })
      return () => {
        gridRef.current?.destroy()
        gridRef.current = null
      }
    }, [])  // 空依赖，下面 effects 单独同步

    useEffect(() => { gridRef.current?.setData(props.data) }, [props.data])
    useEffect(() => { props.theme && gridRef.current?.setTheme(props.theme) },
              [props.theme])
    useEffect(() => {
      gridRef.current?.setFrozen(props.frozenRows ?? 0, props.frozenCols ?? 0)
    }, [props.frozenRows, props.frozenCols])

    useImperativeHandle(ref, () => ({
      scrollToRow: (i, a) => gridRef.current?.scrollToRow(i, a),
      scrollToCell: (i, f) => gridRef.current?.scrollToCell(i, f),
      refresh: () => gridRef.current?.refresh(),
    }), [])

    return <div ref={containerRef} className={props.className} style={props.style} />
  }
)
```

### React 18 Strict Mode 兼容

Strict Mode 会在开发期 mount → unmount → mount。`Grid.destroy()` 必须完全幂等：解绑所有事件、取消 RAF、清空 ResizeObserver / MutationObserver、断开 ScrollHost 引用。专项测试 case：`mount → destroy → mount` 三次不报错、不漏挂监听。

### 反模式（明确不做）

- 不把 Grid 状态 mirror 到 React state
- 不把 cell 渲染为 React 节点
- 不提供 controlled scroll state（scroll 是命令式 API，由 ref 控制）

### 可选 hook

```ts
export function useNovaSheet(props: NovaSheetProps) {
  const ref = useRef<NovaSheetHandle>(null)
  const element = <NovaSheet ref={ref} {...props} />
  return [ref, element] as const
}
```

---

## § 8 工程化、构建与测试

### 8.1 工具链

| 选项 | 选择 | 理由 |
|---|---|---|
| 包管理 / 工作区 | pnpm + workspaces | 大型 monorepo 标配 |
| TypeScript | 5.4+，strict + verbatimModuleSyntax | 类型基线高 |
| 构建（库） | tsup | 零配置出 ESM/CJS/d.ts |
| 构建（playground） | Vite | HMR + 现代默认 |
| 测试运行器 | Vitest | 与 Vite 同心智 |
| Canvas 单测 | 自实现「ctx 调用录制器」 | jsdom canvas 是空 mock；录制 ctx 方法序列做断言 |
| 像素回归 | Playwright + 截图 diff | 跨真实浏览器 |
| 基准测试 | Vitest bench | 避免引入额外基准工具 |
| Lint | ESLint + typescript-eslint | 一套覆盖 monorepo |
| Format | Prettier | — |
| Git hook | simple-git-hooks + lint-staged | 仅 staged lint |

### 8.2 仓库结构

```
novasheet/
├── package.json                    // root, scripts only
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .eslintrc.cjs
├── .prettierrc
├── packages/
│   ├── core/
│   │   ├── package.json            // "type": "module", exports map
│   │   ├── tsup.config.ts
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   └── tests/
│   └── react/
│       ├── package.json            // peerDependencies: react/react-dom
│       ├── tsup.config.ts
│       └── ...
└── apps/
    └── playground/
        ├── package.json
        ├── vite.config.ts
        └── src/
            ├── main.tsx
            ├── mockData.ts          // 1M × 10 列发生器，列式 TypedArray
            └── App.tsx              // 切换数据规模、Theme、Frozen 的 demo
```

### 8.3 测试策略

**纯函数层（核心算法）—— Vitest 单测，覆盖率 ≥ 90%**

- `ChunkedAxis`：indexToPosition / positionToIndex / setSize / setDefaultSize 表格驱动
- `ScrollMapper`：边界 case（小数据直通、大数据映射、maxScroll=0）
- `Viewport.getVisibleRange`、`FrozenRegions.getQuadrants`
- `InMemoryDataSource`：subscribe / emit 时序

**模块协作层 —— Vitest + happy-dom + canvas 调用录制**

- 自实现 `RecordingContext2D`，重写 ctx 方法收集 `{ op, args }` 序列
- 跑 Renderer，断言指令序列（clearRect / fillText 数量、坐标范围、Theme 颜色注入）
- 指令级测试比像素 diff 稳定，CI 可重复

**集成层 —— Playwright**

- 真实 Chrome / WebKit / Firefox 各一份截图
- 场景：初始渲染、滚到 50 万行、调整列宽、切换 frozen、切换 theme
- 像素 diff 容忍度：< 0.2%

**Strict Mode / 生命周期 —— Vitest + @testing-library/react**

- mount → unmount → mount 三次不报错
- 卸载后无遗留 RAF / 事件 / observer（spy 验证）

**Bench —— Vitest bench**

- `ChunkedAxis` 1M rows，随机 1 万次 indexToPosition / setSize
- Renderer `flush()` 全帧耗时分布
- 回归门槛：CI 上 P95 > 历史 +10% 视为退化

### 8.4 性能预算汇总

| 路径 | 目标（一帧 16.67ms） |
|---|---|
| Scroll → invalidate → flush 全链路 | < 8 ms |
| ChunkedAxis 单帧总调用 | < 0.1 ms |
| Renderer.paint（600 cells + 网格 + header + frozen） | < 5 ms |
| ResizeObserver 重算 spacer + invalidate | < 1 ms |
| 初始 mount 到首帧 | < 100 ms |
| 内存（不含数据） | < 50 MB |
| 1M 行 × 10 列 滚动 | 稳定 60fps（Chrome / FF / Safari / iOS） |

CI 不强卡这些数（运行环境不稳）；playground 内置 stats overlay（FPS、单帧耗时、内存）便于本地验证。

---

## § 9 风险、未决项与验收

### 9.1 关键风险

| 风险 | 严重度 | 缓解 |
|---|---|---|
| iOS Safari 高频 scroll 丢帧 | 高 | RAF 节流 + passive listener；早期真机测 |
| 长文本 `measureText` 慢，LRU 缓存命中率低 | 中 | 按 (font + text) 作 key；测命中率，必要时降字号挡位 |
| Strict Mode 双 mount 泄漏 | 高 | 专项测试，destroy 幂等 100% |
| 极大数据 prefix sum 增量更新成本累积 | 低 | n_chunks ≈ 977，~3μs；千万行级再转 Fenwick over chunks |
| Theme 切换运行时绘制不一致 | 中 | Theme 不可变；setTheme 触发完整 invalidate；像素一致性测试 |
| ResizeObserver 与 DPR 监听重复触发 | 低 | invalidate 幂等（dirty flag） |
| 1M 行 mock 数据 OOM | 中 | playground 列式 TypedArray 生成器；InMemoryDataSource 文档明确上限 |
| iOS Safari 快速滑动时 scroll 事件被节流到 ~30Hz，Canvas 内容落后视觉 1-2 帧 | 中 | 已知 quirk；Phase 1 接受。Phase 2+ 可探索 `visualViewport` + 预测性渲染 |

### 9.2 未决项（实现前 sanity check 即可定）

1. `CHUNK_SIZE`：基线 1024；实现后 bench 调到 512 / 2048
2. measureText LRU 容量：基线 10000；看真实命中率
3. ScrollMapper SAFE_MAX：基线 6_000_000；最终用各浏览器实测做最低公约数
4. Frozen 投影渐变范围：基线 4 CSS px
5. `@novasheet/core` 是否 zero dependency：倾向是

### 9.3 Phase 1 验收清单

**功能**

- [ ] 可挂载到任意容器，自适应尺寸（ResizeObserver 验证）
- [ ] 1M × 10 列 mock 数据，垂直/水平滚动 60fps（Chrome / Firefox / Safari macOS / iOS Safari）
- [ ] 冻结任意 N 行 + M 列，象限正确切分，投影正确
- [ ] 拖动列分隔线调整列宽，松手实时生效
- [ ] 拖动行分隔线调整行高，松手实时生效
- [ ] 单元格 text / number 类型按 Theme 正确绘制（含右对齐、千分位、省略号）
- [ ] DPR = 1 / 2 / 3 下文字与分隔线无模糊
- [ ] 切换 Theme（构造一个 mock 主题验证）触发完整重绘
- [ ] `scrollToRow(500000)` 命中正确行，可见区对齐

**工程**

- [ ] `@novasheet/core` 与 `@novasheet/react` 两个包独立可发布到 npm（dry-run）
- [ ] 类型测试通过、d.ts 完整
- [ ] Vitest 单测覆盖率 ≥ 90%（layout/、scroll/、data/、theme/）
- [ ] Playwright 跨浏览器截图回归通过
- [ ] React Strict Mode 双 mount 测试通过
- [ ] 渲染管线无硬编码视觉值（ESLint 规则 / code review）
- [ ] playground 可演示所有 Phase 1 功能、含 FPS overlay

**文档**

- [ ] README：安装、3 分钟上手、API 参考
- [ ] 架构文档：layout / render / scroll 三大子系统各一节
- [ ] Theme 自定义示例

---

## 附录 A · 关键架构决策记录（ADR-style）

| # | 决策 | 选项 | 选择 | 理由 |
|---|---|---|---|---|
| 1 | 渲染层 Canvas 形态 | 单 Canvas / 多层 Canvas / OffscreenCanvas | **单 Canvas** | 简单可控、足够快；Phase 2 再升级 |
| 2 | 滚动机制 | 原生 / 自绘 / 混合 | **原生 + 非线性映射** | 原生键盘、触控惯性、a11y、滚动条样式开箱即用；精度损失只在拖拽时感知，可接受 |
| 3 | 行高布局 | BIT / 分块 / 完整数组 | **分块（ChunkedAxis）** | 内存自适应、与未来分页对齐、局部失效支持排序/筛选 |
| 4 | 数据源 | 同步内存 / 异步分页 | **DataSource 接口同/异步双兼容；Phase 1 内置同步实现** | 一次设计撑到 Phase N，无需重写 |
| 5 | 主题 | 硬编码 / Token | **Theme Token 必须** | 引擎内零硬编码视觉值，Phase 2+ 可发布独立 theme 包 |
| 6 | 框架包装 | 无 / React / Vue / 多 | **TS 核心 + React Wrapper** | 当前明确以 React 为首要集成目标，核心保持框架无关以便扩展 |
| 7 | Canvas 单测 | jsdom mock / 像素 diff / 指令录制 | **指令录制** | 跨平台稳定、可重复、CI 友好 |

---

## 附录 B · Phase 1 之后的演进路径（概览，仅供对齐）

- **Phase 2**：选区、键盘导航、复制粘贴、单元格编辑、字段类型专属编辑器、暗色主题成品
- **Phase 3**：排序、筛选、分组、列拖拽重排、列隐藏
- **Phase 4**：服务端分页 DataSource、OPFS / IndexedDB 持久化、协同同步层
- **Phase 5**：公式引擎与计算图、引用、多视图、视图配置
- **Phase 6**：AI 能力（自然语言查询、数据洞察、智能补全）
