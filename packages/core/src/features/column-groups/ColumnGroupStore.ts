import type { ColumnGroupChild, Field } from '../../kernel/data/Schema'
import { validateColumnGroups } from './validateColumnGroups'

/** JSON 可往返的组树快照（undo command 携带用，勿放非纯数据）。 */
export interface ColumnGroupsSnapshot {
  readonly tree: readonly ColumnGroupChild[]
}

/**
 * 列组树运行时状态。构造即校验（见 `validateColumnGroups`）；结构 mutation（insert/delete/move）
 * 后由 engine 调用对应 `apply*` 方法维护树与 `fields` 的一致性（spec §2.3）。
 */
export class ColumnGroupStore {
  private tree: ColumnGroupChild[]

  constructor(fields: readonly Field[], tree: readonly ColumnGroupChild[] | undefined) {
    const initial = tree ?? []
    validateColumnGroups(fields, initial)
    this.tree = cloneTree(initial)
  }

  hasGroups(): boolean {
    return this.tree.length > 0
  }

  /** 当前组树的独立副本（与 `snapshot()` 一致：深拷贝，后续 `apply*` mutation 不会影响已取得的返回值）。 */
  getTree(): readonly ColumnGroupChild[] {
    return cloneTree(this.tree)
  }

  /** 组层最大深度（叶不计）。无组返 0。 */
  getDepth(): number {
    const depthOf = (nodes: readonly ColumnGroupChild[]): number => {
      let max = 0
      for (const node of nodes) {
        if ('fieldId' in node) continue
        max = Math.max(max, 1 + depthOf(node.children))
      }
      return max
    }
    return depthOf(this.tree)
  }

  /** 组 id → 其下全部叶 fieldId（文档序）。不存在返 null。 */
  findGroupLeafFieldIds(groupId: string): readonly string[] | null {
    const found = findGroup(this.tree, groupId)
    return found ? collectLeafFieldIds(found.children) : null
  }

  /**
   * insertCols 后调用：插入点两侧同组则新列归该组，否则不归组（spec §2.3）。
   * `atFieldIndex` 与 `fieldsBefore` 是插入前的字段序与索引——两侧列的最深公共组即归属组。
   */
  applyInsertFields(
    atFieldIndex: number,
    newFieldIds: readonly string[],
    fieldsBefore: readonly Field[],
  ): void {
    const leftField = fieldsBefore[atFieldIndex - 1]
    const rightField = fieldsBefore[atFieldIndex]
    const leftPath = leftField ? findAncestorGroupPath(this.tree, leftField.id) : []
    const rightPath = rightField ? findAncestorGroupPath(this.tree, rightField.id) : []

    const targetGroup = deepestCommonGroup(leftPath, rightPath)

    const newLeaves: ColumnGroupChild[] = newFieldIds.map((fieldId) => ({ fieldId }))

    if (!targetGroup) {
      // 不归组：新列作为顶层无组叶插到 leftField 之后（若存在），否则插到树首。
      const insertAt = leftField ? findTopLevelInsertIndex(this.tree, leftField.id) : 0
      this.tree.splice(insertAt, 0, ...newLeaves)
      return
    }

    // 归组：插到 targetGroup.children 内 leftField 所在直接子路径之后。
    const insertAt = leftField
      ? findChildInsertIndexAfter(targetGroup.children, leftField.id)
      : targetGroup.children.length
    ;(targetGroup.children as ColumnGroupChild[]).splice(insertAt, 0, ...newLeaves)
  }

  /** deleteCols 后调用：剔除引用，组叶子删空则级联移除。 */
  applyDeleteFields(fieldIds: readonly string[]): void {
    const toDelete = new Set(fieldIds)
    this.tree = pruneTree(this.tree, toDelete)
  }

  /**
   * moveCols 预检：全部移动列与目标位置同属一个组（或同为无组顶层）返 true。
   * `beforeFieldId` = null 表示移到 fields 末尾之后——该位置没有右邻居可比较分组归属，
   * 与 `applyInsertFields` 对"插入点越过末列"的处理一致，恒判定为无组（不取末列自身的分组）。
   * `fields` 用于校验 `beforeFieldId` 确实存在于当前列序；不存在时位置不可判定，保守返 false。
   */
  isMoveWithinSameGroup(
    fieldIds: readonly string[],
    beforeFieldId: string | null,
    fields: readonly Field[],
  ): boolean {
    if (beforeFieldId !== null && !fields.some((field) => field.id === beforeFieldId)) {
      return false
    }

    const targetGroupId = beforeFieldId === null ? null : this.ancestorGroupId(beforeFieldId)
    return fieldIds.every((fieldId) => this.ancestorGroupId(fieldId) === targetGroupId)
  }

  private ancestorGroupId(fieldId: string): string | null {
    const path = findAncestorGroupPath(this.tree, fieldId)
    return path.length > 0 ? path[path.length - 1]!.id : null
  }

  /** moveCols 成功后调用：按新 fields 序重排各组叶序。 */
  applyMoveFields(fieldsAfter: readonly Field[]): void {
    const orderIndex = new Map<string, number>()
    fieldsAfter.forEach((field, index) => orderIndex.set(field.id, index))

    const reorder = (nodes: ColumnGroupChild[]): void => {
      nodes.sort((a, b) => {
        const aIndex = leafOrderIndex(a, orderIndex)
        const bIndex = leafOrderIndex(b, orderIndex)
        return aIndex - bIndex
      })
      for (const node of nodes) {
        if (!('fieldId' in node)) reorder(node.children as ColumnGroupChild[])
      }
    }
    reorder(this.tree)
  }

  snapshot(): ColumnGroupsSnapshot {
    return { tree: cloneTree(this.tree) }
  }

  restore(snap: ColumnGroupsSnapshot): void {
    this.tree = cloneTree(snap.tree)
  }
}

function cloneTree(tree: readonly ColumnGroupChild[]): ColumnGroupChild[] {
  return tree.map((node) =>
    'fieldId' in node
      ? { fieldId: node.fieldId }
      : { id: node.id, label: node.label, children: cloneTree(node.children) },
  )
}

/** 深度优先查找 id 为 groupId 的组节点（返回树内实际引用，供 in-place mutation）。 */
function findGroup(
  nodes: readonly ColumnGroupChild[],
  groupId: string,
): Extract<ColumnGroupChild, { id: string }> | null {
  for (const node of nodes) {
    if ('fieldId' in node) continue
    if (node.id === groupId) return node
    const found = findGroup(node.children, groupId)
    if (found) return found
  }
  return null
}

/**
 * fieldId 所属的祖先组路径（从外到内）；不在任何组内返空数组。
 * 递归时把当前组节点先并入 path 再下探，故子树匹配到时返回的 path 必非空——
 * 据此可用 `found.length > 0` 判定"在此子树命中"，无需额外 containment 扫描。
 */
function findAncestorGroupPath(
  nodes: readonly ColumnGroupChild[],
  fieldId: string,
  path: Extract<ColumnGroupChild, { id: string }>[] = [],
): Extract<ColumnGroupChild, { id: string }>[] {
  for (const node of nodes) {
    if ('fieldId' in node) {
      if (node.fieldId === fieldId) return path
      continue
    }
    const found = findAncestorGroupPath(node.children, fieldId, [...path, node])
    if (found.length > 0) return found
  }
  return []
}

function nodeContainsField(node: ColumnGroupChild, fieldId: string): boolean {
  if ('fieldId' in node) return node.fieldId === fieldId
  return node.children.some((child) => nodeContainsField(child, fieldId))
}

/** left/right 两条祖先组路径（从外到内）的最深公共前缀组；无公共前缀返 null。 */
function deepestCommonGroup(
  leftPath: readonly Extract<ColumnGroupChild, { id: string }>[],
  rightPath: readonly Extract<ColumnGroupChild, { id: string }>[],
): Extract<ColumnGroupChild, { id: string }> | null {
  let common: Extract<ColumnGroupChild, { id: string }> | null = null
  const len = Math.min(leftPath.length, rightPath.length)
  for (let i = 0; i < len; i++) {
    if (leftPath[i]!.id === rightPath[i]!.id) {
      common = leftPath[i]!
    } else {
      break
    }
  }
  return common
}

/** 树的顶层数组中，anchorFieldId 所在的顶层子树之后的插入下标。 */
function findTopLevelInsertIndex(tree: readonly ColumnGroupChild[], anchorFieldId: string): number {
  for (let i = 0; i < tree.length; i++) {
    if (nodeContainsField(tree[i]!, anchorFieldId)) return i + 1
  }
  return tree.length
}

/** children 数组中，anchorFieldId 所在直接子节点之后的插入下标。 */
function findChildInsertIndexAfter(
  children: readonly ColumnGroupChild[],
  anchorFieldId: string,
): number {
  for (let i = 0; i < children.length; i++) {
    if (nodeContainsField(children[i]!, anchorFieldId)) return i + 1
  }
  return children.length
}

function collectLeafFieldIds(nodes: readonly ColumnGroupChild[]): string[] {
  const result: string[] = []
  for (const node of nodes) {
    if ('fieldId' in node) {
      result.push(node.fieldId)
    } else {
      result.push(...collectLeafFieldIds(node.children))
    }
  }
  return result
}

/** 剔除 toDelete 中的叶引用；组的 children 删空则该组节点本身也被剔除（级联）。 */
function pruneTree(
  nodes: readonly ColumnGroupChild[],
  toDelete: ReadonlySet<string>,
): ColumnGroupChild[] {
  const result: ColumnGroupChild[] = []
  for (const node of nodes) {
    if ('fieldId' in node) {
      if (!toDelete.has(node.fieldId)) result.push(node)
      continue
    }
    const prunedChildren = pruneTree(node.children, toDelete)
    if (prunedChildren.length > 0) {
      result.push({ id: node.id, label: node.label, children: prunedChildren })
    }
  }
  return result
}

function leafOrderIndex(node: ColumnGroupChild, orderIndex: ReadonlyMap<string, number>): number {
  if ('fieldId' in node) return orderIndex.get(node.fieldId) ?? Number.POSITIVE_INFINITY
  let min = Number.POSITIVE_INFINITY
  for (const child of node.children) {
    min = Math.min(min, leafOrderIndex(child, orderIndex))
  }
  return min
}
