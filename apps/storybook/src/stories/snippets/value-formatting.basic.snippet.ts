// @ts-nocheck
import { Grid, InMemoryDataSource, dateToSerial } from '@zhiguang/core'
import { canvas2dBackend } from '@zhiguang/canvas2d'

// Column-level default formats (Field.format). Raw values stay numbers/dates —
// only the painted text changes. Sorting/editing/export still use the raw value.
const schema = {
  fields: [
    { id: 'product', name: 'Product', type: 'text', width: 150 },
    { id: 'amount', name: 'Amount', type: 'number', width: 130, format: { kind: 'currency', currency: 'CNY' } },
    { id: 'margin', name: 'Margin', type: 'number', width: 100, format: { kind: 'percent', decimals: 2 } },
    { id: 'qty', name: 'Qty', type: 'number', width: 120, format: { kind: 'number', thousands: true } },
    { id: 'updated', name: 'Updated', type: 'date', width: 130, format: { kind: 'date', pattern: 'YYYY-MM-DD' } },
    { id: 'size', name: 'Size', type: 'number', width: 110, format: { kind: 'custom', formatterId: 'fileSize' } },
  ],
}

const data = new InMemoryDataSource({
  schema,
  rows: [
    { product: 'Widget A', amount: 1234.5, margin: 0.1357, qty: 1234567, updated: dateToSerial(new Date(Date.UTC(2024, 5, 9))), size: 1572864 },
  ],
})

const grid = new Grid(container, {
  backend: canvas2dBackend(),
  data,
  locale: 'zh-CN', // zh-CN → ¥1,234.50；en-US → CN¥1,234.50（Intl 消歧）
  formatters: {
    // 自定义 formatter：文档只存 formatterId，函数在此注册（须纯/同步/只返 string）。
    fileSize: (v) => `${((v as number) / (1024 * 1024)).toFixed(1)} MB`,
  },
})

// 运行时给选区套格式：raw 值不变、可 undo。
grid.setValueFormat({ startRow: 0, endRow: 9, startCol: 2, endCol: 2 }, { kind: 'percent', decimals: 1 })
