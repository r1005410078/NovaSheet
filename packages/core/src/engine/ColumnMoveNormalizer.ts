import type { Field } from '../data/Schema'

/** Normalized description of a valid column move in field-id space. */
export interface ColumnMovePlan {
  /** Field ids that should move, ordered by their current schema order. */
  readonly fieldIds: readonly string[]
  /** Field id before which the moving group should be inserted, or `null` for append. */
  readonly beforeFieldId: string | null
  /** Field id that restores the original order when the same group is moved again. */
  readonly inverseBeforeFieldId: string | null
}

/**
 * Validates and normalizes column move requests without touching engine state.
 *
 * The engine moves columns by stable `field.id`, so this helper keeps requested ids anchored to
 * schema order and rejects moves that would be ambiguous or produce no visible order change.
 */
export class ColumnMoveNormalizer {
  normalize(
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
}

function isContiguousFieldGroup(fields: readonly Field[], fieldIds: readonly string[]): boolean {
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

function sameStringOrder(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false
  }
  return true
}
