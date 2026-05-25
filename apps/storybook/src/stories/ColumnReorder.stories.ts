import type { Meta, StoryObj } from '@storybook/html'
import { InMemoryDataSource, type Row, type Schema } from '@novasheet/core'
import type { Grid } from '@novasheet/web'
import { createGridHost } from '../grid-host'
import { docsMeta, docsStory } from '../story-docs'

const meta: Meta = {
  title: '表格/列拖拽重排（Phase 4.7）',
  parameters: { layout: 'fullscreen' },
  ...docsMeta(
    'Phase 4.7：先点击列头选中列，再从已选列头拖动；拖动中显示 DOM 灰色目标列带与深色落点线，松手提交列序变更。',
  ),
}
export default meta

type Story = StoryObj

function reorderSchema(): Schema {
  return {
    fields: [
      { id: 'name', name: '姓名', type: 'text', width: 140 },
      { id: 'team', name: '团队', type: 'text', width: 120 },
      { id: 'revenue', name: '营收', type: 'number', width: 110 },
      { id: 'date', name: '入职日期', type: 'date', width: 140 },
      { id: 'active', name: '在职', type: 'checkbox', width: 80 },
    ],
  }
}

function makeRows(n: number): Row[] {
  const teams = ['Platform', 'Data', 'Design']
  const base = Date.UTC(2024, 0, 1)
  return Array.from({ length: n }, (_, i) => ({
    name: `员工 ${String(i + 1).padStart(3, '0')}`,
    team: teams[i % teams.length]!,
    revenue: (i + 1) * 1000,
    date: new Date(base + i * 86400000),
    active: i % 2 === 0,
  }))
}

const defaultSource = `
const data = new InMemoryDataSource({ schema, rows })
createGridHost({ data })

// 手动：点击列头选中列；在已选列头内再次按下拖动；松手提交列序。
`

export const Default: Story = {
  name: '默认（先选列再拖动）',
  ...docsStory(
    defaultSource,
    '点击任意列头选中整列，然后在已选列头内拖动到目标位置；拖动中只显示灰色目标列带与深色落点线。',
  ),
  render: () => {
    const data = new InMemoryDataSource({ schema: reorderSchema(), rows: makeRows(100) })
    return createGridHost({ data })
  },
}

const multiColumnSource = `
const data = new InMemoryDataSource({ schema, rows })
const host = createGridHost({ data })
const grid: Grid = (host as any).__grid

grid.setSelection({
  activeCell: { rowIndex: 0, colIndex: 1 },
  anchorCell: { rowIndex: 0, colIndex: 1 },
  extentCell: { rowIndex: rows.length - 1, colIndex: 2 },
  selectedRange: { startRow: 0, endRow: rows.length - 1, startCol: 1, endCol: 2 },
})
`

export const MultiColumn: Story = {
  name: '多列（预选 team + revenue）',
  ...docsStory(
    multiColumnSource,
    '进入 story 后已选中 team + revenue 两列；在任一已选列头内拖动即可移动连续列组。',
  ),
  render: () => {
    const rows = makeRows(80)
    const data = new InMemoryDataSource({ schema: reorderSchema(), rows })
    const host = createGridHost({ data })
    const grid = (host as unknown as { __grid: Grid }).__grid
    grid.setSelection({
      activeCell: { rowIndex: 0, colIndex: 1 },
      anchorCell: { rowIndex: 0, colIndex: 1 },
      extentCell: { rowIndex: rows.length - 1, colIndex: 2 },
      selectedRange: { startRow: 0, endRow: rows.length - 1, startCol: 1, endCol: 2 },
    })
    return host
  },
}

const hiddenColsSource = `
const data = new InMemoryDataSource({ schema, rows })
const host = createGridHost({ data })
const grid: Grid = (host as any).__grid

grid.hideCols(['date'])
grid.moveCols(['team', 'revenue'], null)
`

export const HiddenCols: Story = {
  name: '隐藏列保持 fieldId 锚定',
  ...docsStory(
    hiddenColsSource,
    'date 列预隐藏；拖拽可见列只按可见列边界落点，隐藏列不会作为拖拽对象或独立 drop target。',
  ),
  render: () => {
    const data = new InMemoryDataSource({ schema: reorderSchema(), rows: makeRows(80) })
    const host = createGridHost({ data })
    const grid = (host as unknown as { __grid: Grid }).__grid
    grid.hideCols(['date'])
    grid.moveCols(['team', 'revenue'], null)
    return host
  },
}
