import type { Meta, StoryObj } from '@storybook/html'
import { InMemoryDataSource } from '@novasheet/core'
import { createGridHost } from '../grid-host'
import { generateRows, mixedTypesSchema } from '../mock-data'
import { docsMeta, docsStory } from '../story-docs'
import allSevenSrc from './snippets/fieldTypes.allSeven.snippet.ts?raw'

const meta: Meta = {
  title: 'Table/Field types',
  ...docsMeta(
    'One column for each of the seven `FieldType` values. `text` and `number` use dedicated paint paths; the rest use text fallback.',
  ),
}
export default meta

type Story = StoryObj

export const AllSevenTypes: Story = {
  name: 'Seven field types',
  ...docsStory(allSevenSrc),
  render: () => {
    const schema = mixedTypesSchema()
    const data = new InMemoryDataSource({ schema, rows: generateRows(schema, 50) })
    return createGridHost({ data })
  },
}
