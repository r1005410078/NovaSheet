// @ts-nocheck
import { Grid } from '@novasheet/web'
import { InMemoryDataSource } from '@novasheet/core'

const schema = {
  fields: [
    { id: 'name', name: 'Name', type: 'text', width: 160 },
    { id: 'role', name: 'Role', type: 'text', width: 140 },
    { id: 'team', name: 'Team', type: 'text', width: 140 },
  ],
}

const data = new InMemoryDataSource({
  schema,
  rows: Array.from({ length: 20 }, (_, i) => ({
    name: `员工 ${i + 1}`,
    role: ['Engineer', 'Designer', 'PM'][i % 3],
    team: ['Platform', 'Growth', 'Data'][i % 3],
  })),
})

const container = document.getElementById('grid-container')!
const grid = new Grid(container, { data })

// 演示范围：第 0–2 行，第 0–1 列（A1:B3）
const DEMO_RANGE = { startRow: 0, endRow: 2, startCol: 0, endCol: 1 }
const DEMO_SELECTION = {
  activeCell: { rowIndex: 0, colIndex: 0 },
  anchorCell: { rowIndex: 0, colIndex: 0 },
  extentCell: { rowIndex: 2, colIndex: 1 },
  selectedRange: DEMO_RANGE,
}

document.getElementById('fill-yellow')!.addEventListener('click', () => {
  grid.setSelection(DEMO_SELECTION)
  grid.setFillColor(DEMO_RANGE, '#fff2cc')
})

document.getElementById('border-red-outer')!.addEventListener('click', () => {
  grid.setSelection(DEMO_SELECTION)
  grid.setBorders(DEMO_RANGE, 'outer', { color: '#cc0000', width: 'medium', lineStyle: 'solid' })
})

document.getElementById('border-all-thin')!.addEventListener('click', () => {
  grid.setSelection(DEMO_SELECTION)
  grid.setBorders(DEMO_RANGE, 'all', { color: '#666666', width: 'thin', lineStyle: 'solid' })
})

document.getElementById('merge')!.addEventListener('click', () => {
  grid.setSelection(DEMO_SELECTION)
  grid.mergeCells(DEMO_RANGE)
})

document.getElementById('unmerge')!.addEventListener('click', () => {
  grid.setSelection(DEMO_SELECTION)
  grid.unmergeCells(DEMO_RANGE)
})

document.getElementById('undo-btn')!.addEventListener('click', () => grid.undo())
document.getElementById('redo-btn')!.addEventListener('click', () => grid.redo())
