import type { StyledSegment } from '@zhiguang/novasheet-canvas2d'
import type { RichTextValue, TextRunAttrs } from './types'

/** cell 默认 typography（来自 theme），run 缺省字段继承它。 */
export interface CellTextDefault {
  readonly fontSize: number
  readonly fontFamily: string
  readonly color: string
}

/**
 * 把 text 按 normalized runs 切成 StyledSegment[]：run 覆盖区 = default ⊕ attrs，gap = default。
 * runs 须已 normalize（升序、不重叠）。
 */
export function splitIntoSegments(
  text: string,
  runs: RichTextValue,
  def: CellTextDefault,
): StyledSegment[] {
  if (text.length === 0) return []
  const segments: StyledSegment[] = []
  let cursor = 0
  for (const run of runs) {
    if (run.start > cursor) segments.push(makeSegment(text.slice(cursor, run.start), {}, def))
    segments.push(makeSegment(text.slice(run.start, run.end), run.attrs, def))
    cursor = run.end
  }
  if (cursor < text.length) segments.push(makeSegment(text.slice(cursor), {}, def))
  return segments
}

function makeSegment(text: string, attrs: TextRunAttrs, def: CellTextDefault): StyledSegment {
  const fontSize = attrs.fontSize ?? def.fontSize
  const fontFamily = attrs.fontFamily ?? def.fontFamily
  const parts: string[] = []
  if (attrs.italic) parts.push('italic')
  if (attrs.bold) parts.push('bold')
  parts.push(`${fontSize}px`, fontFamily)
  return {
    text,
    font: parts.join(' '),
    fontSize,
    color: attrs.color ?? def.color,
    underline: attrs.underline ?? false,
    strikethrough: attrs.strikethrough ?? false,
  }
}
