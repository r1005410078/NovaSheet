import { describe, expect, it } from 'bun:test'

import {
  DefaultGridEngine,
  type DataSourceEvent,
} from '../../../../src'
import {
  createDenseData,
  createMutableData,
  rowOrder,
} from '../../_helpers/fixtures'
import { dumpFrame } from '../../_helpers/frame-dump'
import { expectGolden } from '../../_helpers/golden'

/** DataSourceEvent → 单行确定性文本（订阅方观测到的公开事件契约）。 */
function dumpEvent(e: DataSourceEvent): string {
  switch (e.type) {
    case 'rowsChanged':
      return `rowsChanged [${e.startIndex}..${e.endIndex}]`
    case 'rowsInserted':
      return `rowsInserted at=${e.at} count=${e.count}`
    case 'rowsDeleted':
      return `rowsDeleted removed=[${e.removed.join(',')}]`
    case 'rowsMoved':
      return `rowsMoved rowIds=[${e.rowIds.join(',')}] before=${e.beforeRowId}`
    case 'colsInserted':
      return `colsInserted at=${e.at} field=${e.field.id}`
    case 'colsDeleted':
      return `colsDeleted removed=[${e.removed.map((r) => `${r.index}:${r.fieldId}`).join(',')}]`
    case 'colsMoved':
      return `colsMoved fieldIds=[${e.fieldIds.join(',')}] before=${e.beforeFieldId}`
    case 'rowCountChanged':
      return `rowCountChanged newCount=${e.newCount}`
    default:
      return e.type
  }
}

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

  it('core.L1.engine-structural-event-stream emits stable DataSource events for mutations + undo/redo', () => {
    // DataSource.subscribe 是订阅方（renderer / 缓存）的公开观测缝；结构 mutation 的事件流
    // （含 undo/redo 逆向）是契约。整段事件序列入金，任何域写缝改动立即可见。
    const events: string[] = []
    // 每个 op 用独立引擎，事件流互不干扰；header 行分段。
    const run = (label: string, body: (engine: DefaultGridEngine) => void): void => {
      const data = createMutableData()
      const engine = new DefaultGridEngine({ data })
      const captured: string[] = []
      const unsubscribe = data.subscribe((e) => captured.push(dumpEvent(e)))
      body(engine)
      unsubscribe()
      events.push(`== ${label} ==`, ...captured)
    }

    run('insertRows(at=1,count=2) + undo + redo', (engine) => {
      engine.insertRows(1, 2)
      engine.undo()
      engine.redo()
    })
    run('deleteRows([r0,r1]) + undo + redo', (engine) => {
      engine.deleteRows([0, 1])
      engine.undo()
      engine.redo()
    })
    run('moveRows([r1,r2]→front) + undo + redo', (engine) => {
      engine.moveRows([1, 2], 0)
      engine.undo()
      engine.redo()
    })
    run('insertCols(before=1,count=1) + undo + redo', (engine) => {
      engine.insertCols(1, 1)
      engine.undo()
      engine.redo()
    })
    run('deleteCols([b]) + undo + redo', (engine) => {
      engine.deleteCols(['b'])
      engine.undo()
      engine.redo()
    })
    run('moveCols([c]→front) + undo + redo', (engine) => {
      engine.moveCols(['c'], 'a')
      engine.undo()
      engine.redo()
    })

    expectGolden(import.meta.dir, 'core.L1.engine-structural-event-stream', `${events.join('\n')}\n`)
  })
})
