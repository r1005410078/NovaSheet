import { Grid } from '@novasheet/web'
import { InMemoryDataSource, type Schema } from '@novasheet/core'

const schema: Schema = {
  fields: [
    { id: 'name', name: '员工', type: 'text', width: 100 },
    { id: 'desc', name: '描述', type: 'text', width: 220, wrap: true },
    { id: 'note', name: '备注', type: 'text', width: 160, wrap: true },
    { id: 'amount', name: '金额', type: 'number', width: 100 },
  ],
}

const data = new InMemoryDataSource({ schema, rows })
const grid = new Grid(container, { data })
grid.autofitRows()  // 按列宽与文本内容批量重算 wrap 字段所在行的行高
