import type { Meta, StoryObj } from '@storybook/html'
import { Grid, InMemoryDataSource } from '@zhiguang/core'
import type { CellRange, TextWrapMode } from '@zhiguang/core'
import { canvas2dBackend } from '@zhiguang/canvas2d'
import {
  createRichTextEditor,
  richTextExtension,
  RichTextToolbarProvider,
  useRichTextToolbarController,
} from '@zhiguang/cell-kit'
import { NovaSheetToolbar } from '@zhiguang/react'
import type { ToolbarAction } from '@zhiguang/react'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { basicTextSchema, generateRows } from '../mock-data'
import { docsMeta, docsStory } from '../story-docs'

const RICH_TEXT_DOCS = `
Rich-text cell editing via \`@zhiguang/cell-kit\`.

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

const DEFAULT_RANGE: CellRange = { startRow: 0, endRow: 0, startCol: 0, endCol: 0 }

function RichTextStoryApp(): React.ReactElement {
  const controller = useRichTextToolbarController()
  const gridHostRef = React.useRef<HTMLDivElement | null>(null)
  const gridRef = React.useRef<Grid | null>(null)

  const getRange = React.useCallback((): CellRange | null => {
    const grid = gridRef.current
    if (!grid) return null

    const selection = grid.getSelection()
    if (selection.selectedRange) return selection.selectedRange

    grid.setSelection({
      activeCell: { rowIndex: DEFAULT_RANGE.startRow, colIndex: DEFAULT_RANGE.startCol },
      anchorCell: { rowIndex: DEFAULT_RANGE.startRow, colIndex: DEFAULT_RANGE.startCol },
      extentCell: { rowIndex: DEFAULT_RANGE.endRow, colIndex: DEFAULT_RANGE.endCol },
      selectedRange: DEFAULT_RANGE,
    })
    return DEFAULT_RANGE
  }, [])

  const applyRangeAction = React.useCallback(
    (action: (range: CellRange) => boolean) => {
      const range = getRange()
      if (!range) return
      action(range)
    },
    [getRange],
  )

  const handleToolbarAction = React.useCallback(
    (action: ToolbarAction) => {
      const grid = gridRef.current
      if (!grid) return

      if (action.id === 'undo') {
        grid.undo()
        return
      }
      if (action.id === 'redo') {
        grid.redo()
        return
      }
      if (action.id === 'copy' || action.id === 'cut' || action.id === 'paste') {
        void grid[action.id]()
        return
      }
      if (action.id === 'fill-color') {
        applyRangeAction((range) => grid.setFillColor(range, action.color))
        return
      }
      if (action.id === 'borders') {
        applyRangeAction((range) => grid.setBorders(range, action.preset, action.border))
        return
      }
      if (action.id === 'merge-cells') {
        if (action.mode === 'all') applyRangeAction((range) => grid.mergeCells(range))
        return
      }
      if (action.id === 'unmerge-cells') {
        applyRangeAction((range) => grid.unmergeCells(range))
        return
      }
      if (action.id === 'text-wrap') {
        const next: TextWrapMode = 'wrap'
        applyRangeAction((range) => grid.setTextWrap(range, next))
        return
      }
      if (action.id === 'value-format') {
        applyRangeAction((range) => grid.setValueFormat(range, action.format))
      }
    },
    [applyRangeAction],
  )

  React.useEffect(() => {
    const host = gridHostRef.current
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

    gridRef.current = grid
    ;(host as HTMLElement & { __grid?: Grid }).__grid = grid
    return () => {
      grid.destroy()
      gridRef.current = null
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
      onAction: handleToolbarAction,
      extensionItems: [richTextExtension.toolbarExtension(controller)],
    }),
    React.createElement('div', {
      ref: gridHostRef,
      'data-rich-text-grid-host': '',
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
