/**
 * 平台无关引擎契约（spec §5 `GridEngine`）。
 *
 * 持有数据、主题、行列轴、冻结区、viewport 与逻辑滚动；不含 DOM / canvas。
 */

import type { DataSource } from '../kernel/data/DataSource'
import type { CellValue, Field } from '../kernel/data/Schema'
import type { RemovedFieldSnapshot } from '../kernel/data/MutableDataSource'
import type { CellWrite, UndoCommand } from '../kernel/undo/UndoCommand'
import type { BorderPreset, BorderStyle, CellFormat, TextWrapMode, ValueFormat } from '../kernel/protocol/FormatTypes'
import type { MergeRegion } from '../kernel/coords/MergeRegion'
import type { ApplyPasteSource, PasteTargetRect } from '../features/clipboard/ApplyPaste'
import type { PasteSkippedCell } from '../features/clipboard/types'
import type { AttachmentWrite } from '../features/clipboard/PasteController'
import type { FillDirection, FillMergeSnap } from '../features/fill/FillTarget'
import type {
  CellAddress,
  CellRange,
  GridSelection,
  SelectCellOptions,
} from '../kernel/coords/SelectionTypes'
import type { Axis } from '../kernel/geometry/ChunkedAxis'
import type { FrozenConfig } from '../kernel/geometry/FrozenRegions'
import type { Viewport } from '../kernel/geometry/Viewport'
import type { HoveredColumnHeaderMenu, RenderFrame } from '../kernel/render/RenderFrame'
import type { Theme } from '../kernel/theme/Theme'
import type { ExcelWorkspaceSize } from '../features/excel-workspace'
import type { CellTypeOverride, CellTypeRegistry } from '../features/cell-types'
import type { CellAttachmentCodec } from '../kernel/protocol/AttachmentTypes'
import type { ValidationRule, ValidationState } from '../kernel/protocol/ValidationTypes'

/**
 * `DefaultGridEngine` 构造参数。
 *
 * @example
 * ```ts
 * const engine = new DefaultGridEngine({
 *   data,
 *   theme: denseGridTheme,
 *   frozen: { topRows: 1, leftCols: 1, rightCols: 1 },
 *   defaultRowHeight: 32,
 *   excelHeaders: true,
 * })
 * ```
 */
export interface GridEngineOptions {
  data: DataSource
  theme?: Theme
  /**
   * 冻结配置：支持顶部、左侧、右侧冻结。
   *
   * @example
   * ```ts
   * { topRows: 1 } // 冻结首行
   * { leftCols: 2 } // 冻结左侧 2 列
   * { topRows: 1, leftCols: 1, rightCols: 1 } // 顶部 + 左右侧冻结
   * ```
   */
  frozen?: Partial<FrozenConfig>
  /**
   * 默认行高；未传时使用 theme 中的 body row height。
   *
   * @example
   * ```ts
   * { defaultRowHeight: 32 }
   * ```
   */
  defaultRowHeight?: number
  /**
   * Excel 风格：列头显示 A/B/…、左侧显示 1-based 行号。
   *
   * @example
   * ```ts
   * { excelHeaders: true }
   * ```
   */
  excelHeaders?: boolean
  /** Phase 5-C — 自定义 formatter 命名注册表（custom kind 查此表）。 */
  formatters?: Readonly<Record<string, import('../kernel/protocol/FormatTypes').CellFormatter>>
  /** Phase 5-C — formatter locale；默认 'en-US'。 */
  locale?: string
  /** 单元格类型语义注册表：驱动 inline edit parse/format 等 backend-neutral 行为。 */
  cellTypes?: CellTypeRegistry
  /** Fill handle 是否把目标格 cell type 覆盖为源格 resolved type；默认 true。 */
  fillCellTypes?: boolean
  /** 扩展附件 codec 注册表；namespace 唯一，core 不识别 T 语义。 */
  cellAttachments?: readonly import('../kernel/protocol/AttachmentTypes').CellAttachmentCodec<unknown>[]
  /** 自定义 validator 注册表；与 BUILT_IN_VALIDATORS 合并，custom 优先。 */
  validators?: Readonly<Record<string, import('../features/validation').ValidatorDefinition>>
  /** 批量校验每 tick 处理格数上限；默认 50。 */
  validationBatchSize?: number
  /** 异步 validator 最大并发数；默认 4。 */
  validationMaxConcurrent?: number
}

export interface FillCommitResult {
  readonly source: CellRange
  readonly fill: CellRange
  readonly result: CellRange
  readonly writes: readonly CellWrite[]
}

export interface SetViewDataOptions {
  readonly oldResolveUnderlyingRow?: (viewRow: number) => number
  readonly clearSelection?: boolean
}

/** 数据源与 view pipeline 同步能力。 */
export interface GridDataAccess {
  /** 替换底层数据源，并重建行轴、列轴、viewport 与选区依赖状态。 */
  setData(data: DataSource): void

  /**
   * 替换当前 view 数据源。
   *
   * 用于 sort/filter pipeline 生成新的视图数据后同步 engine；`oldResolveUnderlyingRow`
   * 让 engine 在 view 顺序变化时尽量保持选区对应的底层行，`clearSelection`
   * 用于调用方明确要求清空选择状态。
   */
  setViewData(data: DataSource, options?: SetViewDataOptions): void

  /** 返回当前 engine 持有的数据源；sort/filter 后可能是 composed view data。 */
  getData(): DataSource

  /** Excel workspace 专用：调整逻辑工作区尺寸并重建行列轴；不进入 undo 栈。 */
  resizeExcelWorkspace(size: ExcelWorkspaceSize): boolean
}

/** 布局、滚动、尺寸与主题能力。 */
export interface GridLayout {
  /** 替换主题 token，并同步依赖 theme 的默认尺寸与 frame 输出。 */
  setTheme(theme: Theme): void

  /** 设置冻结行列配置；会影响 viewport 切分、hit-test 与 frame 中的冻结区域。 */
  setFrozen(config: Partial<FrozenConfig>): void

  /** 设置可视区域尺寸（CSS px），通常由 host ResizeObserver 驱动。 */
  setViewportSize(width: number, height: number): void

  /**
   * 设置表头 leaf 行（字段名行）高度（px）。存在列组时表头总高会另加
   * `depth × Theme.metrics.groupHeaderRowHeight`；`frame.viewport.headerHeight` 始终是总高，
   * 影响 body viewport 起点与 frame 布局，`frame.viewport.leafHeaderHeight` 才是本方法设置的值。
   */
  setHeaderHeight(headerHeight: number): void

  /** 设置逻辑滚动位置（CSS px）；runtime 负责 native scrollTop 到 logicalY 的映射。 */
  setScroll(logicalX: number, logicalY: number): void

  /** 读取 view 行高；隐藏行返回 0。 */
  getRowHeight(rowIndex: number): number

  /** 设置单个 view 行高；立即更新 row axis 并触发后续 frame 变化。 */
  setRowHeight(rowIndex: number, height: number): void

  /** 按 fieldId 设置列宽；fieldId 是 schema 中的稳定列标识。 */
  setColumnWidth(fieldId: string, width: number): void

  /** 返回全部 view 行累计高度（CSS px），隐藏行已按 0 计入。 */
  getRowsTotalSize(): number

  /** 返回全部 view 列累计宽度（CSS px），隐藏列已按 0 计入。 */
  getColsTotalSize(): number

  /** 将 fieldId 解析为当前 view/schema 列索引；不存在时返回 -1。 */
  getColumnIndex(fieldId: string): number

  /** 返回当前生效主题。 */
  getTheme(): Theme

  /** 返回行轴；runtime 用于滚动、命中与尺寸同步，renderer 不应直接依赖。 */
  getRowsAxis(): Axis

  /** 返回列轴；runtime 用于滚动、命中与尺寸同步，renderer 不应直接依赖。 */
  getColsAxis(): Axis

  /** 返回当前 viewport 状态。 */
  getViewport(): Viewport

  /** Phase 4.6 — 返回当前冻结配置快照。 */
  getFrozenConfig(): FrozenConfig
}

/** 选区与键盘导航能力。 */
export interface GridSelectionAccess {
  /** 设置当前选中单元格；`options` 控制扩展选择、锚点等交互细节。 */
  selectCell(cell: CellAddress, options?: SelectCellOptions): void

  /** Phase 3.3 — 键盘导航；识别按键则更新选区并返回 true。 */
  navigateSelection(key: string, shiftKey: boolean): boolean

  /** 清空当前选择、编辑与选择派生状态。 */
  clearSelection(): void

  /** 返回当前选择模型快照。 */
  getSelection(): GridSelection

  /** Phase 4.5 — 程序化设置选区。 */
  setSelection(selection: GridSelection): void
}

/** 单元格编辑能力。 */
export interface GridCellEditing {
  /** Phase 3.5 — 进入编辑；不可编辑格返回 false。 */
  beginCellEdit(cell: CellAddress): boolean

  /** 更新当前编辑草稿；仅在 `isCellEditing()` 为 true 时有意义。 */
  updateCellEditDraft(draft: string): void

  /** 取消当前编辑并丢弃草稿。 */
  cancelCellEdit(): void

  /** 提交编辑；非法输入返回 false。 */
  commitCellEdit(): boolean

  /** 直接提交单个 view cell 值；用于 custom editor 等非草稿编辑入口，入栈 `editCell`。 */
  commitCellValue(cell: CellAddress, fieldId: string, value: CellValue | null): boolean

  /** 返回当前是否处于单元格编辑状态。 */
  isCellEditing(): boolean
}

/** 剪贴板写入能力。 */
export interface GridClipboardMutation {
  /** Phase 4.1 — 把 `range` 内每个 cell 置 null；非 MutableDataSource 静默 no-op。 */
  clearRange(range: CellRange): void

  /**
   * Phase 4.2 — 提交一次粘贴为 1 步 undo。
   *
   * `target` 使用 view 坐标；`fieldIdsAtCols` 由 runtime 按当前列顺序传入。
   * 无写入（全跳过）时不入栈；跳过的格子通过 `onSkipped` 回报给调用方。
   */
  commitPaste(
    source: ApplyPasteSource,
    target: PasteTargetRect,
    fieldIdsAtCols: readonly string[],
    onSkipped?: (cells: readonly PasteSkippedCell[]) => void,
    attachmentWrites?: readonly AttachmentWrite[],
  ): void
}

/** 填充柄提交与合并吸附能力。 */
export interface GridFillMutation {
  /** Phase 4.3 — 提交一次填充柄写入为 1 步 undo；无写入时返回 null。 */
  commitFill(source: CellRange, fill: CellRange, direction: FillDirection): FillCommitResult | null

  /**
   * Phase 5-A — 返回 view `source` 选区的合并块吸附尺寸（供 `computeFillTarget` 吸附整块）。
   * source 含合并时返回其行/列跨度，否则返回 `{ rowSpan: 1, colSpan: 1 }`（不吸附）。
   */
  getFillMergeSnap(source: CellRange): FillMergeSnap
}

/** undo / redo 历史能力。 */
export interface GridHistory {
  /** 执行一步 undo；无可撤销命令时返回 undefined。 */
  undo(): UndoCommand | undefined

  /** 执行一步 redo；无可重做命令时返回 undefined。 */
  redo(): UndoCommand | undefined

  /** 返回 undo 栈是否非空。 */
  canUndo(): boolean

  /** 返回 redo 栈是否非空。 */
  canRedo(): boolean

  /** Phase 4.2 — 提交一次列宽调整为 1 步 undo；`oldWidth === newWidth` 时不入栈。 */
  commitColumnResize(colIndex: number, oldWidth: number, newWidth: number): void

  /** Phase 4.2 — 提交一次行高调整为 1 步 undo；`oldHeight === newHeight` 时不入栈。 */
  commitRowResize(rowIndex: number, oldHeight: number, newHeight: number): void
}

/** 行结构与行可见性能力。 */
export interface GridRowStructure {
  /** Phase 4.5 — 将指定 underlying row id 列表从隐藏集移除并触发 invalidate。 */
  unhideRows(underlyingRowIds: readonly number[]): void

  /** Phase 4.5 — 返回当前隐藏行的 underlying row id 升序数组。 */
  getHiddenRows(): readonly number[]

  /**
   * Phase 4.5 — 在 `beforeUnderlyingRow` 前插入 `count` 个空白行。
   *
   * 返回新建 underlying row id；DataSource 不可写时返回空数组。
   */
  insertRows(beforeUnderlyingRow: number, count: number): readonly number[]

  /** Phase 4.5 — 删除给定 underlying row id 集合；调用方保证升序、去重。 */
  deleteRows(underlyingRowIds: readonly number[]): void

  /** Phase 4.5 — 隐藏给定 underlying row id 集合。 */
  hideRows(underlyingRowIds: readonly number[]): void

  /** Phase 4.5 — 批量将多行高度设置为同一值 `h`，并入 undo 栈。 */
  setRowHeights(rowIds: readonly number[], h: number): void

  /** Phase 4.7 follow-up — 按 underlying row id 移动连续行组；`beforeRowId=null` 表示移动到末尾。 */
  moveRows(rowIds: readonly number[], beforeRowId: number | null): boolean
}

/** 列结构、列可见性与列顺序能力。 */
export interface GridColumnStructure {
  /** Phase 4.6 — 在 schema field index 位置前插入 `count` 个列字段，返回新字段。 */
  insertCols(beforeFieldIndex: number, count: number): readonly Field[]

  /** Phase 4.6 — 按 fieldId 删除列字段，返回可供 undo 恢复的删除快照。 */
  deleteCols(fieldIds: readonly string[]): readonly RemovedFieldSnapshot[]

  /** Phase 4.6 — 隐藏给定 fieldId 集合。 */
  hideCols(fieldIds: readonly string[]): void

  /** Phase 4.6 — 取消隐藏给定 fieldId 集合。 */
  unhideCols(fieldIds: readonly string[]): void

  /** Phase 4.6 — 批量设置多列宽度，并入 undo 栈。 */
  setColumnWidths(fieldIds: readonly string[], widthPx: number): void

  /** Phase 4.6 — 返回当前隐藏列 fieldId，按 schema 顺序排序。 */
  getHiddenCols(): readonly string[]

  /** Phase 4.7 — 按 fieldId 移动列组；`beforeFieldId=null` 表示移动到末尾。 */
  moveCols(fieldIds: readonly string[], beforeFieldId: string | null): boolean
}

/** 单元格格式能力。 */
export interface GridFormatting {
  /**
   * Phase 5-A — 为 view `range` 设置填充色；`color=null` 清除填充。
   * 仅在格式实际变化时入 undo 栈并返回 true。
   * `range` 必须已归一化（`startRow ≤ endRow`，`startCol ≤ endCol`）。
   */
  setFillColor(range: CellRange, color: string | null): boolean

  /**
   * Phase 5-A — 为 view `range` 设置基础边框；`preset='clear'` 需 `border=null`。
   * 非 solid 线型在 5-A 返回 false；仅在格式实际变化时入栈并返回 true。
   * `range` 必须已归一化（`startRow ≤ endRow`，`startCol ≤ endCol`）。
   */
  setBorders(range: CellRange, preset: BorderPreset, border: BorderStyle | null): boolean

  /**
   * 设置 view `range` 的文本显示模式（overflow/wrap/clip）。
   *
   * 排序筛选导致 view range 无法映射为连续 raw range 时返回 false。
   */
  /** 设置 view `range` 值格式（Phase 5-C）。 */
  setValueFormat(range: CellRange, valueFormat: ValueFormat): boolean

  setTextWrap(range: CellRange, mode: TextWrapMode): boolean

  /** Phase 5-A — 解析单个单元格格式（raw 坐标）；无格式返回 undefined。 */
  getCellFormat(rowIndex: number, colIndex: number): CellFormat | undefined

  /** 解析 view 坐标的单元格格式；无格式返回 undefined。 */
  getViewCellFormat(viewRow: number, viewCol: number): CellFormat | undefined

  /** view 行 → raw 行（sort/filter/hide 解析）。 */
  viewRowToRaw(viewRow: number): number

  /** view 列 → raw 列。 */
  viewColToRaw(viewCol: number): number

  /** view range → raw range；排序/筛选打乱映射时返回 null。 */
  viewRangeToRaw(range: CellRange): import('../kernel/coords/coordinates').RawRange | null

  /** 给 raw cell 写扩展附件；data=undefined 清除；快照前后无变化返回 false。 */
  setCellAttachment(namespace: string, rawRow: number, rawCol: number, data: unknown): boolean

  /** 读 raw cell 的扩展附件；无则 undefined。 */
  getCellAttachment(namespace: string, rawRow: number, rawCol: number): unknown

  /** 已注册的附件 namespace 列表（供 clipboard 遍历选区附件）。 */
  getAttachmentNamespaces(): readonly string[]

  /** 取某 namespace 的 codec（serialize/deserialize）；未注册返回 undefined。 */
  getAttachmentCodec(namespace: string): CellAttachmentCodec<unknown> | undefined

  /** 为 view `range` 设置单元格类型覆盖；仅改 CellTypeStore，不改 value/format。 */
  setCellType(range: CellRange, type: CellTypeOverride): boolean

  /** 清除 view `range` 的单元格类型覆盖，回退到列默认 resolved type。 */
  clearCellType(range: CellRange): boolean

  /** 解析 view 坐标的 resolved cell type；越界或缺 field 时保守返回 `text`。 */
  getCellType(viewRow: number, viewCol: number): CellTypeOverride

  /** 解析 raw row + field 的 resolved cell type；field 不在 raw schema 中时保守返回 `text`。 */
  resolveRawCellTypeForField?(rowIndex: number, field: Field): CellTypeOverride

  /** 为 raw range 设置校验规则；下次 validateAll / 写入触发时生效。 */
  setValidationRule(rawRange: import('../kernel/coords/coordinates').RawRange, rule: ValidationRule): void
  /** 清除 raw range 的校验规则。 */
  clearValidationRule(rawRange: import('../kernel/coords/coordinates').RawRange): void
  /** 触发全量重新校验（清空结果缓存，将所有格入队）。 */
  validateAll(): void
  /** 读取指定 raw 坐标的最新校验状态；无结果返回 null。 */
  getValidationState(rawRow: number, rawCol: number): ValidationState | null
  /** 注入异步校验完成后的重绘回调；由 GridRuntime 在挂载时调用。 */
  setValidationRedrawCallback(cb: () => void): void

  /**
   * 注入数据源变更（rowsChanged/rowCountChanged/reset）后的重绘回调；由 GridRuntime 在挂载时调用。
   * 桥接 WindowedDataSource 等异步/推送数据源——无同步调用点时靠此回调触发重绘。
   */
  setDataChangeRedrawCallback(cb: () => void): void
}

/** 单元格合并能力。 */
export interface GridMerging {
  /**
   * Phase 5-A — 合并 view `range`；单格 / 重叠现存合并 / 排序筛选下非连续映射时返回 false。
   * 成功时选中整个合并 view 范围并入 undo 栈。
   * `range` 必须已归一化（`startRow ≤ endRow`，`startCol ≤ endCol`）。
   */
  mergeCells(range: CellRange): boolean

  /**
   * Phase 5-A — 取消 view `range` 触及的所有合并区域；移除任何区域则入栈并返回 true。
   * 排序筛选下非连续映射或无区域触及时返回 false。
   */
  unmergeCells(range: CellRange): boolean

  /** Phase 5-A — 返回覆盖单元格的合并区域（**raw 坐标**，与 `getCellFormat` 一致）；无则返回 null。 */
  getMergeRegion(rowIndex: number, colIndex: number): MergeRegion | null

  /** 返回覆盖 view 坐标单元格的合并区域；无则返回 null。 */
  getViewMergeRegion(viewRow: number, viewCol: number): MergeRegion | null
}

/** 渲染帧读取能力。 */
export interface GridFrameReader {
  /**
   * 生成当前渲染帧快照。
   *
   * Renderer 只能读取此快照与 held viewport，不应绕过 frame 直接访问 axis/data。
   */
  getFrame(): RenderFrame

  /** 设置列头悬停菜单状态；null 清除；下一帧 getFrame() 反映新状态。 */
  setHoveredColumnHeaderMenu(state: HoveredColumnHeaderMenu | null): void
}

/**
 * 平台无关的表格状态引擎。
 *
 * `GridEngine` 是 core 与 web/runtime/renderer 之间的兼容聚合契约：
 * DOM、canvas、clipboard、菜单等平台能力不进入这里；调用方通过 mutation
 * 方法改变数据/布局/选择/格式，再通过 `getFrame()` 取得下一帧渲染所需快照。
 *
 * 坐标约定：
 *   - view 坐标：用户当前看到的行列位置，受 sort/filter 影响。
 *   - raw/underlying 坐标：底层数据与 schema 的稳定索引/ID。
 *   - 未特别标注的方法默认接收 view 坐标；结构性行列 API 使用 underlying row id
 *     或 fieldId，方法注释会显式说明。
 */
export interface GridEngine
  extends GridDataAccess,
    GridLayout,
    GridSelectionAccess,
    GridCellEditing,
    GridClipboardMutation,
    GridFillMutation,
    GridHistory,
    GridRowStructure,
    GridColumnStructure,
    GridFormatting,
    GridMerging,
    GridFrameReader {
  /** 释放 engine 持有的外部订阅（当前为 DataSource 事件订阅）；调用方（GridRuntime）在自身 destroy() 时调用。 */
  dispose(): void
}
