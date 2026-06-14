import { useEffect, useRef } from 'react'
import { createReactCellEditor, type ReactCellEditorProps } from '@novasheet/react'
import type { CellEditor } from '@novasheet/core'
import type { FocusEvent } from 'react'
import { richTextToHtml, htmlElementToRichText } from './serialize'
import { FloatingFormatToolbar } from './FloatingFormatToolbar'
import { createRichTextEditingSession } from './editingSession'
import type { RichTextValue } from './types'
import type { RichTextToolbarController } from './RichTextToolbarProvider'

const RICH_TEXT_NAMESPACE = 'richText'
const TOOLBAR_HEIGHT = 36
const RICH_TEXT_EXTERNAL_FOCUS_SELECTOR =
  '[data-rich-text-toolbar], [data-rich-text-color-picker]'

export interface RichTextEditorOptions {
  readonly showInlineToolbar?: boolean
  readonly getToolbarController?: () => RichTextToolbarController | null
}

interface RichTextCellEditorOwnProps {
  readonly options?: RichTextEditorOptions
}

/** contenteditable 编辑器组件；默认由外部 React toolbar 驱动格式操作。 */
function RichTextCellEditorComponent(props: ReactCellEditorProps & RichTextCellEditorOwnProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const { value, commit, setAttachment, getAttachment, cancel, options } = props
  const showInlineToolbar = options?.showInlineToolbar === true

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const text = value == null ? '' : String(value)
    const runs = (getAttachment?.(RICH_TEXT_NAMESPACE) as RichTextValue | undefined) ?? []
    el.innerHTML = richTextToHtml(text, runs)
    el.focus()
  }, [value, getAttachment])

  useEffect(() => {
    const el = ref.current
    const controller = options?.getToolbarController?.() ?? null
    if (!el || !controller) return

    const session = createRichTextEditingSession(el)
    const saveSelection = (): void => { session.saveSelection() }

    controller.setSession(session)
    el.addEventListener('mouseup', saveSelection)
    el.addEventListener('keyup', saveSelection)
    document.addEventListener('selectionchange', saveSelection)

    return () => {
      el.removeEventListener('mouseup', saveSelection)
      el.removeEventListener('keyup', saveSelection)
      document.removeEventListener('selectionchange', saveSelection)
      if (controller.getSession() === session) controller.setSession(null)
    }
  }, [options])

  const submit = (): void => {
    const el = ref.current
    if (!el) return
    const { text, runs } = htmlElementToRichText(el)
    // 先写附件再提交值，避免 commit 触发 close/unmount 后 setAttachment 时序问题。
    setAttachment?.(RICH_TEXT_NAMESPACE, runs)
    commit(text)
  }

  const submitOnBlur = (event: FocusEvent<HTMLDivElement>): void => {
    const nextFocus = event.relatedTarget
    if (nextFocus instanceof Element && nextFocus.closest(RICH_TEXT_EXTERNAL_FOCUS_SELECTOR)) {
      return
    }
    submit()
  }

  return (
    <div style={{ position: 'relative', paddingTop: showInlineToolbar ? TOOLBAR_HEIGHT : 0 }}>
      {showInlineToolbar ? (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: TOOLBAR_HEIGHT, display: 'flex', alignItems: 'center', background: '#fff', border: '1px solid #e0e0e0', borderRadius: '4px 4px 0 0', boxShadow: '0 -2px 8px rgba(0,0,0,.1)', zIndex: 1 }}>
          <FloatingFormatToolbar editableRef={ref} />
        </div>
      ) : null}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        data-novasheet-rich-text-editor
        style={{ minWidth: 120, outline: 'none', whiteSpace: 'pre-wrap' }}
        onBlur={submitOnBlur}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.altKey) { e.preventDefault(); submit() }
          if (e.key === 'Escape') { e.preventDefault(); cancel() }
        }}
      />
    </div>
  )
}

/** 创建 rich-text CellEditor；默认使用外部 toolbar，legacy demo 可显式打开内联 toolbar。 */
export function createRichTextEditor(options: RichTextEditorOptions = {}): CellEditor {
  return createReactCellEditor<RichTextCellEditorOwnProps>(
    RichTextCellEditorComponent,
    { kind: 'inline' },
    { options },
  )
}

/** rich-text 的 CellEditor（inline 模式）。 */
export const richTextEditor: CellEditor = createRichTextEditor()
