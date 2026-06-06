/**
 * Phase 4.6 — DOM 折叠列间隙点击区（spec §hide-col-toggle-handle）。
 *
 * 覆盖列头高度、宽度 16px、居中于折叠列边界；`pointerdown` 触发 `onUnhide`
 * 并阻止事件冒泡以防 canvas 滚动宿主拦截。
 */

import type { RenderFrameCollapsedColGap } from '../../../kernel/render/RenderFrame'

export interface HideColToggleHandleOptions {
  onUnhide(fieldIds: readonly string[]): void
}

export class HideColToggleHandle {
  private elements: HTMLElement[] = []

  constructor(
    private root: HTMLElement,
    private opts: HideColToggleHandleOptions,
  ) {}

  update(gaps: readonly RenderFrameCollapsedColGap[], frame: { headerHeight: number }): void {
    this.clear()
    if (frame.headerHeight < 24) return
    for (const gap of gaps) {
      const el = document.createElement('div')
      el.setAttribute('data-handle', 'hide-col-toggle')
      Object.assign(el.style, {
        position: 'absolute',
        left: `${gap.xPx - 8}px`,
        width: '16px',
        top: '0',
        height: `${frame.headerHeight}px`,
        cursor: 'pointer',
        pointerEvents: 'auto',
      })
      el.addEventListener('pointerdown', (event) => {
        event.stopPropagation()
        this.opts.onUnhide(gap.hiddenFieldIds)
      })
      this.root.appendChild(el)
      this.elements.push(el)
    }
  }

  destroy(): void {
    this.clear()
  }

  private clear(): void {
    for (const el of this.elements) el.remove()
    this.elements = []
  }
}
