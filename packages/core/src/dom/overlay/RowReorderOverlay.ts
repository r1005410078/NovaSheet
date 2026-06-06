export interface RowReorderPreview {
  readonly lineY: number
  readonly dragBandY: number
  readonly bandHeight: number
  readonly width: number
}

/** 行拖拽重排的 DOM 预览层：跟手行带 + 落点横线。 */
export class RowReorderOverlay {
  private band: HTMLDivElement
  private line: HTMLDivElement
  private destroyed = false

  constructor(private root: HTMLElement) {
    this.band = document.createElement('div')
    this.band.setAttribute('data-novasheet-row-reorder-band', '')
    Object.assign(this.band.style, {
      position: 'absolute',
      left: '0',
      display: 'none',
      pointerEvents: 'none',
      background: 'rgba(60, 64, 67, 0.12)',
      zIndex: '3',
    })

    this.line = document.createElement('div')
    this.line.setAttribute('data-novasheet-row-reorder-line', '')
    Object.assign(this.line.style, {
      position: 'absolute',
      left: '0',
      display: 'none',
      pointerEvents: 'none',
      height: '3px',
      background: 'rgba(60, 64, 67, 0.72)',
      zIndex: '3',
    })

    this.root.appendChild(this.band)
    this.root.appendChild(this.line)
  }

  show(preview: RowReorderPreview): void {
    if (this.destroyed) return
    Object.assign(this.band.style, {
      display: 'block',
      top: `${preview.dragBandY}px`,
      height: `${preview.bandHeight}px`,
      width: `${preview.width}px`,
    })
    Object.assign(this.line.style, {
      display: 'block',
      top: `${preview.lineY}px`,
      width: `${preview.width}px`,
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
