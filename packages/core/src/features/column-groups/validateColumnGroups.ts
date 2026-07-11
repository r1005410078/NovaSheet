import type { ColumnGroupChild, Field } from '../../kernel/data/Schema'

/**
 * 校验列组树相对 `fields` 的三条规则（reference/contiguity/leaf-order），违反时 throw Error
 * （message 以规则 tag 开头）。纯函数，不修改入参；调用方在写入 Schema 前调用。
 */
export function validateColumnGroups(
  fields: readonly Field[],
  columnGroups: readonly ColumnGroupChild[],
): void {
  const fieldIndexById = new Map<string, number>()
  fields.forEach((field, index) => fieldIndexById.set(field.id, index))

  const seenFieldIds = new Set<string>()
  const seenGroupIds = new Set<string>()

  // 单次 DFS：叶子做 reference 检查并返回自身 fields-index；组节点做 id/children 校验，
  // 汇总子树 index 后做 contiguity 检查，再把 index 列表向上冒泡供父组/顶层复用（避免二次遍历）。
  const visit = (node: ColumnGroupChild): number[] => {
    if ('fieldId' in node) {
      const index = fieldIndexById.get(node.fieldId)
      if (index === undefined) {
        throw new Error(`[column-groups/reference] fieldId "${node.fieldId}" 不存在于 fields`)
      }
      if (seenFieldIds.has(node.fieldId)) {
        throw new Error(`[column-groups/reference] fieldId "${node.fieldId}" 被多条叶路径引用`)
      }
      seenFieldIds.add(node.fieldId)
      return [index]
    }

    if (seenGroupIds.has(node.id)) {
      throw new Error(`[column-groups/reference] 组 id "${node.id}" 在树中重复`)
    }
    seenGroupIds.add(node.id)
    if (node.children.length === 0) {
      throw new Error(`[column-groups/reference] 组 "${node.id}" 的 children 为空`)
    }

    const indices = node.children.flatMap(visit)

    // 组自身子树（含嵌套子组）的叶 index 须占连续区间——用 min/max/count 三值判定，
    // 避免为 contiguity 单独排序或二次遍历。
    const min = Math.min(...indices)
    const max = Math.max(...indices)
    if (max - min + 1 !== indices.length) {
      throw new Error(`[column-groups/contiguity] 组 "${node.id}" 引用的 fieldId 在 fields 中不连续`)
    }

    return indices
  }

  const allIndices = columnGroups.flatMap(visit)

  for (let i = 1; i < allIndices.length; i++) {
    const prev = allIndices[i - 1]!
    const curr = allIndices[i]!
    if (curr <= prev) {
      throw new Error('[column-groups/leaf-order] 列组树的深度优先叶序与 fields 顺序不一致')
    }
  }
}
