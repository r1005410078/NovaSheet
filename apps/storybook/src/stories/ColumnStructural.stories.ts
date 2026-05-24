import type { Meta, StoryObj } from '@storybook/html'
import { InMemoryDataSource, type Row, type Schema } from '@novasheet/core'
import type { Grid } from '@novasheet/web'
import { createGridHost } from '../grid-host'
import { docsMeta, docsStory } from '../story-docs'

const meta: Meta = {
  title: '表格/列结构操作（Phase 4.6）',
  parameters: { layout: 'fullscreen' },
  ...docsMeta(
    'Phase 4.6：列头右键菜单提供插入列、删除列、隐藏列、取消隐藏列、调整列宽；同时支持通过 Grid 公开 API 以编程方式操作。',
  ),
}
export default meta

type Story = StoryObj

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

function columnSchema(): Schema {
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

// ---------------------------------------------------------------------------
// Story 1: Default — plain table, column header context menu available
// ---------------------------------------------------------------------------

const defaultSource = `
const data = new InMemoryDataSource({ schema, rows })
createGridHost({ data })
`

export const Default: Story = {
  name: '默认（列头右键菜单）',
  ...docsStory(
    defaultSource,
    '右键任意列头打开列操作菜单：Insert column left / right、Delete column、Hide column、Resize column width。',
  ),
  render: () => {
    const data = new InMemoryDataSource({ schema: columnSchema(), rows: makeRows(100) })
    return createGridHost({ data })
  },
}

// ---------------------------------------------------------------------------
// Story 2: InsertDelete — buttons trigger insertCols / deleteCols imperatively
// ---------------------------------------------------------------------------

const insertDeleteSource = `
const data = new InMemoryDataSource({ schema, rows })
const host = createGridHost({ data })
const grid: Grid = (host as any).__grid

// 在第 3 个字段前插入 2 列
grid.insertCols(2, 2)

// 删除 team + revenue 两列
grid.deleteCols(['team', 'revenue'])
`

export const InsertDelete: Story = {
  name: '插入 / 删除列（编程式）',
  ...docsStory(
    insertDeleteSource,
    '点击按钮在第 3 个字段前插入 2 列，或删除 team + revenue 两列。也可右键列头使用菜单操作。',
  ),
  render: () => {
    const data = new InMemoryDataSource({ schema: columnSchema(), rows: makeRows(30) })
    const host = createGridHost({ data })
    const grid = (host as unknown as { __grid: Grid }).__grid

    const wrapper = document.createElement('div')
    wrapper.style.cssText = 'display:flex;flex-direction:column;width:100%;height:100%'

    const toolbar = document.createElement('div')
    toolbar.style.cssText =
      'display:flex;gap:8px;padding:8px;background:#f5f5f5;border-bottom:1px solid #ddd;flex-shrink:0'

    const btnInsert = document.createElement('button')
    btnInsert.textContent = '在第 3 个字段前插入 2 列'
    btnInsert.addEventListener('click', () => {
      grid.insertCols(2, 2)
    })

    const btnDelete = document.createElement('button')
    btnDelete.textContent = '删除 team + revenue'
    btnDelete.addEventListener('click', () => {
      grid.deleteCols(['team', 'revenue'])
    })

    toolbar.appendChild(btnInsert)
    toolbar.appendChild(btnDelete)

    host.style.flex = '1'
    host.style.minHeight = '0'

    wrapper.appendChild(toolbar)
    wrapper.appendChild(host)
    return wrapper
  },
}

// ---------------------------------------------------------------------------
// Story 3: PrefilledHidden — date and active columns hidden on mount
// ---------------------------------------------------------------------------

const hiddenSource = `
const data = new InMemoryDataSource({ schema, rows })
const host = createGridHost({ data })
const grid: Grid = (host as any).__grid

// 隐藏 date + active 两列
grid.hideCols(['date', 'active'])
`

export const PrefilledHidden: Story = {
  name: '预隐藏列',
  ...docsStory(
    hiddenSource,
    'date 与 active 两列在挂载后立即被隐藏；列头显示折叠指示。点击按钮可取消隐藏。',
  ),
  render: () => {
    const data = new InMemoryDataSource({ schema: columnSchema(), rows: makeRows(50) })
    const host = createGridHost({ data })
    const grid = (host as unknown as { __grid: Grid }).__grid

    grid.hideCols(['date', 'active'])

    const wrapper = document.createElement('div')
    wrapper.style.cssText = 'display:flex;flex-direction:column;width:100%;height:100%'

    const toolbar = document.createElement('div')
    toolbar.style.cssText =
      'display:flex;gap:8px;padding:8px;background:#f5f5f5;border-bottom:1px solid #ddd;flex-shrink:0'

    const btnUnhide = document.createElement('button')
    btnUnhide.textContent = '取消隐藏全部'
    btnUnhide.addEventListener('click', () => {
      grid.unhideCols(grid.getHiddenCols().slice())
    })

    toolbar.appendChild(btnUnhide)

    host.style.flex = '1'
    host.style.minHeight = '0'

    wrapper.appendChild(toolbar)
    wrapper.appendChild(host)
    return wrapper
  },
}
