/**
 * Grid——@novasheet/core 的公共门面（facade）。
 *
 * 职责：
 *   - 把容器 DOM、用户配置组装成完整渲染管线（DataSource + Theme + 两根 ChunkedAxis +
 *     FrozenRegions + Viewport + HighDPI + Renderer）
 *   - 暴露**所有外部可写入口**：setData / setTheme / setRowHeight / setColumnWidth / refresh / destroy。
 *     CLAUDE.md 不变量 #2：所有 mutation 走 Grid，painter / layout 不自我 invalidate。
 *   - 维护 destroy 幂等性（CLAUDE.md 不变量 #6）：取消所有 RAF、恢复 container.style.position、
 *     移除 canvas；mount → destroy → mount 在 React Strict Mode 下不报错。
 *
 * 与子系统的边界：
 *   - 子系统（Renderer / Viewport / ChunkedAxis）对外只接受快照读 + 受控写
 *   - Grid 不参与单帧绘制逻辑——绘制时序由 Renderer 走共享 frameScheduler 决定
 *
 * 当前里程碑：M1 已完成静态单帧渲染；scroll / frozen quadrants / 交互 resize handle 留待 M2-M4。
 * 见 docs/superpowers/specs §3 公共 API 与 §5 渲染管线。
 */
import type { DataSource } from './data/DataSource';
import type { Theme } from './theme/Theme';
/** Grid 初始化选项 */
export interface GridOptions {
    /** 数据源 */
    data: DataSource;
    /** 缺省 denseGridTheme */
    theme?: Theme;
    /** 顶部冻结的行数（M3）；M1 始终为 0 */
    frozenRows?: number;
    /** 左侧冻结的列数（M3）；M1 始终为 0 */
    frozenCols?: number;
    /**
     * 覆写默认行高。缺省时跟随 `theme.metrics.rowHeight`，后续 `setTheme()` 会同步更新；
     * 显式传值则 sticky——后续 setTheme 不再改它。
     * 见 CLAUDE.md「defaultRowHeight 可选时跟随主题」决策。
     */
    defaultRowHeight?: number;
}
/**
 * NovaSheet 渲染引擎的公开门面。持有 canvas、行/列轴布局、viewport、renderer；
 * 宿主应用的所有 mutate 都走这一层，让内部子系统之间保持解耦
 * （CLAUDE.md 不变量 #2：「所有 mutation 走 Grid 门面」）。
 *
 * 生命周期：`new Grid(container, opts)` 在 container 内挂一个 canvas 子节点 + 同步绘首帧，
 * 之后全部走 RAF 调度，直到 `destroy()`。
 * `destroy()` 幂等，并把 container 的 CSS `position` 还原为原值——避免污染宿主页面。
 *
 * 首次渲染调用流程：
 *
 * ```
 * new Grid(container, options)
 *          │
 *          ├─ 1. 保存 data / theme / defaultRowHeight
 *          │
 *          ├─ 2. 创建 DOM 层
 *          │      ├─ scrollHost   原生滚动容器
 *          │      ├─ scrollSpacer 撑出滚动条范围
 *          │      └─ canvas       实际绘制表格
 *          │
 *          ├─ 3. 创建布局与状态层
 *          │      ├─ rowsAxis / colsAxis
 *          │      ├─ FrozenRegions
 *          │      ├─ ScrollMapper
 *          │      └─ Viewport
 *          │
 *          ├─ 4. 创建渲染层
 *          │      ├─ HighDPI.resize(width, height)
 *          │      └─ Renderer(...)
 *          │
 *          ├─ 5. 接通滚动和 resize
 *          │      ├─ NativeScroller.attach()
 *          │      └─ ResizeObserver.observe(container)
 *          │
 *          └─ 6. renderer.paint()
 *                 └─ 同步首帧：constructor 返回时 canvas 已经有画面
 * ```
 *
 * 滚动后的渲染调用流程：
 *
 * ```
 * 用户滚动 scrollHost
 *          │
 *          ▼
 * NativeScroller
 *          │ schedule("scroll:read")
 *          ▼
 * FrameScheduler / requestAnimationFrame
 *          │
 *          ▼
 * 读取 scrollTop / scrollLeft
 *          │
 *          ▼
 * Grid.mapScrollToLogical()
 *          │ DOM scroll 坐标 -> 逻辑内容坐标 logicalX / logicalY
 *          ▼
 * Viewport.setScroll(logicalX, logicalY)
 *          │
 *          ▼
 * Renderer.invalidate()
 *          │ schedule("renderer:flush")
 *          ▼
 * FrameScheduler / requestAnimationFrame
 *          │
 *          ▼
 * Renderer.paint()
 *          │
 *          ├─ Viewport.snapshot()
 *          ├─ DataSource.getRows() / getCell()
 *          ├─ CellPainter / GridLinesPainter / HeaderPainter
 *          └─ Canvas 2D
 * ```
 */
export declare class Grid {
    /** 宿主容器 DOM 节点 */
    private container;
    /** 渲染用 canvas 元素 */
    private canvas;
    /** 原生滚动宿主（提供原生滚动条，M2） */
    private scrollHost;
    /** 滚动占位元素（撑出 native scrollbar 的可滚动范围，M2） */
    private scrollSpacer;
    /** canvas 2D 绘图上下文 */
    private ctx;
    /** 当前数据源 */
    private data;
    /** 当前主题 */
    private theme;
    /** 用户通过 options 显式传入的行高（优先于主题值） */
    private explicitDefaultRowHeight;
    /** 行轴（管理每行的高度与位置映射） */
    private rowsAxis;
    /** 列轴（管理每列的宽度与位置映射） */
    private colsAxis;
    /** 冻结区域配置 */
    private frozen;
    /** 视口状态（尺寸、滚动偏移、快照） */
    private viewport;
    /** 高 DPI 适配器 */
    private highDpi;
    /** 帧渲染器 */
    private renderer;
    /** 滚动映射器（content ↔ scroll-host 非线性映射，M2） */
    private scrollMapper;
    /** 原生滚动事件适配器（M2） */
    private nativeScroller;
    /** 容器尺寸变化监听器；happy-dom 中可能不可用 */
    private resizeObserver;
    /** 每个 Grid 一个 RAF 调度器，让 scroll / render / resize 合并到同一帧（CLAUDE.md 不变量 #5） */
    private scheduler;
    /** 是否已销毁，防止重复操作 */
    private destroyed;
    /** 构造时保存容器的原始 position 值，销毁时恢复 */
    private originalPosition;
    /**
     * 创建一个 Grid 实例，并立即在传入容器中挂载 scroll-host + canvas，完成首帧同步绘制。
     *
     * @example
     * ```ts
     * import { Grid, InMemoryDataSource } from '@novasheet/core'
     *
     * const container = document.getElementById('sheet')!
     * const data = new InMemoryDataSource({
     *   schema: {
     *     fields: [
     *       { id: 'name', name: 'Name', type: 'text', width: 180 },
     *       { id: 'age', name: 'Age', type: 'number', width: 80 },
     *     ],
     *   },
     *   rows: [
     *     { name: 'Ada Lovelace', age: 36 },
     *     { name: 'Grace Hopper', age: 85 },
     *   ],
     * })
     *
     * const grid = new Grid(container, { data })
     * grid.scrollToRow(1)
     * grid.destroy()
     * ```
     *
     * @example
     * ```ts
     * const grid = new Grid(container, {
     *   data,
     *   theme: denseGridTheme,
     *   defaultRowHeight: 40, // sticky: later setTheme() will not override row height
     * })
     * ```
     */
    constructor(container: HTMLElement, options: GridOptions);
    /**
     * 切换 DataSource。axis / FrozenRegions / viewport / renderer 都要重建：
     * 字段数、行数、字段宽度都可能变。frozenRows/Cols 与显式 defaultRowHeight 保留。
     */
    setData(data: DataSource): void;
    /**
     * 换主题。只有当用户未在构造期 pin 默认行高时，行高才跟随新主题——
     * 详见 GridOptions.defaultRowHeight。
     */
    setTheme(theme: Theme): void;
    /** 覆写单行行高。索引越界静默 no-op。 */
    setRowHeight(rowIndex: number, height: number): void;
    /**
     * 覆写单列列宽（按 fieldId 而非索引，方便 M3 列重排后 API 仍稳定）。
     * 未知 fieldId 静默 no-op。
     */
    setColumnWidth(fieldId: string, width: number): void;
    /** 强制重绘。外部状态（自定义装饰等）变化时调用。 */
    refresh(): void;
    /**
     * 销毁。Renderer.destroy() 取消挂起的 RAF，移除 canvas DOM 节点，
     * 还原 container 的 position——确保宿主页面回到初始状态。
     * 幂等——可重复调用（对 React Strict Mode 的 mount → unmount → mount 至关重要）。
     */
    destroy(): void;
    /**
     * 滚动到指定行。align：
     *   - 'start' 行顶贴视口顶部
     *   - 'end'   行底贴视口底部
     *   - 'center' 行中心贴视口中心
     * 越界静默 no-op。
     */
    scrollToRow(rowIndex: number, align?: 'start' | 'center' | 'end'): void;
    /**
     * 滚动到指定单元格（行索引 + 字段 id）。行 / 字段越界静默 no-op。
     */
    scrollToCell(rowIndex: number, fieldId: string): void;
    /** destroy 后到来的 RAF 不应再触发任何绘制——CLAUDE.md destroy 不变量。 */
    private invalidate;
    /** 返回实际使用的默认行高：优先 options.defaultRowHeight，退回主题值 */
    private resolveDefaultRowHeight;
    /**
     * 选一个能让 applyFieldWidths() 物化最少 chunk 的 defaultSize。
     * Airtable 风格 schema 里多数字段宽度相近，这样列轴 ChunkedAxis 大概率维持默认状态。
     */
    private averageColWidth;
    /**
     * 把 schema 里 per-field 的 width 物化到列轴。
     * 仅对宽度 !== axis 默认值的字段调 setSize——宽度统一时整个列轴维持 O(1) 快路径。
     */
    private applyFieldWidths;
    /**
     * 当前容器尺寸（CSS px）。统一走 clientWidth/Height（scroll geometry 的常规来源），
     * 退化为 getBoundingClientRect / 默认值仅是 happy-dom 兜底。
     */
    private getClientSize;
    /**
     * 把 DOM scrollTop/scrollLeft 映射成 logical content-area 坐标。
     *
     * 关键：垂直轴 spacer 高度 = `contentH + headerH`（header 占据视口顶部 headerH px，必须
     * 计入 DOM 可滚动总量），mapper 的 viewportSize 传 `clientH`（DOM 视口全高），contentSize
     * 传 `contentH + headerH`。两边对齐后 DOM_maxScroll === mapper_maxLogical，最后一行可达。
     *
     * 水平轴没有 header 等价物，直接用 (contentW, clientW)。
     */
    private mapScrollToLogical;
    /**
     * 把 logical Y 转成 DOM scrollTop。content + headerH ≤ clientH 时 ScrollMapper 返回 0
     * （与真实浏览器一致：内容塞得下时 `scrollTo({ top: N })` 会被自动 clamp）。
     */
    private logicalToScrollY;
    /** logicalToScrollY 的水平版本（X 轴无 header 偏移）。 */
    private logicalToScrollX;
    /**
     * 在 axis 总尺寸 / 容器尺寸变化后重新读 DOM scrollTop 并同步到 viewport——
     * 防止下一帧用过期的 logical 坐标绘制（非线性映射下旧 scrollTop 会被解读到错误位置）。
     */
    private remapScroll;
    /** Called by ResizeObserver and exposed for tests. */
    private _onContainerResize;
    /**
     * 重算 scroll-spacer 尺寸。
     * 垂直 spacer = `contentH + headerH`：把 header 占据的 headerH 也计入 DOM 可滚动总量，
     * 这样 DOM `scrollTop ∈ [0, spacerH - clientH]` 与 mapper `logicalY ∈ [0, contentH - vpContentH]`
     * 端点对齐，最后一行可被滚到完全可见。水平没有 header 偏移。
     */
    private resizeSpacer;
}
//# sourceMappingURL=Grid.d.ts.map