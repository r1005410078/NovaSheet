import type { CellValue, Field, RenderFrame } from '../../../src'

/**
 * 把 RenderFrame 序列化为确定性的文本快照（黄金文件用）。
 *
 * 只读 frame 契约（viewport snapshot + data + formatCell + cellFormats + mergeRegions），
 * 与渲染后端同一访问面——不碰 ChunkedAxis/FrozenRegions 内部（架构不变量 #1）。
 * 输出按固定顺序排序，避免迭代顺序引入抖动。
 */
export function dumpFrame(frame: RenderFrame): string {
  const lines: string[] = []
  const vp = frame.viewport

  lines.push('== viewport ==')
  lines.push(
    `content=${vp.contentRect.width}x${vp.contentRect.height}` +
      ` scroll=(${vp.scrollX},${vp.scrollY})` +
      ` header=${vp.headerHeight} rowHeader=${vp.rowHeaderWidth}`,
  )

  lines.push('== regions ==')
  for (const region of [...vp.regions].sort((a, b) => a.id.localeCompare(b.id))) {
    lines.push(
      `${region.id}` +
        ` rect=(${region.rect.x},${region.rect.y},${region.rect.width},${region.rect.height})` +
        ` rows=[${region.rowRange[0]},${region.rowRange[1]}]` +
        ` cols=[${region.colRange[0]},${region.colRange[1]}]` +
        ` offset=(${region.scrollOffsetX},${region.scrollOffsetY})` +
        ` z=${region.zIndex}`,
    )
  }

  lines.push('== cells (formatted) ==')
  const main = vp.regions.find((region) => region.id === 'main')
  const schema = frame.data.getSchema()
  if (main && main.rowRange[1] >= main.rowRange[0] && main.colRange[1] >= main.colRange[0]) {
    for (let r = main.rowRange[0]; r <= main.rowRange[1]; r++) {
      const cells: string[] = []
      for (let c = main.colRange[0]; c <= main.colRange[1]; c++) {
        const field = schema.fields[c]
        if (!field) continue
        cells.push(displayText(frame, r, c, field, frame.data.getCell(r, field.id)))
      }
      lines.push(`r${r}: ${cells.join(' | ')}`)
    }
  }

  lines.push('== merges ==')
  const merges = [...(frame.mergeRegions ?? [])].sort(
    (a, b) => a.range.startRow - b.range.startRow || a.range.startCol - b.range.startCol,
  )
  for (const { range, anchor } of merges) {
    lines.push(
      `[r${range.startRow}c${range.startCol}..r${range.endRow}c${range.endCol}]` +
        ` anchor=r${anchor.rowIndex}c${anchor.colIndex}`,
    )
  }

  lines.push('== cellFormats ==')
  const formats = [...(frame.cellFormats ?? [])].sort(
    (a, b) => a.rowIndex - b.rowIndex || a.colIndex - b.colIndex,
  )
  for (const cf of formats) {
    lines.push(`r${cf.rowIndex}c${cf.colIndex} ${stableEntries(cf.format)}`)
  }

  return `${lines.join('\n')}\n`
}

/** 单元格显示文本：formatCell 优先（5-C 值格式化），无格式时回退原始值字符串；空值显示 `·`。 */
function displayText(
  frame: RenderFrame,
  rowIndex: number,
  colIndex: number,
  field: Field,
  value: CellValue | undefined,
): string {
  if (value === null || value === undefined) return '·'
  const formatted = frame.formatCell?.(rowIndex, colIndex, field, value)
  if (formatted !== undefined) return formatted
  if (Array.isArray(value)) return value.join(', ')
  return String(value)
}

/** 对象按 key 排序后 `k=v` 串接，保证 CellFormat 序列化顺序稳定。 */
function stableEntries(record: object): string {
  return Object.entries(record as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(' ')
}
