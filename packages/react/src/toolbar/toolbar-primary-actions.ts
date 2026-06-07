import type { ToolbarAction } from './types'

/** 合并分体按钮主区域：与下拉第一项「全部合并」一致。 */
export function primaryMergeToolbarAction(): ToolbarAction {
  return { id: 'merge-cells', mode: 'all' }
}
