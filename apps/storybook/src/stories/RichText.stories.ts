import type { Meta, StoryObj } from '@storybook/html'
import { Grid, InMemoryDataSource } from '@novasheet/core'
import { canvas2dBackend } from '@novasheet/canvas2d'
import {
  createRichTextEditor,
  richTextExtension,
  RichTextToolbarProvider,
  useRichTextToolbarController,
} from '@novasheet/cell-kit'
import { NovaSheetToolbar } from '@novasheet/react'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { basicTextSchema, generateRows } from '../mock-data'
import { docsMeta, docsStory } from '../story-docs'

const RICH_TEXT_DOCS = `
Rich-text cell editing via \`@novasheet/cell-kit\`.

### Google Sheets-like external toolbar

| 注册点 | API | 作用 |
|---|---|---|
| codec | \`cellAttachments: [richTextExtension.codec]\` | 持久化 TextRun[] 至 \`richText\` namespace |
| renderer | \`canvas2dBackend({ cellRenderers: { text: richTextExtension.renderer } })\` | 分段渲染 rich-text runs |
| editor | \`cellEditors: { text: createRichTextEditor({ getToolbarController }) }\` | inline contenteditable editor |
| toolbar | \`NovaSheetToolbar extensionItems={[richTextExtension.toolbarExtension(controller)]}\` | 外部 React toolbar 控制当前 editor 选区 |

### 使用方式

- 双击或 F2 进入 rich-text 编辑。
- 在单元格内选中部分文本。
- 使用表格上方 toolbar 切换 Bold / Italic / Underline / Strike / 字号。
- Enter 提交，Esc 取消，提交后 canvas renderer 显示格式化文本。
`.trim()

const meta: Meta = {
  title: 'Cell-Kit/RichText',
  ...docsMeta(RICH_TEXT_DOCS),
}
export default meta

type Story = StoryObj

function RichTextStoryApp(): React.ReactElement {
  const controller = useRichTextToolbarController()
  const gridRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    const host = gridRef.current
    if (!host) return

    const schema = basicTextSchema()
    const data = new InMemoryDataSource({ schema, rows: generateRows(schema, 30) })
    const grid = new Grid(host, {
      data,
      cellAttachments: [richTextExtension.codec],
      cellEditors: {
        text: createRichTextEditor({ getToolbarController: () => controller }),
      },
      backend: canvas2dBackend({ cellRenderers: { text: richTextExtension.renderer } }),
    })

    ;(host as HTMLElement & { __grid?: Grid }).__grid = grid
    return () => {
      grid.destroy()
      delete (host as HTMLElement & { __grid?: Grid }).__grid
    }
  }, [controller])

  return React.createElement(
    'div',
    {
      style: {
        display: 'grid',
        gridTemplateRows: 'auto minmax(0, 1fr)',
        height: '100%',
        minHeight: 0,
      },
    },
    React.createElement(NovaSheetToolbar, {
      extensionItems: [richTextExtension.toolbarExtension(controller)],
    }),
    React.createElement('div', {
      ref: gridRef,
      style: { position: 'relative', minHeight: 0 },
    }),
  )
}

export const Registered: Story = {
  name: 'Registered rich-text',
  ...docsStory(RICH_TEXT_DOCS),
  render: () => {
    const host = document.createElement('div')
    host.style.width = '100%'
    host.style.height = '100%'
    host.style.minHeight = '0'

    const root = createRoot(host)
    root.render(
      React.createElement(
        RichTextToolbarProvider,
        null,
        React.createElement(RichTextStoryApp),
      ),
    )
    ;(host as HTMLElement & { __root?: typeof root }).__root = root
    return host
  },
}
