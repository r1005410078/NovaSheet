/** RenderFrame 中一个可见分组表头 cell 的 view 坐标命中结果。 */
export interface ColumnGroupHeaderHit {
  readonly groupId: string
  readonly level: number
  readonly startViewCol: number
  readonly endViewCol: number
}
