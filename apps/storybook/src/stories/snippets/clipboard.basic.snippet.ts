// @ts-nocheck — storybook docs display snippet; references undefined demo names by design
import { Grid } from '@novasheet/core'
import { canvas2dBackend } from '@novasheet/canvas2d'
import { InMemoryDataSource, type Schema } from '@novasheet/core'

const schema: Schema = {
  fields: [
    { id: 'name', name: 'Name', type: 'text', width: 120 },
    { id: 'qty', name: 'Quantity', type: 'number', width: 100 },
  ],
}

const grid = new Grid(container, {
  backend: canvas2dBackend(),
  data: new InMemoryDataSource({ schema, rows }),
  onCopy: (range) => console.log('copied', range),
  onCut: (range) => console.log('cut', range),
  onPaste: (target) => console.log('pasted into', target),
  onPasteSkipped: (cells) => console.warn('skipped (type mismatch)', cells),
})

// After selecting a range:
// Ctrl/Cmd+C copies; Ctrl/Cmd+X cuts and clears the source cells; Ctrl/Cmd+V pastes.
// You can also use the Cut/Copy/Paste context menu from Phase 4.0.
// Or call the APIs: await grid.copy() / cut() / paste()
//
// Data uses TSV through the system clipboard and interoperates with Excel / Sheets.
// Type-incompatible cells are skipped and reported through onPasteSkipped.
