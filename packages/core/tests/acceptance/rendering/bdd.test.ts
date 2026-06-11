import { describe, expect, it } from 'bun:test'

import {
  createMutableData,
  createScrollData,
  fillRange,
  lastFrame,
  mountRecordingGrid,
  withManualRaf,
} from '../_helpers/fixtures'
import { dumpFrame } from '../_helpers/frame-dump'
import { expectGolden } from '../_helpers/golden'

describe('Core acceptance rendering — RenderFrame 黄金快照', () => {
  it('core.L2.render-frame-golden-base captures dense grid frame layout', () =>
    withManualRaf((flushRaf) => {
      const { container, grid, recorder } = mountRecordingGrid({ data: createMutableData() })
      flushRaf()

      expectGolden(import.meta.dir, 'core.L2.render-frame-golden-base', dumpFrame(lastFrame(recorder)))

      grid.destroy()
      document.body.removeChild(container)
    }))

  it('core.L2.render-frame-golden-format-merge-value captures fill merge and value format', () =>
    withManualRaf((flushRaf) => {
      const { container, grid, recorder } = mountRecordingGrid({ data: createMutableData() })

      // 先断言 mutation 成功，避免 no-op 时黄金快照静默缺失这些段。
      expect(grid.setFillColor(fillRange(0, 0, 0, 0), '#fff2cc')).toBe(true)
      expect(grid.setValueFormat(fillRange(0, 0, 1, 1), { kind: 'percent', decimals: 1 })).toBe(true)
      expect(grid.mergeCells(fillRange(1, 2, 0, 1))).toBe(true)
      flushRaf()

      expectGolden(
        import.meta.dir,
        'core.L2.render-frame-golden-format-merge-value',
        dumpFrame(lastFrame(recorder)),
      )

      grid.destroy()
      document.body.removeChild(container)
    }))

  it('core.L2.render-frame-golden-frozen-quadrants captures frozen region geometry', () =>
    withManualRaf((flushRaf) => {
      const { container, grid, recorder } = mountRecordingGrid({ data: createScrollData() })

      grid.setFrozen({ topRows: 1, leftCols: 1 })
      flushRaf()

      expectGolden(
        import.meta.dir,
        'core.L2.render-frame-golden-frozen-quadrants',
        dumpFrame(lastFrame(recorder)),
      )

      grid.destroy()
      document.body.removeChild(container)
    }))
})
