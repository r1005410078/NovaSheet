/**
 * Phase 4.6 端到端场景测试。
 *
 * 三条 E2E 覆盖列结构操作的核心交互链：
 *   1. insertCols + undo 完全还原（schema 与 frozen config）
 *   2. deleteCols 让命中 fieldId 的 SortLayer spec invalidate
 *   3. hideCols + insertCols 后隐藏集按 fieldId 锚定，不随 index 漂移
 */

import { describe, expect, it } from 'bun:test'
import { InMemoryDataSource, denseGridTheme, type FrozenConfig, type GridEngine } from '@zhiguang/novasheet-core'
import { Grid } from '@zhiguang/novasheet-core'
import { canvas2dBackend } from '../../src/backend/canvas2dBackend'

const SCHEMA = {
  fields: [
    { id: 'a', name: 'A', type: 'text' as const, width: 100 },
    { id: 'b', name: 'B', type: 'number' as const, width: 80 },
    { id: 'c', name: 'C', type: 'text' as const, width: 120 },
    { id: 'd', name: 'D', type: 'text' as const, width: 100 },
  ],
}

function mkGrid(opts: { frozen?: Partial<FrozenConfig> } = {}) {
  const data = new InMemoryDataSource({
    schema: { fields: SCHEMA.fields.map((field) => ({ ...field })) },
    rows: Array.from({ length: 10 }, (_, i) => ({ a: `r${i}`, b: i, c: `x${i}`, d: `y${i}` })),
  })
  const container = document.createElement('div')
  Object.assign(container.style, { width: '500px', height: '300px' })
  document.body.appendChild(container)
  const grid = new Grid(container, {
    backend: canvas2dBackend(),
    data,
    theme: denseGridTheme,
    frozen: { topRows: 0, leftCols: 0, rightCols: 0, ...opts.frozen },
  })
  return { grid, data, container }
}

function engineOf(grid: Grid): GridEngine {
  return (grid as unknown as { delegate: { engine: GridEngine } }).delegate.engine
}

describe('Phase 4.6 E2E', () => {
  it('insertCols + undo 完全还原（含 frozen 状态）', () => {
    const { grid, data, container } = mkGrid({ frozen: { leftCols: 2 } })
    expect(engineOf(grid).getFrozenConfig()).toEqual({ topRows: 0, leftCols: 2, rightCols: 0 })

    grid.insertCols(0, 1)

    expect(data.getSchema().fields).toHaveLength(5)
    expect(engineOf(grid).getFrozenConfig()).toEqual({ topRows: 0, leftCols: 3, rightCols: 0 })
    expect(grid.canUndo()).toBe(true)

    grid.undo()

    expect(data.getSchema().fields.map((field) => field.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(engineOf(grid).getFrozenConfig()).toEqual({ topRows: 0, leftCols: 2, rightCols: 0 })
    expect(grid.canUndo()).toBe(false)

    grid.destroy()
    container.remove()
  })

  it('deleteCols 让 sort spec 在 fieldId 命中时 invalidate', () => {
    const { grid, data, container } = mkGrid()
    const sortLayer = grid.getSortLayer()
    expect(sortLayer.setSpec({ fieldId: 'b', direction: 'asc' })).toBe(true)
    expect(sortLayer.getSpec()).toEqual({ fieldId: 'b', direction: 'asc' })

    grid.deleteCols(['b'])

    expect(data.getSchema().fields.map((field) => field.id)).toEqual(['a', 'c', 'd'])
    expect(sortLayer.getSpec()).toBeNull()

    grid.destroy()
    container.remove()
  })

  it('hideCols + insertCols 后 hidden fieldIds 按 id 锚定不漂移', () => {
    const { grid, data, container } = mkGrid()

    grid.hideCols(['c'])
    expect(grid.getHiddenCols()).toEqual(['c'])

    grid.insertCols(0, 2)

    expect(data.getSchema().fields).toHaveLength(6)
    expect(grid.getHiddenCols()).toEqual(['c'])

    grid.destroy()
    container.remove()
  })
})
