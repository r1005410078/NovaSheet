import type { ColumnGroupChild, Field } from '../../kernel/data/Schema'
import type { CellRange } from '../../kernel/coords/SelectionTypes'

/** 一个组在某表头行中占据的单元格：view 坐标下的闭区间列跨度。 */
export interface LayoutGroupCell {
  readonly groupId: string
  readonly label: string
  readonly startViewCol: number
  readonly endViewCol: number
}

/** 列组树解析为绘制用的表头行结构。 */
export interface ColumnGroupLayout {
  /** 组嵌套最大层数（叶不计）；决定表头组行数。 */
  readonly depth: number
  /** rows[0] = 最顶层组行 ... rows[depth-1] = 最深层组行。每行仅含该层内至少一个可见叶的组。 */
  readonly rows: readonly (readonly LayoutGroupCell[])[]
  /** 与 visibleFields 等长；每列自身标签开始绘制的表头行号（其祖先组数）。 */
  readonly leafTopRowByViewCol: readonly number[]
}

interface Span {
  readonly minCol: number
  readonly maxCol: number
}

/** 树结构组嵌套最大深度（叶不计），与可见性无关。无组返 0。 */
function computeDepth(nodes: readonly ColumnGroupChild[]): number {
  let max = 0
  for (const node of nodes) {
    if ('fieldId' in node) continue
    max = Math.max(max, 1 + computeDepth(node.children))
  }
  return max
}

/**
 * 把列组树折叠为按 view 列坐标（`visibleFields` 中的位置）标注区间的表头行数据。
 * 单次深度优先遍历：每个节点在自身层级 `level` 求可见叶的 view 列 min/max；
 * 组节点若子树内无可见叶则不产 cell（也不继续影响祖先，天然向上收缩/消失）。
 *
 * visibleFields = hidden 剔除后的有序字段（即 frame schema.fields）。无组或组全隐 → null。
 */
export function resolveColumnGroupLayout(
  tree: readonly ColumnGroupChild[],
  visibleFields: readonly Field[],
): ColumnGroupLayout | null {
  const depth = computeDepth(tree)
  if (depth === 0) return null

  const viewColByFieldId = new Map<string, number>()
  visibleFields.forEach((field, index) => viewColByFieldId.set(field.id, index))

  const rows: LayoutGroupCell[][] = Array.from({ length: depth }, () => [])
  const leafTopRowByViewCol: number[] = Array.from({ length: visibleFields.length }, () => 0)

  const resolveNode = (node: ColumnGroupChild, level: number): Span | null => {
    if ('fieldId' in node) {
      const viewCol = viewColByFieldId.get(node.fieldId)
      if (viewCol === undefined) return null // 叶被隐藏
      leafTopRowByViewCol[viewCol] = level
      return { minCol: viewCol, maxCol: viewCol }
    }

    let minCol = Number.POSITIVE_INFINITY
    let maxCol = Number.NEGATIVE_INFINITY
    for (const child of node.children) {
      const span = resolveNode(child, level + 1)
      if (!span) continue
      minCol = Math.min(minCol, span.minCol)
      maxCol = Math.max(maxCol, span.maxCol)
    }
    if (minCol > maxCol) return null // 子树内所有叶均隐藏，组不产 cell

    rows[level]!.push({ groupId: node.id, label: node.label, startViewCol: minCol, endViewCol: maxCol })
    return { minCol, maxCol }
  }

  for (const node of tree) {
    resolveNode(node, 0)
  }

  // 判定须基于实际产出的组 cell，而非顶层节点的 span——顶层裸叶（无组）即便可见，
  // 也不代表任何组有可见跨度（见测试 3：仅裸叶可见时应返回 null）。
  const hasAnyGroupCell = rows.some((row) => row.length > 0)
  if (!hasAnyGroupCell) return null

  return { depth, rows, leafTopRowByViewCol }
}

/** 派生高亮：selectedRange 整列（0..rowCount-1）且列区间 ⊇ 组可见叶列区间 → 该组 id 入集。 */
export function deriveSelectedGroupIds(
  layout: ColumnGroupLayout,
  selectedRange: CellRange | null,
  rowCount: number,
): ReadonlySet<string> {
  if (selectedRange === null) return new Set()
  if (selectedRange.startRow !== 0 || selectedRange.endRow !== rowCount - 1) return new Set()

  const result = new Set<string>()
  for (const row of layout.rows) {
    for (const cell of row) {
      if (selectedRange.startCol <= cell.startViewCol && cell.endViewCol <= selectedRange.endCol) {
        result.add(cell.groupId)
      }
    }
  }
  return result
}
