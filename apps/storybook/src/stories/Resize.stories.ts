import type { Meta, StoryObj } from '@storybook/html'
import { InMemoryDataSource } from '@novasheet/core'
import { withExcelHeaders } from '@novasheet/sheet'
import { createGridHost } from '../grid-host'
import { basicTextSchema, generateRows } from '../mock-data'
import { docsMeta, docsStory } from '../story-docs'
import resizeExcelSrc from './snippets/resize.excelHeaders.snippet.ts?raw'

const RESIZE_DOCS = `
Phase 3.4 row and column resize uses DOM \`<handle>\` hit zones without blocking Canvas scrolling.

### Column width

- Move the pointer to the **bottom edge of a column header**. The 8px hit zone switches to \`col-resize\` and shows a Sheets-style grip on hover.
- Drag to resize the column. Spacer and viewport state sync after release.

### Row height (requires Excel row headers)

- Enable the left row-number rail with \`withExcelHeaders()\` or \`excelHeaders: true\`. The **right edge of the row header** becomes a \`row-resize\` hit zone.
- Drag to resize row height.

### Keyboard (after a handle receives focus)

| Key | Column handle | Row handle |
|------|-----------|-----------|
| ← / → | Narrow / widen (Shift steps by 32px) | — |
| ↑ / ↓ | — | Decrease / increase height |

The minimum size is **20px** (\`MIN_RESIZE_SIZE\`). Dragging shows a Sheets-style vertical or horizontal preview line; the grid updates on release.
`.trim()

const meta: Meta = {
  title: 'Table/Row and column resize',
  ...docsMeta(RESIZE_DOCS),
}
export default meta

type Story = StoryObj

export const ExcelHeadersResize: Story = {
  name: 'Column header + row header resize',
  ...docsStory(
    resizeExcelSrc,
    'Drag column headers to resize widths and the left row header rail to resize heights. Frozen and normal-region handles sync with every frame.',
  ),
  render: () => {
    const schema = basicTextSchema()
    const data = new InMemoryDataSource({ schema, rows: generateRows(schema, 80) })
    return createGridHost(withExcelHeaders({ data }))
  },
}
