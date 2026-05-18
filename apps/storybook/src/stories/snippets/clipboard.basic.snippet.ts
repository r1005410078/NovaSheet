// @ts-nocheck — storybook docs display snippet; references undefined demo names by design
import { Grid } from '@novasheet/web'
import { InMemoryDataSource, type Schema } from '@novasheet/core'

const schema: Schema = {
  fields: [
    { id: 'name', name: '姓名', type: 'text', width: 120 },
    { id: 'qty', name: '数量', type: 'number', width: 100 },
  ],
}

const grid = new Grid(container, {
  data: new InMemoryDataSource({ schema, rows }),
  onCopy: (range) => console.log('copied', range),
  onCut: (range) => console.log('cut', range),
  onPaste: (target) => console.log('pasted into', target),
  onPasteSkipped: (cells) => console.warn('skipped (type mismatch)', cells),
})

// 选区后：
// Ctrl/Cmd+C 复制；Ctrl/Cmd+X 剪切（原格立即清）；Ctrl/Cmd+V 粘贴
// 也可右键菜单 Cut/Copy/Paste（4.0）
// 或编程：await grid.copy() / cut() / paste()
//
// 数据走系统剪贴板 TSV，能与 Excel / Sheets 互通；
// 类型不匹配的 cell 跳过 + onPasteSkipped 事件。
