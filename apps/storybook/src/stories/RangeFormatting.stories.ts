import type { Meta, StoryObj } from '@storybook/html'
import { InMemoryDataSource } from '@novasheet/core'
import type { BorderPreset, BorderStyle, CellRange } from '@novasheet/core'
import { createGridHost } from '../grid-host'
import { basicTextSchema, generateRows } from '../mock-data'
import { docsMeta, docsStory } from '../story-docs'
import basicSrc from './snippets/range-formatting.basic.snippet.ts?raw'

const meta: Meta = {
  title: 'Table/Merge and formatting',
  parameters: { layout: 'centered' },
  ...docsMeta(
    'Phase 5-A/5-B: fill colors, custom borders (all/outer/inner/single-edge presets plus solid/dashed/dotted/double styles), merge/unmerge, text-wrap modes, and Undo/Redo. Toolbar actions apply to the current selection.',
  ),
}
export default meta
type Story = StoryObj

const RED_BORDER: BorderStyle = { color: '#cc0000', width: 'medium', lineStyle: 'solid' }
const DASHED_BORDER: BorderStyle = { color: '#1a73e8', width: 'thin', lineStyle: 'dashed' }
const DOTTED_BORDER: BorderStyle = { color: '#1a73e8', width: 'medium', lineStyle: 'dotted' }
const DOUBLE_BORDER: BorderStyle = { color: '#188038', width: 'thin', lineStyle: 'double' }
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
  name: 'Merge and formatting',
  ...docsStory(
    basicSrc,
    'Toolbar buttons operate on the current selection. The status line shows the latest operation and affected range.',
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
    Object.assign(toolbar.style, {
      display: 'flex',
      gap: '6px',
      alignItems: 'center',
      flexWrap: 'wrap',
    })

    function makeBtn(label: string): HTMLButtonElement {
      const btn = document.createElement('button')
      btn.textContent = label
      Object.assign(btn.style, { padding: '4px 10px', cursor: 'pointer' })
      return btn
    }

    const fillYellowBtn = makeBtn('Fill yellow')
    const borderOuterBtn = makeBtn('Red outer')
    const borderAllBtn = makeBtn('All thin')
    const borderInnerBtn = makeBtn('Inner borders')
    const borderInnerHorizontalBtn = makeBtn('Inner horizontal')
    const borderInnerVerticalBtn = makeBtn('Inner vertical')
    const borderTopBtn = makeBtn('Top border')
    const borderBottomBtn = makeBtn('Bottom border')
    const borderLeftBtn = makeBtn('Left border')
    const borderRightBtn = makeBtn('Right border')
    const borderDashedBtn = makeBtn('Dashed outer')
    const borderDottedBtn = makeBtn('Dotted outer')
    const borderDoubleBtn = makeBtn('Double outer')
    const borderClearBtn = makeBtn('Clear borders')
    const mergeBtn = makeBtn('Merge')
    const unmergeBtn = makeBtn('Unmerge')
    const wrapOverflowBtn = makeBtn('Overflow')
    const wrapWrapBtn = makeBtn('Wrap')
    const wrapClipBtn = makeBtn('Clip')
    const undoBtn = makeBtn('Undo')
    const redoBtn = makeBtn('Redo')
    undoBtn.disabled = true
    redoBtn.disabled = true

    const statusEl = document.createElement('span')
    Object.assign(statusEl.style, { fontFamily: 'monospace', fontSize: '12px', color: '#555' })
    statusEl.textContent = 'Select any range, then click a toolbar button'

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
      borderDashedBtn,
      borderDottedBtn,
      borderDoubleBtn,
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

    const grid = (gridEl as unknown as HTMLElement & { __grid: import('@novasheet/core').Grid })
      .__grid

    function syncButtons(): void {
      undoBtn.disabled = !grid.canUndo()
      redoBtn.disabled = !grid.canRedo()
    }

    function applyAndStatus(action: (range: CellRange) => boolean, label: string): void {
      const range = grid.getSelection().selectedRange
      if (!range) {
        statusEl.textContent = `${label} failed (no selection)`
        return
      }
      const ok = action(range)
      const labelText = rangeLabel(range)
      statusEl.textContent = ok ? `${label} ${labelText}` : `${label} failed (${labelText})`
      syncButtons()
    }

    fillYellowBtn.addEventListener('click', () => {
      applyAndStatus((range) => grid.setFillColor(range, '#fff2cc'), 'Filled yellow')
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

    applyBorder(borderOuterBtn, 'outer', 'Set red outer border', RED_BORDER)
    applyBorder(borderAllBtn, 'all', 'Set all thin borders', THIN_BORDER)
    applyBorder(borderInnerBtn, 'inner', 'Set inner borders', THIN_BORDER)
    applyBorder(
      borderInnerHorizontalBtn,
      'innerHorizontal',
      'Set inner horizontal borders',
      THIN_BORDER,
    )
    applyBorder(borderInnerVerticalBtn, 'innerVertical', 'Set inner vertical borders', THIN_BORDER)
    applyBorder(borderTopBtn, 'top', 'Set top border', RED_BORDER)
    applyBorder(borderBottomBtn, 'bottom', 'Set bottom border', RED_BORDER)
    applyBorder(borderLeftBtn, 'left', 'Set left border', RED_BORDER)
    applyBorder(borderRightBtn, 'right', 'Set right border', RED_BORDER)
    applyBorder(borderDashedBtn, 'outer', 'Set dashed outer border', DASHED_BORDER)
    applyBorder(borderDottedBtn, 'outer', 'Set dotted outer border', DOTTED_BORDER)
    applyBorder(borderDoubleBtn, 'outer', 'Set double outer border', DOUBLE_BORDER)
    applyBorder(borderClearBtn, 'clear', 'Cleared borders', null)

    mergeBtn.addEventListener('click', () => {
      applyAndStatus((range) => grid.mergeCells(range), 'Merged selection')
    })

    unmergeBtn.addEventListener('click', () => {
      applyAndStatus((range) => grid.unmergeCells(range), 'Unmerged selection')
    })

    wrapOverflowBtn.addEventListener('click', () => {
      applyAndStatus((range) => grid.setTextWrap(range, 'overflow'), 'Set overflow')
    })
    wrapWrapBtn.addEventListener('click', () => {
      applyAndStatus((range) => grid.setTextWrap(range, 'wrap'), 'Set wrap')
    })
    wrapClipBtn.addEventListener('click', () => {
      applyAndStatus((range) => grid.setTextWrap(range, 'clip'), 'Set clip')
    })

    undoBtn.addEventListener('click', () => {
      grid.undo()
      statusEl.textContent = 'Undone'
      syncButtons()
    })

    redoBtn.addEventListener('click', () => {
      grid.redo()
      statusEl.textContent = 'Redone'
      syncButtons()
    })

    const pollId = window.setInterval(syncButtons, 200)
    wrapper.dataset['pollId'] = String(pollId)

    return wrapper
  },
}
