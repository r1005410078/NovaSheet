import type { Meta, StoryObj } from '@storybook/html'
import { InMemoryDataSource } from '@zhiguang/novasheet-core'
import { createGridHost } from '../grid-host'
import { basicTextSchema } from '../mock-data'
import { docsMeta, docsStory } from '../story-docs'
import noRowsSrc from './snippets/empty.noRows.snippet.ts?raw'

const meta: Meta = {
  title: 'Table/Empty state',
  ...docsMeta(
    'When `rowCount = 0`, headers still render and the body shows an empty-state illustration and message.',
  ),
}
export default meta

type Story = StoryObj

export const NoRows: Story = {
  name: 'No rows',
  ...docsStory(noRowsSrc),
  render: () => {
    const schema = basicTextSchema()
    const data = new InMemoryDataSource({ schema, rows: [] })
    return createGridHost({ data })
  },
}
