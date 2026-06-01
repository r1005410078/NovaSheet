import type { Meta, StoryObj } from '@storybook/html'
import { InMemoryDataSource } from '@novasheet/core'
import { createGridHost } from '../grid-host'
import { basicTextSchema, generateRows } from '../mock-data'
import { docsMeta, docsStory } from '../story-docs'
import basicSrc from './snippets/contextMenu.basic.snippet.ts?raw'

const meta: Meta = {
  title: 'Table/Context menu',
  parameters: { layout: 'centered' },
  ...docsMeta(
    'Phase 4.0: right-click a body cell to open Cut / Copy / Paste. Paste is enabled by default for MutableDataSource, and Cut/Copy actions are exposed through `onContextMenuAction`.',
  ),
}
export default meta

type Story = StoryObj

export const Basic: Story = {
  name: 'Basic context menu',
  ...docsStory(
    basicSrc,
    'Right-click the body area to open the menu. Esc closes it, arrow keys move focus, and Enter triggers the callback.',
  ),
  render: () => {
    const schema = basicTextSchema()
    const data = new InMemoryDataSource({ schema, rows: generateRows(schema, 30) })
    return createGridHost({
      data,
      onContextMenuAction: (action, ctx) => {
        // eslint-disable-next-line no-console
        const detail =
          ctx.targetKind === 'columnHeader'
            ? ctx.field
            : ctx.targetKind === 'rowHeader'
              ? ctx.targetRowIndex
              : ctx.cell
        console.log('[ContextMenu]', action, detail)
      },
    })
  },
}

export const PasteEnabled: Story = {
  name: 'Paste enabled',
  ...docsStory(basicSrc, 'Paste is enabled by default when using a MutableDataSource.'),
  render: () => {
    const schema = basicTextSchema()
    const data = new InMemoryDataSource({ schema, rows: generateRows(schema, 30) })
    return createGridHost({ data })
  },
}
