import { describe, expect, it } from 'bun:test'
import { ColumnGroupStore } from '../../../src/features/column-groups/ColumnGroupStore'
import type { Field, ColumnGroupChild } from '../../../src/kernel/data/Schema'

const f = (id: string): Field => ({ id, name: id, type: 'text', width: 100 })
const fields = [f('m'), f('s1c1'), f('s1c2'), f('s2c1'), f('s2c2')]
const tree: ColumnGroupChild[] = [
  { fieldId: 'm' },
  { id: 's1', label: '堆1', children: [{ fieldId: 's1c1' }, { fieldId: 's1c2' }] },
  { id: 's2', label: '堆2', children: [{ fieldId: 's2c1' }, { fieldId: 's2c2' }] },
]

describe('ColumnGroupStore', () => {
  it('depth 与叶查找', () => {
    const store = new ColumnGroupStore(fields, tree)
    expect(store.getDepth()).toBe(1)
    expect(store.findGroupLeafFieldIds('s1')).toEqual(['s1c1', 's1c2'])
    expect(store.findGroupLeafFieldIds('ghost')).toBeNull()
  })

  it('insert 组内部归组、边界不归组', () => {
    const store = new ColumnGroupStore(fields, tree)
    // 在 s1c1 与 s1c2 之间（fields index 2）插入 → 归 s1
    store.applyInsertFields(2, ['new1'], fields)
    expect(store.findGroupLeafFieldIds('s1')).toEqual(['s1c1', 'new1', 's1c2'])
    // 在 s1 与 s2 边界（原 index 3，插入后 fields 变化，用当前 fields 快照传入）不归组
    const fields2 = [f('m'), f('s1c1'), f('new1'), f('s1c2'), f('s2c1'), f('s2c2')]
    store.applyInsertFields(4, ['new2'], fields2)
    expect(store.findGroupLeafFieldIds('s1')).toEqual(['s1c1', 'new1', 's1c2'])
    expect(store.findGroupLeafFieldIds('s2')).toEqual(['s2c1', 's2c2'])
    expect(store.getTree().some((n) => 'fieldId' in n && n.fieldId === 'new2')).toBe(true)
  })

  it('delete 级联移除空组，snapshot/restore 往返', () => {
    const store = new ColumnGroupStore(fields, tree)
    const before = store.snapshot()
    store.applyDeleteFields(['s1c1', 's1c2'])
    expect(store.findGroupLeafFieldIds('s1')).toBeNull()
    store.restore(before)
    expect(store.findGroupLeafFieldIds('s1')).toEqual(['s1c1', 's1c2'])
    expect(JSON.parse(JSON.stringify(before))).toEqual(before) // JSON 纯数据
  })

  it('move 预检：跨组 false、同组 true、无组顶层间 true', () => {
    const store = new ColumnGroupStore(fields, tree)
    expect(store.isMoveWithinSameGroup(['s1c2'], 's2c2', fields)).toBe(false)
    expect(store.isMoveWithinSameGroup(['s1c2'], 's1c1', fields)).toBe(true)
    expect(store.isMoveWithinSameGroup(['m'], null, fields)).toBe(true)
  })

  it('applyMoveFields 按新 fields 序重排组内叶序', () => {
    const store = new ColumnGroupStore(fields, tree)
    store.applyMoveFields([f('m'), f('s1c2'), f('s1c1'), f('s2c1'), f('s2c2')])
    expect(store.findGroupLeafFieldIds('s1')).toEqual(['s1c2', 's1c1'])
  })
})
