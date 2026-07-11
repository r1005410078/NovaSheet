import { describe, expect, it } from 'bun:test'
import { Grid, InMemoryDataSource } from '../../../src'
import { createNoopBackend } from '../../acceptance/_helpers/fixtures'

// getCellText 原为 GridRuntime 的 mutation passthrough 之一（GridRuntime 拆分 Task 10 迁至
// GridControllerImpl 直调 engine，见该文件同名方法）。经 Grid 公开门面驱动，验证组合逻辑
// （getData → getSchema → getCell，越界/空值兜底 ''）随迁移后行为不变。
describe('Grid.getCellText — F3 facade (relocated from GridRuntime, Task 10)', () => {
  it('returns string value at raw coords', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const data = new InMemoryDataSource({
      rows: [{ name: 'abc', score: 42 }],
      schema: {
        fields: [
          { id: 'name', name: 'Name', type: 'text', width: 100 },
          { id: 'score', name: 'Score', type: 'number', width: 100 },
        ],
      },
    })
    const grid = new Grid(container, { data, backend: createNoopBackend })
    expect(grid.getCellText(0, 0)).toBe('abc')
    expect(grid.getCellText(0, 1)).toBe('42')
    grid.destroy()
  })

  it('returns empty string for null/undefined cell (out-of-bounds row)', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const data = new InMemoryDataSource({
      rows: [{ name: 'abc' }],
      schema: { fields: [{ id: 'name', name: 'Name', type: 'text', width: 100 }] },
    })
    const grid = new Grid(container, { data, backend: createNoopBackend })
    expect(grid.getCellText(999, 0)).toBe('')
    grid.destroy()
  })

  it('returns empty string for out-of-bounds column', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const data = new InMemoryDataSource({
      rows: [{ name: 'abc' }],
      schema: { fields: [{ id: 'name', name: 'Name', type: 'text', width: 100 }] },
    })
    const grid = new Grid(container, { data, backend: createNoopBackend })
    expect(grid.getCellText(0, 99)).toBe('')
    grid.destroy()
  })
})

// GridRuntime 拆分 Task 10 把这些 mutation 的调用从 GridRuntime（内部 `if (this.destroyed) return`
// 早退）迁到 GridControllerImpl 直调 engine；code review 指出迁移时丢了这个早退——async 续体
// （防抖 resize、in-flight paste/undo promise、过期事件闭包）可能在 destroy() 之后才触发，
// 若不早退会继续驱动 engine mutation 并触碰已销毁的 host/renderer。回归测试锁定：destroy() 后
// 调用仍安全（不抛）且返回值与销毁前 GridRuntime guard 的早退默认值一致。
describe('GridControllerImpl mutation methods after destroy() — no-op guard (Task 10 destroyed-guard fix)', () => {
  it('void/array/boolean 返回的 mutation 方法在 destroy() 后调用不抛且不产生副作用', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const data = new InMemoryDataSource({
      rows: [{ name: 'abc', score: 1 }],
      schema: {
        fields: [
          { id: 'name', name: 'Name', type: 'text', width: 100 },
          { id: 'score', name: 'Score', type: 'number', width: 100 },
        ],
      },
    })
    const grid = new Grid(container, { data, backend: createNoopBackend })
    grid.destroy()

    expect(() => grid.unhideRows([0])).not.toThrow()
    expect(() => grid.insertRows(0, 1)).not.toThrow()
    expect(grid.insertRows(0, 1)).toEqual([])
    expect(grid.setFillColor({ startRow: 0, endRow: 0, startCol: 0, endCol: 0 }, '#ff0000')).toBe(false)
    expect(grid.mergeCells({ startRow: 0, endRow: 0, startCol: 0, endCol: 1 })).toBe(false)
    expect(data.getRowCount()).toBe(1)
  })
})
