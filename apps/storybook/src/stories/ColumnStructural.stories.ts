import type { Meta, StoryObj } from '@storybook/html'
import { InMemoryDataSource, type Row, type Schema } from '@novasheet/core'
import type { Grid } from '@novasheet/web'
import { createGridHost } from '../grid-host'
import { docsMeta, docsStory } from '../story-docs'

const meta: Meta = {
  title: 'Table/Column structure (Phase 4.6)',
  parameters: { layout: 'fullscreen' },
  ...docsMeta(
    'Phase 4.6: column header context menus provide insert, delete, hide, unhide, and resize actions. The same operations are also exposed through the public Grid API.',
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
      { id: 'name', name: 'Name', type: 'text', width: 140 },
      { id: 'team', name: 'Team', type: 'text', width: 120 },
      { id: 'revenue', name: 'Revenue', type: 'number', width: 110 },
      { id: 'date', name: 'Start date', type: 'date', width: 140 },
      { id: 'active', name: 'Active', type: 'checkbox', width: 80 },
    ],
  }
}

function makeRows(n: number): Row[] {
  const teams = ['Platform', 'Data', 'Design']
  const base = Date.UTC(2024, 0, 1)
  return Array.from({ length: n }, (_, i) => ({
    name: `Employee ${String(i + 1).padStart(3, '0')}`,
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
  name: 'Default column header menu',
  ...docsStory(
    defaultSource,
    'Right-click any column header to open column actions: Insert column left / right, Delete column, Hide column, and Resize column width.',
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

// Insert 2 columns before the third field
grid.insertCols(2, 2)

// Delete the team + revenue columns
grid.deleteCols(['team', 'revenue'])
`

export const InsertDelete: Story = {
  name: 'Insert / delete columns programmatically',
  ...docsStory(
    insertDeleteSource,
    'Use the buttons to insert two columns before the third field or delete the team + revenue columns. You can also use the column header context menu.',
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
    btnInsert.textContent = 'Insert 2 columns before field 3'
    btnInsert.addEventListener('click', () => {
      grid.insertCols(2, 2)
    })

    const btnDelete = document.createElement('button')
    btnDelete.textContent = 'Delete team + revenue'
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

// Hide the date + active columns
grid.hideCols(['date', 'active'])
`

export const PrefilledHidden: Story = {
  name: 'Pre-hidden columns',
  ...docsStory(
    hiddenSource,
    'The date and active columns are hidden on mount. Column headers show collapse indicators. Use the button to unhide all columns.',
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
    btnUnhide.textContent = 'Unhide all'
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
