import { describe, expect, it } from 'bun:test'
import {
  DefaultGridEngine,
  InMemoryDataSource,
  type DataSource,
  type DataSourceListener,
  type Row,
  type Schema,
} from '../../src'

const schema: Schema = {
  fields: [{ id: 'name', name: 'Name', type: 'text', width: 120 }],
}

describe('DefaultGridEngine.setCellValue', () => {
  it('writes one cell through the mutable data source', () => {
    const data = new InMemoryDataSource({ schema, rows: [{ name: 'Ada' }] })
    const engine = new DefaultGridEngine({ data })

    expect(engine.setCellValue({ rowIndex: 0, colIndex: 0 }, 'Grace')).toBe(true)

    expect(data.getCell(0, 'name')).toBe('Grace')
  })

  it('returns false for a read-only data source', () => {
    const data = new ReadonlyDataSource([{ name: 'Ada' }])
    const engine = new DefaultGridEngine({ data })

    expect(engine.setCellValue({ rowIndex: 0, colIndex: 0 }, 'Grace')).toBe(false)

    expect(data.getCell(0, 'name')).toBe('Ada')
  })

  it('returns false for an invalid address', () => {
    const data = new InMemoryDataSource({ schema, rows: [{ name: 'Ada' }] })
    const engine = new DefaultGridEngine({ data })

    expect(engine.setCellValue({ rowIndex: 1, colIndex: 0 }, 'Grace')).toBe(false)
    expect(engine.setCellValue({ rowIndex: 0, colIndex: 1 }, 'Grace')).toBe(false)

    expect(data.getCell(0, 'name')).toBe('Ada')
  })
})

class ReadonlyDataSource implements DataSource {
  constructor(private readonly rows: readonly Row[]) {}

  getRowCount(): number {
    return this.rows.length
  }

  getSchema(): Schema {
    return schema
  }

  getRows(startIndex: number, endIndex: number): Row[] {
    return this.rows.slice(startIndex, endIndex + 1)
  }

  getCell(rowIndex: number, fieldId: string) {
    return this.rows[rowIndex]?.[fieldId]
  }

  subscribe(_listener: DataSourceListener): () => void {
    return () => {}
  }
}
