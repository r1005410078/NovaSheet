import type { Theme } from '@novasheet/core'

const STYLESHEET_ID = 'novasheet-filter-popover-style'

const CSS = `
[data-novasheet-filter-popover-layer] {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 4;
}
[data-novasheet-filter-popover] {
  position: fixed;
  display: none;
  pointer-events: auto;
  box-sizing: border-box;
  min-width: 240px;
  max-width: 320px;
  padding: 10px;
  background: var(--ns-filter-popover-bg);
  border: 1px solid var(--ns-filter-popover-border);
  border-radius: 4px;
  box-shadow: var(--ns-filter-popover-shadow);
  color: var(--ns-filter-popover-text);
  font-family: var(--ns-filter-popover-font);
  font-size: var(--ns-filter-popover-font-size);
}
[data-novasheet-filter-popover][data-open] {
  display: block;
}
[data-ns-filter-title] {
  margin: 0 0 8px;
  color: var(--ns-filter-popover-muted);
  font-weight: 600;
}
[data-novasheet-filter-popover] input,
[data-novasheet-filter-popover] select {
  box-sizing: border-box;
  width: 100%;
  margin: 0 0 8px;
  padding: 5px 6px;
  border: 1px solid var(--ns-filter-popover-border);
  border-radius: 3px;
  background: var(--ns-filter-popover-bg);
  color: var(--ns-filter-popover-text);
  font: inherit;
}
[data-novasheet-filter-popover] input:focus,
[data-novasheet-filter-popover] select:focus {
  border-color: var(--ns-filter-popover-accent);
  outline: none;
}
[data-ns-filter-choice] {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 4px 0;
}
[data-ns-filter-choice] input {
  width: auto;
  margin: 0;
}
[data-novasheet-filter-popover] button {
  margin: 2px 6px 0 0;
  padding: 5px 10px;
  border: 1px solid var(--ns-filter-popover-border);
  border-radius: 3px;
  background: var(--ns-filter-popover-bg);
  color: var(--ns-filter-popover-text);
  font: inherit;
  cursor: pointer;
}
[data-novasheet-filter-popover] button:hover:not(:disabled),
[data-novasheet-filter-popover] button:focus {
  background: var(--ns-filter-popover-hover);
  outline: none;
}
[data-novasheet-filter-popover] button:disabled {
  color: var(--ns-filter-popover-muted);
  cursor: default;
}
`.trim()

export function ensureFilterPopoverStylesheet(doc: Document = document): void {
  if (doc.getElementById(STYLESHEET_ID)) return
  const style = doc.createElement('style')
  style.id = STYLESHEET_ID
  style.textContent = CSS
  doc.head.appendChild(style)
}

export function applyFilterPopoverTheme(host: HTMLElement, theme: Theme): void {
  ensureFilterPopoverStylesheet(host.ownerDocument)
  const { colors, metrics } = theme
  host.style.setProperty('--ns-filter-popover-bg', colors.background)
  host.style.setProperty('--ns-filter-popover-border', colors.gridLineStrong)
  host.style.setProperty('--ns-filter-popover-text', colors.text)
  host.style.setProperty('--ns-filter-popover-muted', colors.headerText)
  host.style.setProperty('--ns-filter-popover-hover', colors.menuItemHover)
  host.style.setProperty('--ns-filter-popover-accent', colors.selectionBorder)
  host.style.setProperty('--ns-filter-popover-shadow', metrics.menuShadow)
  host.style.setProperty('--ns-filter-popover-font', metrics.fontFamily)
  host.style.setProperty('--ns-filter-popover-font-size', `${metrics.fontSize}px`)
}
