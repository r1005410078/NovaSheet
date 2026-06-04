/** 行领域 operation：描述外部希望 row 领域执行的意图。 */
export type RowOperation =
  | InsertRowsOperation
  | DeleteRowsOperation
  | MoveRowsOperation
  | HideRowsOperation
  | UnhideRowsOperation

export interface InsertRowsOperation {
  readonly kind: 'insertRows'
  readonly at: number
  readonly count: number
}

export interface DeleteRowsOperation {
  readonly kind: 'deleteRows'
  readonly rowIds: readonly number[]
}

export interface MoveRowsOperation {
  readonly kind: 'moveRows'
  readonly rowIds: readonly number[]
  readonly beforeRowId: number | null
}

export interface HideRowsOperation {
  readonly kind: 'hideRows'
  readonly rowIds: readonly number[]
}

export interface UnhideRowsOperation {
  readonly kind: 'unhideRows'
  readonly rowIds: readonly number[]
}
