import type { DataSource } from '../kernel/data/DataSource'
import type { CellValue } from '../kernel/data/Schema'
import type { CellRange } from '../engine/selection/SelectionTypes'
import type { FillDirection } from './FillTarget'

/** 一次 fill commit 要写入的单元格值；colIndex 保留给 web 层和测试按自然网格顺序断言。 */
export interface FillWrite {
  readonly rowIndex: number
  readonly colIndex: number
  readonly fieldId: string
  readonly value: CellValue
}

/** 计算填充值所需的只读输入；函数本身不写 DataSource。 */
export interface ComputeFillWritesInput {
  readonly data: DataSource
  readonly source: CellRange
  readonly fill: CellRange
  readonly direction: FillDirection
}

type SeriesProjector = (offset: number) => CellValue

interface TextTailSample {
  readonly prefix: string
  readonly numeric: number
  readonly width: number
}

/** 生成 fill range 的写入列表；垂直按列推导，水平按行推导，输出保持 row-major 顺序。 */
export function computeFillWrites(input: ComputeFillWritesInput): readonly FillWrite[] {
  const fields = input.data.getSchema().fields
  const writes: FillWrite[] = []

  if (input.direction === 'down' || input.direction === 'up') {
    const projectors = new Map<number, SeriesProjector>()
    for (let colIndex = input.fill.startCol; colIndex <= input.fill.endCol; colIndex += 1) {
      const field = fields[colIndex]
      if (!field) continue
      projectors.set(
        colIndex,
        inferProjector(readVerticalSamples(input.data, input.source, field.id)),
      )
    }

    for (let rowIndex = input.fill.startRow; rowIndex <= input.fill.endRow; rowIndex += 1) {
      for (let colIndex = input.fill.startCol; colIndex <= input.fill.endCol; colIndex += 1) {
        const field = fields[colIndex]
        const projector = projectors.get(colIndex)
        if (!field || !projector) continue
        writes.push({
          rowIndex,
          colIndex,
          fieldId: field.id,
          value: projector(rowIndex - input.source.startRow),
        })
      }
    }
    return writes
  }

  const projectors = new Map<number, SeriesProjector>()
  for (let rowIndex = input.fill.startRow; rowIndex <= input.fill.endRow; rowIndex += 1) {
    projectors.set(
      rowIndex,
      inferProjector(readHorizontalSamples(input.data, input.source, rowIndex)),
    )
  }

  for (let rowIndex = input.fill.startRow; rowIndex <= input.fill.endRow; rowIndex += 1) {
    const projector = projectors.get(rowIndex)
    if (!projector) continue
    for (let colIndex = input.fill.startCol; colIndex <= input.fill.endCol; colIndex += 1) {
      const field = fields[colIndex]
      if (!field) continue
      writes.push({
        rowIndex,
        colIndex,
        fieldId: field.id,
        value: projector(colIndex - input.source.startCol),
      })
    }
  }
  return writes
}

function readVerticalSamples(data: DataSource, source: CellRange, fieldId: string): CellValue[] {
  const samples: CellValue[] = []
  for (let rowIndex = source.startRow; rowIndex <= source.endRow; rowIndex += 1) {
    samples.push(readCell(data, rowIndex, fieldId))
  }
  return samples
}

function readHorizontalSamples(data: DataSource, source: CellRange, rowIndex: number): CellValue[] {
  const fields = data.getSchema().fields
  const samples: CellValue[] = []
  for (let colIndex = source.startCol; colIndex <= source.endCol; colIndex += 1) {
    const field = fields[colIndex]
    samples.push(field ? readCell(data, rowIndex, field.id) : null)
  }
  return samples
}

function readCell(data: DataSource, rowIndex: number, fieldId: string): CellValue {
  return data.getCell(rowIndex, fieldId) ?? null
}

function inferProjector(samples: readonly CellValue[]): SeriesProjector {
  if (samples.length === 0) return () => null
  if (samples.length === 1) return () => cloneCellValue(samples[0]!)

  const numberProjector = inferNumberProjector(samples)
  if (numberProjector) return numberProjector

  const dateProjector = inferDateProjector(samples)
  if (dateProjector) return dateProjector

  const textProjector = inferTextTailProjector(samples)
  if (textProjector) return textProjector

  return (offset) => cloneCellValue(samples[positiveModulo(offset, samples.length)]!)
}

function inferNumberProjector(samples: readonly CellValue[]): SeriesProjector | null {
  if (
    !samples.every(
      (sample): sample is number => typeof sample === 'number' && Number.isFinite(sample),
    )
  )
    return null
  const delta = samples[1]! - samples[0]!
  for (let i = 2; i < samples.length; i += 1) {
    if (samples[i]! - samples[i - 1]! !== delta) return null
  }
  const first = samples[0]!
  return (offset) => first + delta * offset
}

function inferDateProjector(samples: readonly CellValue[]): SeriesProjector | null {
  if (
    !samples.every(
      (sample): sample is Date => sample instanceof Date && Number.isFinite(sample.getTime()),
    )
  )
    return null
  const times = samples.map((sample) => sample.getTime())
  const delta = times[1]! - times[0]!
  for (let i = 2; i < times.length; i += 1) {
    if (times[i]! - times[i - 1]! !== delta) return null
  }
  const first = times[0]!
  return (offset) => new Date(first + delta * offset)
}

function inferTextTailProjector(samples: readonly CellValue[]): SeriesProjector | null {
  const parsed = samples.map(parseTextTailSample)
  if (parsed.some((sample) => sample === null)) return null

  const textSamples = parsed as TextTailSample[]
  const prefix = textSamples[0]!.prefix
  if (!textSamples.every((sample) => sample.prefix === prefix)) return null

  const delta = textSamples[1]!.numeric - textSamples[0]!.numeric
  for (let i = 2; i < textSamples.length; i += 1) {
    if (textSamples[i]!.numeric - textSamples[i - 1]!.numeric !== delta) return null
  }

  const first = textSamples[0]!
  const width = Math.max(...textSamples.map((sample) => sample.width))
  return (offset) => `${prefix}${formatTextTailNumber(first.numeric + delta * offset, width)}`
}

function parseTextTailSample(value: CellValue): TextTailSample | null {
  if (typeof value !== 'string') return null
  // 符号属于尾号本身，而不是 prefix；否则 Item -1 过零会格式化成 Item --1。
  const match = /^(.*?)([+-]?\d+)$/.exec(value)
  if (!match) return null
  const digits = match[2]!.replace(/^[+-]/, '')
  return {
    prefix: match[1]!,
    numeric: Number(match[2]!),
    width: digits.length,
  }
}

function formatTextTailNumber(value: number, width: number): string {
  const sign = value < 0 ? '-' : ''
  return `${sign}${String(Math.abs(value)).padStart(width, '0')}`
}

function cloneCellValue(value: CellValue): CellValue {
  return value instanceof Date ? new Date(value.getTime()) : value
}

/** 始终返回非负余数，使 fill 平铺/取样在源轴上正确循环。 */
export function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor
}
