import type { ExcelWorkspaceDecision, ExcelWorkspaceDecisionInput } from './ExcelWorkspaceTypes'

export function decideExcelWorkspaceResize(
  input: ExcelWorkspaceDecisionInput,
): ExcelWorkspaceDecision {
  const growRows = shouldGrowRows(input)
  const growCols = shouldGrowCols(input)

  if (growRows || growCols) {
    return {
      kind: 'grow',
      rows: growRows
        ? Math.min(input.policy.rowGrowBatch, input.policy.maxRows - input.size.rowCount)
        : 0,
      cols: growCols
        ? Math.min(input.policy.colGrowBatch, input.policy.maxCols - input.size.colCount)
        : 0,
    }
  }

  const shrink = computeShrinkTarget(input)
  if (shrink) return shrink
  return { kind: 'none' }
}

function shouldGrowRows(input: ExcelWorkspaceDecisionInput): boolean {
  const intent = input.intent
  if (!intent || intent.kind !== 'wheel') return false
  if (input.nowMs - intent.atMs > input.policy.wheelIntentTtlMs) return false
  if (input.lastGrowAtMs !== null && input.nowMs - input.lastGrowAtMs < input.policy.growCooldownMs) {
    return false
  }
  if (intent.deltaY <= 0) return false
  if (input.size.rowCount >= input.policy.maxRows) return false
  return (
    input.visible.rows[1] >= input.size.rowCount - input.policy.rowGrowThreshold &&
    input.hasMaterializedRows
  )
}

function shouldGrowCols(input: ExcelWorkspaceDecisionInput): boolean {
  const intent = input.intent
  if (!intent || intent.kind !== 'wheel') return false
  if (input.nowMs - intent.atMs > input.policy.wheelIntentTtlMs) return false
  if (input.lastGrowAtMs !== null && input.nowMs - input.lastGrowAtMs < input.policy.growCooldownMs) {
    return false
  }
  if (intent.deltaX <= 0) return false
  if (input.size.colCount >= input.policy.maxCols) return false
  return (
    input.visible.cols[1] >= input.size.colCount - input.policy.colGrowThreshold &&
    input.hasMaterializedCols
  )
}

function computeShrinkTarget(
  input: ExcelWorkspaceDecisionInput,
): ExcelWorkspaceDecision | null {
  if (input.lastGrowAtMs !== null && input.nowMs - input.lastGrowAtMs < input.policy.shrinkDelayMs) {
    return null
  }

  const bounds = input.contentBounds
  const targetRows = bounds
    ? Math.max(input.policy.minRows, bounds.endRow + 1 + input.policy.rowBuffer)
    : input.policy.minRows
  const targetCols = bounds
    ? Math.max(input.policy.minCols, bounds.endCol + 1 + input.policy.colBuffer)
    : input.policy.minCols
  const rowCount = Math.min(targetRows, input.size.rowCount)
  const colCount = Math.min(targetCols, input.size.colCount)
  if (rowCount === input.size.rowCount && colCount === input.size.colCount) return null
  return { kind: 'shrink', rowCount, colCount }
}
