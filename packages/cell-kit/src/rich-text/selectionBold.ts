import type { RichTextValue } from './types'

/** rich-text 对选区操作所需的 grid 门面（raw 坐标）；由组合根用真 Grid 适配。 */
export interface RichTextGridAccess {
  getCellText(rawRow: number, rawCol: number): string
  getRichText(rawRow: number, rawCol: number): RichTextValue | undefined
  setRichText(rawRow: number, rawCol: number, runs: RichTextValue): boolean
}

export interface RawRange {
  readonly startRow: number
  readonly endRow: number
  readonly startCol: number
  readonly endCol: number
}

/** 选区逐格 full-span bold：全格已 full-span bold 则 toggle 清除，否则全置 bold。空格跳过。 */
export function applyBoldToRange(grid: RichTextGridAccess, range: RawRange): void {
  const cells: { r: number; c: number; len: number }[] = []
  for (let r = range.startRow; r <= range.endRow; r++) {
    for (let c = range.startCol; c <= range.endCol; c++) {
      const len = grid.getCellText(r, c).length
      if (len > 0) cells.push({ r, c, len })
    }
  }
  const allBold =
    cells.length > 0 &&
    cells.every(({ r, c, len }) => isFullSpanBold(grid.getRichText(r, c), len))
  for (const { r, c, len } of cells) {
    grid.setRichText(r, c, allBold ? [] : [{ start: 0, end: len, attrs: { bold: true } }])
  }
}

function isFullSpanBold(runs: RichTextValue | undefined, len: number): boolean {
  return (
    !!runs &&
    runs.length === 1 &&
    runs[0]!.start === 0 &&
    runs[0]!.end === len &&
    runs[0]!.attrs.bold === true
  )
}

/** Grid facade 的 raw-coord 子集，供 cell-kit adapter 用，不 import core 类型。 */
export interface RichTextGrid {
  getCellText(rawRow: number, rawCol: number): string
  getCellAttachment(namespace: string, rawRow: number, rawCol: number): unknown
  setCellAttachment(namespace: string, rawRow: number, rawCol: number, data: unknown): boolean
  getSelection(): { selectedRange: { startRow: number; endRow: number; startCol: number; endCol: number } | null }
}

/** 把 RichTextGrid facade 适配成 RichTextGridAccess（raw 坐标）。 */
export function createGridAccess(grid: RichTextGrid): RichTextGridAccess {
  return {
    getCellText: (r, c) => grid.getCellText(r, c),
    getRichText: (r, c) => grid.getCellAttachment('richText', r, c) as RichTextValue | undefined,
    setRichText: (r, c, runs) => grid.setCellAttachment('richText', r, c, runs),
  }
}

/**
 * 对当前选区逐格应用 full-span bold。
 * view===raw 简化（sort/filter 下 view≠raw 的精确映射留 TODO）。
 * TODO(rich-text-selection-bold-viewraw): sort/filter 激活时 view range 需转 raw 坐标
 */
export function applySelectionBold(grid: RichTextGrid): void {
  const range = grid.getSelection().selectedRange
  if (!range) return
  applyBoldToRange(createGridAccess(grid), range)
}
