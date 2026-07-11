import { describe, expect, it } from 'bun:test'
import { validateColumnGroups } from '../../../src/features/column-groups/validateColumnGroups'
import type { ColumnGroupChild } from '../../../src/kernel/data/Schema'
import type { Field } from '../../../src/kernel/data/Schema'

const f = (id: string): Field => ({ id, name: id, type: 'text', width: 100 })
const fields = [f('m'), f('s1c1'), f('s1c2'), f('s2c1'), f('s2c2')]
const legal: ColumnGroupChild[] = [
  { fieldId: 'm' },
  { id: 's1', label: '堆1', children: [{ fieldId: 's1c1' }, { fieldId: 's1c2' }] },
  { id: 's2', label: '堆2', children: [{ fieldId: 's2c1' }, { fieldId: 's2c2' }] },
]

describe('validateColumnGroups', () => {
  it('合法混排（无组列 + 两组）通过', () => {
    expect(() => validateColumnGroups(fields, legal)).not.toThrow()
  })

  it('嵌套组（组含子组）通过', () => {
    const nested: ColumnGroupChild[] = [
      { fieldId: 'm' },
      {
        id: 'a',
        label: 'A相',
        children: [
          { id: 's1', label: '堆1', children: [{ fieldId: 's1c1' }, { fieldId: 's1c2' }] },
          { id: 's2', label: '堆2', children: [{ fieldId: 's2c1' }, { fieldId: 's2c2' }] },
        ],
      },
    ]
    expect(() => validateColumnGroups(fields, nested)).not.toThrow()
  })

  it('不连续引用 throw contiguity', () => {
    const bad: ColumnGroupChild[] = [
      { id: 's1', label: 'x', children: [{ fieldId: 's1c1' }, { fieldId: 's2c2' }] },
    ]
    expect(() => validateColumnGroups(fields, bad)).toThrow(/column-groups\/contiguity/)
  })

  it('叶序与 fields 顺序不一致 throw leaf-order', () => {
    const bad: ColumnGroupChild[] = [
      { id: 's1', label: 'x', children: [{ fieldId: 's1c2' }, { fieldId: 's1c1' }] },
    ]
    expect(() => validateColumnGroups(fields, bad)).toThrow(/column-groups\/leaf-order/)
  })

  it.each([
    ['引用不存在', [{ id: 'g', label: 'x', children: [{ fieldId: 'ghost' }] }]],
    [
      '重复归属',
      [
        { id: 'g1', label: 'x', children: [{ fieldId: 's1c1' }] },
        { id: 'g2', label: 'y', children: [{ fieldId: 's1c1' }] },
      ],
    ],
    ['空 children', [{ id: 'g', label: 'x', children: [] }]],
    [
      '重复组 id',
      [
        { id: 'g', label: 'x', children: [{ fieldId: 's1c1' }] },
        { id: 'g', label: 'y', children: [{ fieldId: 's1c2' }] },
      ],
    ],
  ] as const)('%s throw reference', (_name, bad) => {
    expect(() => validateColumnGroups(fields, bad as unknown as ColumnGroupChild[])).toThrow(
      /column-groups\/reference/,
    )
  })
})
