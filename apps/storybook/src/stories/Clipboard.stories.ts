import type { Meta, StoryObj } from '@storybook/html'
import { InMemoryDataSource } from '@novasheet/core'
import { createGridHost } from '../grid-host'
import { basicTextSchema, generateRows } from '../mock-data'
import { docsMeta, docsStory } from '../story-docs'
import basicSrc from './snippets/clipboard.basic.snippet.ts?raw'

const meta: Meta = {
  title: 'Table/Clipboard',
  parameters: { layout: 'centered' },
  ...docsMeta(
    'Phase 4.1: Cut / Copy / Paste. Ctrl/Cmd+X/C/V and the context menu share the same engine, TSV interops with Excel / Sheets, and incompatible cells are skipped through `onPasteSkipped`.',
  ),
}
export default meta
type Story = StoryObj

export const Basic: Story = {
  name: 'Basic clipboard',
  ...docsStory(
    basicSrc,
    'Select a range, then use Ctrl/Cmd+C/X/V or the context menu. Open the browser console to inspect onCopy/onCut/onPaste output.',
  ),
  render: () => {
    const schema = basicTextSchema()
    const data = new InMemoryDataSource({ schema, rows: generateRows(schema, 50) })
    return createGridHost({
      data,
      onCopy: (r) => {
        // eslint-disable-next-line no-console
        console.log('[clipboard] copy', r)
      },
      onCut: (r) => {
        // eslint-disable-next-line no-console
        console.log('[clipboard] cut', r)
      },
      onPaste: (t) => {
        // eslint-disable-next-line no-console
        console.log('[clipboard] paste', t)
      },
      onPasteSkipped: (c) => {
        // eslint-disable-next-line no-console
        console.warn('[clipboard] skipped', c)
      },
    })
  },
}
