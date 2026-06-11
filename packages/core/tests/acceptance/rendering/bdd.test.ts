import { describe, expect, it } from 'bun:test'

import { InMemoryDataSource } from '../../../src'
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

  it('core.L2.render-frame-golden-view-compose captures raw-keyed format under hide and sort', () =>
    withManualRaf((flushRaf) => {
      const { container, grid, recorder } = mountRecordingGrid({ data: createViewComposeData() })

      // hide raw1 'alpha'，score 降序：view = delta(5), Echo(4), Gamma(3), Beta(2)
      grid.hideRows([1])
      expect(grid.getSortLayer().setSpec({ fieldId: 'score', direction: 'desc' })).toBe(true)
      // 对打散视图施格式：view 行 0 = raw 3 'delta'——mutation 经 viewRangeToRawRange 落 raw 键。
      expect(grid.setFillColor(fillRange(0, 0, 0, 1), '#fff2cc')).toBe(true)
      expect(grid.setValueFormat(fillRange(0, 1, 1, 1), { kind: 'percent', decimals: 1 })).toBe(true)
      flushRaf()
      const descDump = dumpFrame(lastFrame(recorder))

      // 重排升序：raw 键控格式应跟随 'delta' 行移动到新 view 位置，原 view 行 0 不再有填充。
      expect(grid.getSortLayer().setSpec({ fieldId: 'score', direction: 'asc' })).toBe(true)
      flushRaf()
      const ascDump = dumpFrame(lastFrame(recorder))

      expectGolden(
        import.meta.dir,
        'core.L2.render-frame-golden-view-compose',
        `==== sort desc ====\n${descDump}==== sort asc（fill 跟随 raw 行移位）====\n${ascDump}`,
      )

      grid.destroy()
      document.body.removeChild(container)
    }))
})

function createViewComposeData(): InMemoryDataSource {
  return new InMemoryDataSource({
    schema: {
      fields: [
        { id: 'name', name: 'Name', type: 'text', width: 120 },
        { id: 'score', name: 'Score', type: 'number', width: 80 },
      ],
    },
    rows: [
      { name: 'Beta', score: 2 },
      { name: 'alpha', score: 1 },
      { name: 'Gamma', score: 3 },
      { name: 'delta', score: 5 },
      { name: 'Echo', score: 4 },
    ],
  })
}
