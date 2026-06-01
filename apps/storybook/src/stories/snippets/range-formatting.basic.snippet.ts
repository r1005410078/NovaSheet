// @ts-nocheck
import { Grid } from '@novasheet/web'
import { InMemoryDataSource } from '@novasheet/core'
import type { BorderPreset, BorderStyle, CellRange } from '@novasheet/core'

const RED_BORDER: BorderStyle = { color: '#cc0000', width: 'medium', lineStyle: 'solid' }
const THIN_BORDER: BorderStyle = { color: '#666666', width: 'thin', lineStyle: 'solid' }

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
    name: `Employee ${i + 1}`,
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

function bindBorderButton(id: string, preset: BorderPreset, border: BorderStyle | null): void {
  document.getElementById(id)!.addEventListener('click', () => {
    withSelection((range) => grid.setBorders(range, preset, border))
  })
}

bindBorderButton('border-outer', 'outer', RED_BORDER)
bindBorderButton('border-all', 'all', THIN_BORDER)
bindBorderButton('border-inner', 'inner', THIN_BORDER)
bindBorderButton('border-inner-horizontal', 'innerHorizontal', THIN_BORDER)
bindBorderButton('border-inner-vertical', 'innerVertical', THIN_BORDER)
bindBorderButton('border-top', 'top', RED_BORDER)
bindBorderButton('border-bottom', 'bottom', RED_BORDER)
bindBorderButton('border-left', 'left', RED_BORDER)
bindBorderButton('border-right', 'right', RED_BORDER)
bindBorderButton('border-clear', 'clear', null)

document.getElementById('merge')!.addEventListener('click', () => {
  withSelection((range) => grid.mergeCells(range))
})

document.getElementById('unmerge')!.addEventListener('click', () => {
  withSelection((range) => grid.unmergeCells(range))
})

document.getElementById('undo-btn')!.addEventListener('click', () => grid.undo())
document.getElementById('redo-btn')!.addEventListener('click', () => grid.redo())
