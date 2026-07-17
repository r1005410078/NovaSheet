# 滑动窗口数据加载/订阅 API —— 两案对比

> 状态：brainstorming 产出的方案对比稿（2026-07-05）。定稿后正式 spec 落 `docs/superpowers/specs/`。

## 需求与已锁定决策

1. 可视区域按需拉取，带倍数 overscan（每次拉 2–3 倍屏，减少滚动等待）。
2. 订阅可视区域，数据变更经推送通道（典型 WebSocket）实时更新。

| 维度 | 决定 |
| --- | --- |
| 范围 | 仅客户端 TS 接口，线上协议业务层自定 |
| 写路径 | 本期只读（方案 B 天然涉及写，见其章节） |
| 窗口 | 行×列二维 |
| 排序/筛选 | 本期不支持，留扩展位 |
| 推送类型 | 仅订阅窗口内的 cells 值更新；结构变更（删行/增行）不走推送，由拉取响应捎带 rowCount/version 检出（服务端可选推 rowCount 通告） |

两案共用的窗口/更新类型：

```ts
/** 矩形数据窗口，四端 INCLUSIVE——与 CellRange / DataSource.getRows 语义一致 */
export interface DataWindow {
  readonly startRow: number
  readonly endRow: number
  readonly startCol: number
  readonly endCol: number
}

export interface CellUpdate {
  readonly row: number          // raw 行号
  readonly fieldId: string      // 列按 fieldId 锚定（与全仓 cell 值锚定惯例一致）
  readonly value: CellValue
}
```

---

## 方案 A：`WindowedDataSource` + `WindowedDataProvider` port（数据源侧，core 调业务）

### 架构

```
业务层
  ├─ 实现 WindowedDataProvider（内部随意：WS+HTTP / 全 WS / Worker / IndexedDB / mock）
  └─ new WindowedDataSource({ schema, rowCount, provider, preloadScreens })
        ↓ 注入
core   Grid({ data: windowedSource, backend })
  ├─ DefaultGridEngine.getFrame() 出帧时 → data.hintWindow?.(可视窗口)   ← 新增缝
  └─ WindowedDataSource（core 内置，含全部难点逻辑）
        ├─ 二维块缓存（LRU，默认块 128 行 × 16 列，上限 256 块）
        ├─ 预取规划（可视窗口 × preloadScreens 对称外扩，块对齐，in-flight 去重）
        └─ 订阅窗口跟随（滚动停稳防抖 150ms 后 setWindow）
```

新增代码全部落 `core/src/kernel/data/windowed/`（纯层，零 DOM 全局；`WebSocket` 实例只存在于业务层适配器）。

### Port 契约（业务层唯一要实现的东西）

```ts
export type WindowedDataEvent =
  | { type: 'cells'; updates: readonly CellUpdate[] }   // 订阅窗口内的批量改值
  /**
   * 可选：服务端主动通告总行数变化（epoch 软失效）。
   * core 更新轴/滚动条，全部驻留块标 stale 后台重验证——旧值先画，不闪骨架。
   */
  | { type: 'rowCount'; rowCount: number; version?: number }
  /** 硬失效闸门（断线重连等）：清缓存重拉，可携新 rowCount。 */
  | { type: 'resync'; rowCount?: number }

export interface WindowSubscription {
  /** WindowedDataSource 滚动防抖后调用，告知服务端新的订阅窗口 */
  setWindow(window: DataWindow): void
  close(): void
}

/** loadRange 响应切片 */
export interface RangeSlice {
  /** 与 [startRow..endRow] 对齐，每行至少含窗口内列的字段 */
  readonly rows: readonly Row[]
  /** 响应时刻的总行数——core 据此检测结构漂移（删行/增行）并更新轴 */
  readonly rowCount?: number
  /** 可选单调数据版本；提供则 epoch 判定精确（乱序/陈旧响应可甄别丢弃） */
  readonly version?: number
}

export interface WindowedDataProvider {
  /** 拉取矩形区间 */
  loadRange(window: DataWindow, signal: AbortSignal): Promise<RangeSlice>
  /** 建立推送通道（典型 WebSocket），返回可变窗口的订阅句柄 */
  subscribe(onEvent: (event: WindowedDataEvent) => void): WindowSubscription
}
```

### `WindowedDataSource` 选项

```ts
export interface WindowedDataSourceOptions {
  readonly schema: Schema               // app 先行拉快照（getSchema/getRowCount 是同步接口）
  readonly rowCount: number             // 初始行数；后续随 rowCount 通告 / 拉取捎带更新
  readonly provider: WindowedDataProvider
  readonly preloadScreens?: number     // 预取倍数（含可视屏自身），默认 2
  readonly blockRows?: number           // 默认 128
  readonly blockCols?: number           // 默认 16
  readonly maxCachedBlocks?: number     // LRU 上限，默认 256
  readonly subscribeDebounceMs?: number // 默认 150
  readonly staleAfterMs?: number        // 块离开订阅窗口多久算可疑，默认 30_000；Infinity 关闭重验证
}
```

### `DataSource` 接口唯一改动（可选方法，向后兼容）

```ts
/** 可视窗口提示。engine 每帧调用；窗口未变时实现须 O(1) 短路。同步源不实现即可。 */
hintWindow?(window: DataWindow): void
```

装饰器链（Sort/Filter/HideRows/VisibleColumns）向下转发时做 view→raw 包络翻译（端点映射取
min/max 保守外扩）；无重排时恒等转发。canvas2d 的 `preloadVisibleRows` 行级预热保留不动。

### 内部编排

帧驱动预取管线（每帧一次，热路径短路优先）：

1. 窗口与上次相同 → return（O(1)，绝大多数帧走这条）。
2. 预取窗口 = 可视窗口按 `preloadScreens` 对称外扩，clamp 到数据边界。
3. 块规划：预取窗口相交块 − 新鲜驻留 − in-flight − cooldown = 待拉取块集（stale 驻留块参与重拉，期间保持可画）。
4. 同一块行内水平相邻块合并为一个矩形请求 → `loadRange(rect, signal)`。
5. 重置订阅防抖；停稳后 `subscription.setWindow(可视窗口)`（订阅用可视窗口而非预取窗口——服务端只推用户真正看着的区域）。

请求生命周期：

| 事件 | 处理 |
| --- | --- |
| resolve | epoch 检查（见"缓存新鲜度"）→ 写块缓存 → 回放该块 pending updates → 合并 emit 一次 `rowsChanged(minRow..maxRow)` |
| reject | 该批块进 cooldown（2s），定时器到期重跑块规划（防静止画面永久空洞）；AbortError 静默 |
| 窗口移走 | 新预取窗口外的 in-flight 请求 abort |

推送更新应用规则（`onEvent`）：

| 目标块状态 | 动作 |
| --- | --- |
| 已驻留 | 写值，帧内合并后 emit 一次 `rowsChanged` |
| in-flight | 进该块 pending buffer，loadRange 落地后回放（防"拉取快照旧于推送"竞态） |
| 未加载 | 丢弃（块被拉取时自然是新值） |

其余：`resync` → abort 全部 + 清缓存 + 若携 rowCount 则更新行数并 emit `rowCountChanged` +
重拉当前预取窗口 + emit `reset`；LRU 淘汰跳过与当前预取窗口相交的块；`getCell` 未命中返
`undefined`（renderer 现行为绘空），**不改热路径签名**；`dispose()` 由 app 在 Grid destroy 后调用。

**骨架优先渲染**是本方案的默认行为，无需额外 API：构造时给 schema + rowCount（如 100×100），
Grid 立即渲染完整网格（轴、表头、网格线、滚动条），所有单元格 miss 绘空；滚动中块数据陆续
resolve → `rowsChanged` → 增量填充。"空白"升级为 shimmer 骨架属 canvas2d painter 视觉增强
（theme token 驱动），可作为可选任务。

### 缓存新鲜度：滚回旧区域时数据已删/已增怎么办

订阅只保鲜**可视窗口**，离开订阅窗口的驻留块会静默漂移（值变、删行/增行致行号平移）。三层机制：

| 漂移类型 | 检测通道 | core 行为 |
| --- | --- | --- |
| 可视窗口内值变 | WS `cells` 推送 | 直接改块，下一帧重绘 |
| 窗口外值漂移 | 重验证（SWR）：块离开订阅窗口超 `staleAfterMs` 后再进入预取窗口 → 后台重拉 | 旧值先画不闪骨架，新值到达替换重绘 |
| 结构漂移（删/增行） | 每次 `loadRange` 响应捎带 `rowCount`/`version`（epoch）；服务端也可主动推 `rowCount` 通告 | epoch 变化 → 全部驻留块标 stale + emit `rowCountChanged`（轴/滚动条即时收缩/增长）+ 预取窗口优先重拉；陈旧 in-flight 响应按 version 甄别丢弃 |

行号平移后，按行号键控的缓存无法局部修补，所以结构漂移一律**整体软失效**
（stale-while-revalidate：旧值过渡显示直至替换，不清空、不闪骨架）；`resync` 保留为硬失效
闸门（断线重连）。**结构变更不需要 WS 推细粒度事件**——推送语义只覆盖订阅窗口内的值。

排序/筛选扩展位：未来给 `loadRange`/`subscribe` 追加可选 `view?: WindowedViewDescriptor`
参数——对既有实现是非破坏性追加（ADR），本期不定义其结构。

### 使用示例

```ts
import { Grid, WindowedDataSource } from '@zhiguang/core'
import type { WindowedDataProvider, RangeSlice } from '@zhiguang/core'
import { canvas2dBackend } from '@zhiguang/canvas2d'

function createDocProvider(docId: string): WindowedDataProvider {
  return {
    async loadRange(window, signal) {
      const q = `r0=${window.startRow}&r1=${window.endRow}&c0=${window.startCol}&c1=${window.endCol}`
      const res = await fetch(`/api/docs/${docId}/range?${q}`, { signal })
      const { rows, rowCount, version } = await res.json()
      return { rows, rowCount, version } as RangeSlice
    },
    subscribe(onEvent) {
      let ws = new WebSocket(`wss://api.example.com/docs/${docId}/watch`)
      let lastWindow: string | null = null
      const bind = () => {
        ws.onmessage = (e) => {
          const msg = JSON.parse(e.data)
          if (msg.kind === 'cells') onEvent({ type: 'cells', updates: msg.updates })
        }
        ws.onclose = () => {
          setTimeout(() => {
            ws = new WebSocket(ws.url)
            bind()
            ws.onopen = () => {
              if (lastWindow) ws.send(lastWindow)
              onEvent({ type: 'resync' })   // 掉线期间可能丢推送 → 清缓存重拉
            }
          }, 1000)
        }
      }
      bind()
      return {
        setWindow(w) {
          lastWindow = JSON.stringify({ kind: 'watch', ...w })
          if (ws.readyState === WebSocket.OPEN) ws.send(lastWindow)
        },
        close() { ws.close() },
      }
    },
  }
}

const { schema, rowCount } = await fetch(`/api/docs/${docId}/snapshot`).then((r) => r.json())
const data = new WindowedDataSource({
  schema, rowCount,
  provider: createDocProvider(docId),
  preloadScreens: 3,
})
const grid = new Grid(container, { data, backend: canvas2dBackend })

// 卸载
grid.destroy()
data.dispose()
```

业务层不碰缓存、不算窗口、不管竞态——只做「矩形 → 数据」和「事件 → 翻译」两件事。

---

## 方案 B：Grid 对象命令式 API（facade 侧，业务调 core）

### 思路

Grid 不知道"加载"这回事。facade 暴露两组东西：

1. **窗口订阅**：`grid.onViewportWindowChange(cb)` —— 可视窗口变化时回调业务层；
2. **数据推入/修改方法**：业务层自己拉数据、自己管缓存与竞态，把结果**推**进 Grid。

数据归属反转：Grid 内部持有一个 sparse 可变存储（复用 `MutableDataSource` /
`SparseExcelDataSource` 机制），构造时不再传 `data`，改传 `{ schema, rowCount }`。

### 新增 facade API 草图

```ts
// 读路径
grid.onViewportWindowChange(cb: (window: DataWindow) => void): () => void  // 帧驱动、去重后回调

// 数据推入（不进 undo 栈——远端数据不是用户操作）
grid.setRangeData(window: DataWindow, rows: readonly Row[]): void   // 拉取结果批量推入
grid.updateCells(updates: readonly CellUpdate[]): void              // 推送更新应用
grid.setRowCount(rowCount: number): void

// 结构变更：复用现有 facade 方法
grid.insertRows(beforeRow, count) / grid.deleteRows(rowIds)
grid.insertCols(...) / grid.deleteCols(...)
```

现有 `insertRows`/`deleteRows` 走 `*CommandHandler` → 事件 → **undo 栈**。远端推来的结构变更
不能让本地用户 undo，因此还需给命令路径开 `source: 'remote'` 旁路（不记 undo、不触发本地
persistence 回调）——这是 B 隐藏的架构成本。

### 使用示例（同等功能）

```ts
const grid = new Grid(container, { schema, rowCount, backend: canvas2dBackend })

// ―― 以下全部业务层自写：缓存、overscan、去重、竞态、防抖 ――
const loaded = new Set<string>()            // 块驻留表
const inflight = new Map<string, AbortController>()
let subDebounce: ReturnType<typeof setTimeout>

grid.onViewportWindowChange((win) => {
  const prefetch = expandWindow(win, 3, rowCount, colCount)   // overscan 自己算
  for (const block of missingBlocks(prefetch, loaded, inflight)) {  // 块规划自己做
    const ac = new AbortController()
    inflight.set(key(block), ac)
    loadRange(block, ac.signal)
      .then((rows) => {
        loaded.add(key(block))
        grid.setRangeData(block, rows)      // 推入
      })
      .catch(() => {/* cooldown/重试 自己管 */})
      .finally(() => inflight.delete(key(block)))
  }
  abortOutside(prefetch, inflight)          // 离场 abort 自己管
  clearTimeout(subDebounce)                 // 订阅跟随自己管
  subDebounce = setTimeout(() => ws.send(JSON.stringify({ kind: 'watch', ...win })), 150)
})

ws.onmessage = (e) => {
  const msg = JSON.parse(e.data)
  if (msg.kind === 'cells') grid.updateCells(msg.updates)   // 竞态（拉取旧于推送）自己防
}
```

（LRU 淘汰在 B 里没有归属：Grid 内部 store 只进不出，滚多远内存涨多少，除非 facade 再加
`evictRange()` 让业务层管理——又多一块自写逻辑。）

---

## 对比与推荐

两案本质是**控制反转方向**的差异：A 是 core 调业务（provider 被动应答），B 是业务调 core
（facade 被命令式驱动）。

| 维度 | A：WindowedDataSource | B：Grid 命令式 API |
| --- | --- | --- |
| 难点逻辑归属（缓存/预取/去重/竞态/淘汰/防抖） | core 实现 + 测试一次 | 每个业务方重写一遍 |
| 业务层接入量 | 适配器 ~40 行 | 编排 ~200 行起，且难写对 |
| core 新增面 | port + 内置实现 + `hintWindow` 缝 | facade +4 方法 + 内置 store + undo/persistence 旁路 |
| 与现架构一致性 | 兑现 DataSource ADR（"M4+ 服务端源仍是这个接口"）、同 backend 注入模式 | 数据归属反转，`GridOptions.data` 语义被破坏 |
| 内存控制 | 内置 LRU，上限可配 | 无淘汰归属，只进不出 |
| 数据层可测性 | 数据源可脱离 Grid headless 测（FakeProvider） | 业务逻辑绑死 Grid 实例与 DOM |
| 写路径（更新/插入/删除） | 本期不含，另立项 | 天然覆盖，但需解决 undo 旁路 |
| 演进（服务端排序/筛选、多视图共享数据） | port 带 view 扩展位；一份数据源可喂多个 Grid | 每 Grid 一份推入数据，查询语义无处安放 |

**推荐 A**，理由：

1. 需求的难点 100% 在读路径编排（缓存/预取/竞态），A 把它收进 core 测一次，B 把它摊给每个接入方；
2. A 兑现 `DataSource` 注释里 M1 就写下的 ADR，B 反转数据归属、还要给 undo 栈开旁路，架构代价更高;
3. **两案并不互斥**——B 的真实价值是"写路径 facade 方法"（`updateCells`/insert/delete 旁路），
   那是未来"协同写入"立项的内容，届时在 A 之上补 facade 写方法即得到 B 的全部能力，而不背
   B 的读路径缺点。A 先行不堵死任何 B 的后路。
