import type { Meta, StoryObj } from '@storybook/html'
import { InMemoryDataSource, dateToSerial, type Row, type Schema } from '@zhiguang/novasheet-core'
import { Grid } from '@zhiguang/novasheet-core'
import { createGridHost } from '../grid-host'
import { docsMeta, docsStory } from '../story-docs'

const meta: Meta = {
  title: 'Table/Row structure (Phase 4.5)',
  parameters: { layout: 'fullscreen' },
  ...docsMeta(
    'Phase 4.5: row header context menus provide insert, delete, hide, and unhide actions. The same operations are also exposed through the public Grid API.',
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
    date: dateToSerial(new Date(base + i * 86400000)),
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
  name: 'Default row header menu',
  ...docsStory(
    defaultSource,
    'Right-click any row header in the left row-number rail to open row actions: Insert row above / below, Delete row, and Hide row.',
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

// Insert 2 rows before row 5
grid.insertRows(4, 2)

// Delete underlying row ids 0 and 1
grid.deleteRows([0, 1])
`

export const InsertDelete: Story = {
  name: 'Insert / delete rows programmatically',
  ...docsStory(
    insertDeleteSource,
    'Use the buttons to insert blank rows around the selected position or delete underlying row ids 0-2. You can also use the row header context menu.',
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
    btnInsert.textContent = 'Insert 2 rows before row 5'
    btnInsert.addEventListener('click', () => {
      grid.insertRows(4, 2)
    })

    const btnDelete = document.createElement('button')
    btnDelete.textContent = 'Delete underlying rows 0-2'
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

// Hide underlying row ids 4-6 and 11-12 (0-indexed)
grid.hideRows([4, 5, 6, 11, 12])
`

export const PrefilledHidden: Story = {
  name: 'Pre-hidden rows',
  ...docsStory(
    hiddenSource,
    'Rows 5-7 and 12-13 (1-based) are hidden on mount. Row headers show collapse indicators. Use the button to unhide all rows.',
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
    btnUnhide.textContent = 'Unhide all'
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
