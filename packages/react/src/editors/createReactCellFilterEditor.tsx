import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { CellValue, Field } from '@zhiguang/core'

export interface CellFilterApply {
  readonly operatorId: string
  readonly value: CellValue | readonly CellValue[] | null
}

export interface ReactCellFilterEditorProps {
  readonly field: Field
  readonly operatorId: string
  readonly value: CellFilterApply['value']
  readonly rect: {
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
  }
  apply(next: CellFilterApply): void
  cancel(): void
}

export interface CellFilterEditor {
  open(ctx: ReactCellFilterEditorProps): void
  close?(): void
  destroy?(): void
}

export function createReactCellFilterEditor<TProps extends object = object>(
  Component: React.ComponentType<TProps & ReactCellFilterEditorProps>,
  componentProps?: TProps,
): CellFilterEditor {
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
      host.setAttribute('data-novasheet-react-filter-editor', '')
      Object.assign(host.style, {
        position: 'fixed',
        left: `${ctx.rect.x}px`,
        top: `${ctx.rect.y + ctx.rect.height}px`,
        zIndex: '30',
      })
      document.body.appendChild(host)

      root = createRoot(host)
      const props = (componentProps ?? {}) as TProps
      root.render(
        <Component
          {...props}
          {...ctx}
          apply={(next) => {
            ctx.apply(next)
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
