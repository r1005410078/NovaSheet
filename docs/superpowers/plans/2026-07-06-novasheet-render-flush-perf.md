# Render Flush Perf（handle 池复用 / frame 去重 / measureText 缓存）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 消除 render flush 的三个 profiler 实证热点——resize handle 层每帧 DOM 拆重建（Layout 774ms/35% + Recalc Style 316ms + handle sync 链）、flush 内 5 次重复 `engine.getFrame()`（`viewColToRaw` 放大 177ms）、overflow 扫描与截断的无缓存 `measureText`（~165ms）。

**Architecture:** 三个独立、无相互依赖的定点修复：① `DomHandleLayer` 的 handle 池从「按行/列号键控」改为「按池内位置复用」，滚动稳态零 DOM 增删；② `GridRuntime` 的 `invalidate()`/`paintSync()` 构建一次 frame 并下传给全部 `sync*`（可选参数、guard 后再兜底取 frame，保持惰性）；③ `Canvas2DRenderer.overflowExtra` 增加文本宽度缓存、`CellPainter.truncationCache` 增加容量上限。不引入新依赖、不改公开 API。

**Tech Stack:** TypeScript strict（`noUncheckedIndexedAccess` + `verbatimModuleSyntax`）、bun workspaces、`bun:test`（`mock`/`spyOn`，非 vitest）、happy-dom（core 的 DOM 测试）、`RecordingContext2D`（canvas2d 测试）。

## Global Constraints

- 工具链 **bun only**：测试 `bun test <file>`；typecheck `bun run --filter '*' typecheck`；lint `bun run lint`（0 error/warning）。
- 测试框架 `bun:test`（`mock`/`spyOn`）；canvas 测试用 `packages/canvas2d/tests/helpers/recording-context.ts` 的 `createRecordingContext()`（其 `measureText` 确定性返回 `7px/字符`）。
- **行为契约不变**：`DomHandleLayer` 元素结构（`data-novasheet-resize-handle` 属性、2 个 grip span、`role="separator"`、`aria-orientation`、`tabIndex=0`、cursor）与 `readHandle` 的 dataset 读取语义保持不变；`sync([])` 之后 DOM 中 handle 数为 0（已有测试断言此点，必须继续通过）。
- **性能不变量（Task 1 的验收本体）**：handle 数量不变的连续 `sync`（滚动稳态）零 DOM 节点增删、零 `addEventListener`。
- 缓存上限常量统一为 `8192`，超限整体 `clear()`（不引入 LRU 依赖，与仓库现有 pragmatism 一致）。
- Conventional Commits：英文 `type(scope)` 前缀 + 中文 subject；一 task 一 commit；never `--no-verify`。
- TDD 红先行：每个测试先跑出失败（并核对失败原因是「断言不成立」而非编译错误之外的意外），再实现转绿。

---

### Task 1: DomHandleLayer handle 池按位置复用

**Files:**
- Modify: `packages/core/src/dom/interaction/DomHandleLayer.ts`
- Test: `packages/core/tests/dom/interaction/DomHandleLayer.test.ts`（追加用例，已有用例必须保持绿）

**Interfaces:**
- Consumes: `ResizeHandleRect` / `ResizeHandleKind`（`packages/core/src/kernel/interaction/HandleLayout.ts`）。
- Produces: `DomHandleLayer.sync(handles: readonly ResizeHandleRect[]): void` 签名不变；内部 `pool: Map<string, HTMLDivElement>` 替换为 `colPool: HTMLDivElement[]` + `rowPool: HTMLDivElement[]`；模块内 `handleKey` 函数删除。

**背景（给实现者）：** 现实现按 `row:${rowIndex}` / `col:${colIndex}` 键控缓存 handle 元素。垂直滚动时可见行号每帧整体位移 → 几乎整池每帧 `remove()` + `createElement` + 2 grip + 7 × `addEventListener` + `appendChild`，profiler 显示由此产生的 Layout/Recalculate Style/Pre-Paint 占整帧 ~57%。修复：同 kind 的 handle 元素除 dataset/position 外完全同构，改为按池内下标复用，滚动稳态只写 dataset + style。

**已知可接受的行为差异（不要 STOP）：** 被复用的元素若恰好处于 hover/焦点态，会「带着状态」变成另一行/列的 handle。hover 态由浏览器在指针不再覆盖时触发 `pointerleave` 清除；键盘焦点保持在池内同一元素上（此前滚动会直接销毁焦点元素，新行为不差于旧行为）。

- [ ] **Step 1: 写失败测试（追加到现有 describe 之后）**

```ts
describe('DomHandleLayer — 位置复用池', () => {
  function makeLayer() {
    const container = document.createElement('div')
    Object.assign(container.style, { position: 'relative', width: '400px', height: '300px' })
    document.body.appendChild(container)
    const layer = new DomHandleLayer(container, {
      onResizePointerDown: mock(() => {}),
      onResizePointerMove: mock(() => {}),
      onResizePointerUp: mock(() => {}),
      onResizeKeyboard: mock(() => {}),
    })
    layer.attach()
    return { container, layer }
  }

  function rowHandle(rowIndex: number): Parameters<DomHandleLayer['sync']>[0][number] {
    return {
      kind: 'row',
      id: `row-${rowIndex}`,
      rowIndex,
      x: 0,
      y: rowIndex * 28 - 4,
      width: 48,
      height: 8,
    }
  }

  it('行号整体位移时复用既有节点：零增删、dataset 与位置更新', () => {
    const { container, layer } = makeLayer()
    layer.sync([rowHandle(0), rowHandle(1), rowHandle(2)])
    const before = [...container.querySelectorAll('[data-novasheet-resize-handle]')]
    expect(before.length).toBe(3)

    // 模拟向下滚动 5 行：行号全变，数量不变
    layer.sync([rowHandle(5), rowHandle(6), rowHandle(7)])
    const after = [...container.querySelectorAll('[data-novasheet-resize-handle]')]
    expect(after.length).toBe(3)
    // 元素身份完全复用（零 createElement / remove）
    expect(after[0]).toBe(before[0]!)
    expect(after[1]).toBe(before[1]!)
    expect(after[2]).toBe(before[2]!)
    // dataset 与位置已更新（readHandle 依赖 dataset）
    expect((after[0] as HTMLElement).dataset['rowIndex']).toBe('5')
    expect((after[2] as HTMLElement).dataset['rowIndex']).toBe('7')
    expect((after[0] as HTMLElement).style.top).toBe(`${5 * 28 - 4}px`)

    layer.destroy()
    document.body.removeChild(container)
  })

  it('数量缩减时裁掉多余节点，扩张时只补差额', () => {
    const { container, layer } = makeLayer()
    layer.sync([rowHandle(0), rowHandle(1), rowHandle(2)])
    layer.sync([rowHandle(0)])
    expect(container.querySelectorAll('[data-novasheet-resize-handle]').length).toBe(1)

    const survivor = container.querySelector('[data-novasheet-resize-handle]')
    layer.sync([rowHandle(0), rowHandle(1)])
    const grown = [...container.querySelectorAll('[data-novasheet-resize-handle]')]
    expect(grown.length).toBe(2)
    expect(grown[0]).toBe(survivor!) // 幸存节点仍被复用

    layer.destroy()
    document.body.removeChild(container)
  })

  it('列与行分池：列 handle 不会被复用为行 handle', () => {
    const { container, layer } = makeLayer()
    layer.sync([
      { kind: 'column', id: 'name', fieldId: 'name', colIndex: 0, x: 96, y: 0, width: 8, height: 32 },
    ])
    const colEl = container.querySelector('[data-novasheet-resize-handle]') as HTMLElement
    expect(colEl.style.cursor).toBe('col-resize')

    layer.sync([rowHandle(0)])
    const rowEl = container.querySelector('[data-novasheet-resize-handle]') as HTMLElement
    expect(rowEl).not.toBe(colEl)
    expect(rowEl.style.cursor).toBe('row-resize')
    expect(rowEl.dataset['nsResize']).toBe('row')

    layer.destroy()
    document.body.removeChild(container)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test packages/core/tests/dom/interaction/DomHandleLayer.test.ts`
Expected: FAIL——现实现按 key 键控，「行号整体位移」用例中旧 key 全部 miss，`after[0]` 是新建元素，`expect(after[0]).toBe(before[0])` 不成立。

- [ ] **Step 3: 实现位置复用池**

在 `DomHandleLayer.ts` 中：

1. import 增加 `ResizeHandleKind`（type import，来源同 `ResizeHandleRect`）。
2. 字段替换：删除 `private pool = new Map<string, HTMLDivElement>()`，改为：

```ts
  /**
   * 位置复用池（列/行分池）：滚动时 handle 数量基本不变而行列号整体位移，
   * 按池内下标复用元素、只重写 dataset 与位置，避免整池 DOM 拆重建
   * 触发的每帧 Layout/Recalculate Style（profiler 实证 ~57% 帧时间）。
   */
  private colPool: HTMLDivElement[] = []
  private rowPool: HTMLDivElement[] = []
```

3. `sync` 替换为：

```ts
  sync(handles: readonly ResizeHandleRect[]): void {
    if (!this.attached || this.destroyed) return
    const cols: ResizeHandleRect[] = []
    const rows: ResizeHandleRect[] = []
    for (const handle of handles) (handle.kind === 'column' ? cols : rows).push(handle)
    this.syncKind(this.colPool, cols, 'column')
    this.syncKind(this.rowPool, rows, 'row')
  }

  private syncKind(
    pool: HTMLDivElement[],
    handles: readonly ResizeHandleRect[],
    kind: ResizeHandleKind,
  ): void {
    for (let i = 0; i < handles.length; i++) {
      const handle = handles[i]!
      const el = pool[i] ?? this.createHandle(kind, pool)
      if (handle.fieldId !== undefined) el.dataset['fieldId'] = handle.fieldId
      else delete el.dataset['fieldId']
      if (handle.colIndex !== undefined) el.dataset['colIndex'] = String(handle.colIndex)
      else delete el.dataset['colIndex']
      if (handle.rowIndex !== undefined) el.dataset['rowIndex'] = String(handle.rowIndex)
      else delete el.dataset['rowIndex']
      Object.assign(el.style, {
        left: `${handle.x}px`,
        top: `${handle.y}px`,
        width: `${handle.width}px`,
        height: `${handle.height}px`,
      })
    }
    while (pool.length > handles.length) pool.pop()!.remove()
  }
```

4. `ensureHandle(key, handle)` 改名为 `createHandle(kind, pool)`——去掉 key/dataset 初始化（dataset 由 `syncKind` 每次写入），保留元素结构与监听器：

```ts
  private createHandle(kind: ResizeHandleKind, pool: HTMLDivElement[]): HTMLDivElement {
    const el = document.createElement('div')
    el.setAttribute('data-novasheet-resize-handle', '')
    el.dataset['nsResize'] = kind

    const vertical = kind === 'column'
    el.setAttribute('role', 'separator')
    el.setAttribute('aria-orientation', vertical ? 'vertical' : 'horizontal')
    el.tabIndex = 0
    Object.assign(el.style, {
      position: 'absolute',
      pointerEvents: 'auto',
      touchAction: 'none',
      cursor: vertical ? 'col-resize' : 'row-resize',
    })

    for (let i = 0; i < 2; i++) {
      const grip = document.createElement('span')
      grip.setAttribute('data-novasheet-resize-grip', '')
      grip.setAttribute('aria-hidden', 'true')
      el.appendChild(grip)
    }

    el.addEventListener('pointerenter', this.onPointerEnter)
    el.addEventListener('pointerleave', this.onPointerLeave)
    el.addEventListener('pointerdown', this.onPointerDown)
    el.addEventListener('pointermove', this.onPointerMove)
    el.addEventListener('pointerup', this.onPointerUp)
    el.addEventListener('pointercancel', this.onPointerUp)
    el.addEventListener('keydown', this.onKeyDown)
    this.layer.appendChild(el)
    pool.push(el)
    return el
  }
```

5. `destroy()` 中 `for (const el of this.pool.values()) el.remove(); this.pool.clear()` 改为：

```ts
    for (const el of this.colPool) el.remove()
    for (const el of this.rowPool) el.remove()
    this.colPool.length = 0
    this.rowPool.length = 0
```

6. 删除文件底部的 `handleKey` 函数（已无引用）。

注意：dataset 属性访问用方括号（`el.dataset['fieldId']`），与 strict + `noUncheckedIndexedAccess` 下仓库现有写法一致（原代码 `el.dataset.nsResize` 若 typecheck 通过也可保留点号——以 `bun run --filter @novasheet/core typecheck` 结果为准）。

- [ ] **Step 4: 跑测试确认全绿（含既有用例）**

Run: `bun test packages/core/tests/dom/interaction/DomHandleLayer.test.ts`
Expected: PASS，含既有「sync 创建列/行 handle 节点并在移除时回收」用例（`sync([])` → 0 节点仍成立：`syncKind` 对空数组会把池裁到 0）。

再跑关联面：`bun test packages/core/tests/dom/` 全绿（resize 交互相关测试都在这层）。

- [ ] **Step 5: typecheck + commit**

Run: `bun run --filter @novasheet/core typecheck`
Expected: exit 0

```bash
git add packages/core/src/dom/interaction/DomHandleLayer.ts packages/core/tests/dom/interaction/DomHandleLayer.test.ts
git commit -m "perf(core): DomHandleLayer handle 池按位置复用，滚动稳态零 DOM 增删"
```

---

### Task 2: GridRuntime flush 单帧构建 frame 下传

**Files:**
- Modify: `packages/core/src/dom/runtime/GridRuntime.ts`（`invalidate()` 约 2284 行、`paintSync()` 约 2301 行、`syncResizeHandles` 约 2325 行、`syncHideToggleHandles` 约 2332 行、`syncHideColToggleHandles` 约 2341 行、`syncFillHandle` 约 2350 行、`syncCellEditorPosition` 约 2867 行）
- Test: Create `packages/core/tests/dom/runtime/GridRuntime.frame-dedup.test.ts`

**Interfaces:**
- Consumes: `GridEngine.getFrame(): RenderFrame`；测试用 `makeMockGridEngine`（`packages/core/tests/helpers/mock-grid-engine.ts`，`getFrame` 已是 `mock(() => frame)`）。
- Produces: 5 个 `sync*` 私有方法签名统一追加**可选**参数 `frame?: ReturnType<GridEngine['getFrame']>`；其余调用点（约 492/1811/1843 行）不传参、行为不变。

**背景：** flush 一帧内 `getRenderFrame()` 构建一次 frame 后，`syncResizeHandles`/`syncHideToggleHandles`/`syncHideColToggleHandles`/`syncFillHandle`/`syncCellEditorPosition` 又各自调用一次 `engine.getFrame()`。`getFrame` 内含 raw→view 映射与格式解析，profiler 显示 `viewColToRaw` total 177.5ms/8.1% 即为此放大。

**Plan-risk（实现者注意）：** 不要用「默认参数」写法（`frame = this.engine.getFrame()`）——默认值在方法体的 guard **之前**求值，会让 `syncCellEditorPosition` 这类「guard 早退、常态不取 frame」的方法在无参调用路径上反而多一次 `getFrame`。统一用可选参数 + guard 后 `frame ?? this.engine.getFrame()` 兜底。若发现 `getRenderFrame()`（带 `cellEdit`/`viewPipeline` 注入）与 `engine.getFrame()` 的差异会改变某个 `sync*` 的行为（见下方逐个说明），STOP+ASK。

`getRenderFrame` 相比 `engine.getFrame()` 只多两处：`viewPipeline` 注入（`computeResizeHandles`/`computeFillHandleRect`/`hideToggle.update` 均不读该字段）与 `activeCustomEditorCellEdit` 注入（仅当 engine frame 无 `cellEdit` 且自定义编辑器激活；`syncCellEditorPosition` 有 `this.cellEditor?.isOpen()` 前置 guard，内置编辑器与自定义编辑器互斥，故注入值不会进入该方法逻辑）。结论：下传 `getRenderFrame()` 的产物是安全的。

- [ ] **Step 1: 写失败测试**

创建 `packages/core/tests/dom/runtime/GridRuntime.frame-dedup.test.ts`：

```ts
import { describe, expect, it, mock } from 'bun:test'
import { GridRuntime } from '@novasheet/core'
import type { RenderBackend, WebHost } from '@novasheet/core'
import { DomHandleLayer } from '../../../src/dom/interaction/DomHandleLayer'
import { makeMockGridEngine } from '../../helpers/mock-grid-engine'

function makeHost(): WebHost {
  return {
    attach: mock(() => {}),
    applyScrollbarTheme: mock(() => {}),
    setScrollSize: mock(() => {}),
    setCursor: mock(() => {}),
    scrollTo: mock(() => {}),
    getDpr: () => 1,
    getContainerSize: () => ({ width: 400, height: 300 }),
    getContainerBoundingRect: () => ({ left: 0, top: 0 }),
    getScrollPosition: () => ({ scrollTop: 0, scrollLeft: 0 }),
    focusScrollHost: mock(() => {}),
    destroy: mock(() => {}),
  } as unknown as WebHost
}

function makeRenderer(): RenderBackend {
  return {
    mount: mock(() => {}),
    resize: mock(() => {}),
    render: mock(() => {}),
    invalidate: mock(() => {}),
    destroy: mock(() => {}),
  } as unknown as RenderBackend
}

describe('GridRuntime flush — engine.getFrame 去重', () => {
  it('一次 flush 内 getFrame 恰好调用一次（handleLayer 在场）', () => {
    const engine = makeMockGridEngine()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const handleLayer = new DomHandleLayer(container, {
      onResizePointerDown: mock(() => {}),
      onResizePointerMove: mock(() => {}),
      onResizePointerUp: mock(() => {}),
      onResizeKeyboard: mock(() => {}),
    })
    handleLayer.attach()
    const runtime = new GridRuntime({ engine, host: makeHost(), renderer: makeRenderer(), handleLayer })

    const rafs: FrameRequestCallback[] = []
    const originalRaf = globalThis.requestAnimationFrame
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      rafs.push(cb)
      return rafs.length
    }) as typeof requestAnimationFrame

    const getFrameMock = engine.getFrame as unknown as { mock: { calls: unknown[] } }
    const before = getFrameMock.mock.calls.length
    runtime.handleHostResize(100, 100, 1)
    rafs[rafs.length - 1]!(performance.now())
    const callsInFlush = getFrameMock.mock.calls.length - before

    globalThis.requestAnimationFrame = originalRaf
    runtime.destroy()
    document.body.removeChild(container)

    expect(callsInFlush).toBe(1)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test packages/core/tests/dom/runtime/GridRuntime.frame-dedup.test.ts`
Expected: FAIL，`callsInFlush` 实测 `2`（`getRenderFrame` 1 次 + `syncResizeHandles` 1 次；fill/hideToggle/cellEditor 均因层不在场而 guard 早退）。若实测不是 2，先核对原因再继续（可能挂接路径有额外 getFrame——STOP+ASK）。

- [ ] **Step 3: 实现下传**

1. 5 个方法签名与取帧方式统一改为（以 `syncResizeHandles` 为例，其余同型）：

```ts
  /** 根据当前 frame 同步 resize handle layer；flush 路径复用已构建的 frame，避免重复 getFrame。 */
  private syncResizeHandles(frame?: ReturnType<GridEngine['getFrame']>): void {
    if (!this.handleLayer || this.resizeDrag.active) return
    const f = frame ?? this.engine.getFrame()
    this.handleLayer.sync(computeResizeHandles(f))
  }
```

逐个对应：

```ts
  private syncHideToggleHandles(frame?: ReturnType<GridEngine['getFrame']>): void {
    if (!this.hideToggleHandle) return
    const f = frame ?? this.engine.getFrame()
    this.hideToggleHandle.update(f.collapsedRowGaps, {
      rowHeaderWidth: f.viewport.rowHeaderWidth,
    })
  }

  private syncHideColToggleHandles(frame?: ReturnType<GridEngine['getFrame']>): void {
    if (!this.hideColToggleHandle) return
    const f = frame ?? this.engine.getFrame()
    this.hideColToggleHandle.update(f.collapsedColGaps, {
      headerHeight: f.viewport.headerHeight,
    })
  }

  private syncFillHandle(frame?: ReturnType<GridEngine['getFrame']>): void {
    if (!this.fillLayer) return
    if (this.resizeDrag.active || this.activeDrag?.active || this.engine.isCellEditing()) {
      this.fillLayer.sync(null)
      return
    }
    const f = frame ?? this.engine.getFrame()
    const range = f.selection?.selectedRange
    if (!range) {
      this.fillLayer.sync(null)
      return
    }
    const visualRange = mergeVisualRange(f.mergeRegions, range, f.selection?.activeCell)
    this.fillLayer.sync(computeFillHandleRect(f, visualRange))
  }

  private syncCellEditorPosition(frame?: ReturnType<GridEngine['getFrame']>): void {
    if (!this.cellEditor?.isOpen()) return
    const f = frame ?? this.engine.getFrame()
    const session = f.cellEdit
    if (!session) {
      this.cellEditor.close()
      return
    }
    const rect = this.computeCellEditorRect(f, session.cell)
    if (!rect) {
      this.cancelCellEdit()
      return
    }
    this.cellEditor.syncRect(rect)
  }
```

（`syncFillHandle` 内注释「与选区边框一致…」保留原文；上面为节省篇幅省略。）

2. `invalidate()` 与 `paintSync()` 两处，把 5 个无参调用改为传 `frame`：

```ts
      const frame = this.getRenderFrame()
      this.renderer.render(frame)
      this.syncSelectionOverlay(frame)
      this.notifySelectionChange(frame)
      this.syncResizeHandles(frame)
      this.syncFillHandle(frame)
      this.syncHideToggleHandles(frame)
      this.syncHideColToggleHandles(frame)
      this.syncCellEditorPosition(frame)
```

3. 其他调用点（约 492 行 `syncFillHandle: () => this.syncFillHandle()`、1811 行、1843 行）不动——可选参数自动兼容。

- [ ] **Step 4: 跑测试确认通过 + 回归**

Run: `bun test packages/core/tests/dom/runtime/GridRuntime.frame-dedup.test.ts`
Expected: PASS（`callsInFlush === 1`）

Run: `bun test packages/core/tests/dom/`
Expected: 全绿（fill/undo/reorder 等既有 runtime 测试不受影响）。

- [ ] **Step 5: typecheck + commit**

Run: `bun run --filter @novasheet/core typecheck`
Expected: exit 0

```bash
git add packages/core/src/dom/runtime/GridRuntime.ts packages/core/tests/dom/runtime/GridRuntime.frame-dedup.test.ts
git commit -m "perf(core): GridRuntime flush 单帧构建 frame 下传，去除 sync* 重复 getFrame"
```

---

### Task 3: overflow 扫描与截断的 measureText 缓存与上限

**Files:**
- Modify: `packages/canvas2d/src/render/Canvas2DRenderer.ts`（`setTheme` 约 242 行、`overflowExtra` 约 785-813 行、类字段区）
- Modify: `packages/canvas2d/src/painters/CellPainter.ts`（`truncationCache` 约 104 行、`hardCut` 约 331 行、`truncate` 约 358 行）
- Test: Create `packages/canvas2d/tests/render/Canvas2DRenderer.text-cache.test.ts`；Create `packages/canvas2d/tests/painters/CellPainter.cache-cap.test.ts`

**Interfaces:**
- Consumes: `createRecordingContext()`（`packages/canvas2d/tests/helpers/recording-context.ts`，`measureText` 返回 `7px/字符`，是普通对象方法、可被 `spyOn`）。
- Produces: `Canvas2DRenderer` 新增私有 `measureTextWidth(text: string): number` 与 `textWidthCache: Map<string, number>`；模块常量 `TEXT_WIDTH_CACHE_MAX = 8192`。`CellPainter` 新增私有 `cacheTruncation(key: string, value: string): string`；模块常量 `TRUNCATION_CACHE_MAX = 8192`。公开 API 无变化。

**背景：** `overflowExtra`（Canvas2DRenderer.ts:799）对每个非空 text 单元格每帧裸调 `ctx.measureText`（profiler：measureText 92.6ms + hardCut 72.1ms）。`CellPainter.truncationCache` 有缓存但无上限（行情类推送每 tick 新字符串 → 无界增长）。

**缓存 key 只含 text、不含 font 的安全性论证（写进代码注释）：** content pass 的字体在 `paintContentLayer` 开头一帧一设、值只由 theme 决定；`overflowExtra` 只在 `paintCellContentRegion` 内执行（先于 `paintHeaders` 可能的字体改写）；theme 变更经 `setTheme`/`syncFromFrame` 必经 `setTheme`，在那里清缓存。故同一缓存生命周期内 font 恒定。

- [ ] **Step 1: 写失败测试（renderer 宽度缓存）**

创建 `packages/canvas2d/tests/render/Canvas2DRenderer.text-cache.test.ts`：

```ts
import { describe, expect, it, spyOn } from 'bun:test'
import {
  ChunkedAxis,
  FrozenRegions,
  InMemoryDataSource,
  Viewport,
  denseGridTheme,
  type Schema,
  type Theme,
} from '@novasheet/core'
import { Canvas2DRenderer } from '../../src/render/Canvas2DRenderer'
import { createRecordingContext } from '../helpers/recording-context'

const SCHEMA: Schema = {
  fields: [
    { id: 'name', name: 'Name', type: 'text', width: 100 },
    { id: 'val', name: 'Val', type: 'text', width: 100 },
  ],
}

function setup() {
  const { ctx } = createRecordingContext()
  // 长文本 + 右邻空 → 每行触发 overflowExtra 的 measureText
  const rows = Array.from({ length: 4 }, (_, i) => ({ name: `${'x'.repeat(20)}${i}`, val: '' }))
  const data = new InMemoryDataSource({ schema: SCHEMA, rows })
  const rowsAxis = new ChunkedAxis({
    count: data.getRowCount(),
    defaultSize: denseGridTheme.metrics.rowHeight,
  })
  const colsAxis = new ChunkedAxis({ count: SCHEMA.fields.length, defaultSize: 100 })
  const frozen = new FrozenRegions(rowsAxis, colsAxis, {})
  const viewport = new Viewport(rowsAxis, colsAxis, frozen)
  viewport.setSize(400, 200)
  viewport.setHeaderHeight(denseGridTheme.metrics.headerHeight)
  viewport.setScroll(0, 0)
  const renderer = new Canvas2DRenderer({ ctx, data, viewport, rowsAxis, colsAxis, theme: denseGridTheme })
  const frame = (theme: Theme) => ({
    data,
    theme,
    rowsAxis,
    colsAxis,
    viewport: viewport.snapshot(),
    collapsedRowGaps: [],
    collapsedColGaps: [],
  })
  return { ctx, renderer, frame }
}

describe('Canvas2DRenderer — 文本宽度缓存', () => {
  it('相同 frame 第二次 render 不再调用 measureText', () => {
    const { ctx, renderer, frame } = setup()
    const spy = spyOn(ctx, 'measureText')

    renderer.render(frame(denseGridTheme))
    expect(spy.mock.calls.length).toBeGreaterThan(0) // 首帧必然量度

    spy.mockClear()
    renderer.render(frame(denseGridTheme))
    expect(spy.mock.calls.length).toBe(0) // overflowExtra 与 CellPainter 截断均命中缓存
  })

  it('theme 变更清空缓存后重新量度', () => {
    const { ctx, renderer, frame } = setup()
    renderer.render(frame(denseGridTheme))

    const spy = spyOn(ctx, 'measureText')
    spy.mockClear()
    const theme2: Theme = {
      ...denseGridTheme,
      metrics: { ...denseGridTheme.metrics, fontSize: denseGridTheme.metrics.fontSize + 2 },
    }
    renderer.render(frame(theme2))
    expect(spy.mock.calls.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test packages/canvas2d/tests/render/Canvas2DRenderer.text-cache.test.ts`
Expected: 第一个用例 FAIL——第二次 render 时 `overflowExtra` 仍裸调 `measureText`（`CellPainter.truncate` 的缓存会命中，但 overflow 路径没有缓存，计数 > 0）。第二个用例此时可能已 PASS（`CellPainter.setTheme` 清缓存 + overflow 裸调），属预期。

- [ ] **Step 3: 实现 renderer 宽度缓存**

`Canvas2DRenderer.ts`：

1. 模块顶部（`RENDERER_KEY` 常量旁）：

```ts
/** overflow 扫描文本宽度缓存上限；超限整体清空（无 LRU，简单可预测）。 */
const TEXT_WIDTH_CACHE_MAX = 8192
```

2. 类字段（`cellActionHits` 旁）：

```ts
  /**
   * overflow 扫描的文本宽度缓存。key 只含文本：content pass 字体一帧一设且只由
   * theme 决定，overflowExtra 只在 paintCellContentRegion 内执行（先于 paintHeaders
   * 的字体改写），theme 变更必经 setTheme 并在那里清空。
   */
  private textWidthCache = new Map<string, number>()
```

3. `setTheme(theme: Theme)` 末尾追加：

```ts
    this.textWidthCache.clear()
```

4. 新增私有方法（`overflowExtra` 上方）：

```ts
  private measureTextWidth(text: string): number {
    const cached = this.textWidthCache.get(text)
    if (cached !== undefined) return cached
    const width = this.ctx.measureText(text).width
    if (this.textWidthCache.size >= TEXT_WIDTH_CACHE_MAX) this.textWidthCache.clear()
    this.textWidthCache.set(text, width)
    return width
  }
```

5. `overflowExtra` 中 `const textRight = padX + this.ctx.measureText(text).width` 改为：

```ts
    const textRight = padX + this.measureTextWidth(text)
```

- [ ] **Step 4: 跑测试确认 renderer 用例全绿**

Run: `bun test packages/canvas2d/tests/render/`
Expected: 新文件 2 用例 PASS，且既有 `Canvas2DRenderer.overflow-gridline.test.ts` 等全部保持绿（溢出判定数值不变，只是来源换成缓存）。

- [ ] **Step 5: 写失败测试（CellPainter 缓存上限）**

创建 `packages/canvas2d/tests/painters/CellPainter.cache-cap.test.ts`：

```ts
import { describe, expect, it } from 'bun:test'
import { denseGridTheme } from '@novasheet/core'
import { CellPainter } from '../../src/painters/CellPainter'
import { createRecordingContext } from '../helpers/recording-context'

describe('CellPainter — truncationCache 上限', () => {
  it('唯一字符串超过 8192 条时缓存被整体清空重建，不无界增长', () => {
    const { ctx } = createRecordingContext()
    const painter = new CellPainter(denseGridTheme)
    const rect = { x: 0, y: 0, width: 40, height: 24 } // 窄列强制截断入缓存
    const field = { id: 'f', name: 'F', type: 'text' as const, width: 40 }

    for (let i = 0; i < 9000; i++) {
      painter.paint(ctx, {
        value: `unique-value-${i}-${'x'.repeat(20)}`,
        rect,
        field,
        rowIndex: 0,
        colIndex: 0,
      })
    }

    const cache = (painter as unknown as { truncationCache: Map<string, string> }).truncationCache
    expect(cache.size).toBeLessThanOrEqual(8192)
  })
})
```

Run: `bun test packages/canvas2d/tests/painters/CellPainter.cache-cap.test.ts`
Expected: FAIL——现实现无上限，`cache.size` 为 9000。

- [ ] **Step 6: 实现 CellPainter 缓存上限**

`CellPainter.ts`：

1. 模块顶部：

```ts
/** 截断缓存上限；推送型数据每 tick 产生新字符串，无上限会无界增长。超限整体清空。 */
const TRUNCATION_CACHE_MAX = 8192
```

2. 新增私有方法（`hardCut` 上方）：

```ts
  private cacheTruncation(key: string, value: string): string {
    if (this.truncationCache.size >= TRUNCATION_CACHE_MAX) this.truncationCache.clear()
    this.truncationCache.set(key, value)
    return value
  }
```

3. 4 处 `this.truncationCache.set(...)` 改经该方法：
   - `hardCut` 末尾：`this.truncationCache.set(cacheKey, result); return result` → `return this.cacheTruncation(cacheKey, result)`
   - `truncate` 整串放得下分支：`this.truncationCache.set(cacheKey, text); return text` → `return this.cacheTruncation(cacheKey, text)`
   - `truncate` 极窄列分支：`this.truncationCache.set(cacheKey, ''); return ''` → `return this.cacheTruncation(cacheKey, '')`
   - `truncate` 末尾：`this.truncationCache.set(cacheKey, result); return result` → `return this.cacheTruncation(cacheKey, result)`

- [ ] **Step 7: 跑测试 + 全量回归 + typecheck**

Run: `bun test packages/canvas2d/tests/painters/CellPainter.cache-cap.test.ts`
Expected: PASS

Run: `bun test packages/canvas2d`
Expected: 全绿（已知例外：`tests/grid/Grid.test.ts:619` 为 pre-existing 失败，与本 task 无关——若它是唯一失败可放行，其余任何失败必须归零）。

Run: `bun run --filter @novasheet/canvas2d typecheck`
Expected: exit 0

- [ ] **Step 8: Commit**

```bash
git add packages/canvas2d/src/render/Canvas2DRenderer.ts packages/canvas2d/src/painters/CellPainter.ts packages/canvas2d/tests/render/Canvas2DRenderer.text-cache.test.ts packages/canvas2d/tests/painters/CellPainter.cache-cap.test.ts
git commit -m "perf(canvas2d): overflow 扫描与截断的 measureText 缓存与容量上限"
```

---

## 收尾验证（三个 task 完成后）

- `bun test` 全仓（已知例外仅 `packages/canvas2d/tests/grid/Grid.test.ts:619` pre-existing）
- `bun run --filter '*' typecheck` 全绿
- `bun run lint` 0 error/warning
- 人工复测（无法自动化）：在原 profile 场景（localhost:8080）重新录制 Performance，确认 Layout/Recalculate Style 大块消失、帧时间显著下降——由用户执行。
