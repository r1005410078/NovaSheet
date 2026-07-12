import { describe, expect, it } from 'bun:test'

import {
  denseGridTheme,
  Grid,
  InMemoryDataSource,
  type ColumnGroup,
  type ColumnGroupChild,
  type Field,
  type RenderFrameGroupHeaderCell,
  type Row,
} from '../../../../src'
import {
  createNoopBackend,
  createRecordingBackend,
  getScrollHost,
  lastFrame,
  mountRecordingGrid,
  withManualRaf,
} from '../../_helpers/fixtures'

function textField(id: string, width = 100): Field {
  return { id, name: id, type: 'text', width }
}

function isGroup(node: ColumnGroupChild, id: string): node is ColumnGroup {
  return 'id' in node && node.id === id
}

function flattenCells(
  rows: readonly (readonly RenderFrameGroupHeaderCell[])[],
): readonly RenderFrameGroupHeaderCell[] {
  return rows.flat()
}

function findCell(
  rows: readonly (readonly RenderFrameGroupHeaderCell[])[],
  groupId: string,
): RenderFrameGroupHeaderCell {
  const cell = flattenCells(rows).find((c) => c.groupId === groupId)
  if (cell === undefined) throw new Error(`expected group header cell for ${groupId}`)
  return cell
}

describe('Core acceptance column groups', () => {
  // ---------------------------------------------------------------------
  // core.L0.column-groups-schema-validation
  // ---------------------------------------------------------------------
  it('core.L0.column-groups-schema-validation throws on the three rule violations and passes for legal mixed group/no-group fields', () =>
    withManualRaf((flushRaf) => {
      const fields: Field[] = [
        textField('m'),
        textField('s1c1'),
        textField('s1c2'),
        textField('s2c1'),
        textField('s2c2'),
      ]
      const rows: Row[] = Array.from({ length: 2 }, () => ({
        m: 'x',
        s1c1: 1,
        s1c2: 2,
        s2c1: 3,
        s2c2: 4,
      }))
      const validGroups: ColumnGroupChild[] = [
        { fieldId: 'm' },
        { id: 's1', label: '堆1', children: [{ fieldId: 's1c1' }, { fieldId: 's1c2' }] },
        { id: 's2', label: '堆2', children: [{ fieldId: 's2c1' }, { fieldId: 's2c2' }] },
      ]

      function mount(columnGroups?: ColumnGroupChild[]): { container: HTMLElement; grid: Grid } {
        const container = document.createElement('div')
        Object.assign(container.style, { width: '400px', height: '300px' })
        document.body.appendChild(container)
        const data = new InMemoryDataSource({ schema: { fields, columnGroups }, rows })
        const grid = new Grid(container, { data, backend: createNoopBackend })
        return { container, grid }
      }

      function expectInvalid(columnGroups: ColumnGroupChild[], pattern: RegExp): void {
        const container = document.createElement('div')
        Object.assign(container.style, { width: '400px', height: '300px' })
        document.body.appendChild(container)
        const data = new InMemoryDataSource({ schema: { fields, columnGroups }, rows })
        expect(() => new Grid(container, { data, backend: createNoopBackend })).toThrow(pattern)
        document.body.removeChild(container)
      }

      // 配置 1：合法混排——构造成功，getColumnGroups 等价原树。
      const { container: c1, grid: g1 } = mount(validGroups)
      expect(g1.getColumnGroups()).toEqual(validGroups)
      g1.destroy()
      document.body.removeChild(c1)

      // 配置 2：不连续（s1 引用 [s1c1, s2c2]，fields 中不相邻）→ contiguity。
      expectInvalid(
        [{ id: 's1', label: '堆1', children: [{ fieldId: 's1c1' }, { fieldId: 's2c2' }] }],
        /column-groups\/contiguity/,
      )

      // 配置 3：叶序与 fields 顺序相反 → leaf-order。
      expectInvalid(
        [{ id: 's1', label: '堆1', children: [{ fieldId: 's1c2' }, { fieldId: 's1c1' }] }],
        /column-groups\/leaf-order/,
      )

      // 配置 4：引用不存在的 fieldId → reference。
      expectInvalid(
        [{ id: 's1', label: '堆1', children: [{ fieldId: 'ghost' }] }],
        /column-groups\/reference/,
      )

      // 配置 5：同一 fieldId 归属两条叶路径 → reference。
      expectInvalid(
        [
          { id: 's1', label: '堆1', children: [{ fieldId: 's1c1' }] },
          { id: 's2', label: '堆2', children: [{ fieldId: 's1c1' }] },
        ],
        /column-groups\/reference/,
      )

      // 配置 6：组 children 为空数组 → reference。
      expectInvalid([{ id: 's1', label: '堆1', children: [] }], /column-groups\/reference/)

      // 配置 7：两个组使用相同 id → reference。
      expectInvalid(
        [
          { id: 's1', label: '堆1', children: [{ fieldId: 's1c1' }] },
          { id: 's1', label: '堆1b', children: [{ fieldId: 's2c1' }] },
        ],
        /column-groups\/reference/,
      )

      // 省略 columnGroups：行为与现状完全一致——无 columnGroupHeader，总高 = leaf 高。
      const data = new InMemoryDataSource({ schema: { fields }, rows })
      const { container: c2, grid: g2, recorder } = mountRecordingGrid({ data })
      flushRaf()
      const frame = lastFrame(recorder)
      expect(frame.columnGroupHeader).toBeUndefined()
      expect(frame.viewport.headerHeight).toBe(denseGridTheme.metrics.headerHeight)
      expect(frame.viewport.headerHeight).toBe(frame.viewport.leafHeaderHeight)
      g2.destroy()
      document.body.removeChild(c2)
    }))

  // ---------------------------------------------------------------------
  // core.L2.grid-column-groups-frame-layout
  // ---------------------------------------------------------------------
  it('core.L2.grid-column-groups-frame-layout delivers nested group tree layout through getFrame()', () =>
    withManualRaf((flushRaf) => {
      const fields: Field[] = [
        textField('m'),
        textField('aXc1'),
        textField('aXc2'),
        textField('aYc1'),
        textField('bZc1'),
      ]
      const columnGroups: ColumnGroupChild[] = [
        { fieldId: 'm' },
        {
          id: 'a',
          label: 'A相',
          children: [
            { id: 'aX', label: '堆X', children: [{ fieldId: 'aXc1' }, { fieldId: 'aXc2' }] },
            { id: 'aY', label: '堆Y', children: [{ fieldId: 'aYc1' }] },
          ],
        },
        { id: 'b', label: 'B相', children: [{ id: 'bZ', label: '堆Z', children: [{ fieldId: 'bZc1' }] }] },
      ]
      const rows: Row[] = Array.from({ length: 3 }, () => ({
        m: 'x',
        aXc1: 1,
        aXc2: 2,
        aYc1: 3,
        bZc1: 4,
      }))
      const data = new InMemoryDataSource({ schema: { fields, columnGroups }, rows })
      const { container, grid, recorder } = mountRecordingGrid({ data })
      flushRaf()

      const frame = lastFrame(recorder)
      const cg = frame.columnGroupHeader!
      expect(cg.depth).toBe(2)
      expect(cg.rows[0]).toEqual([
        { groupId: 'a', label: 'A相', startViewCol: 1, endViewCol: 3, selected: false },
        { groupId: 'b', label: 'B相', startViewCol: 4, endViewCol: 4, selected: false },
      ])
      expect(cg.rows[1]).toEqual([
        { groupId: 'aX', label: '堆X', startViewCol: 1, endViewCol: 2, selected: false },
        { groupId: 'aY', label: '堆Y', startViewCol: 3, endViewCol: 3, selected: false },
        { groupId: 'bZ', label: '堆Z', startViewCol: 4, endViewCol: 4, selected: false },
      ])
      expect(cg.leafTopRowByViewCol).toEqual([0, 2, 2, 2, 2])
      expect(frame.viewport.headerHeight).toBe(
        2 * denseGridTheme.metrics.groupHeaderRowHeight + denseGridTheme.metrics.headerHeight,
      )
      expect(frame.viewport.leafHeaderHeight).toBe(denseGridTheme.metrics.headerHeight)

      grid.destroy()
      document.body.removeChild(container)
    }))

  // ---------------------------------------------------------------------
  // core.L2.grid-column-groups-hide-shrink
  // ---------------------------------------------------------------------
  it('core.L2.grid-column-groups-hide-shrink shrinks/removes/restores group header spans as leaves hide, tree stays intact', () =>
    withManualRaf((flushRaf) => {
      const fields: Field[] = [
        textField('m'),
        textField('s1c1'),
        textField('s1c2'),
        textField('s1c3'),
        textField('s2c1'),
      ]
      const columnGroups: ColumnGroupChild[] = [
        { fieldId: 'm' },
        {
          id: 's1',
          label: '堆1',
          children: [{ fieldId: 's1c1' }, { fieldId: 's1c2' }, { fieldId: 's1c3' }],
        },
        { id: 's2', label: '堆2', children: [{ fieldId: 's2c1' }] },
      ]
      const rows: Row[] = Array.from({ length: 2 }, () => ({
        m: 'x',
        s1c1: 1,
        s1c2: 2,
        s1c3: 3,
        s2c1: 4,
      }))
      const data = new InMemoryDataSource({ schema: { fields, columnGroups }, rows })
      const { container, grid, recorder } = mountRecordingGrid({ data })
      flushRaf()
      const initialRows0 = lastFrame(recorder).columnGroupHeader!.rows[0]

      // 步骤 1：隐藏 s1 中间一列——s1 收缩为 2 列宽，组树不变。
      grid.hideCols(['s1c2'])
      flushRaf()
      let cg = lastFrame(recorder).columnGroupHeader!
      expect(cg.rows[0]).toEqual([
        { groupId: 's1', label: '堆1', startViewCol: 1, endViewCol: 2, selected: false },
        { groupId: 's2', label: '堆2', startViewCol: 3, endViewCol: 3, selected: false },
      ])
      expect(grid.getColumnGroups()).toEqual(columnGroups)

      // 步骤 2：s1 全隐——rows 中无 s1 cell，s2 左移补位，组树不变。
      grid.hideCols(['s1c1', 's1c3'])
      flushRaf()
      cg = lastFrame(recorder).columnGroupHeader!
      expect(cg.rows[0]).toEqual([{ groupId: 's2', label: '堆2', startViewCol: 1, endViewCol: 1, selected: false }])
      expect(grid.getColumnGroups()).toEqual(columnGroups)

      // 全隐期间 selectGroup 返回 false 且不动选区。
      const selectionBeforeSelect = grid.getSelection()
      expect(grid.selectGroup('s1')).toBe(false)
      expect(grid.getSelection()).toEqual(selectionBeforeSelect)

      // 步骤 3：全部取消隐藏——frame 组头布局与初始状态完全一致。
      grid.unhideCols(['s1c1', 's1c2', 's1c3'])
      flushRaf()
      cg = lastFrame(recorder).columnGroupHeader!
      expect(cg.rows[0]).toEqual(initialRows0)

      grid.destroy()
      document.body.removeChild(container)
    }))

  // ---------------------------------------------------------------------
  // core.L2.grid-column-groups-select-group
  // ---------------------------------------------------------------------
  it('core.L2.grid-column-groups-select-group derives group header highlight by superset containment', () =>
    withManualRaf((flushRaf) => {
      const fields: Field[] = [textField('m'), textField('aXc1'), textField('aXc2'), textField('aYc1')]
      const columnGroups: ColumnGroupChild[] = [
        { fieldId: 'm' },
        {
          id: 'a',
          label: 'A相',
          children: [
            { id: 'aX', label: '堆X', children: [{ fieldId: 'aXc1' }, { fieldId: 'aXc2' }] },
            { id: 'aY', label: '堆Y', children: [{ fieldId: 'aYc1' }] },
          ],
        },
      ]
      const rowCount = 10
      const rows: Row[] = Array.from({ length: rowCount }, () => ({ m: 'x', aXc1: 1, aXc2: 2, aYc1: 3 }))
      const data = new InMemoryDataSource({ schema: { fields, columnGroups }, rows })
      const { container, grid, recorder } = mountRecordingGrid({ data })
      flushRaf()

      // 1. selectGroup('aX') → true；整列 range；frame 派生：aX selected，aY/父组 a 不选中。
      expect(grid.selectGroup('aX')).toBe(true)
      expect(grid.getSelection().selectedRange).toEqual({ startRow: 0, endRow: 9, startCol: 1, endCol: 2 })
      flushRaf()
      let cg = lastFrame(recorder).columnGroupHeader!
      expect(findCell(cg.rows, 'aX').selected).toBe(true)
      expect(findCell(cg.rows, 'aY').selected).toBe(false)
      expect(findCell(cg.rows, 'a').selected).toBe(false)

      // 2. 手工整列 range 覆盖 aX+aY 全部叶列（view 列 [1,3]）→ aX/aY/父组 a 均选中（⊇ 递归向上）。
      grid.setSelection({
        activeCell: { rowIndex: 0, colIndex: 3 },
        anchorCell: { rowIndex: 0, colIndex: 1 },
        extentCell: { rowIndex: rowCount - 1, colIndex: 3 },
        selectedRange: { startRow: 0, endRow: rowCount - 1, startCol: 1, endCol: 3 },
      })
      flushRaf()
      cg = lastFrame(recorder).columnGroupHeader!
      expect(findCell(cg.rows, 'aX').selected).toBe(true)
      expect(findCell(cg.rows, 'aY').selected).toBe(true)
      expect(findCell(cg.rows, 'a').selected).toBe(true)

      // 3. view 列 [1,2] 但行区间非整列（startRow:1）→ 所有组头 selected 均 false。
      grid.setSelection({
        activeCell: { rowIndex: rowCount - 1, colIndex: 2 },
        anchorCell: { rowIndex: 1, colIndex: 1 },
        extentCell: { rowIndex: rowCount - 1, colIndex: 2 },
        selectedRange: { startRow: 1, endRow: rowCount - 1, startCol: 1, endCol: 2 },
      })
      flushRaf()
      cg = lastFrame(recorder).columnGroupHeader!
      for (const cell of flattenCells(cg.rows)) expect(cell.selected).toBe(false)

      // 4. selectGroup('ghost') → false，选区保持不变。
      const selectionBeforeGhost = grid.getSelection()
      expect(grid.selectGroup('ghost')).toBe(false)
      expect(grid.getSelection()).toEqual(selectionBeforeGhost)

      grid.destroy()
      document.body.removeChild(container)
    }))

  // ---------------------------------------------------------------------
  // core.L2.grid-column-groups-scroll-to-group
  // ---------------------------------------------------------------------
  it('core.L2.grid-column-groups-scroll-to-group unconditionally scrolls to the align position like scrollToRow/scrollToCell', () =>
    withManualRaf((flushRaf) => {
      // happy-dom 测试环境 container.clientWidth/getBoundingClientRect 恒返回 0——
      // DomGridHost.getContainerSize() 因此总是落到硬编码 fallback 400×300，与 CSS 宽度无关
      // （已用独立探测脚本验证）。故列宽按这个固定视口宽度反推，而非按 container.style.width。
      const VIEWPORT_WIDTH = 400
      const COL_WIDTH = 64 // 400/64=6.25 → 视口容纳约 6 列
      const GROUP_COUNT = 13
      const fields: Field[] = [textField('m', COL_WIDTH)]
      const columnGroups: ColumnGroupChild[] = [{ fieldId: 'm' }]
      for (let g = 1; g <= GROUP_COUNT; g++) {
        const leafIds = [1, 2, 3].map((k) => `g${g}c${k}`)
        for (const id of leafIds) fields.push(textField(id, COL_WIDTH))
        columnGroups.push({ id: `g${g}`, label: `组${g}`, children: leafIds.map((fieldId) => ({ fieldId })) })
      }
      const rows: Row[] = Array.from({ length: 5 }, () =>
        Object.fromEntries(fields.map((f) => [f.id, 1])),
      )
      const data = new InMemoryDataSource({ schema: { fields, columnGroups }, rows })

      const container = document.createElement('div')
      // 40 列组头总宽 13*3*64+64=2560 远超视口。
      Object.assign(container.style, { width: `${VIEWPORT_WIDTH}px`, height: '300px' })
      document.body.appendChild(container)
      const { backend, recorder } = createRecordingBackend()
      const grid = new Grid(container, { data, backend })
      const scrollHost = getScrollHost(container)
      flushRaf()

      expect(scrollHost.scrollLeft).toBe(0)

      // 1. scrollToGroup('g10','start')：g10 首叶列（view col 28）滚到视口左缘。
      const g10FirstLeafViewCol = 1 + 9 * 3 // m + g1..g9（每组 3 叶）
      grid.scrollToGroup('g10', 'start')
      expect(scrollHost.scrollLeft).toBe(g10FirstLeafViewCol * COL_WIDTH)
      scrollHost.dispatchEvent(new Event('scroll'))
      flushRaf()
      const mainRegion = lastFrame(recorder).viewport.regions.find((r) => r.id === 'main')!
      expect(mainRegion.colRange[0]).toBe(g10FirstLeafViewCol)

      // 2. g10 已可见（start 对齐后完整可见）时再次 scrollToGroup(...,'end')：仍无条件滚动到新位置。
      const scrollLeftAfterStart = scrollHost.scrollLeft
      grid.scrollToGroup('g10', 'end')
      expect(scrollHost.scrollLeft).not.toBe(scrollLeftAfterStart)
      expect(scrollHost.scrollLeft).toBe(g10FirstLeafViewCol * COL_WIDTH + COL_WIDTH - VIEWPORT_WIDTH)

      // 3. 未知组 id no-op。
      const scrollLeftBeforeGhost = scrollHost.scrollLeft
      grid.scrollToGroup('ghost')
      expect(scrollHost.scrollLeft).toBe(scrollLeftBeforeGhost)

      // 4. g10 首叶列被隐藏后再调用：定位到 g10 的下一个可见叶列（g10c2，原 view col 29 → 隐藏
      // g10c1 后左移一位填补其位，新 view col 恰为 28，与步骤 1 数值重合，属正确重算而非残留值）。
      grid.hideCols(['g10c1'])
      grid.scrollToGroup('g10', 'start')
      expect(scrollHost.scrollLeft).toBe(g10FirstLeafViewCol * COL_WIDTH)

      grid.destroy()
      document.body.removeChild(container)
    }))

  // ---------------------------------------------------------------------
  // core.L2.grid-column-groups-structural-mutations
  // ---------------------------------------------------------------------
  it('core.L2.grid-column-groups-structural-mutations keeps the group tree consistent across insert/delete/move + undo', () =>
    withManualRaf((flushRaf) => {
      function baseFixture(): { fields: Field[]; columnGroups: ColumnGroupChild[]; rows: Row[] } {
        return {
          fields: [textField('m'), textField('s1c1'), textField('s1c2'), textField('s2c1'), textField('s2c2')],
          columnGroups: [
            { fieldId: 'm' },
            { id: 's1', label: '堆1', children: [{ fieldId: 's1c1' }, { fieldId: 's1c2' }] },
            { id: 's2', label: '堆2', children: [{ fieldId: 's2c1' }, { fieldId: 's2c2' }] },
          ],
          rows: Array.from({ length: 3 }, () => ({ m: 'x', s1c1: 1, s1c2: 2, s2c1: 3, s2c2: 4 })),
        }
      }

      // Act A — 步骤 1/2：insertCols 组内归组 / 组边界不归组。
      {
        const { fields, columnGroups, rows } = baseFixture()
        const data = new InMemoryDataSource({ schema: { fields, columnGroups }, rows })
        const container = document.createElement('div')
        Object.assign(container.style, { width: '400px', height: '300px' })
        document.body.appendChild(container)
        const grid = new Grid(container, { data, backend: createNoopBackend })

        // 1. 插入点在 s1c1(idx1) 与 s1c2(idx2) 之间——新列归入 s1，s1 变 3 叶。
        const inserted1 = grid.insertCols(2, 1)
        const newField1 = inserted1[0]!.id
        let groups = grid.getColumnGroups()
        const s1AfterStep1 = groups.find((n): n is ColumnGroup => isGroup(n, 's1'))!
        expect(s1AfterStep1.children).toEqual([
          { fieldId: 's1c1' },
          { fieldId: newField1 },
          { fieldId: 's1c2' },
        ])

        // 2. 插入点在 s1(现终于 idx3) 与 s2(现始于 idx4) 边界——新列不归任何组。
        const inserted2 = grid.insertCols(4, 1)
        const newField2 = inserted2[0]!.id
        groups = grid.getColumnGroups()
        expect(groups).toEqual([
          { fieldId: 'm' },
          {
            id: 's1',
            label: '堆1',
            children: [{ fieldId: 's1c1' }, { fieldId: newField1 }, { fieldId: 's1c2' }],
          },
          { fieldId: newField2 },
          { id: 's2', label: '堆2', children: [{ fieldId: 's2c1' }, { fieldId: 's2c2' }] },
        ])

        grid.destroy()
        document.body.removeChild(container)
      }

      // Act B — 步骤 3/4/5：deleteCols 级联移除 + undo 恢复 / moveCols 跨组 no-op / 同组内部成功。
      {
        const { fields, columnGroups, rows } = baseFixture()
        const data = new InMemoryDataSource({ schema: { fields, columnGroups }, rows })
        const { container, grid, recorder } = mountRecordingGrid({ data })
        flushRaf()

        // 3. deleteCols(['s1c1','s1c2'])：s1 级联移除；undo() 后 fields 与组树完整恢复。
        grid.deleteCols(['s1c1', 's1c2'])
        expect(grid.getColumnGroups().some((n) => isGroup(n, 's1'))).toBe(false)
        grid.undo()
        expect(grid.getColumnGroups()).toEqual(columnGroups)
        expect(data.getSchema().fields.map((f) => f.id)).toEqual(['m', 's1c1', 's1c2', 's2c1', 's2c2'])

        // 4. moveCols(['s1c2'], 's2c2' 之前)（跨组边界）：返回 false，fields/组树均不变。
        const fieldsBeforeMove = data.getSchema().fields.map((f) => f.id)
        expect(grid.moveCols(['s1c2'], 's2c2')).toBe(false)
        expect(data.getSchema().fields.map((f) => f.id)).toEqual(fieldsBeforeMove)
        expect(grid.getColumnGroups()).toEqual(columnGroups)

        // 5. moveCols(['s1c2'], 's1c1' 之前)（同组内部）：返回 true，s1 叶序同步，frame 组头区间不变。
        expect(grid.moveCols(['s1c2'], 's1c1')).toBe(true)
        const s1AfterMove = grid.getColumnGroups().find((n): n is ColumnGroup => isGroup(n, 's1'))!
        expect(s1AfterMove.children).toEqual([{ fieldId: 's1c2' }, { fieldId: 's1c1' }])

        flushRaf()
        const cg = lastFrame(recorder).columnGroupHeader!
        expect(findCell(cg.rows, 's1')).toEqual({
          groupId: 's1',
          label: '堆1',
          startViewCol: 1,
          endViewCol: 2,
          selected: false,
        })

        grid.destroy()
        document.body.removeChild(container)
      }
    }))

  // ---------------------------------------------------------------------
  // core.L2.grid-column-groups-bms-smoke
  //
  // Task 11 — 冻结横向滚动定位修复后转绿。根因：`ViewportController.scrollToGroup/scrollToCell`
  // 把绝对列坐标 `colsAxis.indexToPosition(colIndex)` 直接当作 vp.scrollX 目标，但横轴冻结约定
  // 是 `centerScrollX = leftWidth + vp.scrollX`（FrozenRegions），故须先减去左冻结列宽再换算。
  // 修复后 frozen.leftCols>0 时 scrollToGroup('start') 把目标堆首簇列对齐到中心可滚区左缘。
  // ---------------------------------------------------------------------
  it('core.L2.grid-column-groups-bms-smoke replicates BMS locateStack via scrollToGroup + selectGroup with a frozen metric column', () =>
    withManualRaf((flushRaf) => {
      // happy-dom container.clientWidth 恒为 0，DomGridHost 落到硬编码 fallback 视口 400×300
      // （见 scroll-to-group 场景同一注释）；列宽按此固定视口反推，非按 container.style.width。
      const METRIC_WIDTH = 80
      const LEAF_WIDTH = 40
      const STACK_COUNT = 8
      const LEAVES_PER_STACK = 4
      const ROW_COUNT = 5

      const fields: Field[] = [textField('metric', METRIC_WIDTH)]
      const columnGroups: ColumnGroupChild[] = [{ fieldId: 'metric' }]
      for (let s = 1; s <= STACK_COUNT; s++) {
        const leafIds = Array.from({ length: LEAVES_PER_STACK }, (_, k) => `s${s}c${k + 1}`)
        for (const id of leafIds) fields.push(textField(id, LEAF_WIDTH))
        columnGroups.push({
          id: `stack-${s}`,
          label: `堆${s}`,
          children: leafIds.map((fieldId) => ({ fieldId })),
        })
      }
      const rows: Row[] = Array.from({ length: ROW_COUNT }, () =>
        Object.fromEntries(fields.map((f) => [f.id, 1])),
      )
      const data = new InMemoryDataSource({ schema: { fields, columnGroups }, rows })

      const container = document.createElement('div')
      // 冻结 metric(80) + 8 叶列(40 × 8 = 320，约 2 个堆宽) 恰好等于固定视口宽度 400。
      Object.assign(container.style, { width: `${METRIC_WIDTH + LEAF_WIDTH * 8}px`, height: '300px' })
      document.body.appendChild(container)
      const { backend, recorder } = createRecordingBackend()
      const grid = new Grid(container, { data, backend, frozen: { leftCols: 1 } })
      flushRaf()

      grid.scrollToGroup('stack-6', 'start')
      expect(grid.selectGroup('stack-6')).toBe(true)

      const scrollHost = getScrollHost(container)
      scrollHost.dispatchEvent(new Event('scroll'))
      flushRaf()

      const frame = lastFrame(recorder)
      const stack6FirstLeafViewCol = 1 + 5 * LEAVES_PER_STACK // metric + stack-1..5（每堆 4 簇）
      const mainRegion = frame.viewport.regions.find((r) => r.id === 'main')!
      const frozenRegion = frame.viewport.regions.find((r) => r.id === 'middleLeft')!
      expect(mainRegion.colRange[0]).toBe(stack6FirstLeafViewCol)
      expect(frozenRegion.colRange).toEqual([0, 0])

      expect(grid.getSelection().selectedRange).toEqual({
        startRow: 0,
        endRow: ROW_COUNT - 1,
        startCol: stack6FirstLeafViewCol,
        endCol: stack6FirstLeafViewCol + LEAVES_PER_STACK - 1,
      })

      const cg = frame.columnGroupHeader!
      for (const cell of flattenCells(cg.rows)) expect(cell.selected).toBe(cell.groupId === 'stack-6')

      expect(cg.leafTopRowByViewCol[0]).toBe(0)
      expect(cg.leafTopRowByViewCol[stack6FirstLeafViewCol]).toBe(1)
      expect(frame.viewport.headerHeight).toBe(
        denseGridTheme.metrics.groupHeaderRowHeight + frame.viewport.leafHeaderHeight,
      )

      grid.destroy()
      document.body.removeChild(container)
    }))
})
