import type { Theme } from '../../kernel/theme/Theme'
import type { OverlayRect } from './RangeOverlayRects'

export interface SelectionOverlayState {
  readonly rangeRects: readonly OverlayRect[]
  readonly activeRect: OverlayRect | null
}

/** DOM 选区浮层：只负责视觉，不参与 pointer hit test。 */
export class SelectionOverlay {
  private readonly layer: HTMLDivElement
  private rangeEls: HTMLDivElement[] = []
  private activeEl: HTMLDivElement | null = null
  private destroyed = false

  constructor(private readonly root: HTMLElement) {
    this.layer = document.createElement('div')
    this.layer.setAttribute('data-novasheet-selection-layer', '')
    Object.assign(this.layer.style, {
      position: 'absolute',
      inset: '0',
      pointerEvents: 'none',
      zIndex: '2',
    })
    this.root.appendChild(this.layer)
  }

  sync(state: SelectionOverlayState | null): void {
    if (this.destroyed) return
    this.clear()
    if (!state) return

    for (const rect of state.rangeRects) {
      const el = document.createElement('div')
      el.setAttribute('data-novasheet-selection-range', '')
      Object.assign(el.style, {
        position: 'absolute',
        pointerEvents: 'none',
        boxSizing: 'border-box',
        background: 'var(--novasheet-selection-bg, rgba(9, 105, 218, 0.12))',
        border:
          'var(--novasheet-selection-border-width, 1px) solid var(--novasheet-selection-border, #0969da)',
        left: `${rect.x}px`,
        top: `${rect.y}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      })
      this.layer.appendChild(el)
      this.rangeEls.push(el)
    }

    if (state.activeRect) this.renderActive(state.activeRect)
  }

  applyTheme(theme: Theme): void {
    this.layer.style.setProperty('--novasheet-selection-bg', theme.colors.selectionBg)
    this.layer.style.setProperty('--novasheet-selection-border', theme.colors.selectionBorder)
    this.layer.style.setProperty(
      '--novasheet-selection-border-width',
      `${theme.metrics.borderWidth}px`,
    )
    this.layer.style.setProperty(
      '--novasheet-selection-active-border-width',
      `${Math.max(2, theme.metrics.borderWidth * 2)}px`,
    )
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.clear()
    this.layer.remove()
  }

  private renderActive(rect: OverlayRect): void {
    const el = document.createElement('div')
    el.setAttribute('data-novasheet-selection-active', '')
    Object.assign(el.style, {
      position: 'absolute',
      pointerEvents: 'none',
      boxSizing: 'border-box',
      background: 'transparent',
      border:
        'var(--novasheet-selection-active-border-width, 2px) solid var(--novasheet-selection-border, #0969da)',
      left: `${rect.x}px`,
      top: `${rect.y}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    })
    this.layer.appendChild(el)
    this.activeEl = el
  }

  private clear(): void {
    for (const el of this.rangeEls) el.remove()
    this.rangeEls = []
    this.activeEl?.remove()
    this.activeEl = null
  }
}
