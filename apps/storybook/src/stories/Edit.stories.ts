import type { Meta, StoryObj } from '@storybook/html'
import { InMemoryDataSource } from '@zhiguang/novasheet-core'
import { createGridHost } from '../grid-host'
import { mixedTypesSchema, generateRows } from '../mock-data'
import { docsMeta, docsStory } from '../story-docs'

const EDIT_DOCS = `
Phase 3.5 basic cell editing for \`text\` and \`number\` columns.

### Enter edit mode (Google Sheets style)

- **Click to select**, then **type directly**. The first character replaces the old value and later input appends.
- **F2** or **double-click** edits at the end of the existing value without selecting all text.
- **Enter** moves down one row when the cell is not being edited.

### Commit / cancel

| Action | Effect |
|------|------|
| **Enter** | Commits and moves down one row |
| Click another cell / blur | Commits and keeps focus on the current cell |
| **Esc** | Cancels and restores the old value |

The editor is a DOM \`<input>\` overlaid on the cell, using the theme selection border color.
`.trim()

const meta: Meta = {
  title: 'Table/Basic editing',
  ...docsMeta(EDIT_DOCS),
}
export default meta

type Story = StoryObj

export const TextAndNumber: Story = {
  ...docsStory(EDIT_DOCS),
  render: () => {
    const schema = mixedTypesSchema()
    const data = new InMemoryDataSource({ schema, rows: generateRows(schema, 30) })
    return createGridHost({ data, excelHeaders: true })
  },
}
