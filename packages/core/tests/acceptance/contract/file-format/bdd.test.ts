import { describe, expect, it } from 'bun:test'

import {
  computePasteTarget,
  parseTsvToCells,
  pasteTargetConflictsWithMerges,
  serializeRowsToTsv,
  type Row,
  type Schema,
} from '../../../../src'
import { expectGolden } from '../../_helpers/golden'

describe('Core acceptance file format', () => {
it('core.L0.clipboard-tsv-roundtrip serializes and parses typed cells', () => {
    const tsvSchema: Schema = {
      fields: [
        { id: 'name', name: 'Name', type: 'text', width: 100 },
        { id: 'qty', name: 'Qty', type: 'number', width: 100 },
        { id: 'done', name: 'Done', type: 'checkbox', width: 80 },
      ],
    }
    const rows = [
      { name: 'apple', qty: 3, done: true },
      { name: 'banana', qty: null, done: false },
    ] satisfies Row[]
    const fieldIds = ['name', 'qty', 'done']
    const tsv = serializeRowsToTsv(rows, fieldIds, tsvSchema)
    // TSV 本身是文本格式契约——serialize 输出入金（含制表符/空值的逐字节形态），parse 往返单独断言。
    expectGolden(import.meta.dir, 'core.L0.clipboard-tsv-roundtrip', `${tsv}\n`)
    expect(parseTsvToCells(tsv, fieldIds, tsvSchema)).toEqual([
      ['apple', 3, true],
      ['banana', null, false],
    ])
  })

  it('core.L0.clipboard-tsv-parse-matrix coerces typed cells across edge cases', () => {
    const schema: Schema = {
      fields: [
        { id: 't', name: 'Text', type: 'text', width: 100 },
        { id: 'n', name: 'Num', type: 'number', width: 100 },
        { id: 'c', name: 'Check', type: 'checkbox', width: 80 },
      ],
    }
    const fieldIds = ['t', 'n', 'c']

    // typeof 标注让 string("3") / number(3) / null / boolean 在黄金里一眼可分。
    const tag = (v: string | number | boolean | null): string =>
      v === null ? 'null' : `${typeof v}(${JSON.stringify(v)})`

    // 每条 = 一行 TSV 输入，覆盖各类型强制分支与结构边角。
    const inputs: ReadonlyArray<readonly [string, string]> = [
      ['number 合法整数', 'a\t42\ttrue'],
      ['number 空串→null', 'a\t\tfalse'],
      ['number 前后空白 trim', 'a\t  7  \t1'],
      ['number 科学计数', 'a\t1e3\tyes'],
      ['number 前导零', 'a\t007\tno'],
      ['number 负数', 'a\t-12.5\t0'],
      ['number 非法→保留 raw（applyPaste 决定 SKIP）', 'a\tabc\t'],
      ['checkbox true/1/yes', 'x\t0\ttrue'],
      ['checkbox 1', 'x\t0\t1'],
      ['checkbox YES 大小写', 'x\t0\tYES'],
      ['checkbox 未知→保留 raw', 'x\t0\tmaybe'],
      ['短行右侧补 null', 'only-text'],
      ['引号内 \\t 不分列', '"a\tb"\t5\ttrue'],
      ['引号内 "" 还原字面引号', '"say ""hi"""\t5\ttrue'],
    ]

    const lines: string[] = []
    for (const [label, tsv] of inputs) {
      const parsed = parseTsvToCells(tsv, fieldIds, schema)
      const cells = parsed[0]?.map(tag).join(' | ') ?? '(empty)'
      lines.push(`${label}: ${cells}`)
    }
    expectGolden(import.meta.dir, 'core.L0.clipboard-tsv-parse-matrix', `${lines.join('\n')}\n`)
  })

  it('core.L0.clipboard-paste-target-merge-conflict rejects partial merge overlap', () => {
    const target = computePasteTarget(
      { rowIndex: 0, colIndex: 0 },
      { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
      1,
      1,
      { rowCount: 4, colCount: 4 },
    )
    if (target === null) throw new Error('expected paste target')
    const merges = [
      {
        id: 'merge-1',
        range: { startRow: 0, endRow: 1, startCol: 0, endCol: 1 },
        anchor: { rowIndex: 0, colIndex: 0 },
      },
    ]
    expect(pasteTargetConflictsWithMerges(target, merges)).toBe(true)
  })
})
