/** Phase 4.5 行头菜单的"调整行高…"弹层，复用 4.0 ContextMenuLayer 风格的 portal-to-body 模式。 */
export interface RowHeightPopoverOptions {
  onSubmit(px: number): void
  onClose?(): void
}

export class RowHeightPopover {
  private container: HTMLElement | null = null

  constructor(private opts: RowHeightPopoverOptions) {}

  open(
    triggerRect: DOMRect | { x: number; y: number; width: number; height: number },
    currentHeight: number,
  ): void {
    this.close()
    const root = document.createElement('div')
    root.setAttribute('role', 'dialog')
    root.setAttribute('aria-modal', 'true')
    root.setAttribute('aria-label', '调整行高')
    root.style.position = 'fixed'
    root.style.left = `${triggerRect.x}px`
    root.style.top = `${triggerRect.y + triggerRect.height + 4}px`
    root.style.zIndex = '4'
    const input = document.createElement('input')
    input.type = 'number'
    input.min = '20'
    input.step = '1'
    input.value = String(currentHeight)
    root.appendChild(input)
    document.body.appendChild(root)
    input.focus()
    input.select()
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.opts.onSubmit(Number(input.value))
        this.close()
      } else if (e.key === 'Escape') {
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
}
