import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { CellEditor, CellEditorOpenContext, CellValue } from '@zhiguang/novasheet-core'

export interface ReactCellEditorProps<TValue extends CellValue = CellValue>
  extends CellEditorOpenContext {
  commit(value: TValue | null): void
  cancel(): void
}

export interface CreateReactCellEditorOptions {
  readonly kind?: 'inline' | 'popover' | 'modal'
  readonly className?: string
  readonly closeOnBlur?: boolean
}

export function createReactCellEditor<TProps extends object = object>(
  Component: React.ComponentType<TProps & ReactCellEditorProps>,
  options: CreateReactCellEditorOptions = {},
  componentProps?: TProps,
): CellEditor {
  let host: HTMLDivElement | null = null
  let root: Root | null = null

  const close = (): void => {
    root?.unmount()
    root = null
    host?.remove()
    host = null
  }

  return {
    open(ctx) {
      close()

      host = document.createElement('div')
      host.setAttribute('data-novasheet-react-cell-editor', '')
      host.setAttribute('data-novasheet-react-cell-editor-kind', options.kind ?? 'inline')
      if (options.className) host.className = options.className
      const kind = options.kind ?? 'inline'
      const top = kind === 'inline' ? ctx.rect.y : ctx.rect.y + ctx.rect.height
      Object.assign(host.style, {
        position: 'absolute',
        left: `${ctx.rect.x}px`,
        top: `${top}px`,
        width: kind === 'inline' ? `${ctx.rect.width}px` : '',
        minHeight: kind === 'inline' ? `${ctx.rect.height}px` : '',
        zIndex: '20',
      })
      ctx.container.appendChild(host)

      root = createRoot(host)
      const props = (componentProps ?? {}) as TProps
      root.render(
        <Component
          {...props}
          {...ctx}
          commit={(value) => {
            ctx.commit(value)
            close()
          }}
          cancel={() => {
            ctx.cancel()
            close()
          }}
        />,
      )
    },
    close,
    destroy: close,
  }
}
