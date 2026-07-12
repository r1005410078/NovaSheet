import { describe, expect, it } from 'bun:test'
import {
  resolveColumnGroupLayout,
  deriveSelectedGroupIds,
} from '../../../src/features/column-groups/resolveColumnGroupLayout'
import type { Field, ColumnGroupChild } from '../../../src/kernel/data/Schema'

const f = (id: string): Field => ({ id, name: id, type: 'text', width: 100 })
// 嵌套两层组：m 无组 | A相(堆X[aXc1,aXc2] 堆Y[aYc1]) | B相(堆Z[bZc1])
const tree: ColumnGroupChild[] = [
  { fieldId: 'm' },
  {
    id: 'a',
    label: 'A相',
    children: [
      { id: 'aX', label: '堆X', children: [{ fieldId: 'aXc1' }, { fieldId: 'aXc2' }] },
      { id: 'aY', label: '堆Y', children: [{ fieldId: 'aYc1' }] },
    ],
  },
  {
    id: 'b',
    label: 'B相',
    children: [{ id: 'bZ', label: '堆Z', children: [{ fieldId: 'bZc1' }] }],
  },
]
const allVisible = [f('m'), f('aXc1'), f('aXc2'), f('aYc1'), f('bZc1')]

describe('resolveColumnGroupLayout', () => {
  it('depth/rows 区间/leafTopRowByViewCol（spec §3.1 场景 frame-layout 的纯函数版）', () => {
    const layout = resolveColumnGroupLayout(tree, allVisible)!
    expect(layout.depth).toBe(2)
    expect(layout.rows[0]).toEqual([
      { groupId: 'a', label: 'A相', startViewCol: 1, endViewCol: 3 },
      { groupId: 'b', label: 'B相', startViewCol: 4, endViewCol: 4 },
    ])
    expect(layout.rows[1]).toEqual([
      { groupId: 'aX', label: '堆X', startViewCol: 1, endViewCol: 2 },
      { groupId: 'aY', label: '堆Y', startViewCol: 3, endViewCol: 3 },
      { groupId: 'bZ', label: '堆Z', startViewCol: 4, endViewCol: 4 },
    ])
    expect(layout.leafTopRowByViewCol).toEqual([0, 2, 2, 2, 2])
  })

  it('部分隐藏收缩、全隐组消失（不对称深度：b 只有一层子组时 bZ 叶头仍在 row1 之下）', () => {
    const layout = resolveColumnGroupLayout(tree, [f('m'), f('aXc1'), f('bZc1')])!
    expect(layout.rows[0]).toEqual([
      { groupId: 'a', label: 'A相', startViewCol: 1, endViewCol: 1 },
      { groupId: 'b', label: 'B相', startViewCol: 2, endViewCol: 2 },
    ])
    expect(layout.rows[1]).toEqual([
      { groupId: 'aX', label: '堆X', startViewCol: 1, endViewCol: 1 },
      { groupId: 'bZ', label: '堆Z', startViewCol: 2, endViewCol: 2 },
    ])
  })

  it('无组树 / 组全隐 返回 null', () => {
    expect(resolveColumnGroupLayout([], allVisible)).toBeNull()
    expect(resolveColumnGroupLayout(tree, [f('m')])).toBeNull() // 所有组叶全隐 → 仅无组列
  })

  it('同树内不同分支嵌套深度不对称：a 单层组、b 双层组，leafTopRowByViewCol 三档非均匀', () => {
    // fields: [m, aC1, bC1, bC2]
    const asymmetricTree: ColumnGroupChild[] = [
      { fieldId: 'm' },
      { id: 'a', label: 'A组', children: [{ fieldId: 'aC1' }] },
      {
        id: 'b',
        label: 'B组',
        children: [
          { id: 'b1', label: 'B1子组', children: [{ fieldId: 'bC1' }, { fieldId: 'bC2' }] },
        ],
      },
    ]
    const visible = [f('m'), f('aC1'), f('bC1'), f('bC2')]

    const layout = resolveColumnGroupLayout(asymmetricTree, visible)!
    expect(layout.depth).toBe(2)
    expect(layout.rows[0]).toEqual([
      { groupId: 'a', label: 'A组', startViewCol: 1, endViewCol: 1 },
      { groupId: 'b', label: 'B组', startViewCol: 2, endViewCol: 3 },
    ])
    expect(layout.rows[1]).toEqual([
      { groupId: 'b1', label: 'B1子组', startViewCol: 2, endViewCol: 3 },
    ])
    expect(layout.leafTopRowByViewCol).toEqual([0, 1, 2, 2])
  })
})

describe('deriveSelectedGroupIds', () => {
  const layout = resolveColumnGroupLayout(tree, allVisible)!
  it('整列且 ⊇：单组、多组、父组递归', () => {
    expect(
      deriveSelectedGroupIds(layout, { startRow: 0, endRow: 9, startCol: 1, endCol: 2 }, 10),
    ).toEqual(new Set(['aX']))
    expect(
      deriveSelectedGroupIds(layout, { startRow: 0, endRow: 9, startCol: 1, endCol: 3 }, 10),
    ).toEqual(new Set(['aX', 'aY', 'a']))
  })
  it('非整列 → 空集；null range → 空集', () => {
    expect(
      deriveSelectedGroupIds(layout, { startRow: 1, endRow: 9, startCol: 1, endCol: 2 }, 10).size,
    ).toBe(0)
    expect(deriveSelectedGroupIds(layout, null, 10).size).toBe(0)
  })
})
