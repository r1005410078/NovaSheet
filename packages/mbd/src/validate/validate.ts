import { layerFromId } from '../parse/markdown'
import type { ScenarioEntry, ValidationError } from '../types'

export const DEFAULT_ID_PATTERN = /^excel\.L3[abc]\.[a-z0-9-]+$/

const VALID_LAYERS = new Set(['L3a', 'L3b', 'L3c'])

/** Validate parsed scenarios; returns all issues (empty = ok). */
export function validateScenarios(
  scenarios: readonly ScenarioEntry[],
  idPattern: RegExp = DEFAULT_ID_PATTERN,
): ValidationError[] {
  const errors: ValidationError[] = []
  const seenIds = new Map<string, string>()

  for (const scenario of scenarios) {
    const { filePath, id, layer, summary, status } = scenario

    if (!idPattern.test(id)) {
      errors.push({ filePath, message: `invalid id "${id}" (expected pattern ${idPattern})` })
    }

    if (!VALID_LAYERS.has(layer)) {
      errors.push({ filePath, message: `invalid layer "${layer}" (expected L3a, L3b, or L3c)` })
    }

    const idLayer = layerFromId(id)
    if (idLayer !== undefined && idLayer !== layer) {
      errors.push({
        filePath,
        message: `layer "${layer}" does not match id prefix "${idLayer}" in "${id}"`,
      })
    }

    if (summary.trim().length === 0) {
      errors.push({ filePath, message: 'summary must be a non-empty string' })
    }

    if (status !== undefined && status !== 'draft' && status !== 'implemented') {
      errors.push({ filePath, message: `invalid status "${status}"` })
    }

    const previous = seenIds.get(id)
    if (previous !== undefined) {
      errors.push({
        filePath,
        message: `duplicate id "${id}" (also in ${previous})`,
      })
    } else {
      seenIds.set(id, filePath)
    }
  }

  return errors
}
