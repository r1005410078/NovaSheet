import type { CellAddress } from '../../kernel/coords/SelectionTypes'
import type { CellValue, Field } from '../../kernel/data/Schema'
import type { CellRect } from '../../kernel/interaction/CellLayout'

export type CellEditorTrigger = 'double-click' | 'enter' | 'f2' | 'typing' | 'api' | 'cell-action'

export interface CellEditorOpenContext {
  readonly cell: CellAddress
  readonly field: Field
  readonly value: CellValue | undefined
  /** Grid 容器；`rect` 使用该容器的本地坐标系。 */
  readonly container: HTMLElement
  readonly rect: CellRect
  readonly trigger: CellEditorTrigger
  readonly initialInput?: string
  readonly actionId?: string
  commit(value: CellValue | null): void
  /** 写本单元格附件（namespace 由 GridOptions.cellAttachments 注册）；内部 view→raw 映射，含 undo。 */
  setAttachment?(namespace: string, data: unknown): boolean
  /** 读本单元格附件（namespace 由 cellAttachments 注册）；内部 view→raw。rich-text 回填既存 runs 用。 */
  getAttachment?(namespace: string): unknown
  cancel(): void
}

export interface CellEditor {
  open(ctx: CellEditorOpenContext): void
  close?(): void
  destroy?(): void
}

export type CellEditorRegistry = Readonly<Record<string, CellEditor>>
