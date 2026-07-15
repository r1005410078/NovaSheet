/**
 * Grid 交互能力开关。
 *
 * 未传或字段缺省时均视为启用（保持现有默认行为）。
 * 监控只读面板等场景可显式关闭菜单、改尺寸与换位拖拽。
 */

/** 调用方可传的交互开关（字段均可选）。 */
export interface GridInteractions {
  /**
   * 右键菜单与列头 hover 菜单按钮。
   * @default true
   */
  readonly contextMenu?: boolean
  /**
   * 拖拽调整行高 / 列宽（含键盘微调）。
   * @default true
   */
  readonly resize?: boolean
  /**
   * 拖拽行列换位（表头拖选整行/整列仍可用）。
   * @default true
   */
  readonly reorder?: boolean
}

/** 归一化后的交互开关（三字段均有确定布尔值）。 */
export interface ResolvedGridInteractions {
  readonly contextMenu: boolean
  readonly resize: boolean
  readonly reorder: boolean
}

/**
 * 把可选 interactions 归一成全量布尔开关。
 *
 * @param input 调用方传入；undefined 表示三项全开
 * @returns 归一化结果
 */
export function resolveGridInteractions(
  input?: GridInteractions,
): ResolvedGridInteractions {
  return {
    contextMenu: input?.contextMenu !== false,
    resize: input?.resize !== false,
    reorder: input?.reorder !== false,
  }
}
