import { describe, expect, it } from 'bun:test'
import {
  DefaultGridEngine,
  InMemoryDataSource,
  type DataSource,
  type DataSourceListener,
  type Row,
  type Schema,
} from '../../src'

function makeEngine() {
  return new DefaultGridEngine({
    data: new InMemoryDataSource({
      schema: {
        fields: [
          { id: 'a', name: 'A', type: 'text', width: 100 },
          { id: 'b', name: 'B', type: 'text', width: 100 },
        ],
      },
      rows: [{ a: 'A1', b: 'B1' }, { a: 'A2', b: 'B2' }],
    }),
  })
}

/**
 * OrderedViewDataSource maps view rows to raw rows via an explicit order array.
 * Mirrors the helper in DefaultGridEngine.test.ts.
 */
class OrderedViewDataSource implements DataSource {
  constructor(
    private readonly source: InMemoryDataSource,
    private readonly order: readonly number[],
  ) {}

  getRowCount(): number {
    return this.order.length
  }

  getSchema(): Schema {
    return this.source.getSchema()
  }

  getRows(startIndex: number, endIndex: number): Row[] {
    const rows: Row[] = []
    for (let viewRow = startIndex; viewRow <= endIndex; viewRow += 1) {
      const underlyingRow = this.order[viewRow]
      if (underlyingRow == null) continue
      const [row] = this.source.getRows(underlyingRow, underlyingRow)
      if (row) rows.push(row)
    }
    return rows
  }

  getCell(rowIndex: number, fieldId: string) {
    const underlyingRow = this.order[rowIndex]
    return underlyingRow == null ? undefined : this.source.getCell(underlyingRow, fieldId)
  }

  resolveUnderlyingRow(viewRow: number): number {
    return this.order[viewRow] ?? -1
  }

  findViewRow(underlyingRow: number): number {
    return this.order.indexOf(underlyingRow)
  }

  subscribe(_listener: DataSourceListener): () => void {
    return () => {}
  }
}

/**
 * ScatterViewDataSource gives `resolveUnderlyingRow` and `findViewRow` independent
 * control, allowing the test to simulate a state where the visible raw range check
 * (via resolveUnderlyingRow) passes but findViewRow returns scattered positions for
 * merge interior rows. This exposes the latent interior-scatter bug in mergeRegionToView
 * without requiring an architecturally-impossible consistent sort.
 *
 * Note: this is an intentionally inconsistent data source used only to probe the
 * mergeRegionToView code path that is latent (unreachable via a consistent sort) due
 * to the viewRangeToRawRange guard in resolveVisibleMergeRegions.
 */
class ScatterViewDataSource implements DataSource {
  constructor(
    private readonly source: InMemoryDataSource,
    /** resolveUnderlyingRow: viewRow → rawRow (used for visible-range contiguity check) */
    private readonly viewToRaw: readonly number[],
    /** findViewRow override: rawRow → viewRow (used by mergeRegionToView) */
    private readonly rawToView: readonly number[],
  ) {}

  getRowCount(): number {
    return this.viewToRaw.length
  }

  getSchema(): Schema {
    return this.source.getSchema()
  }

  getRows(startIndex: number, endIndex: number): Row[] {
    const rows: Row[] = []
    for (let viewRow = startIndex; viewRow <= endIndex; viewRow += 1) {
      const underlyingRow = this.viewToRaw[viewRow]
      if (underlyingRow == null) continue
      const [row] = this.source.getRows(underlyingRow, underlyingRow)
      if (row) rows.push(row)
    }
    return rows
  }

  getCell(rowIndex: number, fieldId: string) {
    const underlyingRow = this.viewToRaw[rowIndex]
    return underlyingRow == null ? undefined : this.source.getCell(underlyingRow, fieldId)
  }

  resolveUnderlyingRow(viewRow: number): number {
    return this.viewToRaw[viewRow] ?? -1
  }

  findViewRow(underlyingRow: number): number {
    return this.rawToView[underlyingRow] ?? -1
  }

  subscribe(_listener: DataSourceListener): () => void {
    return () => {}
  }
}

describe('DefaultGridEngine merge APIs', () => {
  it('merges, selects the merged range, and supports undo/redo', () => {
    const engine = makeEngine()
    const range = { startRow: 0, endRow: 1, startCol: 0, endCol: 1 }

    expect(engine.mergeCells(range)).toBe(true)
    expect(engine.getMergeRegion(1, 1)?.anchor).toEqual({ rowIndex: 0, colIndex: 0 })
    expect(engine.getSelection().selectedRange).toEqual(range)

    expect(engine.undo()?.kind).toBe('merge')
    expect(engine.getMergeRegion(1, 1)).toBeNull()
    expect(engine.redo()?.kind).toBe('merge')
    expect(engine.getMergeRegion(1, 1)?.id).toBe('merge-1')
  })

  it('unmerges any region touched by the target range', () => {
    const engine = makeEngine()
    engine.mergeCells({ startRow: 0, endRow: 1, startCol: 0, endCol: 1 })

    expect(engine.unmergeCells({ startRow: 1, endRow: 1, startCol: 1, endCol: 1 })).toBe(true)
    expect(engine.getMergeRegion(0, 0)).toBeNull()
  })

  // ---------------------------------------------------------------------------
  // mergeRegionToView interior-row contiguity tests
  //
  // Background: mergeRegionToView translates stored raw merge regions to view
  // coordinates. A sort can scatter a merge's interior rows in view space such
  // that the endpoint span coincidentally matches but interior rows are non-
  // contiguous — the render path must drop such regions (return null) rather
  // than emitting a corrupted view rectangle covering unrelated cells.
  //
  // The scatter scenario is architecturally latent: resolveVisibleMergeRegions
  // guards with viewRangeToRawRange which requires the visible viewport rows to
  // be raw-contiguous — a constraint that is incompatible with a consistent sort
  // that scatters interior rows. ScatterViewDataSource uses independent
  // resolveUnderlyingRow / findViewRow maps to probe the mergeRegionToView code
  // path directly without needing an architecturally-impossible consistent sort.
  // ---------------------------------------------------------------------------

  it('drops a merge region whose interior rows are scattered by a sort (no corrupted view rect)', () => {
    // 5 raw rows; merge raw rows 1-3 (3-row merge, interior = raw 2).
    const source = new InMemoryDataSource({
      schema: {
        fields: [
          { id: 'a', name: 'A', type: 'text', width: 100 },
          { id: 'b', name: 'B', type: 'text', width: 100 },
        ],
      },
      rows: [
        { a: 'r0', b: 'r0' },
        { a: 'r1', b: 'r1' },
        { a: 'r2', b: 'r2' },
        { a: 'r3', b: 'r3' },
        { a: 'r4', b: 'r4' },
      ],
    })

    // Build engine on identity view, then merge raw rows 1-3.
    const identityView = new OrderedViewDataSource(source, [0, 1, 2, 3, 4])
    const engine = new DefaultGridEngine({ data: identityView })
    engine.setViewportSize(400, 600) // large enough to show all 5 rows
    engine.mergeCells({ startRow: 1, endRow: 3, startCol: 0, endCol: 1 })

    // Sanity: merge is visible in identity view.
    expect(
      engine.getFrame().mergeRegions?.some((r) => r.range.startRow === 1 && r.range.endRow === 3),
    ).toBe(true)

    // ScatterViewDataSource:
    //   resolveUnderlyingRow (identity-like, so visible-range guard passes):
    //     view[0]=raw0, view[1]=raw1, view[2]=raw2, view[3]=raw3, view[4]=raw4
    //   findViewRow (scattered):
    //     raw0→view0, raw1→view2, raw2→view4, raw3→view2+2=4... wait:
    //
    // Scatter such that endpoint span coincidentally matches but interior is wrong:
    //   raw1→viewA=2, raw3→viewA+span=2+2=4 (span=2 matches range span 3-1=2 ✓)
    //   raw2→viewX=0 (NOT viewA+1=3 → scattered ✗)
    //
    // viewToRaw (identity, so visible rows 0-4 are raw-contiguous → guard passes):
    //   [0, 1, 2, 3, 4]
    // rawToView (scattered):
    //   raw0→0, raw1→2, raw2→0, raw3→4, raw4→1
    //   (raw1→2, raw3→4: endpoint span = 4-2 = 2 ✓ matches range span; raw2→0 ≠ 2+1 → interior scattered)
    const scatterView = new ScatterViewDataSource(
      source,
      [0, 1, 2, 3, 4], // viewToRaw: identity → visible range check passes
      [0, 2, 0, 4, 1], // rawToView: raw1→2, raw3→4 (span=2✓), raw2→0 (scattered interior)
    )
    engine.setViewData(scatterView, {
      oldResolveUnderlyingRow: (viewRow) => identityView.resolveUnderlyingRow(viewRow),
    })
    engine.setViewportSize(400, 600) // viewport is reset by setViewData; restore it

    // The merge must be dropped — no region with span 2 should appear.
    const frame = engine.getFrame()
    const suspectRegions = (frame.mergeRegions ?? []).filter(
      (r) => r.range.endRow - r.range.startRow === 2,
    )
    expect(suspectRegions).toHaveLength(0)
  })

  it('emits a merge region whose interior rows remain contiguous after a view change', () => {
    // 5 raw rows; merge raw rows 1-3 (3-row merge, interior = raw 2).
    const source = new InMemoryDataSource({
      schema: {
        fields: [
          { id: 'a', name: 'A', type: 'text', width: 100 },
          { id: 'b', name: 'B', type: 'text', width: 100 },
        ],
      },
      rows: [
        { a: 'r0', b: 'r0' },
        { a: 'r1', b: 'r1' },
        { a: 'r2', b: 'r2' },
        { a: 'r3', b: 'r3' },
        { a: 'r4', b: 'r4' },
      ],
    })

    const identityView = new OrderedViewDataSource(source, [0, 1, 2, 3, 4])
    const engine = new DefaultGridEngine({ data: identityView })
    engine.setViewportSize(400, 600)
    engine.mergeCells({ startRow: 1, endRow: 3, startCol: 0, endCol: 1 })

    // ScatterViewDataSource with contiguous findViewRow:
    //   viewToRaw: identity → visible-range guard passes
    //   rawToView: raw1→2, raw2→3, raw3→4 (ascending contiguous ✓)
    //   Merge raw 1-3 → view [2, 4], interior raw2→3=2+1 ✓
    const contiguousView = new ScatterViewDataSource(
      source,
      [0, 1, 2, 3, 4], // viewToRaw: identity
      [0, 2, 3, 4, 1], // rawToView: raw1→2, raw2→3, raw3→4 (contiguous)
    )
    engine.setViewData(contiguousView, {
      oldResolveUnderlyingRow: (viewRow) => identityView.resolveUnderlyingRow(viewRow),
    })
    engine.setViewportSize(400, 600) // viewport is reset by setViewData; restore it

    const frame = engine.getFrame()
    const region = (frame.mergeRegions ?? []).find(
      (r) => r.range.endRow - r.range.startRow === 2 && r.range.startCol === 0,
    )
    expect(region).toBeDefined()
    expect(region?.range.startRow).toBe(2)
    expect(region?.range.endRow).toBe(4)
  })

  it('补发滚出可见范围的合并 anchor 格式，保证滚动后合并填充仍渲染', () => {
    const engine = new DefaultGridEngine({
      data: new InMemoryDataSource({
        schema: {
          fields: [
            { id: 'a', name: 'A', type: 'text', width: 100 },
            { id: 'b', name: 'B', type: 'text', width: 100 },
          ],
        },
        rows: Array.from({ length: 8 }, (_, i) => ({ a: `A${i}`, b: `B${i}` })),
      }),
    })
    engine.mergeCells({ startRow: 0, endRow: 5, startCol: 0, endCol: 1 })
    engine.setFillColor({ startRow: 0, endRow: 5, startCol: 0, endCol: 1 }, '#fff2cc')

    // rowHeight=28：下滚两行（56px）把 anchor row0 滚出可见扫描范围，合并区域 rows0-5 仍与视口相交。
    engine.setViewportSize(400, 200)
    engine.setScroll(0, 56)

    const frame = engine.getFrame()
    const [firstVisible] = frame.rowsAxis.getVisibleRange(
      frame.viewport.scrollY,
      frame.viewport.scrollY + frame.viewport.contentRect.height,
    )
    expect(firstVisible).toBeGreaterThan(0) // anchor row0 确实滚出可见扫描范围（非普通扫描命中）

    const anchorFmt = frame.cellFormats?.find((f) => f.rowIndex === 0 && f.colIndex === 0)
    expect(anchorFmt?.format.fillColor).toBe('#fff2cc')
  })
})
