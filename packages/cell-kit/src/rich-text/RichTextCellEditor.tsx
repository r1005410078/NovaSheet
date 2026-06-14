import { useEffect, useRef } from 'react'
import { createReactCellEditor, type ReactCellEditorProps } from '@novasheet/react'
import type { CellEditor } from '@novasheet/core'
import { richTextToHtml, htmlElementToRichText } from './serialize'
import { FloatingFormatToolbar } from './FloatingFormatToolbar'
import type { RichTextValue } from './types'

const RICH_TEXT_NAMESPACE = 'richText'
/** toolbar 行高（px）；paddingTop 预留同等空间，让 toolbar absolute 叠在 padding 区而不覆盖编辑文本。 */
const TOOLBAR_HEIGHT = 36

/** contenteditable 编辑器组件；toolbar absolute 定位于 padding 区，不与编辑文本重叠。 */
function RichTextCellEditorComponent(props: ReactCellEditorProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const { value, commit, setAttachment, getAttachment, cancel } = props

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const text = value == null ? '' : String(value)
    const runs = (getAttachment?.(RICH_TEXT_NAMESPACE) as RichTextValue | undefined) ?? []
    el.innerHTML = richTextToHtml(text, runs)
    el.focus()
  }, [value, getAttachment])

  const submit = (): void => {
    const el = ref.current
    if (!el) return
    const { text, runs } = htmlElementToRichText(el)
    // 先写附件再提交值，避免 commit 触发 close/unmount 后 setAttachment 时序问题。
    setAttachment?.(RICH_TEXT_NAMESPACE, runs)
    commit(text)
  }

  return (
    <div style={{ position: 'relative', paddingTop: TOOLBAR_HEIGHT }}>
      {/* toolbar 绝对定位在 padding 区内，不挤压编辑区——onMouseDown preventDefault 防抢焦点。 */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: TOOLBAR_HEIGHT, display: 'flex', alignItems: 'center', background: '#fff', border: '1px solid #e0e0e0', borderRadius: '4px 4px 0 0', boxShadow: '0 -2px 8px rgba(0,0,0,.1)', zIndex: 1 }}>
        <FloatingFormatToolbar editableRef={ref} />
      </div>
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
    </div>
  )
}

/** rich-text 的 CellEditor（inline 模式）。 */
export const richTextEditor: CellEditor = createReactCellEditor(RichTextCellEditorComponent, { kind: 'inline' })
