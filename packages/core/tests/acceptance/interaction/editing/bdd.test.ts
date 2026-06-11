import { describe, expect, it } from 'bun:test'

import {
  DefaultGridEngine,
  InMemoryDataSource,
  computeFillTarget,
  computeFillWrites,
  formatCellForEdit,
  isEditableFieldType,
  isTypableEditKey,
  parseCellEditInput,
  type CellRange,
  type CellValue,
  type PasteSkippedCell,
  type Row,
  type Schema,
} from '../../../../src'

import { afterEach } from 'bun:test'
import {
  mountRecordingGrid,
  setNavigatorClipboard,
  singleCellSelection,
  createClipboardStub,
} from '../../_helpers/fixtures'
import { expectGolden } from '../../_helpers/golden'

describe('Core acceptance editing', () => {
const clipboardSchema: Schema = {
  fields: [
    { id: 'name', name: 'Name', type: 'text', width: 120 },
    { id: 'score', name: 'Score', type: 'number', width: 80 },
  ],
}

const fillSchema: Schema = {
  fields: [
    { id: 'a', name: 'A', type: 'text', width: 80 },
    { id: 'b', name: 'B', type: 'number', width: 80 },
  ],
}

function createClipboardData(): InMemoryDataSource {
  return new InMemoryDataSource({
    schema: clipboardSchema,
    rows: [
      { name: 'Ada', score: 10 },
      { name: 'Grace', score: 20 },
      { name: 'Lin', score: 30 },
    ] satisfies Row[],
  })
}

function createFillEngine(): DefaultGridEngine {
  return new DefaultGridEngine({
    data: new InMemoryDataSource({
      schema: fillSchema,
      rows: [
        { a: 'Item 1', b: 1 },
        { a: 'Item 2', b: 3 },
        { a: null, b: null },
        { a: null, b: null },
      ] satisfies Row[],
    }),
  })
}

function fillRange(
  startRow: number,
  endRow: number,
  startCol: number,
  endCol: number,
): CellRange {
  return { startRow, endRow, startCol, endCol }
}

describe('Core BDD Batch 5 clipboard edit fill scenarios', () => {
  afterEach(() => setNavigatorClipboard(undefined))

  it('core.L2.grid-clipboard-copy-cut-paste-roundtrip copies and cuts through Grid facade', async () => {
    const data = createClipboardData()
    const copyRanges: CellRange[] = []
    const cutRanges: CellRange[] = []
    const pasteRanges: CellRange[] = []
    const stub = createClipboardStub()
    stub.install()

    const { container, grid } = mountRecordingGrid({
      data,
      onCopy: (range) => copyRanges.push(range),
      onCut: (range) => cutRanges.push(range),
      onPaste: (range) => pasteRanges.push(range),
    })

    grid.setSelection(singleCellSelection(0, 0))
    expect(await grid.copy()).toBe(true)
    expect(copyRanges[0]).toEqual(fillRange(0, 0, 0, 0))
    expect(stub.getText()).toBe('Ada')

    grid.setSelection(singleCellSelection(2, 0))
    expect(await grid.paste()).toBe(true)
    expect(data.getCell(2, 'name')).toBe('Ada')
    expect(pasteRanges[0]).toEqual(fillRange(2, 2, 0, 0))

    grid.setSelection(singleCellSelection(1, 0))
    expect(await grid.cut()).toBe(true)
    expect(cutRanges[0]).toEqual(fillRange(1, 1, 0, 0))
    expect(data.getCell(1, 'name')).toBeNull()

    grid.setSelection(singleCellSelection(2, 0))
    expect(await grid.paste()).toBe(true)
    expect(data.getCell(2, 'name')).toBe('Grace')

    grid.destroy()
    document.body.removeChild(container)
  })

  it('core.L2.grid-clipboard-paste-skipped-readonly-type reports type skips', async () => {
    const data = createClipboardData()
    const skipped: PasteSkippedCell[] = []
    const stub = createClipboardStub('not-a-number')
    stub.install()

    const { container, grid } = mountRecordingGrid({
      data,
      onPasteSkipped: (cells) => skipped.push(...cells),
    })

    grid.setSelection(singleCellSelection(0, 1))
    expect(await grid.paste()).toBe(true)
    expect(skipped).toEqual([{ rowIndex: 0, fieldId: 'score', reason: 'type' }])
    expect(data.getCell(0, 'score')).toBe(10)

    grid.destroy()
    document.body.removeChild(container)
  })

  it('core.L0.edit-parse-format classifies editable types and parses input', () => {
    expect(isEditableFieldType('text')).toBe(true)
    expect(isEditableFieldType('number')).toBe(true)
    expect(isEditableFieldType('checkbox')).toBe(false)
    expect(formatCellForEdit(42, 'number')).toBe('42')
    expect(parseCellEditInput('3.5', 'number')).toBe(3.5)
    expect(parseCellEditInput('abc', 'number')).toBe(undefined)
    expect(isTypableEditKey('a', {})).toBe(true)
    expect(isTypableEditKey('Enter', {})).toBe(false)
  })

  it('core.L2.grid-fill-series-down-right computes target writes and commits fill', () => {
    const source = fillRange(0, 1, 0, 1)
    const dims = { rowCount: 4, colCount: 2 }
    const target = computeFillTarget(source, { rowIndex: 3, colIndex: 1 }, dims)
    expect(target?.direction).toBe('down')
    expect(target?.fill).toEqual(fillRange(2, 3, 0, 1))

    const engine = createFillEngine()
    const writes = computeFillWrites({
      data: engine.getData(),
      source,
      fill: target!.fill,
      direction: 'down',
    })
    expect(writes.some((write) => write.fieldId === 'b' && write.value === 5)).toBe(true)

    engine.commitFill(source, target!.fill, 'down')
    expect(engine.getData().getCell(2, 'b')).toBe(5)
    expect(engine.getData().getCell(3, 'b')).toBe(7)
  })

  it('core.L0.fill-series-projection-matrix extrapolates series patterns', () => {
    // 每条 = 一列源样本 → 向下填充 6 行的投影序列。覆盖 inferProjector 全部分支：
    // 单样本 clone、等差数、文本尾号（含补零/过零）、日期等步、非等差回退取样循环。
    const schema: Schema = { fields: [{ id: 'v', name: 'V', type: 'text', width: 100 }] }
    // Date 用固定毫秒构造，dump 用 ISO（UTC）——序列本身确定，无本地时区抖动。
    const day = 86_400_000
    const base = Date.UTC(2024, 0, 1)
    const cases: ReadonlyArray<readonly [string, readonly CellValue[]]> = [
      ['单样本 clone', [7]],
      ['等差 +1', [1, 2]],
      ['等差 +10', [10, 20]],
      ['等差递减 -3', [9, 6]],
      ['文本尾号 +1', ['Item 1', 'Item 2']],
      ['文本尾号补零保宽', ['Q01', 'Q02']],
      ['文本尾号过零', ['n -1', 'n 0']],
      ['日期按日等步', [new Date(base), new Date(base + day)]],
      ['非等差→回退取样循环', [1, 2, 4]],
      ['纯文本无尾号→循环重复', ['a', 'b']],
    ]

    const fmt = (v: CellValue): string =>
      v instanceof Date ? v.toISOString() : v === null ? 'null' : JSON.stringify(v)

    const lines: string[] = []
    for (const [label, samples] of cases) {
      const data = new InMemoryDataSource({
        schema,
        rows: samples.map((v) => ({ v })) as Row[],
      })
      const source = fillRange(0, samples.length - 1, 0, 0)
      const fill = fillRange(0, 5, 0, 0) // 投影前 6 行（含源），看完整外推
      const writes = computeFillWrites({ data, source, fill, direction: 'down' })
      const seq = writes.map((w) => fmt(w.value)).join(', ')
      lines.push(`${label}: [${seq}]`)
    }
    expectGolden(import.meta.dir, 'core.L0.fill-series-projection-matrix', `${lines.join('\n')}\n`)
  })

  it('core.L2.grid-fill-style-propagates copies fill color to target cells', () => {
    const engine = createFillEngine()
    engine.setFillColor(fillRange(0, 0, 0, 0), '#ff0000')
    engine.commitFill(fillRange(0, 0, 0, 0), fillRange(1, 2, 0, 0), 'down')
    expect(engine.getViewCellFormat(1, 0)?.fillColor).toBe('#ff0000')
    expect(engine.getViewCellFormat(2, 0)?.fillColor).toBe('#ff0000')
  })
})
})
