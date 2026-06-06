/** 列领域 operation：描述外部希望 column 领域执行的意图。 */
export type ColumnOperation =
  | InsertColsOperation
  | DeleteColsOperation
  | HideColsOperation
  | UnhideColsOperation
  | MoveColsOperation

export interface InsertColsOperation {
  readonly kind: 'insertCols'
  readonly beforeFieldIndex: number
  readonly count: number
}

export interface DeleteColsOperation {
  readonly kind: 'deleteCols'
  readonly fieldIds: readonly string[]
}

export interface HideColsOperation {
  readonly kind: 'hideCols'
  readonly fieldIds: readonly string[]
}

export interface UnhideColsOperation {
  readonly kind: 'unhideCols'
  readonly fieldIds: readonly string[]
}

export interface MoveColsOperation {
  readonly kind: 'moveCols'
  readonly fieldIds: readonly string[]
  readonly beforeFieldId: string | null
}
