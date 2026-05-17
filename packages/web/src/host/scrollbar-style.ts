import type { ThemeScrollbar } from '@novasheet/core'

const STYLESHEET_ID = 'novasheet-scrollbar-style'

const SCROLLBAR_CSS = `
[data-novasheet-scroll-host] {
  scrollbar-width: thin;
  scrollbar-color: var(--ns-scrollbar-thumb) var(--ns-scrollbar-track);
}
[data-novasheet-scroll-host]::-webkit-scrollbar {
  width: var(--ns-scrollbar-size);
  height: var(--ns-scrollbar-size);
}
[data-novasheet-scroll-host]::-webkit-scrollbar-track {
  background: var(--ns-scrollbar-track);
}
[data-novasheet-scroll-host]::-webkit-scrollbar-thumb {
  background-color: var(--ns-scrollbar-thumb);
  border-radius: var(--ns-scrollbar-radius);
  border: 2px solid transparent;
  background-clip: padding-box;
}
[data-novasheet-scroll-host]::-webkit-scrollbar-thumb:hover {
  background-color: var(--ns-scrollbar-thumb-hover);
}
[data-novasheet-scroll-host]::-webkit-scrollbar-corner {
  background: var(--ns-scrollbar-track);
}
`.trim()

/** 向 document 注入一次滚动条伪元素样式（幂等）。 */
export function ensureScrollbarStylesheet(doc: Document = document): void {
  if (doc.getElementById(STYLESHEET_ID)) return
  const style = doc.createElement('style')
  style.id = STYLESHEET_ID
  style.textContent = SCROLLBAR_CSS
  doc.head.appendChild(style)
}

/** 将 Theme `scrollbar` token 写入 scroll-host 的 CSS 变量。 */
export function applyScrollbarTheme(
  scrollHost: HTMLElement,
  scrollbar: ThemeScrollbar,
): void {
  ensureScrollbarStylesheet(scrollHost.ownerDocument)
  const size = `${scrollbar.trackWidth}px`
  scrollHost.style.setProperty('--ns-scrollbar-size', size)
  scrollHost.style.setProperty('--ns-scrollbar-track', scrollbar.trackColor)
  scrollHost.style.setProperty('--ns-scrollbar-thumb', scrollbar.thumbColor)
  scrollHost.style.setProperty('--ns-scrollbar-thumb-hover', scrollbar.thumbHoverColor)
  scrollHost.style.setProperty('--ns-scrollbar-radius', `${scrollbar.borderRadius}px`)
}
