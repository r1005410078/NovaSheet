/**
 * Phase 4.0 — 右键菜单样式（Theme CSS 变量）。
 */

import type { Theme } from '../../kernel/theme/Theme'

const STYLESHEET_ID = 'novasheet-context-menu-style'

const CSS = `
[data-novasheet-context-menu-layer] {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 3;
}
[data-novasheet-context-menu] {
  position: fixed;
  display: none;
  pointer-events: auto;
  min-width: 160px;
  padding: var(--ns-menu-padding-y) 0;
  background: var(--ns-menu-bg);
  border: 1px solid var(--ns-menu-border);
  border-radius: 4px;
  box-shadow: var(--ns-menu-shadow);
  color: var(--ns-menu-text);
  font-family: var(--ns-menu-font);
  font-size: var(--ns-menu-font-size);
  user-select: none;
}
[data-novasheet-context-menu][data-open] {
  display: block;
}
[data-novasheet-context-menu] [role="menuitem"] {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  align-items: center;
  width: 100%;
  min-height: 32px;
  padding: 0 var(--ns-menu-padding-x);
  gap: 0 4px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
[data-novasheet-context-menu] [role="menuitem"]:focus,
[data-novasheet-context-menu] [role="menuitem"]:hover:not([aria-disabled="true"]) {
  background: var(--ns-menu-item-hover);
  outline: none;
}
[data-novasheet-context-menu] [role="menuitem"][aria-disabled="true"] {
  color: var(--ns-menu-text-disabled);
  cursor: default;
}
[data-novasheet-context-menu] [role="separator"] {
  height: 1px;
  margin: 4px 0;
  background: var(--ns-menu-separator);
}
[data-novasheet-context-menu] {
  min-width: 220px;
}
[data-ns-menu-icon-slot] {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: var(--ns-menu-text);
  opacity: 0.7;
}
[data-ns-menu-label] {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
[data-ns-menu-shortcut] {
  padding-left: 16px;
  opacity: 0.56;
  font-size: 12px;
  white-space: nowrap;
}
[data-ns-submenu] {
  position: fixed;
  background: var(--ns-menu-bg);
  border: 1px solid var(--ns-menu-border);
  border-radius: 4px;
  box-shadow: var(--ns-menu-shadow);
  padding: var(--ns-menu-padding-y) 0;
  min-width: 180px;
  z-index: 4;
}
[data-ns-submenu] [role="menuitem"] {
  display: block;
  width: 100%;
  padding: 6px var(--ns-menu-padding-x);
  border: 0;
  background: transparent;
  color: var(--ns-menu-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
[data-ns-submenu] [role="menuitem"]:hover:not([aria-disabled="true"]) {
  background: var(--ns-menu-item-hover);
}
`.trim()

export function ensureContextMenuStylesheet(doc: Document = document): void {
  if (doc.getElementById(STYLESHEET_ID)) return
  const style = doc.createElement('style')
  style.id = STYLESHEET_ID
  style.textContent = CSS
  doc.head.appendChild(style)
}

export function applyContextMenuTheme(host: HTMLElement, theme: Theme): void {
  ensureContextMenuStylesheet(host.ownerDocument)
  const { colors, metrics } = theme
  host.style.setProperty('--ns-menu-bg', colors.background)
  host.style.setProperty('--ns-menu-border', colors.gridLineStrong)
  host.style.setProperty('--ns-menu-text', colors.text)
  host.style.setProperty('--ns-menu-text-disabled', colors.headerText)
  host.style.setProperty('--ns-menu-item-hover', colors.menuItemHover)
  host.style.setProperty('--ns-menu-separator', colors.gridLine)
  host.style.setProperty('--ns-menu-accent', colors.selectionBorder)
  host.style.setProperty('--ns-menu-shadow', metrics.menuShadow)
  host.style.setProperty('--ns-menu-font', metrics.fontFamily)
  host.style.setProperty('--ns-menu-font-size', `${metrics.fontSize}px`)
  host.style.setProperty('--ns-menu-padding-x', `${metrics.menuPaddingX}px`)
  host.style.setProperty('--ns-menu-padding-y', `${metrics.menuPaddingY}px`)
}
