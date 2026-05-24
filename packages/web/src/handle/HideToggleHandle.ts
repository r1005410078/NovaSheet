/**
 * Phase 4.5 — DOM 折叠行间隙点击区（spec §hide-toggle-handle）。
 *
 * 覆盖行表头宽度、高度 16px、居中于间隙下边界；`pointerdown` 触发 `onUnhide`
 * 并阻止事件冒泡以防 canvas 滚动宿主拦截。
 */

import type { RenderFrameCollapsedGap } from '@novasheet/core'

export interface HideToggleHandleOptions {
  onUnhide(hiddenIds: readonly number[]): void
}

export class HideToggleHandle {
  private elements: HTMLElement[] = []

  constructor(
    private root: HTMLElement,
    private opts: HideToggleHandleOptions,
  ) {}

  update(gaps: readonly RenderFrameCollapsedGap[], frame: { rowHeaderWidth: number }): void {
    this.clear()
    if (frame.rowHeaderWidth < 24) return
    for (const gap of gaps) {
      const el = document.createElement('div')
      el.setAttribute('data-handle', 'hide-toggle')
      Object.assign(el.style, {
        position: 'absolute',
        left: '0',
        width: `${frame.rowHeaderWidth}px`,
        top: `${gap.yPx - 8}px`,
        height: '16px',
        cursor: 'pointer',
        pointerEvents: 'auto',
      })
      el.addEventListener('pointerdown', (e) => {
        e.stopPropagation()
        this.opts.onUnhide(gap.hiddenIds)
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
