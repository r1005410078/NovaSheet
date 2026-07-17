import { useState } from 'react'
import { CustomColorPicker } from '@zhiguang/react'

export interface FloatingFormatToolbarProps {
  readonly editableRef: { current: HTMLElement | null }
}

/** Default font size (px) used when no ancestor specifies font-size. */
export const DEFAULT_FONT_SIZE = 14

/**
 * 遍历 fragment 内所有 text node，返回所遇到的全部 text node 列表。
 * 用 TreeWalker 而非递归，避免栈溢出。
 */
function collectTextNodes(root: Node): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  let node: Node | null = walker.nextNode()
  while (node !== null) {
    nodes.push(node as Text)
    node = walker.nextNode()
  }
  return nodes
}

/**
 * 判断选区内所有 text node 是否都满足 predicate（通过向上遍历 ancestor inline style）。
 * - range.collapsed → false（不触发 toggle-off）
 * - 无 text node（空片段）→ false
 * - 使用 cloneContents() 获取副本，避免修改真实 DOM
 *
 * 注：当选区完全位于某个 text node 之内时，cloneContents() 只克隆该 text node 本身，
 * 不含其 parent span 的样式（happy-dom / 浏览器行为一致）。此时 cloned text node 的
 * parentNode 是 fragment 自身，需要额外检查真实 range 的 commonAncestorContainer 链。
 */
export function isSelectionFullyStyled(
  range: Range,
  predicate: (el: HTMLElement) => boolean,
): boolean {
  if (range.collapsed) return false

  const fragment = range.cloneContents()
  const textNodes = collectTextNodes(fragment)
  if (textNodes.length === 0) return false

  for (const textNode of textNodes) {
    // 1. 先在 cloned fragment 内向上遍历（处理跨多元素选区时克隆保留层级的情况）
    let current: Node | null = textNode.parentNode
    let satisfied = false
    while (current !== null && current !== fragment) {
      if (current.nodeType === Node.ELEMENT_NODE) {
        if (predicate(current as HTMLElement)) {
          satisfied = true
          break
        }
      }
      current = current.parentNode
    }
    // 2. 若 clone 内未满足（text node 直接挂在 fragment 下，parent 样式丢失），
    //    降级：检查真实 range 的 commonAncestorContainer 上方链。
    //    注：mock range（测试用）可能无 commonAncestorContainer，需 guard。
    if (!satisfied && range.commonAncestorContainer != null) {
      let realNode: Node | null =
        range.commonAncestorContainer.nodeType === Node.TEXT_NODE
          ? range.commonAncestorContainer.parentNode
          : range.commonAncestorContainer
      while (realNode !== null) {
        if (realNode.nodeType === Node.ELEMENT_NODE) {
          if (predicate(realNode as HTMLElement)) {
            satisfied = true
            break
          }
        }
        realNode = realNode.parentNode
      }
    }
    if (!satisfied) return false
  }
  return true
}

/**
 * 从 anchorNode 向上遍历，找最近 ancestor 的 inline fontSize。
 * 若无，返回 DEFAULT_FONT_SIZE。
 */
export function getCurrentFontSize(anchorNode: Node | null): number {
  let current: Node | null = anchorNode
  while (current !== null) {
    if (current.nodeType === Node.ELEMENT_NODE) {
      const el = current as HTMLElement
      const fs = el.style.fontSize
      if (fs !== '') {
        const parsed = parseFloat(fs)
        if (!isNaN(parsed)) return parsed
      }
    }
    current = current.parentNode
  }
  return DEFAULT_FONT_SIZE
}

/**
 * 浮动字体组工具栏：B/I/U/删除线 toggle 当前 Selection + 颜色 A（复用 CustomColorPicker）+ 字号 ±2。
 * onMouseDown preventDefault 防抢焦点丢 Selection。data-cmd 供测试选择。
 * toggle-off（已 bold/italic/underline/strikethrough 再点取消）使用 isSelectionFullyStyled 判定。
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

  const toggleStyle = (
    predicate: (el: HTMLElement) => boolean,
    applyOn: (s: HTMLSpanElement) => void,
    applyOff: (s: HTMLSpanElement) => void,
  ): void => {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || !editableRef.current) return
    const range = sel.getRangeAt(0)
    if (range.collapsed) return
    if (!editableRef.current.contains(range.commonAncestorContainer)) return
    if (isSelectionFullyStyled(range, predicate)) {
      wrap(applyOff)
    } else {
      wrap(applyOn)
    }
  }

  return (
    <div data-novasheet-format-toolbar role="toolbar">
      <button
        type="button"
        data-cmd="bold"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() =>
          toggleStyle(
            (el) => el.style.fontWeight === 'bold',
            (s) => { s.style.fontWeight = 'bold' },
            (s) => { s.style.fontWeight = 'normal' },
          )
        }
      >
        B
      </button>
      <button
        type="button"
        data-cmd="italic"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() =>
          toggleStyle(
            (el) => el.style.fontStyle === 'italic',
            (s) => { s.style.fontStyle = 'italic' },
            (s) => { s.style.fontStyle = 'normal' },
          )
        }
      >
        I
      </button>
      <button
        type="button"
        data-cmd="underline"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() =>
          toggleStyle(
            (el) => el.style.textDecoration === 'underline',
            (s) => { s.style.textDecoration = 'underline' },
            // TODO: inline style 无法精确移除单一 text-decoration 值；U/S 共用 textDecoration，toggle-off 互斥
            (s) => { s.style.textDecoration = 'none' },
          )
        }
      >
        U
      </button>
      <button
        type="button"
        data-cmd="strikethrough"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() =>
          toggleStyle(
            (el) => el.style.textDecoration === 'line-through',
            (s) => { s.style.textDecoration = 'line-through' },
            // TODO: inline style 无法精确移除单一 text-decoration 值；U/S 共用 textDecoration，toggle-off 互斥
            (s) => { s.style.textDecoration = 'none' },
          )
        }
      >
        S
      </button>
      <button
        type="button"
        data-cmd="font-size-inc"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          const sel = window.getSelection()
          const anchor = sel?.anchorNode ?? null
          const cur = getCurrentFontSize(anchor)
          const next = Math.min(96, cur + 2)
          wrap((s) => { s.style.fontSize = `${next}px` })
        }}
      >
        A+
      </button>
      <button
        type="button"
        data-cmd="font-size-dec"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          const sel = window.getSelection()
          const anchor = sel?.anchorNode ?? null
          const cur = getCurrentFontSize(anchor)
          const next = Math.max(8, cur - 2)
          wrap((s) => { s.style.fontSize = `${next}px` })
        }}
      >
        A-
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
