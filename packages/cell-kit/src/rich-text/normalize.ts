import type { TextRun, TextRunAttrs, RichTextValue } from './types'

/**
 * 规整 runs：clamp 到 [0, text.length]、丢空、按 start 升序、snap 代理对边界、合并相邻等格。
 * 假定输入 runs 不重叠（编辑器保证）；重叠不在本函数职责内（C-edit 的 toggle 保证）。
 */
export function normalize(runs: readonly TextRun[], text: string): RichTextValue {
  const len = text.length
  const cleaned: TextRun[] = []
  for (const r of runs) {
    let start = clamp(r.start, 0, len)
    let end = clamp(r.end, 0, len)
    if (start >= end) continue
    start = snapStart(text, start)
    end = snapEnd(text, end)
    cleaned.push({ start, end, attrs: r.attrs })
  }
  cleaned.sort((a, b) => a.start - b.start)

  const merged: TextRun[] = []
  for (const r of cleaned) {
    const prev = merged[merged.length - 1]
    if (prev !== undefined && prev.end === r.start && sameAttrs(prev.attrs, r.attrs)) {
      merged[merged.length - 1] = { start: prev.start, end: r.end, attrs: prev.attrs }
    } else {
      merged.push(r)
    }
  }
  return merged
}

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n
}

/** start 落在 low surrogate（前一个是 high）上 → 向外退到 high surrogate。 */
function snapStart(text: string, i: number): number {
  if (i > 0 && isLowSurrogate(text.charCodeAt(i)) && isHighSurrogate(text.charCodeAt(i - 1))) return i - 1
  return i
}

/** end 落在 high+low 之间（i-1=high, i=low）→ 向外进到 low surrogate 之后。 */
function snapEnd(text: string, i: number): number {
  if (i < text.length && isHighSurrogate(text.charCodeAt(i - 1)) && isLowSurrogate(text.charCodeAt(i))) {
    return i + 1
  }
  return i
}

function isHighSurrogate(c: number): boolean { return c >= 0xd800 && c <= 0xdbff }
function isLowSurrogate(c: number): boolean { return c >= 0xdc00 && c <= 0xdfff }

const ATTR_KEYS = ['bold', 'italic', 'underline', 'strikethrough', 'fontSize', 'fontFamily', 'color'] as const

function sameAttrs(a: TextRunAttrs, b: TextRunAttrs): boolean {
  for (const k of ATTR_KEYS) if (a[k] !== b[k]) return false
  return true
}
