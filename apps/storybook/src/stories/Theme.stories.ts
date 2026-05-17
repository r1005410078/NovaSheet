import type { Meta, StoryObj } from '@storybook/html'
import { InMemoryDataSource, denseGridTheme, type Theme } from '@novasheet/core'
import { createGridHost } from '../grid-host'
import { basicTextSchema, generateRows } from '../mock-data'
import { docsMeta, docsStory } from '../story-docs'
import { sources } from '../story-sources'

const meta: Meta = {
  title: '表格/主题',
  parameters: { layout: 'centered' },
  ...docsMeta('通过 `theme` 选项或 `setTheme` 切换 Theme Token。'),
}
export default meta

type Story = StoryObj

export const Dense: Story = {
  name: '默认紧凑',
  ...docsStory(sources.theme.dense),
  render: () => {
    const schema = basicTextSchema()
    const data = new InMemoryDataSource({ schema, rows: generateRows(schema, 80) })
    return createGridHost({ data })
  },
}

const compactTheme: Theme = {
  ...denseGridTheme,
  metrics: {
    ...denseGridTheme.metrics,
    rowHeight: 24,
    headerHeight: 28,
    fontSize: 11,
  },
  colors: {
    ...denseGridTheme.colors,
    background: '#fbfbfd',
    headerBackground: '#ecf0f4',
    text: '#0d1117',
    headerText: '#4a5562',
    gridLine: '#e3e7eb',
    gridLineStrong: '#b8c2cc',
  },
}

export const Compact: Story = {
  name: '更紧凑',
  ...docsStory(sources.theme.compact),
  render: () => {
    const schema = basicTextSchema()
    const data = new InMemoryDataSource({ schema, rows: generateRows(schema, 80) })
    return createGridHost({ data, theme: compactTheme })
  },
}
