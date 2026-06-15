/** 轻量 DOM tooltip，显示单元格 validation 错误原因。无 React 依赖。 */
export class ValidationTooltip {
  private el: HTMLElement | null = null

  constructor(private readonly host: HTMLElement) {}

  show(
    message: string,
    anchorRect: { left: number; right: number; top: number },
    containerRect: { left: number; top: number; width: number },
  ): void {
    if (!this.el) {
      this.el = document.createElement('div')
      this.el.setAttribute('data-novasheet-validation-tooltip', '')
      this.el.style.cssText = [
        'position:absolute',
        'z-index:9999',
        'pointer-events:none',
        'background:#fff',
        'border:1px solid #E53E3E',
        'border-radius:4px',
        'padding:6px 10px',
        'font-size:13px',
        'color:#1a1a1a',
        'max-width:220px',
        'box-shadow:0 2px 8px rgba(0,0,0,0.15)',
        'line-height:1.5',
        'white-space:pre-wrap',
        'word-break:break-word',
      ].join(';')
      this.host.appendChild(this.el)
    }
    this.el.textContent = `无效：${message}`
    const tooltipWidth = 200
    let left = anchorRect.right - containerRect.left + 4
    if (left + tooltipWidth > containerRect.width) {
      left = anchorRect.left - containerRect.left - tooltipWidth - 4
    }
    const top = anchorRect.top - containerRect.top
    this.el.style.left = `${left}px`
    this.el.style.top = `${top}px`
    this.el.style.display = 'block'
  }

  hide(): void {
    if (this.el) this.el.style.display = 'none'
  }

  destroy(): void {
    this.el?.remove()
    this.el = null
  }
}
