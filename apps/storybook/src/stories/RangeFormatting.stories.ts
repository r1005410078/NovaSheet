import type { Meta, StoryObj } from '@storybook/html'
import { InMemoryDataSource } from '@novasheet/core'
import { createGridHost } from '../grid-host'
import { basicTextSchema, generateRows } from '../mock-data'
import { docsMeta, docsStory } from '../story-docs'
import basicSrc from './snippets/range-formatting.basic.snippet.ts?raw'

const meta: Meta = {
  title: '表格/合并与格式化',
  parameters: { layout: 'centered' },
  ...docsMeta(
    'Phase 5-A：手动填充色、自定义边框（outer/all 预设）、合并/取消合并单元格、Undo/Redo。演示范围固定为 A1:B3（第 0–2 行，第 0–1 列）。',
  ),
}
export default meta
type Story = StoryObj

// 演示范围：第 0–2 行，第 0–1 列（A1:B3）
const DEMO_RANGE = { startRow: 0, endRow: 2, startCol: 0, endCol: 1 }
const DEMO_LABEL = 'A1:B3'

export const Basic: Story = {
  name: '合并与格式化',
  ...docsStory(
    basicSrc,
    '工具栏按钮操作固定演示范围 A1:B3；每次操作前调用 setSelection 以高亮范围，状态行显示最近操作。',
  ),
  render: () => {
    const schema = basicTextSchema()
    const data = new InMemoryDataSource({ schema, rows: generateRows(schema, 30) })

    const wrapper = document.createElement('div')
    Object.assign(wrapper.style, {
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      padding: '8px',
      width: '720px',
      height: '480px',
      boxSizing: 'border-box',
    })

    const toolbar = document.createElement('div')
    Object.assign(toolbar.style, { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' })

    function makeBtn(label: string): HTMLButtonElement {
      const btn = document.createElement('button')
      btn.textContent = label
      Object.assign(btn.style, { padding: '4px 10px', cursor: 'pointer' })
      return btn
    }

    const fillYellowBtn = makeBtn('填充黄色')
    const borderRedBtn = makeBtn('红色外框')
    const borderAllBtn = makeBtn('全部细边框')
    const mergeBtn = makeBtn('合并选区')
    const unmergeBtn = makeBtn('取消合并')
    const undoBtn = makeBtn('Undo')
    const redoBtn = makeBtn('Redo')
    undoBtn.disabled = true
    redoBtn.disabled = true

    const statusEl = document.createElement('span')
    Object.assign(statusEl.style, { fontFamily: 'monospace', fontSize: '12px', color: '#555' })
    statusEl.textContent = `演示范围: ${DEMO_LABEL} — 点击按钮操作`

    for (const btn of [fillYellowBtn, borderRedBtn, borderAllBtn, mergeBtn, unmergeBtn, undoBtn, redoBtn]) {
      toolbar.appendChild(btn)
    }
    toolbar.appendChild(statusEl)

    const gridContainer = document.createElement('div')
    Object.assign(gridContainer.style, { flex: '1', minHeight: '0', position: 'relative' })

    wrapper.appendChild(toolbar)
    wrapper.appendChild(gridContainer)

    const gridEl = createGridHost({ data }, '100%', '100%')
    gridContainer.appendChild(gridEl)

    const grid = (gridEl as unknown as HTMLElement & { __grid: import('@novasheet/web').Grid }).__grid

    function syncButtons(): void {
      undoBtn.disabled = !grid.canUndo()
      redoBtn.disabled = !grid.canRedo()
    }

    const DEMO_SELECTION = {
      activeCell: { rowIndex: DEMO_RANGE.startRow, colIndex: DEMO_RANGE.startCol },
      anchorCell: { rowIndex: DEMO_RANGE.startRow, colIndex: DEMO_RANGE.startCol },
      extentCell: { rowIndex: DEMO_RANGE.endRow, colIndex: DEMO_RANGE.endCol },
      selectedRange: DEMO_RANGE,
    }

    function applyAndStatus(action: () => boolean, label: string): void {
      grid.setSelection(DEMO_SELECTION)
      const ok = action()
      statusEl.textContent = ok ? `已${label} ${DEMO_LABEL}` : `${label} 失败 (${DEMO_LABEL})`
      syncButtons()
    }

    fillYellowBtn.addEventListener('click', () => {
      applyAndStatus(() => grid.setFillColor(DEMO_RANGE, '#fff2cc'), '填充黄色')
    })

    borderRedBtn.addEventListener('click', () => {
      applyAndStatus(
        () => grid.setBorders(DEMO_RANGE, 'outer', { color: '#cc0000', width: 'medium', lineStyle: 'solid' }),
        '设置红色外框',
      )
    })

    borderAllBtn.addEventListener('click', () => {
      applyAndStatus(
        () => grid.setBorders(DEMO_RANGE, 'all', { color: '#666666', width: 'thin', lineStyle: 'solid' }),
        '设置全部细边框',
      )
    })

    mergeBtn.addEventListener('click', () => {
      applyAndStatus(() => grid.mergeCells(DEMO_RANGE), '合并选区')
    })

    unmergeBtn.addEventListener('click', () => {
      applyAndStatus(() => grid.unmergeCells(DEMO_RANGE), '取消合并')
    })

    undoBtn.addEventListener('click', () => {
      grid.undo()
      statusEl.textContent = `已撤销`
      syncButtons()
    })

    redoBtn.addEventListener('click', () => {
      grid.redo()
      statusEl.textContent = `已重做`
      syncButtons()
    })

    const pollId = window.setInterval(syncButtons, 200)
    wrapper.dataset['pollId'] = String(pollId)

    return wrapper
  },
}
