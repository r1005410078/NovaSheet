import { describe, expect, it } from 'bun:test'

import {
  DefaultGridEngine,
} from '../../../../src'
import {
  createDenseData,
  createMutableData,
  rowOrder,
} from '../../_helpers/fixtures'
import { dumpFrame } from '../../_helpers/frame-dump'
import { expectGolden } from '../../_helpers/golden'

describe('Core acceptance engine', () => {
  it('core.L1.engine-frame-initial-visible-range observes initial engine frame', () => {
    const engine = new DefaultGridEngine({ data: createDenseData() })
    engine.setViewportSize(400, 240)

    // headless engine oracle 整帧入金：可见范围、region 几何、单元格文本一并锁定。
    expectGolden(
      import.meta.dir,
      'core.L1.engine-frame-initial-visible-range',
      dumpFrame(engine.getFrame()),
    )
  })

  it('core.L1.engine-rows-move-undo-redo reorders rows through engine history', () => {
    const data = createMutableData()
    const engine = new DefaultGridEngine({ data })

    expect(engine.moveRows([1, 2], 0)).toBe(true)
    expect(rowOrder(data)).toEqual(['r1', 'r2', 'r0'])
    expect(engine.canUndo()).toBe(true)

    engine.undo()
    expect(rowOrder(data)).toEqual(['r0', 'r1', 'r2'])
    expect(engine.canRedo()).toBe(true)

    engine.redo()
    expect(rowOrder(data)).toEqual(['r1', 'r2', 'r0'])
  })
})
