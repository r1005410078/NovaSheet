import type { DataWindow } from '../DataSource'

export interface BlockCoord {
  readonly blockRow: number
  readonly blockCol: number
}

export function windowsEqual(a: DataWindow | null, b: DataWindow | null): boolean {
  if (a === b) return true
  if (a === null || b === null) return false
  return (
    a.startRow === b.startRow &&
    a.endRow === b.endRow &&
    a.startCol === b.startCol &&
    a.endCol === b.endCol
  )
}

export function clampWindow(window: DataWindow, rowCount: number, colCount: number): DataWindow {
  const maxRow = Math.max(rowCount - 1, 0)
  const maxCol = Math.max(colCount - 1, 0)
  return {
    startRow: Math.max(0, Math.min(window.startRow, maxRow)),
    endRow: Math.max(0, Math.min(window.endRow, maxRow)),
    startCol: Math.max(0, Math.min(window.startCol, maxCol)),
    endCol: Math.max(0, Math.min(window.endCol, maxCol)),
  }
}

/** 可视窗口按 preloadScreens 对称外扩（总面积 ≈ 可视区 × preloadScreens）并 clamp 到数据边界。 */
export function expandWindow(
  window: DataWindow,
  preloadScreens: number,
  rowCount: number,
  colCount: number,
): DataWindow {
  const rowSpan = window.endRow - window.startRow + 1
  const colSpan = window.endCol - window.startCol + 1
  const factor = Math.max(preloadScreens - 1, 0)
  const rowMargin = Math.floor((rowSpan * factor) / 2)
  const colMargin = Math.floor((colSpan * factor) / 2)
  return clampWindow(
    {
      startRow: window.startRow - rowMargin,
      endRow: window.endRow + rowMargin,
      startCol: window.startCol - colMargin,
      endCol: window.endCol + colMargin,
    },
    rowCount,
    colCount,
  )
}

export function blockKey(blockRow: number, blockCol: number): string {
  return `${blockRow}:${blockCol}`
}

/** 窗口相交的所有块坐标，行优先顺序。空窗口返回空数组。 */
export function windowToBlocks(window: DataWindow, blockRows: number, blockCols: number): BlockCoord[] {
  if (window.endRow < window.startRow || window.endCol < window.startCol) return []
  const startBlockRow = Math.floor(window.startRow / blockRows)
  const endBlockRow = Math.floor(window.endRow / blockRows)
  const startBlockCol = Math.floor(window.startCol / blockCols)
  const endBlockCol = Math.floor(window.endCol / blockCols)
  const blocks: BlockCoord[] = []
  for (let blockRow = startBlockRow; blockRow <= endBlockRow; blockRow += 1) {
    for (let blockCol = startBlockCol; blockCol <= endBlockCol; blockCol += 1) {
      blocks.push({ blockRow, blockCol })
    }
  }
  return blocks
}

/** 单个块在数据坐标系中的矩形范围，clamp 到数据边界（末块可能比 blockRows/blockCols 小）。 */
export function blockToWindow(
  block: BlockCoord,
  blockRows: number,
  blockCols: number,
  rowCount: number,
  colCount: number,
): DataWindow {
  return clampWindow(
    {
      startRow: block.blockRow * blockRows,
      endRow: block.blockRow * blockRows + blockRows - 1,
      startCol: block.blockCol * blockCols,
      endCol: block.blockCol * blockCols + blockCols - 1,
    },
    rowCount,
    colCount,
  )
}

/**
 * 同一 blockRow 内水平相邻（blockCol 连续）的块合并为一个矩形请求；
 * 不同 blockRow 从不合并（§6.1 步骤 4：仅同块行内水平合并）。
 */
export function mergeBlocksIntoRects(
  blocks: readonly BlockCoord[],
  blockRows: number,
  blockCols: number,
  rowCount: number,
  colCount: number,
): { window: DataWindow; blocks: BlockCoord[] }[] {
  const byBlockRow = new Map<number, number[]>()
  for (const b of blocks) {
    const cols = byBlockRow.get(b.blockRow) ?? []
    cols.push(b.blockCol)
    byBlockRow.set(b.blockRow, cols)
  }

  const groups: { window: DataWindow; blocks: BlockCoord[] }[] = []
  for (const [blockRow, cols] of byBlockRow) {
    const sorted = [...cols].sort((a, b) => a - b)
    let runStart = sorted[0]!
    let prev = sorted[0]!
    let runBlocks: BlockCoord[] = [{ blockRow, blockCol: prev }]

    const flush = (): void => {
      const startWindow = blockToWindow({ blockRow, blockCol: runStart }, blockRows, blockCols, rowCount, colCount)
      const endWindow = blockToWindow({ blockRow, blockCol: prev }, blockRows, blockCols, rowCount, colCount)
      groups.push({
        window: {
          startRow: startWindow.startRow,
          endRow: startWindow.endRow,
          startCol: startWindow.startCol,
          endCol: endWindow.endCol,
        },
        blocks: runBlocks,
      })
    }

    for (let i = 1; i < sorted.length; i += 1) {
      const col = sorted[i]!
      if (col === prev + 1) {
        runBlocks.push({ blockRow, blockCol: col })
        prev = col
        continue
      }
      flush()
      runStart = col
      prev = col
      runBlocks = [{ blockRow, blockCol: col }]
    }
    flush()
  }
  return groups
}
