import type { Meta, StoryObj } from '@storybook/html'
import { Grid } from '@novasheet/web'
import type { Schema } from '@novasheet/core'
import { createGridHost } from '../grid-host'
import { GeneratedDataSource } from '../generated-data-source'

const meta: Meta = {
  title: 'Grid/Frozen',
  parameters: { layout: 'centered' },
}
export default meta

type Story = StoryObj

const schema: Schema = {
  fields: [
    { id: 'employee', name: 'Employee', type: 'text', width: 160 },
    { id: 'team', name: 'Team', type: 'text', width: 140 },
    { id: 'region', name: 'Region', type: 'text', width: 140 },
    { id: 'revenue', name: 'Revenue', type: 'number', width: 140 },
    { id: 'growth', name: 'Growth', type: 'number', width: 120 },
    { id: 'owner', name: 'Owner', type: 'text', width: 160 },
    { id: 'status', name: 'Status', type: 'text', width: 120 },
    { id: 'notes', name: 'Notes', type: 'text', width: 260 },
  ],
}

const teams = ['Platform', 'Data', 'Design', 'Ops']
const regions = ['NA', 'EU', 'APAC', 'LATAM']
const statuses = ['On track', 'Watch', 'Blocked']

export const FrozenTopLeftAndRight: Story = {
  render: () => {
    const data = new GeneratedDataSource(1_000, schema, (row, fieldId) => {
      if (fieldId === 'employee') return `Employee ${row}`
      if (fieldId === 'team') return teams[row % teams.length]!
      if (fieldId === 'region') return regions[row % regions.length]!
      if (fieldId === 'revenue') return row * 1_000 + 250
      if (fieldId === 'growth') return Math.round(Math.sin(row / 10) * 1000) / 10
      if (fieldId === 'owner') return `Owner ${row % 12}`
      if (fieldId === 'status') return statuses[row % statuses.length]!
      return `Quarterly note ${row}`
    })

    const host = createGridHost({
      data,
      frozen: { topRows: 1, leftCols: 1, rightCols: 1 },
    })
    requestAnimationFrame(() => {
      const grid = (host as HTMLElement & { __grid: Grid }).__grid
      grid.scrollToCell(24, 'owner')
    })
    return host
  },
}
