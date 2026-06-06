import type { FormatLayer } from '../features/format/CellFormat'
import type { MergeRegion } from '../features/merge/MergeStore'
import type { GridSelection } from '../features/selection/SelectionTypes'
import type { FrozenConfig } from '../kernel/geometry/FrozenRegions'
import type { UndoCommand } from '../kernel/undo/UndoCommand'

/** 结构 mutation 协调器注入：只暴露 composer 能力，禁止传入完整 engine。 */
export interface StructuralMutationContext {
  getSelection(): GridSelection
  pushUndo(command: UndoCommand): void
  rebuildRows(): void
  rebuildCols(): void
  snapshotFormatMerge(): {
    formatBefore: readonly FormatLayer[]
    mergeBefore: readonly MergeRegion[]
  }
  snapshotFormatMergeAfter(): {
    formatAfter: readonly FormatLayer[]
    mergeAfter: readonly MergeRegion[]
  }
  getFrozenConfig(): FrozenConfig
}

export interface SelectionPair {
  selectionBefore: GridSelection
  selectionAfter: GridSelection
}

export interface RunCommandStructuralParams<TEvent> {
  execute: () => TEvent | null
  rebuild: 'rows' | 'cols'
  beforeExecute?: () => void
  afterExecute?: (event: TEvent) => void
  withFormatMerge?: boolean
  withFrozen?: boolean
  buildUndo: (
    event: TEvent,
    sel: SelectionPair,
    extras?: {
      formatBefore?: readonly FormatLayer[]
      formatAfter?: readonly FormatLayer[]
      mergeBefore?: readonly MergeRegion[]
      mergeAfter?: readonly MergeRegion[]
      frozenBefore?: FrozenConfig
      frozenAfter?: FrozenConfig
    },
  ) => UndoCommand
}

/** 结构 command 执行后的 rebuild + 复合 undo 入栈（execute 返回 null 则 no-op）。 */
export class StructuralMutationCoordinator {
  constructor(private readonly ctx: StructuralMutationContext) {}

  runCommandStructural<TEvent>(params: RunCommandStructuralParams<TEvent>): TEvent | null {
    const selectionBefore = this.ctx.getSelection()
    const frozenBefore = params.withFrozen ? this.ctx.getFrozenConfig() : undefined
    const fmt = params.withFormatMerge ? this.ctx.snapshotFormatMerge() : undefined
    params.beforeExecute?.()
    const event = params.execute()
    if (event === null) return null
    params.afterExecute?.(event)
    if (params.rebuild === 'rows') this.ctx.rebuildRows()
    else this.ctx.rebuildCols()
    const selectionAfter = this.ctx.getSelection()
    const fmtAfter = params.withFormatMerge ? this.ctx.snapshotFormatMergeAfter() : undefined
    const frozenAfter = params.withFrozen ? this.ctx.getFrozenConfig() : undefined
    this.ctx.pushUndo(
      params.buildUndo(
        event,
        { selectionBefore, selectionAfter },
        {
          formatBefore: fmt?.formatBefore,
          formatAfter: fmtAfter?.formatAfter,
          mergeBefore: fmt?.mergeBefore,
          mergeAfter: fmtAfter?.mergeAfter,
          frozenBefore,
          frozenAfter,
        },
      ),
    )
    return event
  }
}
