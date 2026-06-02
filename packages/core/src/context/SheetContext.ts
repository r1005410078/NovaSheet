import type {
  CanvasHandle,
  CellHandle,
  GridHandle,
  OverlayHandle,
  RuntimeScope,
} from './RuntimeScope'
import type { CommandHandler, ExtensionRegistrar, ExtensionRegistry } from './extensions'

/** Instance-scoped extension context for a NovaSheet grid or shared grid group. */
export interface SheetContext<TCanvasContext = unknown, TElement = unknown> {
  readonly registry: ExtensionRegistry
  readonly extensions: ExtensionRegistrar
  run<T>(scope: RuntimeScope<TCanvasContext, TElement>, fn: () => T): T
  cell(): CellHandle
  canvas(): CanvasHandle<TCanvasContext>
  overlay(): OverlayHandle<TElement>
  grid(): GridHandle
}

/** Create an isolated extension context. */
export function createSheetContext<TCanvasContext = unknown, TElement = unknown>(): SheetContext<
  TCanvasContext,
  TElement
> {
  const registry: ExtensionRegistry = {
    cells: new Map(),
    commands: new Map(),
    contributions: new Map(),
  }
  const scopes: Array<RuntimeScope<TCanvasContext, TElement>> = []
  const topScope = () => scopes[scopes.length - 1]

  return {
    registry,
    extensions: {
      cell(type: string, extension) {
        registry.cells.set(type, extension)
      },
      command(id: string, handler: CommandHandler) {
        registry.commands.set(id, handler)
      },
      contribute(point: string, contribution) {
        const existing = registry.contributions.get(point) ?? []
        registry.contributions.set(point, [...existing, contribution])
      },
    },
    run<T>(scope: RuntimeScope<TCanvasContext, TElement>, fn: () => T): T {
      scopes.push(scope)
      try {
        return fn()
      } finally {
        scopes.pop()
      }
    },
    cell(): CellHandle {
      const handle = topScope()?.cell
      if (!handle) throw new Error('NovaSheet: ctx.cell() is only available during a cell scope')
      return handle
    },
    canvas(): CanvasHandle<TCanvasContext> {
      const handle = topScope()?.canvas
      if (!handle) throw new Error('NovaSheet: ctx.canvas() is only available during a canvas scope')
      return handle
    },
    overlay(): OverlayHandle<TElement> {
      const handle = topScope()?.overlay
      if (!handle) throw new Error('NovaSheet: ctx.overlay() is only available during an overlay scope')
      return handle
    },
    grid(): GridHandle {
      const handle = topScope()?.grid
      if (!handle) throw new Error('NovaSheet: ctx.grid() is only available during a grid scope')
      return handle
    },
  }
}
