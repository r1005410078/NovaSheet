export type FieldType =
  | 'text'
  | 'number'
  | 'singleSelect'
  | 'multiSelect'
  | 'date'
  | 'checkbox'
  | 'url'

export interface Field {
  readonly id: string
  readonly name: string
  readonly type: FieldType
  width: number
  hidden?: boolean
  options?: Record<string, unknown>
}

export interface Schema {
  readonly fields: readonly Field[]
}

export type CellValue = string | number | boolean | null | readonly string[] | Date

export type Row = Record<string, CellValue>
