import type { Grid, GridOptions, FrozenConfig } from '@novasheet/core'
import type { HTMLAttributes } from 'react'

type GridDomProps = Omit<HTMLAttributes<HTMLDivElement>, 'children' | keyof GridOptions>

export interface NovaSheetGridRef {
  readonly grid: Grid
  refresh(): void
  destroy(): void
  scrollToRow(rowIndex: number, align?: 'start' | 'center' | 'end'): void
  scrollToCell(rowIndex: number, fieldId: string): void
  setColumnWidth(fieldId: string, width: number): void
  setFrozen(config: Partial<FrozenConfig>): void
}

export interface NovaSheetGridProps
  extends Omit<GridOptions, 'backend'>,
    GridDomProps {
  readonly className?: string
}
