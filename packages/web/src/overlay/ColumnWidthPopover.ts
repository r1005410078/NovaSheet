/** Phase 4.6 列头菜单的"调整列宽..."弹层，复用 RowHeightPopover 的 portal-to-body 模式。 */
export interface ColumnWidthPopoverOptions {
  onSubmit(px: number): void
  onClose?(): void
}

export class ColumnWidthPopover {
  private container: HTMLElement | null = null

  constructor(private opts: ColumnWidthPopoverOptions) {}

  open(
    triggerRect: DOMRect | { x: number; y: number; width: number; height: number },
    currentWidth: number,
  ): void {
    this.close()
    const root = document.createElement('div')
    root.setAttribute('role', 'dialog')
    root.setAttribute('aria-modal', 'true')
    root.setAttribute('aria-label', '调整列宽')
    root.style.position = 'fixed'
    root.style.left = `${triggerRect.x}px`
    root.style.top = `${triggerRect.y + triggerRect.height + 4}px`
    root.style.zIndex = '4'
    const input = document.createElement('input')
    input.type = 'number'
    input.min = '20'
    input.step = '1'
    input.value = String(currentWidth)
    root.appendChild(input)
    document.body.appendChild(root)
    input.focus()
    input.select()
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        this.opts.onSubmit(Number(input.value))
        this.close()
      } else if (event.key === 'Escape') {
        this.close()
      }
    })
    input.addEventListener('blur', () => this.close())
    this.container = root
  }

  close(): void {
    if (!this.container) return
    this.container.remove()
    this.container = null
    this.opts.onClose?.()
  }

  destroy(): void {
    this.close()
  }
}
