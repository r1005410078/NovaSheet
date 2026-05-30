import { describe, expect, it } from 'bun:test'
import type { Schema } from '@novasheet/core'
import { GeneratedDataSource } from './generated-data-source'

const schema: Schema = {
  fields: [
    { id: 'c0', name: 'C0', type: 'text', width: 80 },
    { id: 'c1', name: 'C1', type: 'text', width: 80 },
    { id: 'c2', name: 'C2', type: 'text', width: 80 },
  ],
}

function ds(rows = 5) {
  return new GeneratedDataSource(rows, schema, (r, f) => `${f}-${r}`)
}

describe('GeneratedDataSource — 读取（结构未变）', () => {
  it('getCell 恒等映射回退 cellFn', () => {
    const d = ds()
    expect(d.getCell(3, 'c1')).toBe('c1-3')
    expect(d.getRowCount()).toBe(5)
  })
})

describe('GeneratedDataSource — 列结构', () => {
  it('moveFields 重排 schema，内容按 fieldId 锚定不变', () => {
    const d = ds()
    d.moveFields(['c2'], 'c0')
    expect(d.getSchema().fields.map((f) => f.id)).toEqual(['c2', 'c0', 'c1'])
    expect(d.getCell(0, 'c2')).toBe('c2-0') // 内容不随列序变化
  })

  it('insertField / removeField 改 schema', () => {
    const d = ds()
    d.insertField(1, { id: 'x', name: 'X', type: 'text', width: 80 })
    expect(d.getSchema().fields.map((f) => f.id)).toEqual(['c0', 'x', 'c1', 'c2'])
    const snap = d.removeField('c1')
    expect(snap?.originalIndex).toBe(2)
    expect(d.getSchema().fields.map((f) => f.id)).toEqual(['c0', 'x', 'c2'])
  })

  it('removeField 快照仅含 override，undo 可还原', () => {
    const d = ds()
    d.updateCell(2, 'c1', 'EDIT')
    const snap = d.removeField('c1')!
    expect(snap.cells[2]).toBe('EDIT')
    // 还原：重插字段并写回 override
    d.insertField(snap.originalIndex, snap.field)
    for (let r = 0; r < snap.cells.length; r += 1) {
      if (snap.cells[r] !== undefined) d.updateCell(r, 'c1', snap.cells[r]!)
    }
    expect(d.getCell(2, 'c1')).toBe('EDIT')
    expect(d.getCell(3, 'c1')).toBe('c1-3') // 生成值重新生成
  })
})

describe('GeneratedDataSource — 行结构', () => {
  it('insertRows 插入空白行，下方行内容随稳定 key 平移', () => {
    const d = ds()
    const ids = d.insertRows(2, 1)
    expect(ids).toEqual([2])
    expect(d.getRowCount()).toBe(6)
    expect(d.getCell(2, 'c0')).toBeUndefined() // 插入的空白行
    expect(d.getCell(3, 'c0')).toBe('c0-2') // 原 row2 内容下移
    expect(d.getCell(0, 'c0')).toBe('c0-0')
  })

  it('override 在上方插入行后随行平移', () => {
    const d = ds()
    d.updateCell(2, 'c0', 'EDIT')
    d.insertRows(0, 1)
    expect(d.getCell(3, 'c0')).toBe('EDIT') // 稳定 key 2 现在在 index 3
  })

  it('deleteRows 删除并返回快照，其余行上移', () => {
    const d = ds()
    const snap = d.deleteRows([1])
    expect(snap[0]?.cells['c0']).toBe('c0-1')
    expect(d.getRowCount()).toBe(4)
    expect(d.getCell(1, 'c0')).toBe('c0-2') // 原 row2 上移到 index1
  })

  it('moveRows 移动行块，生成内容随行移动', () => {
    const d = ds()
    d.moveRows([0], 3) // 把 row0 移到原 row2 之后
    expect(d.getCell(2, 'c0')).toBe('c0-0')
    expect(d.getCell(0, 'c0')).toBe('c0-1')
  })
})
