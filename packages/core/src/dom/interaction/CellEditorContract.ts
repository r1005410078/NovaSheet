import type { CellAddress } from '../../kernel/coords/SelectionTypes'
import type { CellValue, Field } from '../../kernel/data/Schema'
import type { CellRect } from '../../kernel/interaction/CellLayout'

export type CellEditorTrigger = 'double-click' | 'enter' | 'f2' | 'typing' | 'api' | 'cell-action'

export interface CellEditorOpenContext {
  readonly cell: CellAddress
  readonly field: Field
  readonly value: CellValue | undefined
  readonly rect: CellRect
  readonly trigger: CellEditorTrigger
  readonly initialInput?: string
  readonly actionId?: string
  commit(value: CellValue | null): void
  cancel(): void
}

export interface CellEditor {
  open(ctx: CellEditorOpenContext): void
  close?(): void
  destroy?(): void
}

export type CellEditorRegistry = Readonly<Record<string, CellEditor>>
