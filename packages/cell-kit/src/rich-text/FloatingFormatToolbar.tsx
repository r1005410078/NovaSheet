import { useState } from 'react'
import { CustomColorPicker } from '@novasheet/react'

export interface FloatingFormatToolbarProps {
  readonly editableRef: { current: HTMLElement | null }
}

/**
 * 浮动字体组工具栏：B/I/U/删除线 toggle 当前 Selection + 颜色 A（复用 CustomColorPicker）。
 * onMouseDown preventDefault 防抢焦点丢 Selection。data-cmd 供测试选择。
 * toggle-off（已 bold 再点取消）第一版不做，留 follow-up。
 */
export function FloatingFormatToolbar({ editableRef }: FloatingFormatToolbarProps): JSX.Element {
  const [showColor, setShowColor] = useState(false)

  const wrap = (apply: (span: HTMLSpanElement) => void): void => {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || !editableRef.current) return
    const range = sel.getRangeAt(0)
    if (range.collapsed) return
    // 防御：选区须落在本编辑区内，否则 extractContents 会误操作编辑区外 DOM。
    if (!editableRef.current.contains(range.commonAncestorContainer)) return
    const span = document.createElement('span')
    apply(span)
    const contents = range.extractContents()
    span.appendChild(contents)
    range.insertNode(span)
    sel.removeAllRanges()
  }

  return (
    <div data-novasheet-format-toolbar role="toolbar">
      <button
        type="button"
        data-cmd="bold"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => wrap((s) => { s.style.fontWeight = 'bold' })}
      >
        B
      </button>
      <button
        type="button"
        data-cmd="italic"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => wrap((s) => { s.style.fontStyle = 'italic' })}
      >
        I
      </button>
      <button
        type="button"
        data-cmd="underline"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => wrap((s) => { s.style.textDecoration = 'underline' })}
      >
        U
      </button>
      <button
        type="button"
        data-cmd="strikethrough"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => wrap((s) => { s.style.textDecoration = 'line-through' })}
      >
        S
      </button>
      <button
        type="button"
        data-cmd="color"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setShowColor((v) => !v)}
      >
        A
      </button>
      {showColor && (
        <CustomColorPicker
          initialColor="#000000"
          onConfirm={(color) => { wrap((s) => { s.style.color = color }); setShowColor(false) }}
          onCancel={() => setShowColor(false)}
        />
      )}
    </div>
  )
}
