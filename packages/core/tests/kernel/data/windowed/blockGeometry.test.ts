import { describe, expect, it } from 'bun:test'
import {
  blockKey,
  blockToWindow,
  clampWindow,
  expandWindow,
  mergeBlocksIntoRects,
  windowsEqual,
  windowToBlocks,
} from '../../../../src/kernel/data/windowed/blockGeometry'

describe('blockGeometry', () => {
  it('windowsEqual compares by value, treats null correctly', () => {
    const a = { startRow: 0, endRow: 9, startCol: 0, endCol: 1 }
    const b = { startRow: 0, endRow: 9, startCol: 0, endCol: 1 }
    const c = { startRow: 0, endRow: 8, startCol: 0, endCol: 1 }
    expect(windowsEqual(a, b)).toBe(true)
    expect(windowsEqual(a, c)).toBe(false)
    expect(windowsEqual(null, null)).toBe(true)
    expect(windowsEqual(a, null)).toBe(false)
  })

  it('clampWindow clamps to [0, count-1] on both axes', () => {
    expect(clampWindow({ startRow: -5, endRow: 200, startCol: -1, endCol: 50 }, 100, 10)).toEqual({
      startRow: 0,
      endRow: 99,
      startCol: 0,
      endCol: 9,
    })
  })

  it('expandWindow doubles span symmetrically for preloadScreens=2 and clamps at data edges', () => {
    // rowSpan = 10 (0..9), preloadScreens=2 → margin = floor(10*(2-1)/2) = 5
    const expanded = expandWindow({ startRow: 20, endRow: 29, startCol: 0, endCol: 1 }, 2, 1000, 2)
    expect(expanded).toEqual({ startRow: 15, endRow: 34, startCol: 0, endCol: 1 })

    // near top edge: margin pushes startRow negative, must clamp to 0
    const nearEdge = expandWindow({ startRow: 0, endRow: 9, startCol: 0, endCol: 1 }, 2, 1000, 2)
    expect(nearEdge).toEqual({ startRow: 0, endRow: 14, startCol: 0, endCol: 1 })
  })

  it('windowToBlocks enumerates all intersecting block coordinates, row-major, dedup by construction', () => {
    // blockRows=10, blockCols=10; window spans blockRow 0-1, blockCol 0-1
    const blocks = windowToBlocks({ startRow: 5, endRow: 15, startCol: 5, endCol: 15 }, 10, 10)
    expect(blocks).toEqual([
      { blockRow: 0, blockCol: 0 },
      { blockRow: 0, blockCol: 1 },
      { blockRow: 1, blockCol: 0 },
      { blockRow: 1, blockCol: 1 },
    ])
  })

  it('windowToBlocks returns empty for an inverted (empty) window', () => {
    expect(windowToBlocks({ startRow: 5, endRow: 2, startCol: 0, endCol: 1 }, 10, 10)).toEqual([])
  })

  it('blockToWindow returns the block rectangle clamped to data bounds', () => {
    expect(blockToWindow({ blockRow: 0, blockCol: 0 }, 10, 10, 1000, 25)).toEqual({
      startRow: 0,
      endRow: 9,
      startCol: 0,
      endCol: 9,
    })
    // last column block: blockCol=2 covers cols 20..29, colCount=25 → clamp endCol to 24
    expect(blockToWindow({ blockRow: 0, blockCol: 2 }, 10, 10, 1000, 25)).toEqual({
      startRow: 0,
      endRow: 9,
      startCol: 20,
      endCol: 24,
    })
  })

  it('blockKey is stable and distinct per coordinate pair', () => {
    expect(blockKey(1, 2)).toBe('1:2')
    expect(blockKey(1, 2)).not.toBe(blockKey(2, 1))
  })

  it('mergeBlocksIntoRects merges horizontally-adjacent blocks within a blockRow only', () => {
    const groups = mergeBlocksIntoRects(
      [
        { blockRow: 0, blockCol: 0 },
        { blockRow: 0, blockCol: 1 },
        { blockRow: 0, blockCol: 3 }, // gap at blockCol 2 — separate group
        { blockRow: 1, blockCol: 0 }, // different blockRow — never merges with blockRow 0
      ],
      10,
      10,
      1000,
      100,
    )
    expect(groups).toHaveLength(3)
    const byFirstBlock = new Map(groups.map((g) => [blockKey(g.blocks[0]!.blockRow, g.blocks[0]!.blockCol), g]))

    const merged01 = byFirstBlock.get('0:0')!
    expect(merged01.blocks).toEqual([
      { blockRow: 0, blockCol: 0 },
      { blockRow: 0, blockCol: 1 },
    ])
    expect(merged01.window).toEqual({ startRow: 0, endRow: 9, startCol: 0, endCol: 19 })

    const solo3 = byFirstBlock.get('0:3')!
    expect(solo3.blocks).toEqual([{ blockRow: 0, blockCol: 3 }])
    expect(solo3.window).toEqual({ startRow: 0, endRow: 9, startCol: 30, endCol: 39 })

    const row1 = byFirstBlock.get('1:0')!
    expect(row1.window).toEqual({ startRow: 10, endRow: 19, startCol: 0, endCol: 9 })
  })
})
