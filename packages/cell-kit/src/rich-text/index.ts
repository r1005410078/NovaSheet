import { richTextCodec } from './richTextCodec'
import { richTextRenderer } from './richTextRenderer'
import { createRichTextEditor, richTextEditor } from './RichTextCellEditor'
import { richTextToolbarExtension } from './RichTextToolbarExtension'
import { RichTextToolbarProvider } from './RichTextToolbarProvider'

export { richTextCodec } from './richTextCodec'
export { richTextRenderer } from './richTextRenderer'
export { createRichTextEditor, richTextEditor } from './RichTextCellEditor'
export type { RichTextEditorOptions } from './RichTextCellEditor'
export { createRichTextEditingSession } from './editingSession'
export type { RichTextEditingSession, RichTextInlineStyle } from './editingSession'
export { RichTextToolbarProvider, useRichTextToolbarController, useRichTextSession } from './RichTextToolbarProvider'
export type { RichTextToolbarController } from './RichTextToolbarProvider'
export { richTextToolbarExtension } from './RichTextToolbarExtension'
export { FloatingFormatToolbar } from './FloatingFormatToolbar'
export type { FloatingFormatToolbarProps } from './FloatingFormatToolbar'
export { applyBoldToRange } from './selectionBold'
export type { RichTextGridAccess, RawRange } from './selectionBold'
export { normalize } from './normalize'
export { splitIntoSegments } from './segments'
export type { CellTextDefault } from './segments'
export type { TextRun, TextRunAttrs, RichTextValue } from './types'

/**
 * rich-text 扩展装配（display + edit）：core 轴 codec + canvas2d renderer + react editor。
 * 组合根分发给各注册点（spec §4.3）。
 */
export const richTextExtension = {
  codec: richTextCodec,
  renderer: richTextRenderer,
  editor: richTextEditor,
  createEditor: createRichTextEditor,
  toolbarExtension: richTextToolbarExtension,
  ToolbarProvider: RichTextToolbarProvider,
} as const
