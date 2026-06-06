export interface ColumnReorderPreview {
  readonly lineX: number
  readonly dragBandX: number
  readonly bandWidth: number
  readonly height: number
}

/** Phase 4.7 — 列拖拽重排的 DOM 预览层：跟手列带 + 落点竖线。 */
export class ColumnReorderOverlay {
  private band: HTMLDivElement
  private line: HTMLDivElement
  private destroyed = false

  constructor(private root: HTMLElement) {
    this.band = document.createElement('div')
    this.band.setAttribute('data-novasheet-column-reorder-band', '')
    Object.assign(this.band.style, {
      position: 'absolute',
      top: '0',
      display: 'none',
      pointerEvents: 'none',
      background: 'rgba(60, 64, 67, 0.12)',
      zIndex: '3',
    })

    this.line = document.createElement('div')
    this.line.setAttribute('data-novasheet-column-reorder-line', '')
    Object.assign(this.line.style, {
      position: 'absolute',
      top: '0',
      display: 'none',
      pointerEvents: 'none',
      width: '3px',
      background: 'rgba(60, 64, 67, 0.72)',
      zIndex: '3',
    })

    this.root.appendChild(this.band)
    this.root.appendChild(this.line)
  }

  show(preview: ColumnReorderPreview): void {
    if (this.destroyed) return
    Object.assign(this.band.style, {
      display: 'block',
      left: `${preview.dragBandX}px`,
      width: `${preview.bandWidth}px`,
      height: `${preview.height}px`,
    })
    Object.assign(this.line.style, {
      display: 'block',
      left: `${preview.lineX}px`,
      height: `${preview.height}px`,
    })
  }

  hide(): void {
    if (this.destroyed) return
    this.band.style.display = 'none'
    this.line.style.display = 'none'
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.band.remove()
    this.line.remove()
  }
}
