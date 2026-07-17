import { describe, expect, it } from 'bun:test'
import {
  ChunkedAxis,
  denseGridTheme,
  type RenderFrameColumnGroupHeader,
  type Schema,
} from '@zhiguang/core'
import { HeaderPainter } from '../../src/painters/HeaderPainter'
import { createRecordingContext } from '../helpers/recording-context'

// fixture: m(0, 无组) / s1c1(1) s1c2(2)（组 s1）/ s2c1(3)（组 s2），各列宽 100px。
const SCHEMA: Schema = {
  fields: [
    { id: 'm', name: 'm', type: 'text', width: 100 },
    { id: 's1c1', name: 's1c1', type: 'text', width: 100 },
    { id: 's1c2', name: 's1c2', type: 'text', width: 100 },
    { id: 's2c1', name: 's2c1', type: 'text', width: 100 },
  ],
}

const GROUP_ROW_HEIGHT = denseGridTheme.metrics.groupHeaderRowHeight
const LEAF_HEIGHT = denseGridTheme.metrics.headerHeight

function makeAxis(): ChunkedAxis {
  return new ChunkedAxis({ count: 4, defaultSize: 100 })
}

function twoGroupHeader(selected: { s1?: boolean; s2?: boolean } = {}): RenderFrameColumnGroupHeader {
  return {
    depth: 1,
    rows: [
      [
        {
          groupId: 's1',
          label: '堆1',
          startViewCol: 1,
          endViewCol: 2,
          selected: selected.s1 ?? false,
        },
        {
          groupId: 's2',
          label: '堆2',
          startViewCol: 3,
          endViewCol: 3,
          selected: selected.s2 ?? false,
        },
      ],
    ],
    leafTopRowByViewCol: [0, 1, 1, 1],
  }
}

describe('HeaderPainter — 列组表头行', () => {
  it('组行画出每个 cell 的背景 fillRect 与 label fillText', () => {
    const { ctx, ops } = createRecordingContext()
    new HeaderPainter(denseGridTheme).paint(ctx, {
      schema: SCHEMA,
      colsAxis: makeAxis(),
      colRange: [0, 3],
      width: 400,
      columnGroupHeader: twoGroupHeader(),
      leafHeaderHeight: LEAF_HEIGHT,
    })

    // s1 跨 viewCol 1..2 → x=[100,300) width=200；s2 跨 viewCol 3 → x=[300,400) width=100。
    expect(ops).toContainEqual({ op: 'fillRect', args: [100, 0, 200, GROUP_ROW_HEIGHT] })
    expect(ops).toContainEqual({ op: 'fillRect', args: [300, 0, 100, GROUP_ROW_HEIGHT] })

    const texts = ops
      .filter((o) => o.op === 'fillText')
      .map((o) => (o.op === 'fillText' ? o.args[0] : ''))
    expect(texts).toContain('堆1')
    expect(texts).toContain('堆2')
  })

  it('headerTextAlign=center 时组头标签水平居中于跨列范围', () => {
    const theme = {
      ...denseGridTheme,
      cell: { ...denseGridTheme.cell, headerTextAlign: 'center' as const },
    }
    const { ctx, ops } = createRecordingContext()
    new HeaderPainter(theme).paint(ctx, {
      schema: SCHEMA,
      colsAxis: makeAxis(),
      colRange: [0, 3],
      width: 400,
      columnGroupHeader: twoGroupHeader(),
      leafHeaderHeight: LEAF_HEIGHT,
    })
    const stack1 = ops.find(
      (o): o is { op: 'fillText'; args: [string, number, number, number?] } =>
        o.op === 'fillText' && o.args[0] === '堆1',
    )
    // s1 跨 [100,300)，中心 x=200
    expect(stack1?.args[1]).toBe(200)
  })

  it('有列组且关闭 columnLetters 时叶头绘制字段名（簇子集），不画 A/B 列标', () => {
    const schema: Schema = {
      fields: [
        { id: 'leaf-0', name: '簇1', type: 'text', width: 100 },
        { id: 'leaf-1', name: '簇2', type: 'text', width: 100 },
        { id: 'leaf-2', name: '簇1', type: 'text', width: 100 },
        { id: 'leaf-3', name: '簇2', type: 'text', width: 100 },
      ],
    }
    const columnGroupHeader: RenderFrameColumnGroupHeader = {
      depth: 1,
      rows: [
        [
          {
            groupId: 'g-0',
            label: '堆1',
            startViewCol: 0,
            endViewCol: 1,
            selected: false,
          },
          {
            groupId: 'g-1',
            label: '堆2',
            startViewCol: 2,
            endViewCol: 3,
            selected: false,
          },
        ],
      ],
      leafTopRowByViewCol: [1, 1, 1, 1],
    }
    const { ctx, ops } = createRecordingContext()
    new HeaderPainter(denseGridTheme).paint(ctx, {
      schema,
      colsAxis: makeAxis(),
      colRange: [0, 3],
      width: 400,
      columnLetters: false,
      columnGroupHeader,
      leafHeaderHeight: LEAF_HEIGHT,
    })
    const texts = ops
      .filter((o) => o.op === 'fillText')
      .map((o) => (o.op === 'fillText' ? o.args[0] : ''))
    expect(texts).toContain('堆1')
    expect(texts).toContain('堆2')
    expect(texts.filter((t) => t === '簇1')).toHaveLength(2)
    expect(texts.filter((t) => t === '簇2')).toHaveLength(2)
    expect(texts).not.toContain('A')
    expect(texts).not.toContain('B')
  })

  it('表头背景总高 = depth × groupHeaderRowHeight + leafHeaderHeight', () => {
    const { ctx, ops } = createRecordingContext()
    new HeaderPainter(denseGridTheme).paint(ctx, {
      schema: SCHEMA,
      colsAxis: makeAxis(),
      colRange: [0, 3],
      width: 400,
      columnGroupHeader: twoGroupHeader(),
      leafHeaderHeight: LEAF_HEIGHT,
    })

    const totalHeaderHeight = GROUP_ROW_HEIGHT + LEAF_HEIGHT
    expect(ops).toContainEqual({ op: 'fillRect', args: [0, 0, 400, totalHeaderHeight] })
  })

  it('无组列（叶头伸满）文字垂直居中于全表头高，分组列居中于叶行带', () => {
    const { ctx, ops } = createRecordingContext()
    new HeaderPainter(denseGridTheme).paint(ctx, {
      schema: SCHEMA,
      colsAxis: makeAxis(),
      colRange: [0, 3],
      width: 400,
      columnGroupHeader: twoGroupHeader(),
      leafHeaderHeight: LEAF_HEIGHT,
    })

    const totalHeaderHeight = GROUP_ROW_HEIGHT + LEAF_HEIGHT
    const mText = ops.find(
      (o): o is { op: 'fillText'; args: [string, number, number, number?] } =>
        o.op === 'fillText' && o.args[0] === 'm',
    )
    const s1c1Text = ops.find(
      (o): o is { op: 'fillText'; args: [string, number, number, number?] } =>
        o.op === 'fillText' && o.args[0] === 's1c1',
    )
    expect(mText).toBeDefined()
    expect(s1c1Text).toBeDefined()
    // 'm' 无组：leafTop=0 → y = totalHeaderHeight / 2（居中于全表头高）。
    expect(mText!.args[2]).toBe(totalHeaderHeight / 2)
    // 's1c1' 属于 s1（level 0）：leafTop=1×groupRowHeight → y = (leafTop+total)/2，比 m 更靠下。
    const expectedS1c1Y = (GROUP_ROW_HEIGHT + totalHeaderHeight) / 2
    expect(s1c1Text!.args[2]).toBe(expectedS1c1Y)
    expect(s1c1Text!.args[2]).toBeGreaterThan(mText!.args[2])
  })

  it('无组列的背景/选中高亮伸满整个表头高，而非局限于叶行窄带', () => {
    const { ctx, ops } = createRecordingContext()
    new HeaderPainter(denseGridTheme).paint(ctx, {
      schema: SCHEMA,
      colsAxis: makeAxis(),
      colRange: [0, 3],
      width: 400,
      columnGroupHeader: twoGroupHeader(),
      leafHeaderHeight: LEAF_HEIGHT,
      selectedColumnRange: { startCol: 0, endCol: 0 }, // 选中无组列 'm'
    })

    const totalHeaderHeight = GROUP_ROW_HEIGHT + LEAF_HEIGHT
    // 'm' 的选中高亮从 y=0（自身 leafTop）一路到表头底，而不是只有 LEAF_HEIGHT 高。
    expect(ops).toContainEqual({ op: 'fillRect', args: [0, 0, 100, totalHeaderHeight] })
  })

  it('selected: true 的组 cell 使用 selectionBorder 背景与 selectionText 文字色', () => {
    const { ctx, ops } = createRecordingContext()
    new HeaderPainter(denseGridTheme).paint(ctx, {
      schema: SCHEMA,
      colsAxis: makeAxis(),
      colRange: [0, 3],
      width: 400,
      columnGroupHeader: twoGroupHeader({ s1: true }),
      leafHeaderHeight: LEAF_HEIGHT,
    })

    const selectionBorderIdx = ops.findIndex(
      (o) => o.op === 'set:fillStyle' && o.value === denseGridTheme.colors.selectionBorder,
    )
    const s1FillRectIdx = ops.findIndex(
      (o) => o.op === 'fillRect' && o.args[0] === 100 && o.args[2] === 200,
    )
    expect(selectionBorderIdx).toBeGreaterThan(-1)
    expect(s1FillRectIdx).toBeGreaterThan(selectionBorderIdx)

    const selectionTextIdx = ops.findIndex(
      (o) => o.op === 'set:fillStyle' && o.value === denseGridTheme.colors.selectionText,
    )
    expect(selectionTextIdx).toBeGreaterThan(-1)

    // 未选中的 s2 仍用 headerBackground/headerText。
    const s2FillRectIdx = ops.findIndex(
      (o) => o.op === 'fillRect' && o.args[0] === 300 && o.args[2] === 100,
    )
    expect(s2FillRectIdx).toBeGreaterThan(-1)
  })

  it('整列选中时组 cell 底边在线 leaf 选中背景之后重画，避免被高亮覆盖', () => {
    const { ctx, ops } = createRecordingContext()
    new HeaderPainter(denseGridTheme).paint(ctx, {
      schema: SCHEMA,
      colsAxis: makeAxis(),
      colRange: [0, 3],
      width: 400,
      columnGroupHeader: twoGroupHeader({ s1: true }),
      leafHeaderHeight: LEAF_HEIGHT,
      selectedColumnRange: { startCol: 1, endCol: 2 },
    })

    const selectedLeafFillIdx = ops.findIndex(
      (o) =>
        o.op === 'fillRect' &&
        o.args[0] === 100 &&
        o.args[1] === GROUP_ROW_HEIGHT &&
        o.args[2] === 100 &&
        o.args[3] === LEAF_HEIGHT,
    )
    expect(selectedLeafFillIdx).toBeGreaterThan(-1)

    const groupBottomMoveIdx = ops.findIndex(
      (o, idx) =>
        idx > selectedLeafFillIdx &&
        o.op === 'moveTo' &&
        o.args[0] === 100 &&
        o.args[1] === GROUP_ROW_HEIGHT + 0.5,
    )
    const groupBottomLineIdx = ops.findIndex(
      (o, idx) =>
        idx > groupBottomMoveIdx &&
        o.op === 'lineTo' &&
        o.args[0] === 300 &&
        o.args[1] === GROUP_ROW_HEIGHT + 0.5,
    )

    expect(groupBottomMoveIdx).toBeGreaterThan(selectedLeafFillIdx)
    expect(groupBottomLineIdx).toBeGreaterThan(groupBottomMoveIdx)
  })

  it('columnGroupHeader 缺省时（零成本路径）不画任何组行内容，行为与无 group 参数完全一致', () => {
    const { ctx, ops } = createRecordingContext()
    new HeaderPainter(denseGridTheme).paint(ctx, {
      schema: SCHEMA,
      colsAxis: makeAxis(),
      colRange: [0, 3],
      width: 400,
    })

    expect(ops).toContainEqual({
      op: 'fillRect',
      args: [0, 0, 400, denseGridTheme.metrics.headerHeight],
    })
    const texts = ops
      .filter((o) => o.op === 'fillText')
      .map((o) => (o.op === 'fillText' ? o.args[0] : ''))
    expect(texts).not.toContain('堆1')
    expect(texts).not.toContain('堆2')
  })

  it('省略 leafHeaderHeight 时回退 theme.metrics.headerHeight', () => {
    const { ctx, ops } = createRecordingContext()
    new HeaderPainter(denseGridTheme).paint(ctx, {
      schema: SCHEMA,
      colsAxis: makeAxis(),
      colRange: [0, 3],
      width: 400,
      columnGroupHeader: twoGroupHeader(),
      // leafHeaderHeight omitted
    })

    const totalHeaderHeight = GROUP_ROW_HEIGHT + denseGridTheme.metrics.headerHeight
    expect(ops).toContainEqual({ op: 'fillRect', args: [0, 0, 400, totalHeaderHeight] })
  })

  it('组 cell 底边与右边分隔线复用 gridLine token', () => {
    const { ctx, ops } = createRecordingContext()
    new HeaderPainter(denseGridTheme).paint(ctx, {
      schema: SCHEMA,
      colsAxis: makeAxis(),
      colRange: [0, 3],
      width: 400,
      columnGroupHeader: twoGroupHeader(),
      leafHeaderHeight: LEAF_HEIGHT,
    })

    const gridLineStrokeIdx = ops.findIndex(
      (o) => o.op === 'set:strokeStyle' && o.value === denseGridTheme.colors.gridLine,
    )
    expect(gridLineStrokeIdx).toBeGreaterThan(-1)
    expect(ops.some((o) => o.op === 'stroke')).toBe(true)
  })

  it('冻结分段：组 cell 跨冻结/滚动边界时各段重画自己的可见部分', () => {
    // 组 'g' 跨 viewCol 0..1（col0 冻结、col1 滚动），各宽 100px。
    const spanningGroup: RenderFrameColumnGroupHeader = {
      depth: 1,
      rows: [[{ groupId: 'g', label: 'G组', startViewCol: 0, endViewCol: 1, selected: false }]],
      leafTopRowByViewCol: [1, 1],
    }
    const schema: Schema = {
      fields: [
        { id: 'a', name: 'a', type: 'text', width: 100 },
        { id: 'b', name: 'b', type: 'text', width: 100 },
      ],
    }
    const colsAxis = new ChunkedAxis({ count: 2, defaultSize: 100 })

    // 冻结段：colRange=[0,0]，x=0，width=100，scrollOffsetX=0。
    const frozen = createRecordingContext()
    new HeaderPainter(denseGridTheme).paint(frozen.ctx, {
      schema,
      colsAxis,
      colRange: [0, 0],
      x: 0,
      width: 100,
      scrollOffsetX: 0,
      columnGroupHeader: spanningGroup,
      leafHeaderHeight: LEAF_HEIGHT,
    })
    const frozenFill = frozen.ops.find(
      (o) => o.op === 'fillRect' && o.args[1] === 0 && o.args[3] === GROUP_ROW_HEIGHT,
    )
    const frozenText = frozen.ops.find((o) => o.op === 'fillText' && o.args[0] === 'G组')
    expect(frozenFill).toBeDefined()
    expect(frozenText).toBeDefined()

    // 滚动段：colRange=[1,1]，x=100（冻结段右侧开始），width=200，scrollOffsetX=0。
    const scroll = createRecordingContext()
    new HeaderPainter(denseGridTheme).paint(scroll.ctx, {
      schema,
      colsAxis,
      colRange: [1, 1],
      x: 100,
      width: 200,
      scrollOffsetX: 0,
      columnGroupHeader: spanningGroup,
      leafHeaderHeight: LEAF_HEIGHT,
    })
    const scrollFill = scroll.ops.find(
      (o) => o.op === 'fillRect' && o.args[1] === 0 && o.args[3] === GROUP_ROW_HEIGHT,
    )
    const scrollText = scroll.ops.find((o) => o.op === 'fillText' && o.args[0] === 'G组')
    expect(scrollFill).toBeDefined()
    expect(scrollText).toBeDefined()
    // 冻结段与滚动段各画一次同一组 cell 的可见部分，两段几何不同（各自 x 基准）。
    expect(frozenFill).not.toEqual(scrollFill)
  })

  it('组 cell 与本段 colRange 不相交时不绘制（避免其它段的组内容溢出）', () => {
    const spanningGroup: RenderFrameColumnGroupHeader = {
      depth: 1,
      rows: [[{ groupId: 'g', label: 'G组', startViewCol: 0, endViewCol: 0, selected: false }]],
      leafTopRowByViewCol: [1, 0],
    }
    const schema: Schema = {
      fields: [
        { id: 'a', name: 'a', type: 'text', width: 100 },
        { id: 'b', name: 'b', type: 'text', width: 100 },
      ],
    }
    const colsAxis = new ChunkedAxis({ count: 2, defaultSize: 100 })

    // 只画第二段（colRange=[1,1]），组 cell 只在 viewCol 0，不应出现在此次 paint 输出中。
    const { ctx, ops } = createRecordingContext()
    new HeaderPainter(denseGridTheme).paint(ctx, {
      schema,
      colsAxis,
      colRange: [1, 1],
      x: 100,
      width: 200,
      scrollOffsetX: 0,
      columnGroupHeader: spanningGroup,
      leafHeaderHeight: LEAF_HEIGHT,
    })
    const groupText = ops.find((o) => o.op === 'fillText' && o.args[0] === 'G组')
    expect(groupText).toBeUndefined()
  })

  it('无组到分组边界：竖线从该无组列自身 leafTop（y=0）画起，不用全局最深值漏画分隔线', () => {
    const { ctx, ops } = createRecordingContext()
    new HeaderPainter(denseGridTheme).paint(ctx, {
      schema: SCHEMA,
      colsAxis: makeAxis(),
      colRange: [0, 3],
      width: 400,
      columnGroupHeader: twoGroupHeader(),
      leafHeaderHeight: LEAF_HEIGHT,
    })

    // m(0, 无组, leafTop=0) 与 s1c1(1, leafTop=GROUP_ROW_HEIGHT) 的边界线：
    // 取 min(0, GROUP_ROW_HEIGHT) = 0——必须从表头顶画起，覆盖 m 列自己伸满的内容区；
    // 若用全局最深值（GROUP_ROW_HEIGHT）当起点，m 与 s1 之间在组行带内会完全没有分隔线。
    const totalHeaderHeight = GROUP_ROW_HEIGHT + LEAF_HEIGHT
    expect(ops).toContainEqual({ op: 'moveTo', args: [100.5, 0] })
    expect(ops).toContainEqual({ op: 'lineTo', args: [100.5, totalHeaderHeight] })
  })

  it('两个相邻无组列（不在列 0，且表头里其它地方有组）的边界线同样从 y=0 画起', () => {
    const schema: Schema = {
      fields: [
        { id: 'g1', name: 'g1', type: 'text', width: 100 },
        { id: 'g2', name: 'g2', type: 'text', width: 100 },
        { id: 'm1', name: 'm1', type: 'text', width: 100 },
        { id: 'm2', name: 'm2', type: 'text', width: 100 },
      ],
    }
    const groupOnLeft: RenderFrameColumnGroupHeader = {
      depth: 1,
      rows: [[{ groupId: 'g', label: 'G组', startViewCol: 0, endViewCol: 1, selected: false }]],
      leafTopRowByViewCol: [1, 1, 0, 0],
    }
    const { ctx, ops } = createRecordingContext()
    new HeaderPainter(denseGridTheme).paint(ctx, {
      schema,
      colsAxis: new ChunkedAxis({ count: 4, defaultSize: 100 }),
      colRange: [0, 3],
      width: 400,
      columnGroupHeader: groupOnLeft,
      leafHeaderHeight: LEAF_HEIGHT,
    })

    // m1(2)/m2(3) 都无组、leafTop=0；边界既不在列 0，也不是末列越界 fallback 的位置，
    // 证明修复对任意边界位置都成立，不只是巧合命中列 0。
    const totalHeaderHeight = GROUP_ROW_HEIGHT + LEAF_HEIGHT
    expect(ops).toContainEqual({ op: 'moveTo', args: [300.5, 0] })
    expect(ops).toContainEqual({ op: 'lineTo', args: [300.5, totalHeaderHeight] })
  })
})
