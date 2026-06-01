import type { FrozenConfig } from '../layout/FrozenRegions'

export interface FrozenColumnInsert {
  readonly at: number
  readonly count: number
  readonly oldTotalCols: number
}

export interface FrozenColumnDelete {
  readonly removedIndices: readonly number[]
  readonly totalColsBefore: number
}

/** Applies frozen-column count adjustments after structural column changes. */
export class FrozenColumnSyncer {
  afterInsert(config: FrozenConfig, change: FrozenColumnInsert): FrozenConfig {
    let { leftCols, rightCols } = config
    if (change.at < leftCols) leftCols += change.count
    if (rightCols > 0 && change.at >= change.oldTotalCols - rightCols) {
      rightCols += change.count
    }
    return { topRows: config.topRows, leftCols, rightCols }
  }

  afterDelete(config: FrozenConfig, change: FrozenColumnDelete): FrozenConfig {
    const leftHit = change.removedIndices.filter((idx) => idx < config.leftCols).length
    const rightBoundary = change.totalColsBefore - config.rightCols
    const rightHit = change.removedIndices.filter((idx) => idx >= rightBoundary).length
    return {
      topRows: config.topRows,
      leftCols: Math.max(0, config.leftCols - leftHit),
      rightCols: Math.max(0, config.rightCols - rightHit),
    }
  }
}
