import type { Meta, StoryObj } from '@storybook/html'
import { InMemoryDataSource, denseGridTheme, type Theme } from '@novasheet/core'
import { createGridHost } from '../grid-host'
import { basicTextSchema, generateRows } from '../mock-data'

const meta: Meta = {
  title: 'Grid/Theme',
  parameters: { layout: 'centered' },
}
export default meta

type Story = StoryObj

/**
 * 默认 denseGridTheme——基线参考。
 */
export const Dense: Story = {
  render: () => {
    const schema = basicTextSchema()
    const data = new InMemoryDataSource({ schema, rows: generateRows(schema, 80) })
    return createGridHost({ data })
  },
}

/**
 * 自定义 compactTheme——演示运行时主题切换。
 * 仅改 metrics.rowHeight 与若干颜色，其余从 denseGridTheme 继承。
 */
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
  render: () => {
    const schema = basicTextSchema()
    const data = new InMemoryDataSource({ schema, rows: generateRows(schema, 80) })
    return createGridHost({ data, theme: compactTheme })
  },
}
