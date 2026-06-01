import type { Field } from '../data/Schema'
import type { RenderFrameCollapsedColGap } from '../render/RenderFrame'

/** Collapsed hidden-column run before it is projected into pixel coordinates. */
export type CollapsedColGap = Omit<RenderFrameCollapsedColGap, 'xPx'>

/** Computes collapsed column gaps from raw schema order plus hidden field ids. */
export class CollapsedColGapBuilder {
  build(fields: readonly Field[], hiddenFieldIds: ReadonlySet<string>): readonly CollapsedColGap[] {
    if (hiddenFieldIds.size === 0) return []

    const hiddenSchemaIndices: number[] = []
    for (let i = 0; i < fields.length; i += 1) {
      if (hiddenFieldIds.has(fields[i]!.id)) hiddenSchemaIndices.push(i)
    }

    const gaps: CollapsedColGap[] = []
    let run: number[] = []
    for (const schemaIndex of hiddenSchemaIndices) {
      if (run.length === 0 || schemaIndex === run[run.length - 1]! + 1) {
        run.push(schemaIndex)
        continue
      }
      gaps.push(makeColGap(run, fields, hiddenFieldIds))
      run = [schemaIndex]
    }
    if (run.length > 0) gaps.push(makeColGap(run, fields, hiddenFieldIds))
    return gaps
  }
}

function makeColGap(
  run: readonly number[],
  fields: readonly Field[],
  hiddenFieldIds: ReadonlySet<string>,
): CollapsedColGap {
  const upperRawCol = run[0]! - 1
  let atViewCol = -1
  if (upperRawCol >= 0) {
    let visibleCount = 0
    for (let rawCol = 0; rawCol <= upperRawCol; rawCol += 1) {
      if (hiddenFieldIds.has(fields[rawCol]!.id)) continue
      if (rawCol === upperRawCol) atViewCol = visibleCount
      visibleCount += 1
    }
  }
  return {
    atViewCol,
    hiddenCount: run.length,
    hiddenFieldIds: run.map((rawCol) => fields[rawCol]!.id),
  }
}
