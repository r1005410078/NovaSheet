/**
 * Resize handle 视觉——双 pill grip，hover / focus / 拖拽时显示（对齐 Sheets 式提示）。
 */

import type { ThemeColors, ThemeMetrics } from '@novasheet/core'

const STYLESHEET_ID = 'novasheet-resize-handle-style'

const RESIZE_HANDLE_CSS = `
[data-novasheet-resize-handle] {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  background: transparent;
}
[data-novasheet-resize-handle][data-ns-resize="column"] {
  flex-direction: row;
}
[data-novasheet-resize-handle][data-ns-resize="row"] {
  flex-direction: column;
}
[data-novasheet-resize-grip] {
  flex-shrink: 0;
  opacity: 0;
  background: var(--ns-resize-grip);
  border-radius: var(--ns-resize-grip-radius);
  transition:
    opacity 0.12s ease,
    background-color 0.12s ease,
    transform 0.12s ease;
  pointer-events: none;
}
[data-novasheet-resize-handle][data-ns-resize="column"] [data-novasheet-resize-grip] {
  width: var(--ns-resize-grip-thickness);
  height: var(--ns-resize-grip-length);
}
[data-novasheet-resize-handle][data-ns-resize="row"] [data-novasheet-resize-grip] {
  width: var(--ns-resize-grip-length);
  height: var(--ns-resize-grip-thickness);
}
[data-novasheet-resize-handle]:hover [data-novasheet-resize-grip],
[data-novasheet-resize-handle]:focus-visible [data-novasheet-resize-grip],
[data-novasheet-resize-handle][data-ns-resize-active] [data-novasheet-resize-grip] {
  opacity: 1;
}
[data-novasheet-resize-handle]:hover [data-novasheet-resize-grip],
[data-novasheet-resize-handle]:focus-visible [data-novasheet-resize-grip] {
  background: var(--ns-resize-grip-hover);
}
[data-novasheet-resize-handle][data-ns-resize-active] [data-novasheet-resize-grip] {
  background: var(--ns-resize-grip-active);
  transform: scale(1.05);
}
[data-novasheet-handle-layer][data-ns-resize-dragging] [data-novasheet-resize-handle] [data-novasheet-resize-grip] {
  opacity: 0;
}
[data-novasheet-resize-indicator] {
  position: absolute;
  display: none;
  pointer-events: none;
  background: var(--ns-resize-indicator);
  z-index: 3;
}
[data-novasheet-resize-indicator][data-ns-orientation="column"] {
  width: var(--ns-resize-line-thickness);
  top: 0;
  bottom: 0;
  transform: translateX(-50%);
}
[data-novasheet-resize-indicator][data-ns-orientation="row"] {
  height: var(--ns-resize-line-thickness);
  left: 0;
  right: 0;
  transform: translateY(-50%);
}
[data-novasheet-resize-indicator-cap] {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  pointer-events: none;
}
[data-novasheet-resize-indicator][data-ns-orientation="column"] [data-novasheet-resize-indicator-cap] {
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  height: var(--ns-resize-cap-height);
  flex-direction: row;
}
[data-novasheet-resize-indicator][data-ns-orientation="row"] [data-novasheet-resize-indicator-cap] {
  top: 50%;
  left: 0;
  transform: translateY(-50%);
  width: var(--ns-resize-cap-width);
  flex-direction: column;
}
[data-novasheet-resize-indicator-cap] [data-novasheet-resize-grip] {
  opacity: 1;
  background: var(--ns-resize-grip-active);
}
[data-novasheet-resize-indicator][data-ns-orientation="column"] [data-novasheet-resize-indicator-cap] [data-novasheet-resize-grip] {
  width: var(--ns-resize-grip-thickness);
  height: var(--ns-resize-grip-length);
}
[data-novasheet-resize-indicator][data-ns-orientation="row"] [data-novasheet-resize-indicator-cap] [data-novasheet-resize-grip] {
  width: var(--ns-resize-grip-length);
  height: var(--ns-resize-grip-thickness);
}
`.trim()

export function ensureResizeHandleStylesheet(doc: Document = document): void {
  if (doc.getElementById(STYLESHEET_ID)) return
  const style = doc.createElement('style')
  style.id = STYLESHEET_ID
  style.textContent = RESIZE_HANDLE_CSS
  doc.head.appendChild(style)
}

/** 将 Theme 色板映射到 handle 层容器的 CSS 变量。 */
export function applyResizeHandleTheme(
  host: HTMLElement,
  colors: ThemeColors,
  metrics: Pick<ThemeMetrics, 'headerHeight' | 'rowHeaderWidth'>,
): void {
  ensureResizeHandleStylesheet(host.ownerDocument)
  host.style.setProperty('--ns-resize-grip', colors.headerText)
  host.style.setProperty('--ns-resize-grip-hover', colors.gridLineStrong)
  host.style.setProperty('--ns-resize-grip-active', colors.selectionBorder)
  host.style.setProperty('--ns-resize-indicator', colors.selectionBorder)
  host.style.setProperty('--ns-resize-grip-thickness', '4px')
  host.style.setProperty('--ns-resize-grip-length', '20px')
  host.style.setProperty('--ns-resize-grip-radius', '2px')
  host.style.setProperty('--ns-resize-line-thickness', '2px')
  host.style.setProperty('--ns-resize-cap-height', `${metrics.headerHeight}px`)
  host.style.setProperty('--ns-resize-cap-width', `${metrics.rowHeaderWidth}px`)
}
