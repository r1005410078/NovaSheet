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

  it('getTree 返回独立副本：apply* mutation 之后不回溯影响已取得的引用', () => {
    const store = new ColumnGroupStore(fields, tree)
    const before = store.getTree()
    // 无组顶层插入分支用 `this.tree.splice` 原地修改顶层数组——若 getTree() 返回活引用，
    // before 会随 mutation 被静默改写；这正是本次修复要堵住的场景（other apply* 同理，
    // 挑 splice 路径最短最直接证明）。
    store.applyInsertFields(1, ['newTop'], fields)
    expect(before).toEqual(tree)
    expect(before.some((n) => 'fieldId' in n && n.fieldId === 'newTop')).toBe(false)
    expect(store.getTree().some((n) => 'fieldId' in n && n.fieldId === 'newTop')).toBe(true)
  })
})

describe('ColumnGroupStore — 嵌套组（2 层）', () => {
  // fields: [m, a1c1, a1c2, a2c1, b1]
  // tree: m(无组) / a{ a1{a1c1,a1c2}, a2{a2c1} } / b{b1}
  const nestedFields = [f('m'), f('a1c1'), f('a1c2'), f('a2c1'), f('b1')]
  const nestedTree: ColumnGroupChild[] = [
    { fieldId: 'm' },
    {
      id: 'a',
      label: 'A',
      children: [
        { id: 'a1', label: 'A1', children: [{ fieldId: 'a1c1' }, { fieldId: 'a1c2' }] },
        { id: 'a2', label: 'A2', children: [{ fieldId: 'a2c1' }] },
      ],
    },
    { id: 'b', label: 'B', children: [{ fieldId: 'b1' }] },
  ]

  it('级联删除：子组清空逐级移除，父组仍有其他子组时保留，兄弟组不受影响', () => {
    const store = new ColumnGroupStore(nestedFields, nestedTree)

    // 删空 a1 → a1 本身被移除，但 a 仍有 a2 这个子组，故 a 保留
    store.applyDeleteFields(['a1c1', 'a1c2'])
    expect(store.findGroupLeafFieldIds('a1')).toBeNull()
    expect(store.findGroupLeafFieldIds('a')).toEqual(['a2c1'])
    expect(store.findGroupLeafFieldIds('b')).toEqual(['b1'])

    // 再删空 a2 → a2 移除后 a 的 children 也空了，级联到 2 层，a 本身也被移除
    store.applyDeleteFields(['a2c1'])
    expect(store.findGroupLeafFieldIds('a2')).toBeNull()
    expect(store.findGroupLeafFieldIds('a')).toBeNull()
    expect(store.findGroupLeafFieldIds('b')).toEqual(['b1'])
  })

  it('插入路由：子组交界归最深公共祖先（父组），子组内部归子组自身', () => {
    // a1c2 与 a2c1 之间——跨 a1/a2 边界，两侧最深公共组是 a，故新列归 a 顶层、不进任一子组
    const storeBoundary = new ColumnGroupStore(nestedFields, nestedTree)
    storeBoundary.applyInsertFields(3, ['boundary'], nestedFields)
    expect(storeBoundary.findGroupLeafFieldIds('a')).toEqual(['a1c1', 'a1c2', 'boundary', 'a2c1'])
    expect(storeBoundary.findGroupLeafFieldIds('a1')).toEqual(['a1c1', 'a1c2'])
    expect(storeBoundary.findGroupLeafFieldIds('a2')).toEqual(['a2c1'])

    // a1c1 与 a1c2 之间——完全落在 a1 内部，归 a1 自身
    const storeInner = new ColumnGroupStore(nestedFields, nestedTree)
    storeInner.applyInsertFields(2, ['inner'], nestedFields)
    expect(storeInner.findGroupLeafFieldIds('a1')).toEqual(['a1c1', 'inner', 'a1c2'])
  })
})
