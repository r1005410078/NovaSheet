import { normalize } from './normalize'
import type { RichTextValue, TextRun, TextRunAttrs } from './types'

/** runs → contenteditable 初值 HTML：每段一个 <span style>，`\n` → <br>。 */
export function richTextToHtml(text: string, runs: RichTextValue): string {
  if (text.length === 0) return ''
  const norm = normalize(runs, text)
  const segs = splitSegmentsWithAttrs(text, norm)
  const parts: string[] = []
  for (const { text: segText, attrs } of segs) {
    const lines = segText.split('\n')
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) parts.push('<br>')
      const style = attrsToStyle(attrs)
      parts.push(style ? `<span style="${escapeAttr(style)}">${escapeHtml(lines[i]!)}</span>` : `<span>${escapeHtml(lines[i]!)}</span>`)
    }
  }
  return parts.join('')
}

/** contenteditable DOM → { text, normalized runs }。<br> → \n；inline style → attrs。 */
export function htmlElementToRichText(root: HTMLElement): { text: string; runs: RichTextValue } {
  let text = ''
  const raw: TextRun[] = []

  function walk(node: Node, inherited: MutableAttrs): void {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3 /* TEXT_NODE */) {
        const t = child.textContent ?? ''
        if (t.length === 0) continue
        const start = text.length
        text += t
        if (hasAnyAttr(inherited)) raw.push({ start, end: text.length, attrs: toAttrs(inherited) })
      } else if (child.nodeName === 'BR') {
        text += '\n'
      } else if (child.nodeType === 1 /* ELEMENT_NODE */) {
        walk(child, mergeStyle(inherited, child as HTMLElement))
      }
    }
  }

  walk(root, { bold: false, italic: false, underline: false, strikethrough: false })
  return { text, runs: normalize(raw, text) }
}

interface MutableAttrs {
  color?: string
  bold: boolean
  italic: boolean
  underline: boolean
  strikethrough: boolean
  fontSize?: number
  fontFamily?: string
}

function mergeStyle(base: MutableAttrs, el: HTMLElement): MutableAttrs {
  const s = el.style
  const next: MutableAttrs = { ...base }
  if (s.fontWeight === 'bold' || Number(s.fontWeight) >= 600) next.bold = true
  if (s.fontStyle === 'italic') next.italic = true
  const deco = s.textDecoration || s.textDecorationLine || ''
  if (deco.includes('underline')) next.underline = true
  if (deco.includes('line-through')) next.strikethrough = true
  if (s.color) next.color = s.color
  if (s.fontSize) { const n = parseFloat(s.fontSize); if (!Number.isNaN(n)) next.fontSize = n }
  if (s.fontFamily) next.fontFamily = s.fontFamily
  return next
}

function hasAnyAttr(a: MutableAttrs): boolean {
  return a.bold || a.italic || a.underline || a.strikethrough || a.color != null || a.fontSize != null || a.fontFamily != null
}

function toAttrs(a: MutableAttrs): TextRunAttrs {
  const out: Record<string, unknown> = {}
  if (a.bold) out.bold = true
  if (a.italic) out.italic = true
  if (a.underline) out.underline = true
  if (a.strikethrough) out.strikethrough = true
  if (a.color != null) out.color = a.color
  if (a.fontSize != null) out.fontSize = a.fontSize
  if (a.fontFamily != null) out.fontFamily = a.fontFamily
  return out as TextRunAttrs
}

/** 切段但只携带 run.attrs（不并入 cell default）；gap 段 attrs={}。 */
function splitSegmentsWithAttrs(text: string, runs: RichTextValue): { text: string; attrs: TextRunAttrs }[] {
  const out: { text: string; attrs: TextRunAttrs }[] = []
  let cursor = 0
  for (const run of runs) {
    if (run.start > cursor) out.push({ text: text.slice(cursor, run.start), attrs: {} })
    out.push({ text: text.slice(run.start, run.end), attrs: run.attrs })
    cursor = run.end
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor), attrs: {} })
  return out
}

function attrsToStyle(a: TextRunAttrs): string {
  const decls: string[] = []
  if (a.bold) decls.push('font-weight:bold')
  if (a.italic) decls.push('font-style:italic')
  const deco: string[] = []
  if (a.underline) deco.push('underline')
  if (a.strikethrough) deco.push('line-through')
  if (deco.length) decls.push(`text-decoration:${deco.join(' ')}`)
  if (a.color != null) decls.push(`color:${a.color}`)
  if (a.fontSize != null) decls.push(`font-size:${a.fontSize}px`)
  if (a.fontFamily != null) decls.push(`font-family:${a.fontFamily}`)
  return decls.join(';')
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** style 属性值转义：在 escapeHtml 基础上转义双引号，防 color/fontFamily 含 `"` 破坏属性边界。 */
function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;')
}
