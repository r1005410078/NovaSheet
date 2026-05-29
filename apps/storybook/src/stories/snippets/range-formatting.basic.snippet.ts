// @ts-nocheck
import { Grid } from '@novasheet/web'
import { InMemoryDataSource } from '@novasheet/core'
import type { CellRange } from '@novasheet/core'

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

function withSelection(action: (range: CellRange) => boolean): boolean {
  const range = grid.getSelection().selectedRange
  return range ? action(range) : false
}

document.getElementById('fill-yellow')!.addEventListener('click', () => {
  withSelection((range) => grid.setFillColor(range, '#fff2cc'))
})

document.getElementById('border-red-outer')!.addEventListener('click', () => {
  withSelection((range) => grid.setBorders(range, 'outer', { color: '#cc0000', width: 'medium', lineStyle: 'solid' }))
})

document.getElementById('border-all-thin')!.addEventListener('click', () => {
  withSelection((range) => grid.setBorders(range, 'all', { color: '#666666', width: 'thin', lineStyle: 'solid' }))
})

document.getElementById('merge')!.addEventListener('click', () => {
  withSelection((range) => grid.mergeCells(range))
})

document.getElementById('unmerge')!.addEventListener('click', () => {
  withSelection((range) => grid.unmergeCells(range))
})

document.getElementById('undo-btn')!.addEventListener('click', () => grid.undo())
document.getElementById('redo-btn')!.addEventListener('click', () => grid.redo())
