/** Pure sizing knobs for Excel-like dynamic workspace growth and shrink. */
export interface ExcelWorkspacePolicy {
  readonly minRows: number
  readonly minCols: number
  readonly rowGrowBatch: number
  readonly colGrowBatch: number
  readonly rowGrowThreshold: number
  readonly colGrowThreshold: number
  readonly rowBuffer: number
  readonly colBuffer: number
  readonly maxRows: number
  readonly maxCols: number
  readonly wheelIntentTtlMs: number
  readonly growCooldownMs: number
  readonly shrinkDelayMs: number
}

/** Default A-Z x 1000 workspace policy with Excel-compatible maximum caps. */
export const DEFAULT_EXCEL_WORKSPACE_POLICY: ExcelWorkspacePolicy = {
  minRows: 1_000,
  minCols: 26,
  rowGrowBatch: 200,
  colGrowBatch: 10,
  rowGrowThreshold: 30,
  colGrowThreshold: 5,
  rowBuffer: 200,
  colBuffer: 10,
  maxRows: 1_048_576,
  maxCols: 16_384,
  wheelIntentTtlMs: 200,
  growCooldownMs: 100,
  shrinkDelayMs: 500,
}
