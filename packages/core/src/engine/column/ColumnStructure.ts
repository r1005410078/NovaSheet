import type { Field } from '../../data/Schema'
import type { GridSelection } from '../../interaction/SelectionModel'
import type { ChunkedAxis } from '../../layout/ChunkedAxis'
import type { FrozenConfig } from '../../layout/FrozenRegions'

/** 列移动归一化后的计划；调用方据此执行 move 与 undo 反向 move。 */
export interface ColumnMovePlan {
  readonly fieldIds: readonly string[]
  readonly beforeFieldId: string | null
  readonly inverseBeforeFieldId: string | null
}

/** 列结构领域读取/写入 engine 内部状态的最小上下文。 */
export interface ColumnStructureContext {
  readonly rawColsAxis: ChunkedAxis
  readonly hiddenFieldIds: ReadonlySet<string>
  getFields(): readonly Field[]
  setHiddenFieldIds(fieldIds: readonly string[]): void
  getFrozenConfig(): FrozenConfig
  setFrozenConfig(config: FrozenConfig): void
  resolveDefaultColWidth(): number
  rebuildViewColsAxis(): void
  restoreSelectionByVisibleFieldIds(
    selection: GridSelection,
    visibleFieldIdsBefore: readonly string[],
  ): void
}

