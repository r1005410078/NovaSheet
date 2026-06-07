// @ts-nocheck
import { InMemoryDataSource } from '@novasheet/core'
import { NovaExcel } from '@novasheet/react'

const data = new InMemoryDataSource({
  schema: {
    fields: [
      { id: 'name', name: 'Name', type: 'text', width: 200 },
      { id: 'role', name: 'Role', type: 'text', width: 180 },
      { id: 'team', name: 'Team', type: 'text', width: 160 },
      { id: 'score', name: 'Score', type: 'number', width: 100 },
    ],
  },
  rows: Array.from({ length: 100 }, (_, i) => ({
    name: `Employee ${String(i + 1).padStart(3, '0')}`,
    role: i % 2 === 0 ? 'Engineer' : 'Researcher',
    team: i % 3 === 0 ? 'Platform' : 'Data',
    score: (i + 1) * 10,
  })),
})

export function Sheet() {
  return (
    <NovaExcel
      data={data}
      className="h-[560px] w-full"
      onToolbarAction={(action) => {
        console.log('toolbar', action.id)
      }}
    />
  )
}
