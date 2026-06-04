import type { GridOperation } from './GridOperation'

/** 一次用户动作或远端同步批次中的 operation 集合。 */
export interface GridTransaction {
  readonly id: string
  readonly source: 'local' | 'remote'
  readonly createdAt: number
  readonly operations: readonly GridOperation[]
}

