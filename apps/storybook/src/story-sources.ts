/** Storybook Docs 展示的 TypeScript 示例（与 stories 行为一致，便于复制）。 */

export const sources = {
  intro: `import { Grid } from '@novasheet/web'
import { InMemoryDataSource, denseGridTheme } from '@novasheet/core'

const grid = new Grid(container, {
  data: new InMemoryDataSource({ schema, rows }),
  theme: denseGridTheme,
  frozen: { topRows: 1, leftCols: 1, rightCols: 1 },
})

grid.scrollToCell(500, 'owner')`,
  default: {
    hundredRows: `import { InMemoryDataSource } from '@novasheet/core'
import { createGridHost } from '../grid-host'
import { basicTextSchema, generateRows } from '../mock-data'

const schema = basicTextSchema()
const data = new InMemoryDataSource({
  schema,
  rows: generateRows(schema, 100),
})

createGridHost({ data })`,
  },
  empty: {
    noRows: `import { InMemoryDataSource } from '@novasheet/core'
import { createGridHost } from '../grid-host'
import { basicTextSchema } from '../mock-data'

const data = new InMemoryDataSource({
  schema: basicTextSchema(),
  rows: [],
})

createGridHost({ data }, 720, 280)`,
  },
  fieldTypes: {
    allSeven: `import { InMemoryDataSource } from '@novasheet/core'
import { createGridHost } from '../grid-host'
import { generateRows, mixedTypesSchema } from '../mock-data'

const schema = mixedTypesSchema()
const data = new InMemoryDataSource({
  schema,
  rows: generateRows(schema, 50),
})

createGridHost({ data })`,
  },
  frozen: {
    topLeftRight: `import { Grid } from '@novasheet/web'
import type { FieldDef, Schema } from '@novasheet/core'
import { createGridHost } from '../grid-host'
import { GeneratedDataSource } from '../generated-data-source'

const metricFields: FieldDef[] = Array.from({ length: 18 }, (_, i) => ({
  id: \`metric_\${String(i + 1).padStart(2, '0')}\`,
  name: \`指标 \${i + 1}\`,
  type: (i + 1) % 3 === 0 ? 'number' : 'text',
  width: 100,
}))

const schema: Schema = {
  fields: [
    { id: 'employee', name: '员工', type: 'text', width: 120 },
    ...metricFields,
    { id: 'summary', name: '汇总', type: 'text', width: 180 },
  ],
}

const data = new GeneratedDataSource(1_000, schema, (row, fieldId) => {
  if (fieldId === 'employee') return \`员工 \${row}\`
  if (fieldId === 'summary') return \`第 \${(row % 4) + 1} 季度汇总\`
  return \`指标-\${row}\`
})

const host = createGridHost({
  data,
  frozen: { topRows: 1, leftCols: 1, rightCols: 1 },
})

requestAnimationFrame(() => {
  const grid = (host as HTMLElement & { __grid: Grid }).__grid
  grid.scrollToCell(24, 'metric_10')
})`,
  },
  larger: {
    thousandRows: `import { InMemoryDataSource, type Schema } from '@novasheet/core'
import { createGridHost } from '../grid-host'
import { generateRows } from '../mock-data'

const schema: Schema = {
  fields: [
    { id: 'name', name: 'Name', type: 'text', width: 160 },
    { id: 'role', name: 'Role', type: 'text', width: 140 },
    { id: 'team', name: 'Team', type: 'text', width: 120 },
    { id: 'count', name: 'Count', type: 'number', width: 90 },
    { id: 'note', name: 'Note', type: 'text', width: 240 },
  ],
}

const data = new InMemoryDataSource({
  schema,
  rows: generateRows(schema, 1000),
})

createGridHost({ data })`,
  },
  scroll: {
    tenThousand: `import { InMemoryDataSource, type Schema } from '@novasheet/core'
import { createGridHost } from '../grid-host'

const schema: Schema = {
  fields: [
    { id: 'idx', name: 'Index', type: 'number', width: 80 },
    { id: 'name', name: 'Name', type: 'text', width: 200 },
    { id: 'category', name: 'Category', type: 'text', width: 160 },
    { id: 'value', name: 'Value', type: 'number', width: 120 },
  ],
}

const rows = Array.from({ length: 10_000 }, (_, i) => ({
  idx: i,
  name: \`Item \${i}\`,
  category: ['alpha', 'beta', 'gamma', 'delta'][i % 4],
  value: Math.round(Math.sin(i) * 10_000) / 100,
}))

createGridHost({ data: new InMemoryDataSource({ schema, rows }) })`,
    oneMillion: `import type { Schema } from '@novasheet/core'
import { createGridHost } from '../grid-host'
import { GeneratedDataSource } from '../generated-data-source'

const colCount = 30
const schema: Schema = {
  fields: Array.from({ length: colCount }, (_, c) => ({
    id: \`c\${c}\`,
    name: \`Column \${c}\`,
    type: c % 3 === 0 ? 'number' : 'text',
    width: 140,
  })),
}

const data = new GeneratedDataSource(1_000_000, schema, (r, fieldId) => {
  const c = Number(fieldId.slice(1))
  return c % 3 === 0 ? r * 100 + c : \`r\${r}-c\${c}\`
})

createGridHost({ data })`,
    scrollToRow: `import { Grid } from '@novasheet/web'
import { InMemoryDataSource } from '@novasheet/core'
import { createGridHost } from '../grid-host'

const host = createGridHost({ data /* 2000 行 */ })
requestAnimationFrame(() => {
  const grid = (host as HTMLElement & { __grid: Grid }).__grid
  grid.scrollToRow(500, 'center')
})`,
    bothAxis: `// 30 列 × 500 行，触发横向 + 纵向原生滚动条
createGridHost({ data: wideData })`,
    scrollToCell: `import { Grid } from '@novasheet/web'
import { createGridHost } from '../grid-host'

const host = createGridHost({ data: wideData })
requestAnimationFrame(() => {
  const grid = (host as HTMLElement & { __grid: Grid }).__grid
  grid.scrollToCell(100, 'c20')
})`,
  },
  sizing: {
    custom: `import { Grid } from '@novasheet/web'
import { InMemoryDataSource, type Schema } from '@novasheet/core'
import { generateRows } from '../mock-data'

const schema: Schema = {
  fields: [
    { id: 'tiny', name: 'Tiny', type: 'text', width: 60 },
    { id: 'medium', name: 'Medium', type: 'text', width: 140 },
    { id: 'wide', name: 'Wide', type: 'text', width: 320 },
    { id: 'count', name: 'Count', type: 'number', width: 90 },
  ],
}
const data = new InMemoryDataSource({ schema, rows: generateRows(schema, 60) })

const el = document.createElement('div')
el.style.cssText = 'width:780px;height:480px;position:relative'
const grid = new Grid(el, { data })
grid.setRowHeight(0, 56)
grid.setRowHeight(1, 40)
grid.setRowHeight(2, 20)`,
  },
  theme: {
    dense: `import { InMemoryDataSource, denseGridTheme } from '@novasheet/core'
import { createGridHost } from '../grid-host'
import { basicTextSchema, generateRows } from '../mock-data'

const schema = basicTextSchema()
const data = new InMemoryDataSource({ schema, rows: generateRows(schema, 80) })
createGridHost({ data, theme: denseGridTheme })`,
    compact: `import { InMemoryDataSource, denseGridTheme, type Theme } from '@novasheet/core'
import { createGridHost } from '../grid-host'

const compactTheme: Theme = {
  ...denseGridTheme,
  metrics: { ...denseGridTheme.metrics, rowHeight: 24, headerHeight: 28, fontSize: 11 },
  colors: { ...denseGridTheme.colors, background: '#fbfbfd' },
}

createGridHost({ data, theme: compactTheme })`,
  },
} as const
