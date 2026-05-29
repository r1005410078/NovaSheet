/**
 * Phase 4.1 剪贴板交互类型。
 *
 * 定义剪贴板操作（cut/copy/paste）的基础类型和粘贴失败情况。
 */

export type ClipboardAction = 'cut' | 'copy' | 'paste'

export interface PasteSkippedCell {
  readonly rowIndex: number
  readonly fieldId: string
  readonly reason: 'type' | 'readonly' | 'merge'
}
