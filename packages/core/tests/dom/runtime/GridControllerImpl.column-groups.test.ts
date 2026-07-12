import { describe, expect, it } from 'bun:test'
import { Grid, InMemoryDataSource } from '../../../src'
import { createNoopBackend, getScrollHost } from '../../acceptance/_helpers/fixtures'

// Task 7 — 公开 getColumnGroups/selectGroup/scrollToGroup（BMS locateStack 等价物）。
// fields 顺序 m, s1c1, s1c2, s2c1；宽度加大到 300px 使总内容宽 1200px 明显超过 400px
// container，保证 scrollToGroup 对 s2（最右组）产生真实横向滚动。
function makeGroupedData(): InMemoryDataSource {
  return new InMemoryDataSource({
    schema: {
      fields: [
        { id: 'm', name: 'm', type: 'text', width: 300 },
        { id: 's1c1', name: 's1c1', type: 'text', width: 300 },
        { id: 's1c2', name: 's1c2', type: 'text', width: 300 },
        { id: 's2c1', name: 's2c1', type: 'text', width: 300 },
      ],
      columnGroups: [
        { fieldId: 'm' },
        { id: 's1', label: '堆1', children: [{ fieldId: 's1c1' }, { fieldId: 's1c2' }] },
        { id: 's2', label: '堆2', children: [{ fieldId: 's2c1' }] },
      ],
    },
    rows: Array.from({ length: 5 }, () => ({ m: 'x', s1c1: 1, s1c2: 2, s2c1: 3 })),
  })
}

describe('Grid column-group facade — getColumnGroups/selectGroup/scrollToGroup (Task 7)', () => {
  it('getColumnGroups 返回组树（文档序）', () => {
    const container = document.createElement('div')
    Object.assign(container.style, { width: '400px', height: '300px' })
    document.body.appendChild(container)
    const grid = new Grid(container, { data: makeGroupedData(), backend: createNoopBackend })

    const groups = grid.getColumnGroups()
    expect(groups).toEqual([
      { fieldId: 'm' },
      { id: 's1', label: '堆1', children: [{ fieldId: 's1c1' }, { fieldId: 's1c2' }] },
      { id: 's2', label: '堆2', children: [{ fieldId: 's2c1' }] },
    ])

    grid.destroy()
  })

  it('selectGroup 已知组 id 整列选中并返回 true；未知 id 返回 false 且不改动选区', () => {
    const container = document.createElement('div')
    Object.assign(container.style, { width: '400px', height: '300px' })
    document.body.appendChild(container)
    const grid = new Grid(container, { data: makeGroupedData(), backend: createNoopBackend })

    expect(grid.selectGroup('s1')).toBe(true)
    expect(grid.getSelection().selectedRange).toEqual({
      startRow: 0,
      endRow: 4,
      startCol: 1,
      endCol: 2,
    })

    const selectionBefore = grid.getSelection()
    expect(grid.selectGroup('ghost')).toBe(false)
    expect(grid.getSelection()).toEqual(selectionBefore)

    grid.destroy()
  })

  it('scrollToGroup 滚动 host 使 s2 首个可见叶列对齐视口左缘；未知组 id no-op', () => {
    const container = document.createElement('div')
    Object.assign(container.style, { width: '400px', height: '300px' })
    document.body.appendChild(container)
    const grid = new Grid(container, { data: makeGroupedData(), backend: createNoopBackend })
    const scrollHost = getScrollHost(container)

    expect(scrollHost.scrollLeft).toBe(0)
    grid.scrollToGroup('s2', 'start')
    expect(scrollHost.scrollLeft).toBeGreaterThan(0)

    const scrollLeftAfterS2 = scrollHost.scrollLeft
    expect(() => grid.scrollToGroup('ghost')).not.toThrow()
    expect(scrollHost.scrollLeft).toBe(scrollLeftAfterS2)

    grid.destroy()
  })

  it('scrollToGroup 无条件滚动——目标已完全可见时再次调用仍按新 align 改动 scrollLeft（非 ensureCellVisible 语义）', () => {
    const container = document.createElement('div')
    Object.assign(container.style, { width: '400px', height: '300px' })
    document.body.appendChild(container)
    const grid = new Grid(container, { data: makeGroupedData(), backend: createNoopBackend })
    const scrollHost = getScrollHost(container)

    // s1 首个可见叶列 s1c1 落在 [300, 600)；start 对齐后 scrollLeft=300，
    // 视口 [300, 700) 已完整覆盖 s1c1——此时 s1 对该次对齐而言已"可见"。
    grid.scrollToGroup('s1', 'start')
    const scrollLeftAfterStart = scrollHost.scrollLeft
    expect(scrollLeftAfterStart).toBeGreaterThan(0)

    // 同一组换 align 再次调用：ensure-visible 语义会因目标已可见而 no-op，
    // 但 scrollToGroup 应无条件重算并再次改动 scrollLeft。
    grid.scrollToGroup('s1', 'end')
    expect(scrollHost.scrollLeft).not.toBe(scrollLeftAfterStart)

    grid.destroy()
  })
})
