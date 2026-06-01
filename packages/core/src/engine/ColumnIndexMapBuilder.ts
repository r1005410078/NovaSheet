import type { Field } from '../data/Schema'

/**
 * Builds raw column index remaps after schema fields have been reordered.
 *
 * The map keys are old raw column indices and values are their new raw column indices, matched by
 * stable `field.id`. Stores keyed by raw coordinates can use this map to preserve cell formatting
 * and merge regions across column moves.
 */
export class ColumnIndexMapBuilder {
  build(rawFieldIdsBefore: readonly string[], fieldsAfter: readonly Field[]): ReadonlyMap<number, number> {
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
}
