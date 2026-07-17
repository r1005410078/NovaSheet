# NovaSheet 滑动窗口数据源（WindowedDataSource）— 设计

- **日期**：2026-07-05
- **状态**：设计（待 user 复审 → BDD gate → writing-plans）
- **分支**：`main`
- **定位**：为 Grid 提供按可视区域滑动窗口的异步数据加载（overscan 预取倍数）与窗口内实时订阅更新能力。core 开传输无关 port（`WindowedDataProvider`），内置全部编排逻辑（`WindowedDataSource`），业务层只写传输适配器（典型 WebSocket + HTTP，但不绑定）。
- **前置**：
  - `packages/core/src/kernel/data/DataSource.ts` M1 ADR（"M4+ 接入服务端分页源时，新实现仍是这个接口，调用方零改动"）——本设计兑现该承诺
  - [`2026-06-10-novasheet-bdd-tdd-method-design.md`](./2026-06-10-novasheet-bdd-tdd-method-design.md)（开发方法；本 feature 必须先过 BDD gate）
  - 方案对比工作稿：仓库根目录 `sliding-window-data-api-proposals.md`（方案 A/B 完整对比与决策过程）

---

## 1. 背景与目标

### 1.1 用户故事

1. 用户进入页面，表格有 10 万行数据——立即看到完整骨架（轴、表头、滚动条就位），无需等全量数据。
2. 用户滚动，未加载区域按滑动窗口拉取填充；每次拉取可视区的 2–3 倍屏（倍数可配），减少滚动等待。
3. 用户停留时，可视区域数据经推送通道（典型 WebSocket）实时更新。
4. 用户滚走再滚回：期间服务端已删行/增行/改值——缓存过期数据被检出并平滑替换，滚动条随真实行数收缩/增长。

### 1.2 目标

| # | 能力 |
|---|---|
| 1 | **传输无关 port**：`WindowedDataProvider` 两方法（`loadRange` + `subscribe`），WS/HTTP/Worker/IndexedDB/mock 均可实现；线上协议格式完全业务自定 |
| 2 | **骨架优先**：构造给 schema + rowCount 即渲染完整网格，单元格 miss 绘空，数据到达增量填充 |
| 3 | **overscan 预取**：可视窗口 × `preloadScreens`（默认 2）对称外扩、块对齐拉取；预取区内滚动零请求 |
| 4 | **二维窗口**：拉取与订阅均为行 × 列矩形窗口 |
| 5 | **订阅窗口跟随**：滚动停稳（防抖 150ms）后 `setWindow(可视窗口)`；窗口内 `cells` 推送即时生效 |
| 6 | **缓存新鲜度**：SWR 重验证（离开订阅窗口超时的块滚回时后台重拉）+ epoch 检测（`loadRange` 捎带 rowCount/version 检出结构漂移）|
| 7 | **竞态正确性**：in-flight 去重、离场 abort、陈旧响应按 version 甄别丢弃、推送与拉取的 pending buffer 回放 |
| 8 | **内存有界**：二维块 LRU，上限可配，预取窗口内的块受保护 |
| 9 | **热路径不变**：`getCell` 仍同步 O(1)，`DataSource` 既有实现零改动（新缝为可选方法）|

### 1.3 非目标

- 不做写路径（编辑提交、乐观更新、冲突处理）——协同写入另立项；届时在本设计之上补 facade 写方法
- 不做排序/筛选与远程源的组合——port 留 `WindowedViewDescriptor` 扩展位（ADR A5），本期不定义其结构
- 不做细粒度结构推送（`rowsDeleted`/`rowsInserted` 事件）——结构漂移走整体软失效（ADR A3）
- 不做 shimmer 骨架视觉（miss 格沿用现行绘空；骨架样式是 canvas2d painter 增强，可后续单独做）
- 不做服务端协议规范（消息 JSON、鉴权、重连策略均为业务层职责；适配器示例仅供参考）

---

## 2. 架构

```
业务层 (React app / storybook)
  ├─ 实现 WindowedDataProvider（传输细节自定）
  └─ new WindowedDataSource({ schema, rowCount, provider, preloadScreens })
        ↓ 注入
core   Grid({ data: windowedSource, backend })
  ├─ DefaultGridEngine.getFrame() 出帧时 → data.hintWindow?.(可视窗口)   ← 新增缝（§5）
  └─ WindowedDataSource（core 内置，含全部编排难点）
        ├─ 二维块缓存（LRU）
        ├─ 预取规划（外扩、块对齐、去重、cooldown、SWR）
        ├─ 订阅窗口跟随（防抖 setWindow）
        └─ epoch / 新鲜度管理
```

- **控制反转方向**：core 调业务（provider 被动应答）。备选方案 B（业务调 core：facade 暴露窗口事件 + 数据推入方法）经对比否决，见 ADR A1。
- **代码落点**：`packages/core/src/kernel/data/windowed/`（纯层——零 DOM/平台 UI 全局；`WebSocket` 实例只存在于业务层适配器）。`index.ts` re-export 全部公开类型。
- **架构不变量对齐**：mutation 全部经 DataSource 事件（`rowsChanged`/`rowCountChanged`/`reset`）进入既有失效管线，不触 undo 栈；每 Grid 一个 frameScheduler 的 RAF 合并不受影响（本模块只 emit 事件，不自行调度渲染）。该管线由 `DefaultGridEngine.setDataChangeRedrawCallback` + `GridRuntime` 的注入（`this.engine.setDataChangeRedrawCallback(() => this.invalidate())`）桥接实现（task 9，仿 `validationRedrawCallback` 模式）。

## 3. Port 契约

`packages/core/src/kernel/data/windowed/WindowedDataProvider.ts`（新建，纯类型）：

```ts
import type { CellValue, Row } from '../Schema'

/**
 * 矩形数据窗口，四端 INCLUSIVE——与 CellRange / DataSource.getRows 语义一致。
 * 结构同 kernel/coords 的 CellRange，刻意独立命名：selection 与 data 是不同域。
 */
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

/** loadRange 响应切片 */
export interface RangeSlice {
  /** 与 [startRow..endRow] 位置对齐（rows[i] = 第 startRow+i 行），行内至少含窗口列区间覆盖的字段 */
  readonly rows: readonly Row[]
  /** 响应时刻的总行数——结构漂移（删/增行）检测通道，强烈建议每次都带 */
  readonly rowCount?: number
  /** 可选单调数据版本；提供则 epoch 判定精确（乱序/陈旧响应可甄别丢弃） */
  readonly version?: number
}

export type WindowedDataEvent =
  | { type: 'cells'; updates: readonly CellUpdate[] }   // 定时/WS 默认通道
  /**
   * 可选：服务端主动通告总行数变化（epoch 软失效）。
   * 用于静止页面的滚动条实时收缩/增长；不推也行——下一次拉取的捎带 rowCount 同样能检出。
   */
  | { type: 'rowCount'; rowCount: number; version?: number }
  /** 软失效：标 stale + 重拉，不清空（快照轮询）。 */
  | { type: 'invalidate' }
  /** 硬失效闸门（断线重连等）：清缓存重拉当前窗口。禁止用于周期性全量刷新。 */
  | { type: 'resync'; rowCount?: number }

export interface WindowSubscription {
  /** WindowedDataSource 滚动防抖后调用，告知服务端新的订阅窗口 */
  setWindow(window: DataWindow): void
  close(): void
}

export interface WindowedDataProvider {
  /** 拉取矩形区间 */
  loadRange(window: DataWindow, signal: AbortSignal): Promise<RangeSlice>
  /** 建立推送通道（典型 WebSocket），返回可变窗口的订阅句柄；构造 WindowedDataSource 时调用一次 */
  subscribe(onEvent: (event: WindowedDataEvent) => void): WindowSubscription
}
```

`RangeSlice.rows` 契约规则：

| 项 | 约定 |
| --- | --- |
| 长度 | 必须 = `endRow − startRow + 1`；位置对齐，行内不带行号 |
| 行的键 | fieldId；至少含窗口列区间覆盖的字段；多给的字段忽略（只有请求窗口内的格写入缓存） |
| 缺字段 | 该格视为空（miss 语义） |
| 长度不符 | 多余截断、缺失保持 miss + dev 告警（协议违约不崩渲染，§7） |

## 4. WindowedDataSource

`packages/core/src/kernel/data/windowed/WindowedDataSource.ts`（新建）：

```ts
export interface WindowedDataSourceOptions {
  readonly schema: Schema               // app 先行拉快照（getSchema/getRowCount 同步，不能等 IO）
  readonly rowCount: number             // 初始行数；后续随 rowCount 通告 / 拉取捎带更新
  readonly provider: WindowedDataProvider
  readonly preloadScreens?: number     // 预取倍数（含可视屏自身），默认 2
  readonly blockRows?: number           // 缓存块行高，默认 128
  readonly blockCols?: number           // 缓存块列宽，默认 16
  readonly maxCachedBlocks?: number     // LRU 上限，默认 256
  readonly subscribeDebounceMs?: number // 订阅窗口跟随防抖，默认 150
  readonly staleAfterMs?: number        // 块离开订阅窗口多久算可疑，默认 30_000；Infinity 关闭重验证
}

export class WindowedDataSource implements DataSource {
  constructor(options: WindowedDataSourceOptions)  // 构造即 provider.subscribe() 建推送通道
  dispose(): void   // close 订阅 + abort 全部 in-flight + 清缓存；幂等；app 在 Grid.destroy() 后调用
  // DataSource 实现见下表
}
```

`DataSource` 接口方法实现映射：

| 方法 | 行为 |
| --- | --- |
| `getRowCount()` | 返回当前 rowCount（随 epoch 更新） |
| `getSchema()` | 返回构造时 schema（本期列结构固定） |
| `getCell(row, fieldId)` | fieldId→col 查表（构造期建 Map）→ 块查找 → 命中返值 + touch LRU；未命中返 `undefined`（renderer 绘空）。同步 O(1)，热路径不变 |
| `getRows(start, end)` | 同步返回缓存内容（缺失格为空），**不触发 IO**——IO 由 `hintWindow` 驱动。与 canvas2d `preloadVisibleRows` 兼容（其返回值本就被忽略） |
| `hintWindow(window)` | 预取/订阅编排入口（§5、§6） |
| `subscribe(listener)` | 标准监听器集合；emit `rowsChanged` / `rowCountChanged` / `reset` |
| `resolveUnderlyingRow` / `findViewRow` | identity（基础源） |

## 5. hintWindow 缝

`DataSource` 接口新增**可选**方法（唯一的既有契约改动，向后兼容——同步源不实现即可）：

```ts
/** 可视窗口提示。engine 每帧调用；窗口未变时实现须 O(1) 短路。 */
hintWindow?(window: DataWindow): void
```

- **调用点**：`DefaultGridEngine.getFrame()` 出帧时，以 main region 可视行列区间（view 坐标）调用 `this.data.hintWindow?.(window)`。每帧一次，窗口比较相同即短路，对同步源零成本。
- **装饰链转发**：`SortLayer`/`FilterLayer`/`HideRowsLayer`/`VisibleColumnsDataSource` 向下转发时做 view→raw **包络翻译**（端点经 `resolveUnderlyingRow`（行）/可见列映射（列）取 min/max 保守外扩）；无重排时恒等转发。远程源 × 激活 sort/filter 的组合本期不支持（§1.3），包络翻译保证语义上不错、只可能多拉。
- **canvas2d 不动**：`preloadVisibleRows` 行级预热保留，远程源不依赖它（`getRows` 对其是纯缓存读）。

## 6. 内部编排

### 6.1 帧驱动预取管线（每帧一次，短路优先）

1. 窗口与上次相同 → return（O(1)，绝大多数帧走这条）。
2. 预取窗口 = 可视窗口按 `preloadScreens` 对称外扩（行、列同倍数），clamp 到 `[0, rowCount-1] × [0, colCount-1]`。
3. 块规划：预取窗口相交块 − 新鲜驻留 − in-flight − cooldown = 待拉取块集（stale 驻留块参与重拉，期间保持可画）。
4. 同一块行内水平相邻的待拉取块合并为一个矩形 → `provider.loadRange(rect, signal)`，每请求一个 `AbortController`。
5. 重置订阅防抖计时器；`subscribeDebounceMs` 内无新窗口 → `subscription.setWindow(可视窗口)`。

订阅窗口用**可视窗口**而非预取窗口——服务端只推用户真正看着的区域，预取区新鲜度靠 SWR 兜底（ADR A2）。

### 6.2 请求生命周期

| 事件 | 处理 |
| --- | --- |
| resolve | epoch 检查（§6.4）→ 写块缓存 + 刷新块新鲜时钟 → 回放该块 pending updates → 帧内合并 emit 一次 `rowsChanged(minRow..maxRow)` |
| reject | 该批块进 cooldown（2s），置定时器到期重跑块规划（防静止画面永久空洞）；`AbortError` 静默 |
| 窗口移走 | 新预取窗口外的 in-flight 请求 abort |

### 6.3 推送应用规则（`provider.subscribe` 的 `onEvent`）

| 事件 / 目标块状态 | 动作 |
| --- | --- |
| `cells` / 已驻留 | 写值 + 刷新新鲜时钟，帧内合并后 emit 一次 `rowsChanged` |
| `cells` / in-flight | 进该块 pending buffer，loadRange 落地后回放（防"拉取快照旧于推送"竞态） |
| `cells` / 未加载 | 丢弃（块被拉取时自然是新值） |
| `rowCount` | epoch 软失效（§6.4），无数据落块 |
| `invalidate` | 软失效：`markAllStale` + 重拉当前预取窗口，**不清空**缓存（快照轮询） |
| `resync` | abort 全部 in-flight + 清缓存与 buffer + 若携 rowCount 则更新并 emit `rowCountChanged` + 重拉当前预取窗口 + emit `reset` |

### 6.3.1 Anti-patterns（禁止）

| 错误做法 | 为何卡死 / 劣化 | 正确做法 |
| --- | --- | --- |
| 定时 poll 发 `resync` | 每轮清全部缓存并重拉预取窗口；若 `loadRange` 再全表 build，主线程假死 | 发 `cells`（可见窗）或 `invalidate`（软重拉） |
| `loadRange` 先全表物化再 slice | 预取多块并发 × O(行×列) | 只物化请求矩形，O(窗口) |
| 业务手写 poll + remount Grid | 滚动归零、重建成本高 | 用 `createSnapshotWindowedProvider` / 保留 Grid + `replaceSnapshot` |

`resync` **不是**库缺陷：它是断线硬失效闸门。卡死通常来自业务 provider 全表 `loadRange` × 误用定时 `resync` 放大。DEV 下短时间多次 `resync` 会 `console.warn`。

### 6.4 缓存新鲜度：SWR + epoch

订阅只保鲜**可视窗口**，离开订阅窗口的驻留块会静默漂移。三层机制：

| 漂移类型 | 检测通道 | core 行为 |
| --- | --- | --- |
| 可视窗口内值变 | `cells` 推送 | 直接改块，下一帧重绘 |
| 窗口外值漂移 | SWR 重验证：块新鲜时钟超 `staleAfterMs` 后再进入预取窗口 → 后台重拉 | 旧值先画不闪骨架，新值到达替换重绘 |
| 结构漂移（删/增行） | `RangeSlice` 捎带 `rowCount`/`version`；或 `rowCount` 主动通告 | epoch 软失效（见下） |

- **块新鲜时钟** = max(最近一次 loadRange 落地时刻, 最近一次被订阅窗口覆盖的时刻)。
- **epoch 状态** = `{ version?, rowCount }`。`RangeSlice` 到达时：
  - `slice.version < 当前 version` → **陈旧响应，丢弃**（块保持 miss，规划器自然重拉）；
  - `slice.version > 当前 version`，或无 version 但 `slice.rowCount ≠ 当前 rowCount` → **epoch 软失效**：更新 rowCount（emit `rowCountChanged`，轴/滚动条即时收缩/增长）、全部驻留块标 stale、本 slice 落块（它已是新 epoch 数据）、预取窗口优先重拉；
  - 否则正常落块。
- 行号平移后按行号键控的缓存无法局部修补，故结构漂移一律**整体软失效**（stale-while-revalidate：旧值过渡显示直至替换，不清空、不闪骨架）；`resync` 保留为硬失效闸门。

### 6.5 LRU 淘汰

超 `maxCachedBlocks` 时淘汰最久未访问块；与当前预取窗口相交的块受保护不淘汰。`getCell` 命中即 touch。

### 6.6 事件合并

同一帧内的多次块落地 / cells 推送合并为一次 `rowsChanged(minRow..maxRow)`（microtask/frame 边界 flush），避免事件风暴；下游 Grid 的 frameScheduler 本就 coalesce RAF，双层合并后每帧至多一次重绘。

## 7. 错误处理边界

| 情形 | 行为 |
| --- | --- |
| `RangeSlice.rows` 长度与窗口不符 | 多余截断、缺失保持 miss + dev 告警（协议违约不崩渲染） |
| `provider.subscribe` 抛错 / 建立失败 | 降级为纯拉取模式 + dev 告警（数据可用，不实时；SWR 重验证仍工作） |
| provider 回调（onEvent）内的异常 | 捕获 + dev 告警，不打断帧循环 |
| `dispose()` 后到达的 resolve / 推送 / hint | 一律忽略（disposed flag）；`dispose` 幂等 |
| loadRange reject（网络等 IO 错误） | cooldown 2s 后由定时器重跑块规划；`AbortError` 静默 |

## 8. 示例用法

```ts
import { Grid, WindowedDataSource } from '@novasheet/core'
import type { WindowedDataProvider, RangeSlice } from '@novasheet/core'
import { canvas2dBackend } from '@novasheet/canvas2d'

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
          const msg = JSON.parse(e.data)                 // 线上协议格式完全自定
          if (msg.kind === 'cells') onEvent({ type: 'cells', updates: msg.updates })
          if (msg.kind === 'rowCount') onEvent({ type: 'rowCount', rowCount: msg.rowCount })
        }
        ws.onclose = () => {
          setTimeout(() => {                             // 重连策略业务自定
            ws = new WebSocket(ws.url)
            bind()
            ws.onopen = () => {
              if (lastWindow) ws.send(lastWindow)        // 恢复订阅窗口
              onEvent({ type: 'resync' })                // 掉线期间可能丢推送 → 清缓存重拉
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

## 9. 测试策略与 BDD 场景矩阵

### 9.1 kernel 白盒（纯 TDD，`bun:test` + 手动 resolve 的 `FakeProvider`）

窗口外扩/clamp 数学、块对齐与规划集合运算（去重/水平合并/cooldown/stale 参与）、LRU 与预取窗口保护、pending buffer 竞态回放、epoch 三分支（陈旧丢弃/软失效/正常落块）、SWR 新鲜时钟、离场 abort、防抖 setWindow、帧内事件合并、dispose 幂等、协议违约（长度不符）容错。

### 9.2 BDD 外环（Core acceptance，场景 MD 先行于实现，`packages/core/tests/acceptance/**/scenarios/*.md`）

| 场景 | Given / When / Then 概要 |
| --- | --- |
| windowed-initial-skeleton | 10 万行构造 → 首帧即得完整可滚动结构；首窗口 slice 落地 → `rowsChanged` |
| windowed-scroll-prefetch | 预取区内滚动 → provider 零调用；滚出预取区 → 新块拉取且请求块对齐 |
| windowed-push-update | 订阅窗口内 `cells` 推送 → `getCell` 返新值 + `rowsChanged` |
| windowed-subscription-follow | 滚动停稳超防抖 → `setWindow` 收到新可视窗口；抖动滚动不触发 |
| windowed-stale-revalidate | 块离开订阅窗口超 `staleAfterMs` 后滚回 → 旧值可读 + 后台重拉 → 新值替换 |
| windowed-epoch-shrink | 重验证响应 rowCount 变小 → `rowCountChanged` + 全块 stale + 预取窗口重拉 |
| windowed-resync | `resync` → `reset` + 缓存清空 + 当前窗口重拉 |
| windowed-dispose | `dispose` → 订阅 close、in-flight abort、后续事件无效果、二次 dispose 无异常 |

`mbd validate` + `manifest` 过；`lint:scenario-coverage` 不退化。

### 9.3 hintWindow 缝（engine 侧单测）

窗口不变不透传（O(1) 短路）、装饰链 view→raw 包络翻译（含 HideRows/VisibleColumns 激活时的保守外扩）、同步源无 `hintWindow` 时零影响。

---

## A. ADR

- **A1 方案 A（数据源侧 port）over 方案 B（Grid facade 命令式 API）**：难点（缓存/预取/去重/竞态/淘汰）收进 core 测一次 vs 每个接入方重写；兑现 DataSource M1 ADR；不反转数据归属、不需要 undo 旁路。B 的真实价值（facade 写方法）属未来协同写入立项，与 A 正交。完整对比见根目录 `sliding-window-data-api-proposals.md`。
- **A2 订阅窗口 = 可视窗口（非预取窗口）**：服务端只推用户看着的区域，推送流量最小；预取区新鲜度由 SWR 重验证兜底。
- **A3 结构漂移整体软失效，无细粒度结构推送**：推送语义只覆盖订阅窗口内的值；删/增行导致行号平移后，按行号键控的缓存无法局部修补，整体 stale-while-revalidate 是正确且体验最平滑的做法。未来若需细粒度 `rowsDeleted` 推送，为事件 union 增补变体即可（非破坏）。
- **A4 version 可选，rowCount 弱 epoch**：不强制服务端实现版本序列；带 version 则乱序响应可精确甄别，只带 rowCount 则用行数变化做弱判定（同数结构互换检不出，属可接受盲区，SWR 超时兜底）。
- **A5 排序/筛选扩展位**：未来给 `loadRange`/`subscribe` 追加可选 `view?: WindowedViewDescriptor` 参数，对既有 provider 实现是非破坏追加；本期不定义其结构。
- **A6 坐标锚定**：窗口用行/列 index（几何域）；`CellUpdate` 用 fieldId（身份域）——与全仓"cell 值按 fieldId 锚定"惯例一致。本期列结构固定，index↔fieldId 映射稳定。
