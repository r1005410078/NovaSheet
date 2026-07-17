import type { RenderRegionId } from '../geometry/FrozenRegions'

/** 单个冻结数据窗格的选择意图。 */
export type FrozenPaneSelectionIntent = 'cell' | 'row' | 'column'

/** 冻结数据窗格的选择行为配置。 */
export interface FrozenPaneSelectionBehavior {
  /** 左冻结数据窗格；缺省为 cell。 */
  readonly left?: 'cell' | 'row'
  /** 右冻结数据窗格；缺省为 cell。 */
  readonly right?: 'cell' | 'row'
  /** 顶部冻结数据窗格；缺省为 cell。 */
  readonly top?: 'cell' | 'column'
  /** 顶部 × 左冻结的真实数据交叉区；缺省为 cell。 */
  readonly topLeft?: FrozenPaneSelectionIntent
  /** 顶部 × 右冻结的真实数据交叉区；缺省为 cell。 */
  readonly topRight?: FrozenPaneSelectionIntent
}

/** Grid 选择语义配置（构造期，变更需 remount）。 */
export interface GridSelectionBehavior {
  readonly frozenPanes?: FrozenPaneSelectionBehavior
  /** 行头与列表头的非数据角块；缺省 none。 */
  readonly headerCorner?: 'none' | 'all'
}

/** 归一化结果：每个 RenderRegion 有确定 intent。 */
export interface ResolvedSelectionBehavior {
  readonly regionIntents: Readonly<Record<RenderRegionId, FrozenPaneSelectionIntent>>
  readonly headerCorner: 'none' | 'all'
}

/** 把可选 selectionBehavior 归一成全量 region→intent 表。 */
export function resolveSelectionBehavior(
  input?: GridSelectionBehavior,
): ResolvedSelectionBehavior {
  const panes = input?.frozenPanes
  return {
    regionIntents: {
      main: 'cell',
      middleLeft: panes?.left ?? 'cell',
      middleRight: panes?.right ?? 'cell',
      topCenter: panes?.top ?? 'cell',
      topLeft: panes?.topLeft ?? 'cell',
      topRight: panes?.topRight ?? 'cell',
    },
    headerCorner: input?.headerCorner ?? 'none',
  }
}
