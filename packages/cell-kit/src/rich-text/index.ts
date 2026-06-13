import { richTextCodec } from './richTextCodec'
import { richTextRenderer } from './richTextRenderer'

export { richTextCodec } from './richTextCodec'
export { richTextRenderer } from './richTextRenderer'
export { normalize } from './normalize'
export { splitIntoSegments } from './segments'
export type { CellTextDefault } from './segments'
export type { TextRun, TextRunAttrs, RichTextValue } from './types'

/**
 * rich-text 扩展装配（display 半）：core 轴 codec + canvas2d renderer。
 * editor（react）在 Phase C-edit 补入同一对象。组合根分发给各注册点（spec §4.3）。
 */
export const richTextExtension = {
  codec: richTextCodec,
  renderer: richTextRenderer,
} as const
