import type { Meta, StoryObj } from '@storybook/html'
import { Grid, InMemoryDataSource } from '@novasheet/core'
import { canvas2dBackend } from '@novasheet/canvas2d'
import { richTextExtension } from '@novasheet/cell-kit'
import { basicTextSchema, generateRows } from '../mock-data'
import { docsMeta, docsStory } from '../story-docs'

const RICH_TEXT_DOCS = `
Rich-text cell editing via \`@novasheet/cell-kit\`.

### 三点注册（spec §4.3）

| 注册点 | API | 作用 |
|---|---|---|
| codec | \`cellAttachments: [richTextExtension.codec]\` | 持久化 TextRun[] 至 \`richText\` namespace |
| renderer | \`canvas2dBackend({ cellRenderers: { text: … } })\` | 分段渲染 bold/italic |
| editor | \`cellEditors: { text: richTextExtension.editor }\` | contenteditable + 浮动格式工具栏 |

### 使用方式

- **双击**或 **F2** 进入 rich-text 编辑（inline contenteditable）。
- 选中文本后使用浮动工具栏切换 **Bold**（\`Ctrl+B\`）/ **Italic**（\`Ctrl+I\`）。
- **Enter** 提交，**Esc** 取消，提交后 canvas renderer 显示格式化文本。
`.trim()

const meta: Meta = {
  title: 'Cell-Kit/RichText',
  ...docsMeta(RICH_TEXT_DOCS),
}
export default meta

type Story = StoryObj

export const Registered: Story = {
  name: 'Registered rich-text',
  ...docsStory(RICH_TEXT_DOCS),
  render: () => {
    const schema = basicTextSchema()
    const data = new InMemoryDataSource({ schema, rows: generateRows(schema, 30) })

    const host = document.createElement('div')
    host.style.width = '100%'
    host.style.height = '100%'
    host.style.position = 'relative'
    host.style.boxSizing = 'border-box'
    host.style.minHeight = '0'

    const grid = new Grid(host, {
      data,
      cellAttachments: [richTextExtension.codec],
      cellEditors: { text: richTextExtension.editor },
      backend: canvas2dBackend({ cellRenderers: { text: richTextExtension.renderer } }),
    })
    ;(host as unknown as HTMLElement & { __grid: Grid }).__grid = grid
    return host
  },
}
