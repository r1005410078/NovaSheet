import type { Meta, StoryObj } from '@storybook/html'
import { InMemoryDataSource } from '@zhiguang/novasheet-core'
import { createGridHost } from '../grid-host'
import { basicTextSchema, generateRows } from '../mock-data'
import { docsMeta, docsStory } from '../story-docs'
import keyboardNavSrc from './snippets/selection.keyboardNavigation.snippet.ts?raw'

const SELECTION_DOCS = `
Phase 3 selection and keyboard navigation. \`DomGridHost\` and \`WebGridRuntime\` wire the interactions automatically, so application code does not need to listen for keydown events.

### Before using

1. Click any cell first so the \`scroll-host\` receives focus.
2. Then use the shortcuts below. If a key does not respond, click the grid once more.

### Mouse

| Action | Effect |
|------|------|
| Click a cell | Selects one cell; \`activeCell\` = \`anchorCell\` = \`extentCell\` |
| Shift + click | Extends from \`anchorCell\` to the clicked cell; \`activeCell\` stays unchanged |
| Drag | Selects a range; edge auto-scroll is enabled |

### Keyboard (Phase 3.3)

| Key | Effect |
|------|------|
| ↑ ↓ ← → | Moves \`activeCell\` and collapses the selection to one cell |
| Shift + ↑↓←→ | Moves \`extentCell\`, extends \`selectedRange\`, and keeps \`anchorCell\` / \`activeCell\` unchanged |
| Tab | Moves right; wraps to the first cell of the next row at the end of a row |
| Shift + Tab | Moves left; wraps to the last cell of the previous row at the start of a row |
| Enter | Moves down one row |
| Shift + Enter | Moves up one row |
| Type directly | Starts editing with Sheets-style replacement |
| F2 | Edits at the end of the existing value |

When the focused cell moves outside the viewport, the grid automatically scrolls it back into view through \`computeScrollReveal\`.

### Visuals

- Selection fill and active-cell borders are painted in the Canvas **overlay** layer.
- In Excel mode (\`excelHeaders: true\`), row and column headers are highlighted with the selection.

### Engine API (optional)

\`\`\`ts
engine.selectCell({ rowIndex, colIndex }, { extend: true })
engine.navigateSelection('ArrowDown', false) // usually called by the runtime
engine.getSelection() // activeCell / anchorCell / extentCell / selectedRange
\`\`\`
`.trim()

const meta: Meta = {
  title: 'Table/Selection and keyboard',
  ...docsMeta(SELECTION_DOCS),
}
export default meta

type Story = StoryObj

/** 200 rows for checking arrow-key navigation and scroll reveal. */
export const KeyboardNavigation: Story = {
  name: 'Keyboard navigation (200 rows)',
  ...docsStory(
    keyboardNavSrc,
    'After clicking the grid: arrow keys move, Shift+arrow extends, Tab/Enter move between cells, and offscreen cells scroll back into view.',
  ),
  render: () => {
    const schema = basicTextSchema()
    const data = new InMemoryDataSource({ schema, rows: generateRows(schema, 200) })
    return createGridHost({ data })
  },
}
