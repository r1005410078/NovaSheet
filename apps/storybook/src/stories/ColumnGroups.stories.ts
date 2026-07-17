import type { Meta, StoryObj } from '@storybook/html'
import type { CellValue, ColumnGroupChild, Field, Grid, Schema } from '@zhiguang/novasheet-core'
import { createGridHost } from '../grid-host'
import { GeneratedDataSource } from '../generated-data-source'
import { docsMeta, docsStory } from '../story-docs'

const meta: Meta = {
  title: 'Table/Column groups',
  ...docsMeta(
    'Multi-row column group headers — the SlickBmsTablePanel replacement use case: a frozen ' +
      'ungrouped metric column plus a nested site → stack → cluster group tree. Click a group ' +
      'header to select the whole group, or use the buttons to replicate locateStack ' +
      '(scrollToGroup + selectGroup).',
  ),
}
export default meta

type Story = StoryObj

const SITE_COUNT = 2
const STACKS_PER_SITE = 4
const CLUSTERS_PER_STACK = 4
const ROW_COUNT = 300

function stackId(site: number, stackInSite: number): string {
  return `stack-${(site - 1) * STACKS_PER_SITE + stackInSite}`
}

function leafId(site: number, stackInSite: number, cluster: number): string {
  return `${stackId(site, stackInSite)}c${cluster}`
}

function buildSchema(): Schema {
  const fields: Field[] = [{ id: 'metric', name: 'Metric', type: 'text', width: 120 }]
  const columnGroups: ColumnGroupChild[] = [{ fieldId: 'metric' }]

  for (let site = 1; site <= SITE_COUNT; site++) {
    const stacks: ColumnGroupChild[] = []
    for (let stackInSite = 1; stackInSite <= STACKS_PER_SITE; stackInSite++) {
      const stackNumber = (site - 1) * STACKS_PER_SITE + stackInSite
      const leaves: ColumnGroupChild[] = []
      for (let cluster = 1; cluster <= CLUSTERS_PER_STACK; cluster++) {
        const id = leafId(site, stackInSite, cluster)
        fields.push({ id, name: `簇${cluster}`, type: 'number', width: 90 })
        leaves.push({ fieldId: id })
      }
      stacks.push({ id: stackId(site, stackInSite), label: `堆${stackNumber}`, children: leaves })
    }
    columnGroups.push({ id: `site-${site}`, label: `机房${site === 1 ? 'A' : 'B'}`, children: stacks })
  }

  return { fields, columnGroups }
}

const schema = buildSchema()

function cellValue(row: number, fieldId: string): CellValue {
  if (fieldId === 'metric') return `传感器 ${String(row + 1).padStart(3, '0')}`
  const match = /^stack-(\d+)c(\d+)$/.exec(fieldId)
  if (!match) return null
  const stack = Number.parseInt(match[1]!, 10)
  const cluster = Number.parseInt(match[2]!, 10)
  return Math.round((row * 7 + stack * 13 + cluster * 3) % 100) + cluster / 10
}

const source = `
const schema = { fields, columnGroups } // metric（冻结无组）+ 机房A/B → 堆1..8 → 簇1..4
const data = new GeneratedDataSource(300, schema, cellValue)
const host = createGridHost({ data, frozen: { leftCols: 1 } })
const grid: Grid = (host as any).__grid

// BMS locateStack 等价物：滚动到堆首簇列并整堆高亮。
grid.scrollToGroup('stack-6', 'start')
grid.selectGroup('stack-6')
`

export const BmsStackClusterHeaders: Story = {
  name: 'BMS stack → cluster headers (frozen metric column)',
  ...docsStory(
    source,
    '33 columns: a frozen metric/index column plus a 2-level nested group tree (site → stack → ' +
      'cluster, 300 rows). Click any group header cell to select the whole group; use the ' +
      'buttons below to replicate locateStack via scrollToGroup + selectGroup.',
  ),
  render: () => {
    const data = new GeneratedDataSource(ROW_COUNT, schema, cellValue)
    const host = createGridHost({ data, frozen: { leftCols: 1 } })
    const grid = (host as unknown as { __grid: Grid }).__grid

    const wrapper = document.createElement('div')
    wrapper.style.cssText = 'display:flex;flex-direction:column;width:100%;height:100%'

    const toolbar = document.createElement('div')
    toolbar.style.cssText =
      'display:flex;gap:8px;padding:8px;background:#f5f5f5;border-bottom:1px solid #ddd;flex-shrink:0'

    for (const target of [2, 5, 8]) {
      const btn = document.createElement('button')
      btn.textContent = `定位堆${target}（locateStack）`
      btn.addEventListener('click', () => {
        grid.scrollToGroup(`stack-${target}`, 'start')
        grid.selectGroup(`stack-${target}`)
      })
      toolbar.appendChild(btn)
    }

    host.style.flex = '1'
    host.style.minHeight = '0'

    wrapper.appendChild(toolbar)
    wrapper.appendChild(host)
    return wrapper
  },
}
