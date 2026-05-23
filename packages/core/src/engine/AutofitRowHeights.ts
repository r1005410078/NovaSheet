/**
 * autofitRowHeights——按当前列宽和文本内容批量计算 + 写入每行的行高（M3 autofit）。
 *
 * 调用模式：用户手动触发 `grid.autofitRows()`。本函数不订阅引擎变更——若用户后续
 * 改了列宽 / 数据 / 主题，需要再调一次。这是「显式行为」的设计选择（避免昂贵自动回算）。
 *
 * 算法：
 *   1. 对每个待 autofit 的 row：
 *      a. 遍历所有 `field.wrap === true` 的字段
 *      b. 在当前列宽下用 measurer + wrapText 算出该 cell 的高度
 *      c. 取所有 wrap 字段的最大高度 → 该行的目标高度
 *      d. clamp 到 [minHeight, maxHeight]，写入 `engine.setRowHeight(row, height)`
 *   2. 非 wrap 字段不参与高度计算；如果一行内所有字段都不 wrap，行高保持默认
 *
 * 时间复杂度：
 *   - 遍历 N 行 × K 个 wrap 列；每个 cell 的 wrap 计算 O(token 数 × measurer 查询)
 *   - measurer 内部应做缓存（重复字符串 + 相同字体快速命中）
 *   - 典型场景：500 行 × 3 wrap 列 ≈ 1500 次 wrapText × ~5 次 measureWidth ≈ < 10ms
 *
 * 不计算的情况：
 *   - 字段类型为 `number`（即使 wrap=true 也跳过——number 永远单行右对齐）
 *   - hidden 字段（M3+ 才有 UI；这里仍按 schema 来）
 *   - cell value 为 null/undefined（不参与高度）
 */

import type { CellValue } from '../data/Schema'
import type { DataSource } from '../data/DataSource'
import type { Theme } from '../theme/Theme'
import type { TextMeasurer } from '../measure/TextMeasurer'
import { wrapText } from '../measure/TextMeasurer'

/** autofitRowHeights 入参 */
export interface AutofitRowsParams {
  /** 数据源（读 schema、getCell） */
  data: DataSource
  /** 主题（读 fontFamily、fontSize、cellPaddingX/Y） */
  theme: Theme
  /** 文本量度器（平台侧注入；通常是 Canvas2DTextMeasurer） */
  measurer: TextMeasurer
  /** 写入行高的回调：写 axis 由 caller 决定（engine.setRowHeight 或测试用 spy） */
  applyHeight: (rowIndex: number, height: number) => void
  /**
   * 仅 autofit 指定行；缺省时遍历所有 row（`data.getRowCount()`）。
   * 注意 N 大时全量 autofit 会阻塞主线程——大数据集应只传可见 + 邻近行。
   */
  rows?: readonly number[]
  /** 行高下限（CSS px）。缺省 `theme.metrics.rowHeight`，保证比默认更短的行高不被回算到。 */
  minHeight?: number
  /** 行高上限（CSS px）。缺省 1200（避免单元格塞太多文字时行高失控）。 */
  maxHeight?: number
  /** 单行行高（CSS px）。缺省 `theme.metrics.fontSize × 1.4`。 */
  lineHeight?: number
}

/** autofit 结果：被实际改变高度的行数 + 任何错误对。 */
export interface AutofitRowsResult {
  /** 实际写入新高度的行数（与原高度相同的行不计） */
  changedRows: number
  /** 跳过的行（schema 无 wrap 字段或所有 cell 值为空）数量 */
  skippedRows: number
}

const DEFAULT_MAX_HEIGHT = 1200
const DEFAULT_LINE_HEIGHT_MULTIPLIER = 1.4

/**
 * 调用方提供 axis + 行号列表来跑 autofit。结果写回由 `applyHeight` 决定。
 *
 * @example
 * ```ts
 * const result = autofitRowHeights({
 *   data,
 *   theme: denseGridTheme,
 *   measurer: new Canvas2DTextMeasurer(),
 *   applyHeight: (row, h) => engine.setRowHeight(row, h),
 *   rows: [0, 1, 2, 3, 4],
 * })
 * console.log(`Autofit done: ${result.changedRows} rows updated, ${result.skippedRows} skipped`)
 * ```
 */
export function autofitRowHeights(params: AutofitRowsParams): AutofitRowsResult {
  const { data, theme, measurer, applyHeight } = params
  const schema = data.getSchema()
  const rowCount = data.getRowCount()
  const rows = params.rows ?? rangeOf(rowCount)
  const minHeight = params.minHeight ?? theme.metrics.rowHeight
  const maxHeight = params.maxHeight ?? DEFAULT_MAX_HEIGHT
  const lineHeight = params.lineHeight ?? theme.metrics.fontSize * DEFAULT_LINE_HEIGHT_MULTIPLIER
  const padY = theme.metrics.cellPaddingY
  const padX = theme.metrics.cellPaddingX
  const font = `${theme.metrics.fontSize}px ${theme.metrics.fontFamily}`

  // 预筛选 wrap 字段——一次列出，避免每行都遍历整个 schema
  const wrapFields = schema.fields.filter(
    (f) => f.wrap === true && f.type !== 'number' && !f.hidden,
  )

  if (wrapFields.length === 0) {
    return { changedRows: 0, skippedRows: rows.length }
  }

  let changedRows = 0
  let skippedRows = 0

  for (const rowIndex of rows) {
    if (rowIndex < 0 || rowIndex >= rowCount) {
      skippedRows++
      continue
    }
    let tallest = minHeight
    let anyValue = false
    for (const field of wrapFields) {
      const raw = data.getCell(rowIndex, field.id)
      if (raw === null || raw === undefined) continue
      anyValue = true
      const text = toDisplayString(raw)
      if (text.length === 0) continue
      const maxWidth = field.width - padX * 2
      if (maxWidth <= 0) continue
      const wrapped = wrapText(text, { font, maxWidth, lineHeight }, measurer)
      const cellHeight = wrapped.height + padY * 2
      if (cellHeight > tallest) tallest = cellHeight
    }
    if (!anyValue) {
      skippedRows++
      continue
    }
    const finalHeight = Math.ceil(Math.min(maxHeight, Math.max(minHeight, tallest)))
    applyHeight(rowIndex, finalHeight)
    changedRows++
  }

  return { changedRows, skippedRows }
}

/** 把任意 CellValue 标准化为可绘文本（与 CellPainter.toDisplayString 保持一致逻辑）。 */
function toDisplayString(value: CellValue): string {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.join(', ')
  return String(value)
}

/** 生成 [0, n) 的索引数组，autofit 全表时使用。 */
function rangeOf(n: number): readonly number[] {
  if (n <= 0) return []
  return Array.from({ length: n }, (_, i) => i)
}
