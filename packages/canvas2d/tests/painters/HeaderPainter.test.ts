import { describe, expect, it } from 'bun:test'
import { ChunkedAxis, denseGridTheme, type Schema, type ViewPipeline } from '@novasheet/core'
import { HeaderPainter } from '../../src/painters/HeaderPainter'
import { createRecordingContext } from '../helpers/recording-context'

const SCHEMA: Schema = {
  fields: [
    { id: 'name', name: 'Name', type: 'text', width: 200 },
    { id: 'age', name: 'Age', type: 'number', width: 80 },
    { id: 'flag', name: 'Active', type: 'checkbox', width: 60 },
  ],
}

describe('HeaderPainter — 列头', () => {
  it('按 headerHeight 铺满列头背景', () => {
    const { ctx, ops } = createRecordingContext()
    const colsAxis = new ChunkedAxis({ count: 3, defaultSize: 100 })
    new HeaderPainter(denseGridTheme).paint(ctx, {
      schema: SCHEMA,
      colsAxis,
      colRange: [0, 2],
      width: 400,
    })
    const bgFill = ops.find(
      (o) =>
        o.op === 'fillRect' && o.args[1] === 0 && o.args[3] === denseGridTheme.metrics.headerHeight,
    )
    expect(bgFill).toBeDefined()
    expect(ops).toContainEqual({
      op: 'set:fillStyle',
      value: denseGridTheme.colors.headerBackground,
    })
  })

  it('绘制可见列名字段名', () => {
    const { ctx, ops } = createRecordingContext()
    const colsAxis = new ChunkedAxis({ count: 3, defaultSize: 100 })
    new HeaderPainter(denseGridTheme).paint(ctx, {
      schema: SCHEMA,
      colsAxis,
      colRange: [0, 2],
      width: 400,
    })
    const texts = ops
      .filter((o) => o.op === 'fillText')
      .map((o) => (o.op === 'fillText' ? o.args[0] : ''))
    expect(texts).toContain('Name')
    expect(texts).toContain('Age')
    expect(texts).toContain('Active')
  })

  it('headerTextAlign=center 时叶头字段名水平居中', () => {
    const theme = {
      ...denseGridTheme,
      cell: { ...denseGridTheme.cell, headerTextAlign: 'center' as const },
    }
    const { ctx, ops } = createRecordingContext()
    const colsAxis = new ChunkedAxis({ count: 1, defaultSize: 100 })
    new HeaderPainter(theme).paint(ctx, {
      schema: {
        fields: [{ id: 'c0', name: '簇1', type: 'text', width: 100 }],
      },
      colsAxis,
      colRange: [0, 0],
      width: 100,
    })
    expect(ops).toContainEqual({ op: 'set:textAlign', value: 'center' })
    const nameTxt = ops.find(
      (o): o is { op: 'fillText'; args: [string, number, number, number?] } =>
        o.op === 'fillText' && o.args[0] === '簇1',
    )
    expect(nameTxt).toBeDefined()
    // x = colLeft + colWidth/2 = 50
    expect(nameTxt!.args[1]).toBe(50)
  })

  it('绘制过滤状态图标并为文字预留空间（排序箭头不再显示）', () => {
    const { ctx, ops } = createRecordingContext()
    const colsAxis = new ChunkedAxis({ count: 3, defaultSize: 100 })
    const viewPipeline = {
      collectHeaderDecorations: (field: { id: string }) =>
        field.id === 'name' ? { sortIndicator: 'asc' as const, filterActive: true } : {},
    } as Pick<ViewPipeline, 'collectHeaderDecorations'>

    new HeaderPainter(denseGridTheme).paint(ctx, {
      schema: SCHEMA,
      colsAxis,
      colRange: [0, 2],
      width: 400,
      viewPipeline,
    })

    // 只有 filterActive 图标（1个），sortIndicator 不再渲染
    expect(ops.filter((o) => o.op === 'fillPath')).toHaveLength(1)
    const nameTxt = ops.find(
      (o): o is { op: 'fillText'; args: [string, number, number, number?] } =>
        o.op === 'fillText' && o.args[0] === 'Name',
    )
    expect(nameTxt).toBeDefined()
    expect(nameTxt!.args[3]).toBeLessThan(100 - denseGridTheme.metrics.cellPaddingX * 2)
  })

  it('列头文字使用 headerText 色', () => {
    const { ctx, ops } = createRecordingContext()
    const colsAxis = new ChunkedAxis({ count: 3, defaultSize: 100 })
    new HeaderPainter(denseGridTheme).paint(ctx, {
      schema: SCHEMA,
      colsAxis,
      colRange: [0, 2],
      width: 400,
    })
    expect(ops).toContainEqual({ op: 'set:fillStyle', value: denseGridTheme.colors.headerText })
  })

  it('整列选中时列头使用强选中背景与选中文字色', () => {
    const { ctx, ops } = createRecordingContext()
    const colsAxis = new ChunkedAxis({ count: 3, defaultSize: 100 })
    new HeaderPainter(denseGridTheme).paint(ctx, {
      schema: SCHEMA,
      colsAxis,
      colRange: [0, 2],
      width: 400,
      selectedColumnRange: { startCol: 1, endCol: 1 },
    })

    expect(ops).toContainEqual({ op: 'set:fillStyle', value: denseGridTheme.colors.selectionBorder })
    expect(ops).toContainEqual({
      op: 'fillRect',
      args: [100, 0, 100, denseGridTheme.metrics.headerHeight],
    })
    const selectedTextColorIndex = ops.findIndex(
      (o) => o.op === 'set:fillStyle' && o.value === denseGridTheme.colors.selectionText,
    )
    const ageTextIndex = ops.findIndex((o) => o.op === 'fillText' && o.args[0] === 'Age')
    expect(selectedTextColorIndex).toBeGreaterThan(-1)
    expect(ageTextIndex).toBeGreaterThan(selectedTextColorIndex)
  })

  it('scrollOffsetX 使列头随横向滚动', () => {
    const { ctx, ops } = createRecordingContext()
    const colsAxis = new ChunkedAxis({ count: 3, defaultSize: 100 })
    new HeaderPainter(denseGridTheme).paint(ctx, {
      schema: SCHEMA,
      colsAxis,
      colRange: [0, 2],
      width: 400,
      scrollOffsetX: 100, // scrolled right by one column-width
    })
    // 'Name' is field 0 (at content x=0). With scrollOffsetX=100 and padX=8:
    //   without subtraction → x = 0 + 8 = 8 (wrong: drawn at the LEFT edge after scroll)
    //   with subtraction    → x = 0 - 100 + 8 = -92 (correct: clipped off-canvas left)
    // 'Age' is field 1 (at content x=100). With scrollOffsetX=100:
    //   with subtraction → x = 100 - 100 + 8 = 8 (now at the LEFT edge — the new leftmost visible col)
    const nameTxt = ops.find(
      (o): o is { op: 'fillText'; args: [string, number, number, number?] } =>
        o.op === 'fillText' && o.args[0] === 'Name',
    )
    const ageTxt = ops.find(
      (o): o is { op: 'fillText'; args: [string, number, number, number?] } =>
        o.op === 'fillText' && o.args[0] === 'Age',
    )
    expect(nameTxt).toBeDefined()
    expect(nameTxt!.args[1]).toBe(-92)
    expect(ageTxt).toBeDefined()
    expect(ageTxt!.args[1]).toBe(8)
  })

  it('绘制列头单元格竖线与底边', () => {
    const { ctx, ops } = createRecordingContext()
    const colsAxis = new ChunkedAxis({ count: 3, defaultSize: 100 })
    new HeaderPainter(denseGridTheme).paint(ctx, {
      schema: SCHEMA,
      colsAxis,
      colRange: [0, 2],
      width: 400,
    })
    expect(ops.some((o) => o.op === 'stroke')).toBe(true)
    const strokeStyle = ops.find(
      (o) => o.op === 'set:strokeStyle' && o.value === denseGridTheme.colors.gridLine,
    )
    expect(strokeStyle).toBeDefined()
  })

  it('columnLetters 绘制 Excel 列标', () => {
    const { ctx, ops } = createRecordingContext()
    const colsAxis = new ChunkedAxis({ count: 3, defaultSize: 100 })
    new HeaderPainter(denseGridTheme).paint(ctx, {
      schema: SCHEMA,
      colsAxis,
      colRange: [0, 2],
      width: 400,
      columnLetters: true,
    })
    const texts = ops
      .filter((o) => o.op === 'fillText')
      .map((o) => (o.op === 'fillText' ? o.args[0] : ''))
    expect(texts).toEqual(['A', 'B', 'C'])
  })

  it('省略 scrollOffsetX 时默认为 0', () => {
    const { ctx, ops } = createRecordingContext()
    const colsAxis = new ChunkedAxis({ count: 3, defaultSize: 100 })
    new HeaderPainter(denseGridTheme).paint(ctx, {
      schema: SCHEMA,
      colsAxis,
      colRange: [0, 2],
      width: 400,
      // scrollOffsetX omitted
    })
    const nameTxt = ops.find(
      (o): o is { op: 'fillText'; args: [string, number, number, number?] } =>
        o.op === 'fillText' && o.args[0] === 'Name',
    )
    expect(nameTxt!.args[1]).toBe(8) // x = 0 + padX
  })
})

describe('HeaderPainter — hover menu button', () => {
  const SCHEMA_TWO: Schema = {
    fields: [
      { id: 'a', name: 'A', type: 'text', width: 100 },
      { id: 'b', name: 'B', type: 'text', width: 100 },
    ],
  }

  it('paints arc (circle bg) only when buttonHovered=true', () => {
    const { ctx, ops } = createRecordingContext()
    const colsAxis = new ChunkedAxis({ count: 2, defaultSize: 100 })
    new HeaderPainter(denseGridTheme).paint(ctx, {
      schema: SCHEMA_TWO,
      colsAxis,
      colRange: [0, 1],
      width: 200,
      hoveredColumnHeaderMenu: { colIndex: 1, buttonHovered: true },
    })
    const arcs = ops.filter((o) => o.op === 'arc')
    expect(arcs.length).toBe(1)
  })

  it('does not paint arc when buttonHovered=false (triangle still shown)', () => {
    const { ctx, ops } = createRecordingContext()
    const colsAxis = new ChunkedAxis({ count: 2, defaultSize: 100 })
    new HeaderPainter(denseGridTheme).paint(ctx, {
      schema: SCHEMA_TWO,
      colsAxis,
      colRange: [0, 1],
      width: 200,
      hoveredColumnHeaderMenu: { colIndex: 1, buttonHovered: false },
    })
    const arcs = ops.filter((o) => o.op === 'arc')
    expect(arcs.length).toBe(0)
    // triangle fill still present
    const fills = ops.filter((o) => o.op === 'fill')
    expect(fills.length).toBeGreaterThan(0)
  })

  it('paints triangle fill for hovered column', () => {
    const { ctx, ops } = createRecordingContext()
    const colsAxis = new ChunkedAxis({ count: 2, defaultSize: 100 })
    new HeaderPainter(denseGridTheme).paint(ctx, {
      schema: SCHEMA_TWO,
      colsAxis,
      colRange: [0, 1],
      width: 200,
      hoveredColumnHeaderMenu: { colIndex: 1, buttonHovered: true },
    })
    const fills = ops.filter((o) => o.op === 'fill')
    expect(fills.length).toBeGreaterThan(0)
  })

  it('does not paint button when no hoveredColumnHeaderMenu', () => {
    const { ctx, ops } = createRecordingContext()
    const colsAxis = new ChunkedAxis({ count: 2, defaultSize: 100 })
    new HeaderPainter(denseGridTheme).paint(ctx, {
      schema: SCHEMA_TWO,
      colsAxis,
      colRange: [0, 1],
      width: 200,
    })
    const arcs = ops.filter((o) => o.op === 'arc')
    expect(arcs.length).toBe(0)
  })

  it('does not paint button for column narrower than 32px', () => {
    const { ctx, ops } = createRecordingContext()
    const colsAxis = new ChunkedAxis({ count: 1, defaultSize: 31 })
    new HeaderPainter(denseGridTheme).paint(ctx, {
      schema: { fields: [{ id: 'a', name: 'A', type: 'text', width: 31 }] },
      colsAxis,
      colRange: [0, 0],
      width: 31,
      hoveredColumnHeaderMenu: { colIndex: 0, buttonHovered: true },
    })
    const arcs = ops.filter((o) => o.op === 'arc')
    expect(arcs.length).toBe(0)
  })

  it('does not paint button for non-hovered column', () => {
    const { ctx, ops } = createRecordingContext()
    const colsAxis = new ChunkedAxis({ count: 2, defaultSize: 100 })
    new HeaderPainter(denseGridTheme).paint(ctx, {
      schema: SCHEMA_TWO,
      colsAxis,
      colRange: [0, 1],
      width: 200,
      hoveredColumnHeaderMenu: { colIndex: 0, buttonHovered: true }, // only col 0 hovered
    })
    // exactly 1 arc for col 0 (hovered), NOT for col 1
    const arcs = ops.filter((o) => o.op === 'arc')
    expect(arcs.length).toBe(1)
  })

  it('状态图标在 menu button 显示时向左偏移，不与按钮重叠', () => {
    // 列宽 200px，padX=8，HEADER_MENU_BUTTON_SIZE=24，headerIconSize=16
    // menuButtonReserve = 24 + 8 = 32
    // 无修复时图标 X = 200 - 8 - 16 = 176（与按钮圆心 180 重叠）
    // 有修复后图标 X = 200 - 8 - 32 - 16 = 144（按钮左侧 32px 处）
    const SCHEMA_ICON: Schema = {
      fields: [{ id: 'a', name: 'A', type: 'text', width: 200 }],
    }
    const { ctx, ops } = createRecordingContext()
    const colsAxis = new ChunkedAxis({ count: 1, defaultSize: 200 })
    const viewPipeline = {
      collectHeaderDecorations: () => ({ filterActive: true }),
    } as Pick<ViewPipeline, 'collectHeaderDecorations'>

    new HeaderPainter(denseGridTheme).paint(ctx, {
      schema: SCHEMA_ICON,
      colsAxis,
      colRange: [0, 0],
      width: 200,
      viewPipeline,
      hoveredColumnHeaderMenu: { colIndex: 0, buttonHovered: true },
    })

    // The arc center X for the menu button: colLeft + colWidth - padX - buttonSize/2
    // = 0 + 200 - 8 - 12 = 180
    const arc = ops.find((o): o is { op: 'arc'; args: [number, number, number, number, number] } =>
      o.op === 'arc',
    )
    expect(arc).toBeDefined()
    const buttonCenterX = arc!.args[0]

    // The icon is painted via fillPath (paintSvgPath). We cannot read its x directly,
    // but we can verify the fillPath ops exist AND that the translate used to position
    // the icon does not overlap the button circle.
    // paintSvgPath uses ctx.scale + ctx.translate internally; instead check via
    // the translate op that appears *inside* the save/restore wrapping the icon paint.
    // Simpler: verify that the icon render occurs before the arc (button painted after icons).
    const iconFillPathIdx = ops.findIndex((o) => o.op === 'fillPath')
    const arcIdx = ops.findIndex((o) => o.op === 'arc')
    expect(iconFillPathIdx).toBeGreaterThan(-1)
    expect(iconFillPathIdx).toBeLessThan(arcIdx)

    // The menu button circle right edge = buttonCenterX + 12 = 192.
    // Icon right edge without fix = 0 + 200 - 8 = 192 → same x, overlaps.
    // With fix the translate x for the icon should be ≤ buttonCenterX - 12 (left of circle).
    // We find the translate that corresponds to icon placement (first translate in the ops
    // sequence up to the arc).
    const translateBeforeArc = ops
      .slice(0, arcIdx)
      .filter((o): o is { op: 'translate'; args: [number, number] } => o.op === 'translate')
    expect(translateBeforeArc.length).toBeGreaterThan(0)
    const iconTranslateX = translateBeforeArc[translateBeforeArc.length - 1]!.args[0]
    // iconTranslateX is where the icon SVG origin is placed; the icon is 16px wide,
    // so its right edge = iconTranslateX + 16.  Must be left of button circle left edge.
    const buttonCircleLeft = buttonCenterX - 12 // radius = buttonSize/2 = 12
    expect(iconTranslateX + denseGridTheme.metrics.headerIconSize).toBeLessThanOrEqual(
      buttonCircleLeft,
    )
  })
})
