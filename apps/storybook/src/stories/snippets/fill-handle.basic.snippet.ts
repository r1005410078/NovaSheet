// @ts-nocheck
import { Grid } from '@novasheet/core'
import { canvas2dBackend } from '@novasheet/canvas2d'
import { InMemoryDataSource } from '@novasheet/core'

const schema = {
  fields: [
    { id: 'task', name: 'Task', type: 'text', width: 160 },
    { id: 'count', name: 'Count', type: 'number', width: 100 },
    { id: 'due', name: 'Due', type: 'date', width: 160 },
    { id: 'done', name: 'Done', type: 'checkbox', width: 90 },
  ],
}

const rows = [
  { task: 'Item 001', count: 1, due: new Date('2026-01-01T00:00:00Z'), done: false },
  { task: 'Item 002', count: 3, due: new Date('2026-01-03T00:00:00Z'), done: true },
  { task: null, count: null, due: null, done: null },
  { task: null, count: null, due: null, done: null },
]

const grid = new Grid(document.getElementById('grid')!, {
  backend: canvas2dBackend,
  data: new InMemoryDataSource({ schema, rows }),
  onFill: (event) => console.log('[fill]', event.direction, event.fill),
})

void grid
