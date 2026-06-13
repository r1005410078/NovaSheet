import { useEffect, useRef } from 'react'
import { createReactCellEditor, type ReactCellEditorProps } from '@novasheet/react'
import type { CellEditor } from '@novasheet/core'
import { richTextToHtml, htmlElementToRichText } from './serialize'

const RICH_TEXT_NAMESPACE = 'richText'

/** contenteditable 编辑器组件；初值由当前 value 回填（既存 runs 回填留 Task 6）。 */
function RichTextCellEditorComponent(props: ReactCellEditorProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const { value, commit, setAttachment, cancel } = props

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const text = value == null ? '' : String(value)
    // 初值 runs：先以空 runs 回填纯文本；既存 runs 回填留 Task 6 接 getAttachment。
    el.innerHTML = richTextToHtml(text, [])
    el.focus()
  }, [value])

  const submit = (): void => {
    const el = ref.current
    if (!el) return
    const { text, runs } = htmlElementToRichText(el)
    // 先写附件再提交值，避免 commit 触发 close/unmount 后 setAttachment 时序问题。
    setAttachment?.(RICH_TEXT_NAMESPACE, runs)
    commit(text)
  }

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      data-novasheet-rich-text-editor
      style={{ minWidth: 120, outline: 'none', whiteSpace: 'pre-wrap' }}
      onBlur={submit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.altKey) { e.preventDefault(); submit() }
        if (e.key === 'Escape') { e.preventDefault(); cancel() }
      }}
    />
  )
}

/** rich-text 的 CellEditor（inline 模式）。 */
export const richTextEditor: CellEditor = createReactCellEditor(RichTextCellEditorComponent, { kind: 'inline' })
