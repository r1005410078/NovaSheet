import type { CellAttachmentCodec } from '@novasheet/core'
import type { RichTextValue, TextRun } from './types'

/** rich-text 附件 codec：runs ⇄ JSON 串，注册 'richText' namespace（spec §5.1/§6）。 */
export const richTextCodec: CellAttachmentCodec<RichTextValue> = {
  namespace: 'richText',
  serialize(runs) {
    return JSON.stringify(runs)
  },
  deserialize(text) {
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      return undefined
    }
    if (!Array.isArray(parsed)) return undefined
    if (!parsed.every(isTextRun)) return undefined
    return parsed as RichTextValue
  },
}

function isTextRun(v: unknown): v is TextRun {
  if (typeof v !== 'object' || v === null) return false
  const r = v as Record<string, unknown>
  return typeof r.start === 'number' && typeof r.end === 'number' && typeof r.attrs === 'object' && r.attrs !== null
}
