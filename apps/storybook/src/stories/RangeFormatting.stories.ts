import type { Meta, StoryObj } from '@storybook/html'
import { InMemoryDataSource } from '@novasheet/core'
import type { BorderPreset, BorderStyle, CellRange } from '@novasheet/core'
import { createGridHost } from '../grid-host'
import { basicTextSchema, generateRows } from '../mock-data'
import { docsMeta, docsStory } from '../story-docs'
import basicSrc from './snippets/range-formatting.basic.snippet.ts?raw'

const meta: Meta = {
  title: '表格/合并与格式化',
  parameters: { layout: 'centered' },
  ...docsMeta(
    'Phase 5-A：手动填充色、自定义边框（all/outer/inner/单边预设）、合并/取消合并单元格、' +
      '文本显示三态（溢出/换行/裁断）、Undo/Redo。按钮作用于当前任意选区。',
  ),
}
export default meta
type Story = StoryObj

const RED_BORDER: BorderStyle = { color: '#cc0000', width: 'medium', lineStyle: 'solid' }
const THIN_BORDER: BorderStyle = { color: '#666666', width: 'thin', lineStyle: 'solid' }

function colLabel(index: number): string {
  let n = index + 1
  let label = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    label = String.fromCharCode(65 + rem) + label
    n = Math.floor((n - 1) / 26)
  }
  return label
}

function rangeLabel(range: CellRange): string {
  const start = `${colLabel(range.startCol)}${range.startRow + 1}`
  const end = `${colLabel(range.endCol)}${range.endRow + 1}`
  return start === end ? start : `${start}:${end}`
}

export const Basic: Story = {
  name: '合并与格式化',
  ...docsStory(basicSrc, '工具栏按钮操作当前选区；状态行显示最近操作与作用范围。'),
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
    const borderOuterBtn = makeBtn('外框红色')
    const borderAllBtn = makeBtn('全部细边框')
    const borderInnerBtn = makeBtn('内部边框')
    const borderInnerHorizontalBtn = makeBtn('内部横线')
    const borderInnerVerticalBtn = makeBtn('内部竖线')
    const borderTopBtn = makeBtn('上边框')
    const borderBottomBtn = makeBtn('下边框')
    const borderLeftBtn = makeBtn('左边框')
    const borderRightBtn = makeBtn('右边框')
    const borderClearBtn = makeBtn('清除边框')
    const mergeBtn = makeBtn('合并选区')
    const unmergeBtn = makeBtn('取消合并')
    const wrapOverflowBtn = makeBtn('溢出')
    const wrapWrapBtn = makeBtn('换行')
    const wrapClipBtn = makeBtn('裁断')
    const undoBtn = makeBtn('Undo')
    const redoBtn = makeBtn('Redo')
    undoBtn.disabled = true
    redoBtn.disabled = true

    const statusEl = document.createElement('span')
    Object.assign(statusEl.style, { fontFamily: 'monospace', fontSize: '12px', color: '#555' })
    statusEl.textContent = '选择任意范围后点击按钮操作'

    for (const btn of [
      fillYellowBtn,
      borderOuterBtn,
      borderAllBtn,
      borderInnerBtn,
      borderInnerHorizontalBtn,
      borderInnerVerticalBtn,
      borderTopBtn,
      borderBottomBtn,
      borderLeftBtn,
      borderRightBtn,
      borderClearBtn,
      mergeBtn,
      unmergeBtn,
      wrapOverflowBtn,
      wrapWrapBtn,
      wrapClipBtn,
      undoBtn,
      redoBtn,
    ]) {
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

    function applyAndStatus(action: (range: CellRange) => boolean, label: string): void {
      const range = grid.getSelection().selectedRange
      if (!range) {
        statusEl.textContent = `${label} 失败 (无选区)`
        return
      }
      const ok = action(range)
      const labelText = rangeLabel(range)
      statusEl.textContent = ok ? `已${label} ${labelText}` : `${label} 失败 (${labelText})`
      syncButtons()
    }

    fillYellowBtn.addEventListener('click', () => {
      applyAndStatus((range) => grid.setFillColor(range, '#fff2cc'), '填充黄色')
    })

    function applyBorder(
      button: HTMLButtonElement,
      preset: BorderPreset,
      label: string,
      border: BorderStyle | null,
    ): void {
      button.addEventListener('click', () => {
        applyAndStatus((range) => grid.setBorders(range, preset, border), label)
      })
    }

    applyBorder(borderOuterBtn, 'outer', '设置外框红色', RED_BORDER)
    applyBorder(borderAllBtn, 'all', '设置全部细边框', THIN_BORDER)
    applyBorder(borderInnerBtn, 'inner', '设置内部边框', THIN_BORDER)
    applyBorder(borderInnerHorizontalBtn, 'innerHorizontal', '设置内部横线', THIN_BORDER)
    applyBorder(borderInnerVerticalBtn, 'innerVertical', '设置内部竖线', THIN_BORDER)
    applyBorder(borderTopBtn, 'top', '设置上边框', RED_BORDER)
    applyBorder(borderBottomBtn, 'bottom', '设置下边框', RED_BORDER)
    applyBorder(borderLeftBtn, 'left', '设置左边框', RED_BORDER)
    applyBorder(borderRightBtn, 'right', '设置右边框', RED_BORDER)
    applyBorder(borderClearBtn, 'clear', '清除边框', null)

    mergeBtn.addEventListener('click', () => {
      applyAndStatus((range) => grid.mergeCells(range), '合并选区')
    })

    unmergeBtn.addEventListener('click', () => {
      applyAndStatus((range) => grid.unmergeCells(range), '取消合并')
    })

    wrapOverflowBtn.addEventListener('click', () => {
      applyAndStatus((range) => grid.setTextWrap(range, 'overflow'), '设为溢出')
    })
    wrapWrapBtn.addEventListener('click', () => {
      applyAndStatus((range) => grid.setTextWrap(range, 'wrap'), '设为换行')
    })
    wrapClipBtn.addEventListener('click', () => {
      applyAndStatus((range) => grid.setTextWrap(range, 'clip'), '设为裁断')
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
