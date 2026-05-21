import type { DataSource } from '../data/DataSource'
import type { CellValue } from '../data/Schema'
import type { CellRange } from '../interaction/SelectionModel'
import type { FillDirection } from './FillTarget'

export interface FillWrite {
  readonly rowIndex: number
  readonly colIndex: number
  readonly fieldId: string
  readonly value: CellValue
}

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

export function computeFillWrites(input: ComputeFillWritesInput): readonly FillWrite[] {
  const fields = input.data.getSchema().fields
  const writes: FillWrite[] = []

  if (input.direction === 'down' || input.direction === 'up') {
    const projectors = new Map<number, SeriesProjector>()
    for (let colIndex = input.fill.startCol; colIndex <= input.fill.endCol; colIndex += 1) {
      const field = fields[colIndex]
      if (!field) continue
      projectors.set(colIndex, inferProjector(readVerticalSamples(input.data, input.source, field.id)))
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
    projectors.set(rowIndex, inferProjector(readHorizontalSamples(input.data, input.source, rowIndex)))
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
  if (!samples.every((sample): sample is number => typeof sample === 'number' && Number.isFinite(sample))) return null
  const delta = samples[1]! - samples[0]!
  for (let i = 2; i < samples.length; i += 1) {
    if (samples[i]! - samples[i - 1]! !== delta) return null
  }
  const first = samples[0]!
  return (offset) => first + delta * offset
}

function inferDateProjector(samples: readonly CellValue[]): SeriesProjector | null {
  if (!samples.every((sample): sample is Date => sample instanceof Date && Number.isFinite(sample.getTime()))) return null
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
  return (offset) => `${prefix}${String(first.numeric + delta * offset).padStart(width, '0')}`
}

function parseTextTailSample(value: CellValue): TextTailSample | null {
  if (typeof value !== 'string') return null
  const match = /^(.*?)(\d+)$/.exec(value)
  if (!match) return null
  return {
    prefix: match[1]!,
    numeric: Number(match[2]!),
    width: match[2]!.length,
  }
}

function cloneCellValue(value: CellValue): CellValue {
  return value instanceof Date ? new Date(value.getTime()) : value
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor
}
