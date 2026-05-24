import type { Meta, StoryObj } from '@storybook/html'
import { InMemoryDataSource, type Row, type Schema } from '@novasheet/core'
import { Grid } from '@novasheet/web'
import { createGridHost } from '../grid-host'
import { docsMeta, docsStory } from '../story-docs'

const meta: Meta = {
  title: '表格/行结构操作（Phase 4.5）',
  parameters: { layout: 'fullscreen' },
  ...docsMeta(
    'Phase 4.5：行头右键菜单提供插入行、删除行、隐藏行、取消隐藏行；同时支持通过 Grid 公开 API 以编程方式操作。',
  ),
}
export default meta

type Story = StoryObj

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

function rowSchema(): Schema {
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
// Story 1: Default — plain table, row header context menu available
// ---------------------------------------------------------------------------

const defaultSource = `
const data = new InMemoryDataSource({ schema, rows })
createGridHost({ data })
`

export const Default: Story = {
  name: '默认（行头右键菜单）',
  ...docsStory(
    defaultSource,
    '右键任意行头（最左侧行号列）打开行操作菜单：Insert row above / below、Delete row、Hide row。',
  ),
  render: () => {
    const data = new InMemoryDataSource({ schema: rowSchema(), rows: makeRows(100) })
    return createGridHost({ data })
  },
}

// ---------------------------------------------------------------------------
// Story 2: InsertDelete — buttons trigger insertRows / deleteRows imperatively
// ---------------------------------------------------------------------------

const insertDeleteSource = `
const data = new InMemoryDataSource({ schema, rows })
const host = createGridHost({ data })
const grid: Grid = (host as any).__grid

// 在第 5 行之前插入 2 行
grid.insertRows(4, 2)

// 删除底层 id 为 0、1 的行
grid.deleteRows([0, 1])
`

export const InsertDelete: Story = {
  name: '插入 / 删除行（编程式）',
  ...docsStory(
    insertDeleteSource,
    '点击按钮在选中位置前后插入空白行，或删除底层行 id 0~2。也可右键行头使用菜单操作。',
  ),
  render: () => {
    const data = new InMemoryDataSource({ schema: rowSchema(), rows: makeRows(30) })
    const host = createGridHost({ data })
    const grid = (host as unknown as { __grid: Grid }).__grid

    // Wrapper that adds control buttons above the grid
    const wrapper = document.createElement('div')
    wrapper.style.cssText = 'display:flex;flex-direction:column;width:100%;height:100%'

    const toolbar = document.createElement('div')
    toolbar.style.cssText =
      'display:flex;gap:8px;padding:8px;background:#f5f5f5;border-bottom:1px solid #ddd;flex-shrink:0'

    const btnInsert = document.createElement('button')
    btnInsert.textContent = '在第 5 行前插入 2 行'
    btnInsert.addEventListener('click', () => {
      grid.insertRows(4, 2)
    })

    const btnDelete = document.createElement('button')
    btnDelete.textContent = '删除底层行 0~2'
    btnDelete.addEventListener('click', () => {
      grid.deleteRows([0, 1, 2])
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
// Story 3: PrefilledHidden — rows 5–7 and 12–13 hidden on mount
// ---------------------------------------------------------------------------

const hiddenSource = `
const data = new InMemoryDataSource({ schema, rows })
const host = createGridHost({ data })
const grid: Grid = (host as any).__grid

// 隐藏底层行 id 4~6 和 11~12（从 0 计数）
grid.hideRows([4, 5, 6, 11, 12])
`

export const PrefilledHidden: Story = {
  name: '预隐藏行',
  ...docsStory(
    hiddenSource,
    '行 5~7 和行 12~13（1-based）在挂载后立即被隐藏；行头显示折叠指示。点击按钮可取消隐藏。',
  ),
  render: () => {
    const data = new InMemoryDataSource({ schema: rowSchema(), rows: makeRows(50) })
    const host = createGridHost({ data })
    const grid = (host as unknown as { __grid: Grid }).__grid

    // Hide rows 5–7 and 12–13 (0-indexed underlying ids: 4,5,6,11,12)
    grid.hideRows([4, 5, 6, 11, 12])

    const wrapper = document.createElement('div')
    wrapper.style.cssText = 'display:flex;flex-direction:column;width:100%;height:100%'

    const toolbar = document.createElement('div')
    toolbar.style.cssText =
      'display:flex;gap:8px;padding:8px;background:#f5f5f5;border-bottom:1px solid #ddd;flex-shrink:0'

    const btnUnhide = document.createElement('button')
    btnUnhide.textContent = '取消隐藏全部'
    btnUnhide.addEventListener('click', () => {
      grid.unhideRows(grid.getHiddenRows().slice())
    })

    toolbar.appendChild(btnUnhide)

    host.style.flex = '1'
    host.style.minHeight = '0'

    wrapper.appendChild(toolbar)
    wrapper.appendChild(host)
    return wrapper
  },
}
