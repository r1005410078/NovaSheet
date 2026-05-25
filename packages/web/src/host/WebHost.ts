import type { FrameScheduler, ThemeScrollbar } from '@novasheet/core'

export interface WebPointerEvent {
  /** scrollHost 本地坐标，单位 CSS px。 */
  readonly x: number
  /** scrollHost 本地坐标，单位 CSS px。 */
  readonly y: number
  readonly shiftKey: boolean
  /**
   * `MouseEvent.button`：0=左键，1=中键，2=右键。`pointermove`/`up` 路径不填。
   * runtime 用它区分右键 pointerdown——右键不应进入 drag-select 模式，否则会
   * 把后续 `contextmenu` 卡掉。
   */
  readonly button?: number
  /**
   * 视口坐标（仅 `contextmenu` 路径填充）。Phase 4.0 上下文菜单 DOM 用 position: fixed，
   * 直接拿 viewport 锚点更省一次坐标换算。其它 pointer 入口可省略。
   */
  readonly clientX?: number
  readonly clientY?: number
}

/** scrollHost 上的键盘事件（Phase 3.3）。 */
export interface WebKeyboardEvent {
  readonly key: string
  readonly shiftKey: boolean
  readonly ctrlKey: boolean
  readonly metaKey: boolean
  readonly altKey: boolean
}

/** `DomGridHost` 等实现的构造参数。 */
export interface WebHostOptions {
  container: HTMLElement
  /** 与 Grid 共享的 `FrameScheduler`，供 `NativeScroller` 合并 scroll RAF。 */
  scheduler: FrameScheduler
  /** 原生 scroll 事件（经 `NativeScroller` RAF 节流后回调）。 */
  onScroll: (scrollTop: number, scrollLeft: number) => void
  /** 容器尺寸变化（`ResizeObserver`）。 */
  onResize: (cssWidth: number, cssHeight: number, dpr: number) => void
  /** DPR 变化（窗口拖到另一块屏幕等）。 */
  onDprChange?: (dpr: number) => void
  /** pointer down 命中入口；runtime 负责把坐标转成单元格。 */
  onPointerDown?: (event: WebPointerEvent) => void
  /** pointer move 命中入口；用于拖拽框选。 */
  onPointerMove?: (event: WebPointerEvent) => void
  /** pointer up/end 入口；用于结束拖拽框选。 */
  onPointerUp?: () => void
  /** keydown 入口；runtime 处理表格导航键。 */
  onKeyDown?: (event: WebKeyboardEvent) => boolean
  /** dblclick 入口；runtime 进入单元格编辑。 */
  onDoubleClick?: (event: WebPointerEvent) => void
  /** contextmenu 入口；host 内部已 preventDefault，runtime 决定是否打开菜单。 */
  onContextMenu?: (event: WebPointerEvent) => void
}

/**
 * 浏览器宿主契约（spec §6 `WebHost`）。
 *
 * 拥有 scrollHost + scrollSpacer 与滚动/尺寸/DPR 监听；**不**拥有 canvas。
 * canvas 由具体 `WebRenderer` 实现挂载。
 */
export interface WebHost {
  attach(): void
  /** 将 Theme `scrollbar` 应用到原生 scroll-host（`setTheme` / 初次 attach 时调用）。 */
  applyScrollbarTheme(scrollbar: ThemeScrollbar): void
  setScrollSize(width: number, height: number): void
  scrollTo(scrollTop: number, scrollLeft: number): void
  getScrollPosition(): { scrollTop: number; scrollLeft: number }
  getDpr(): number
  getContainerSize(): { width: number; height: number }
  /** Return scroll-host's viewport-relative bounding rect (left/top in CSS px). Used for translating local coords to viewport coords. */
  getContainerBoundingRect(): { left: number; top: number }
  /** 设置 scroll-host cursor；传 null 还原默认。 */
  setCursor(cursor: string | null): void
  /** 将键盘焦点还原到 scroll-host（preventScroll 以防跳屏）。spec §4.5 菜单关闭后恢复焦点。 */
  focusScrollHost(): void
  destroy(): void
}

export type WebHostFactory = (options: WebHostOptions) => WebHost
