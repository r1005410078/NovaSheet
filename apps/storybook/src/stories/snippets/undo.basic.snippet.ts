// @ts-nocheck
import { Grid } from '@novasheet/web'
import { InMemoryDataSource } from '@novasheet/core'

const schema = {
  fields: [
    { id: 'name', name: '名称', type: 'text', width: 140 },
    { id: 'qty', name: '数量', type: 'number', width: 100 },
  ],
}

const data = new InMemoryDataSource({
  schema,
  rows: Array.from({ length: 30 }, (_, i) => ({ name: `产品 ${i + 1}`, qty: 10 + i })),
})

const container = document.getElementById('grid-container')!

const grid = new Grid(container, {
  data,
  onUndo: (e) => console.log('[undo]', e.command.kind),
  onRedo: (e) => console.log('[redo]', e.command.kind),
})

// 编程式 undo / redo
document.getElementById('undo-btn')!.addEventListener('click', () => grid.undo())
document.getElementById('redo-btn')!.addEventListener('click', () => grid.redo())
