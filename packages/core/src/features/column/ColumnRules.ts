import type { ChunkedAxis } from '../../kernel/geometry/ChunkedAxis'
import type { Field } from '../../kernel/data/Schema'

/** 列移动归一化后的计划。 */
export interface ColumnMovePlan {
  readonly fieldIds: readonly string[]
  readonly beforeFieldId: string | null
  readonly inverseBeforeFieldId: string | null
}

export function normalizeMoveCols(
  fields: readonly Field[],
  fieldIds: readonly string[],
  beforeFieldId: string | null,
): ColumnMovePlan | null {
  const requested = new Set(fieldIds)
  const moving = fields.filter((field) => requested.has(field.id)).map((field) => field.id)
  if (moving.length === 0) return null
  if (!isContiguousFieldGroup(fields, moving)) return null
  const movingSet = new Set(moving)
  if (beforeFieldId !== null) {
    if (movingSet.has(beforeFieldId)) return null
    if (!fields.some((field) => field.id === beforeFieldId)) return null
  }

  const remaining = fields.filter((field) => !movingSet.has(field.id)).map((field) => field.id)
  const insertAt = beforeFieldId === null ? remaining.length : remaining.indexOf(beforeFieldId)
  if (insertAt < 0) return null

  const next = remaining.slice()
  next.splice(insertAt, 0, ...moving)
  const current = fields.map((field) => field.id)
  if (sameStringOrder(current, next)) return null

  const firstMovingIndex = current.findIndex((id) => movingSet.has(id))
  let inverseBeforeFieldId: string | null = null
  for (let i = firstMovingIndex + moving.length; i < current.length; i += 1) {
    const id = current[i]!
    if (!movingSet.has(id)) {
      inverseBeforeFieldId = id
      break
    }
  }
  return { fieldIds: moving, beforeFieldId, inverseBeforeFieldId }
}

export function isContiguousFieldGroup(
  fields: readonly Field[],
  fieldIds: readonly string[],
): boolean {
  const indices = fieldIds
    .map((id) => fields.findIndex((field) => field.id === id))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)
  if (indices.length !== fieldIds.length) return false
  for (let i = 1; i < indices.length; i += 1) {
    if (indices[i]! !== indices[i - 1]! + 1) return false
  }
  return true
}

/**
 * 由「移动前 raw 字段序」与当前（移动后）raw 字段序按 fieldId 配对，
 * 推导 `oldRawIndex → newRawIndex` map。必须在 `moveFields` 之后调用。
 */
export function buildColIndexMap(
  rawFieldIdsBefore: readonly string[],
  fieldsAfter: readonly Field[],
): ReadonlyMap<number, number> {
  const newIndexById = new Map<string, number>()
  for (let i = 0; i < fieldsAfter.length; i += 1) {
    newIndexById.set(fieldsAfter[i]!.id, i)
  }
  const indexMap = new Map<number, number>()
  for (let oldIndex = 0; oldIndex < rawFieldIdsBefore.length; oldIndex += 1) {
    const newIndex = newIndexById.get(rawFieldIdsBefore[oldIndex]!)
    if (newIndex !== undefined) indexMap.set(oldIndex, newIndex)
  }
  return indexMap
}

export function captureRawColWidths(
  fields: readonly Field[],
  axis: ChunkedAxis,
): Map<string, number> {
  const widths = new Map<string, number>()
  for (let i = 0; i < fields.length; i += 1) {
    widths.set(fields[i]!.id, axis.getSize(i))
  }
  return widths
}

export function normalizeDeleteCols(
  fields: readonly Field[],
  fieldIds: readonly string[],
): readonly { readonly id: string; readonly idx: number }[] {
  const result = fieldIds
    .map((id) => {
      const idx = fields.findIndex((field) => field.id === id)
      return idx >= 0 ? { id, idx } : null
    })
    .filter((item): item is { id: string; idx: number } => item !== null)
    .sort((a, b) => a.idx - b.idx)
  return result
}

export function getNewlyHiddenCols(
  fields: readonly Field[],
  fieldIds: readonly string[],
  hidden: ReadonlySet<string>,
): string[] {
  const known = new Set(fields.map((field) => field.id))
  return fieldIds.filter((id) => known.has(id) && !hidden.has(id))
}

export function getNewlyVisibleCols(
  fieldIds: readonly string[],
  hidden: ReadonlySet<string>,
): string[] {
  return fieldIds.filter((id) => hidden.has(id))
}

function sameStringOrder(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false
  }
  return true
}
