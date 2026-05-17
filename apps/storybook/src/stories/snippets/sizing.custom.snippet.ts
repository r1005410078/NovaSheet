// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck — storybook docs display snippet; references
import { Grid } from '@novasheet/web'
import { InMemoryDataSource, type Schema } from '@novasheet/core'
import { generateRows } from '../mock-data'

const schema: Schema = {
  fields: [
    { id: 'tiny', name: 'Tiny', type: 'text', width: 60 },
    { id: 'medium', name: 'Medium', type: 'text', width: 140 },
    { id: 'wide', name: 'Wide', type: 'text', width: 320 },
    { id: 'count', name: 'Count', type: 'number', width: 90 },
  ],
}
const data = new InMemoryDataSource({ schema, rows: generateRows(schema, 60) })

const el = document.createElement('div')
el.style.cssText = 'width:780px;height:480px;position:relative'
const grid = new Grid(el, { data })
grid.setRowHeight(0, 56)
grid.setRowHeight(1, 40)
grid.setRowHeight(2, 20)
