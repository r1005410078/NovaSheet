/**
 * Phase 3.5 — 单元格编辑器样式（Theme CSS 变量）。
 */

import type { Theme } from '@novasheet/core'

const STYLESHEET_ID = 'novasheet-cell-editor-style'

const CELL_EDITOR_CSS = `
[data-novasheet-cell-editor] {
  position: absolute;
  display: none;
  box-sizing: border-box;
  margin: 0;
  padding: var(--ns-cell-editor-padding-y) var(--ns-cell-editor-padding-x);
  border: 2px solid var(--ns-cell-editor-border);
  outline: none;
  background: var(--ns-cell-editor-bg);
  color: var(--ns-cell-editor-text);
  font-family: var(--ns-cell-editor-font);
  font-size: var(--ns-cell-editor-font-size);
  line-height: 1.2;
  z-index: 4;
}
textarea[data-novasheet-cell-editor] {
  resize: none;
  /* 与 Google 表格一致：编辑框不软折——默认 1 行，长单行横向溢出，纵向仅随 Alt+Enter 硬换行增长。
     纵向高度由 DomCellEditor.autoGrow 按 scrollHeight 管理（overflow-y 隐藏，避免出现滚动条）。 */
  white-space: pre;
  overflow-x: hidden;
  overflow-y: hidden;
  line-height: 1.4;
}
`.trim()

export function ensureCellEditorStylesheet(doc: Document = document): void {
  if (doc.getElementById(STYLESHEET_ID)) return
  const style = doc.createElement('style')
  style.id = STYLESHEET_ID
  style.textContent = CELL_EDITOR_CSS
  doc.head.appendChild(style)
}

export function applyCellEditorTheme(host: HTMLElement, theme: Theme): void {
  ensureCellEditorStylesheet(host.ownerDocument)
  const { metrics, colors } = theme
  host.style.setProperty('--ns-cell-editor-bg', colors.background)
  host.style.setProperty('--ns-cell-editor-text', colors.text)
  host.style.setProperty('--ns-cell-editor-border', colors.selectionBorder)
  host.style.setProperty('--ns-cell-editor-padding-x', `${metrics.cellPaddingX}px`)
  host.style.setProperty('--ns-cell-editor-padding-y', `${metrics.cellPaddingY}px`)
  host.style.setProperty('--ns-cell-editor-font', metrics.fontFamily)
  host.style.setProperty('--ns-cell-editor-font-size', `${metrics.fontSize}px`)
}
