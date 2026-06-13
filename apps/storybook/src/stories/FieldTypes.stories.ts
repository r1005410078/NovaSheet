import type { Meta, StoryObj } from '@storybook/html'
import React from 'react'
import { canvas2dBackend, type Canvas2DCellRenderer } from '@novasheet/canvas2d'
import {
  Grid,
  InMemoryDataSource,
  SKIP_CELL_VALUE,
  type CellTypeDefinition,
} from '@novasheet/core'
import {
  createReactCellEditor,
  createReactCellFilterEditor,
  type ReactCellEditorProps,
  type ReactCellFilterEditorProps,
} from '@novasheet/react'
import { createGridHost } from '../grid-host'
import { generateRows, mixedTypesSchema } from '../mock-data'
import { docsMeta, docsStory } from '../story-docs'
import allSevenSrc from './snippets/fieldTypes.allSeven.snippet.ts?raw'

const meta: Meta = {
  title: 'Table/Field types',
  ...docsMeta(
    'One column for each of the seven `FieldType` values. `text` and `number` use dedicated paint paths; the rest use text fallback.',
  ),
}
export default meta

type Story = StoryObj

export const AllSevenTypes: Story = {
  name: 'Seven field types',
  ...docsStory(allSevenSrc),
  render: () => {
    const schema = mixedTypesSchema()
    const data = new InMemoryDataSource({ schema, rows: generateRows(schema, 50) })
    return createGridHost({ data })
  },
}

const ratingType: CellTypeDefinition = {
  editable: true,
  formatForEdit: (value) => String(value ?? ''),
  parseEditInput: (input) => {
    const n = Number(input)
    return Number.isNaN(n) ? SKIP_CELL_VALUE : Math.max(0, Math.min(5, n))
  },
  sortValue: (value) => (typeof value === 'number' ? value : null),
  filterOperators: [
    {
      id: 'rating-gte',
      label: 'Rating >=',
      matches: (value, operand) =>
        typeof value === 'number' && typeof operand === 'number' && value >= operand,
    },
  ],
}

const assigneeType: CellTypeDefinition = {
  onAction: () => {
    // 未调用 preventOpenEditor()：action 后继续走统一 open editor 入口。
  },
}

const ratingRenderer: Canvas2DCellRenderer = {
  paint(ctx, { value, rect, theme }) {
    const score = typeof value === 'number' ? value : 0
    const { colors, metrics } = theme
    const size = Math.min(10, rect.height - metrics.cellPaddingY * 2)
    const gap = Math.max(2, metrics.borderWidth * 2)
    const top = rect.y + (rect.height - size) / 2
    let left = rect.x + metrics.cellPaddingX

    for (let i = 1; i <= 5; i += 1) {
      ctx.fillStyle = i <= score ? colors.selectionBorder : colors.gridLineStrong
      ctx.fillRect(left, top, size, size)
      left += size + gap
    }
  },
}

const progressRenderer: Canvas2DCellRenderer = {
  paint(ctx, { value, rect, theme }) {
    const progress = typeof value === 'number' ? Math.max(0, Math.min(1, value)) : 0
    const { colors, metrics } = theme
    const x = rect.x + metrics.cellPaddingX
    const y = rect.y + rect.height / 2 - 3
    const width = Math.max(0, rect.width - metrics.cellPaddingX * 2)

    ctx.fillStyle = colors.gridLineStrong
    ctx.fillRect(x, y, width, 6)
    ctx.fillStyle = colors.selectionBorder
    ctx.fillRect(x, y, width * progress, 6)
  },
}

const assigneeRenderer: Canvas2DCellRenderer = {
  paint(ctx, { value, rect, theme }) {
    const { colors, metrics } = theme
    const padding = metrics.cellPaddingX
    const buttonWidth = 42
    const buttonHeight = Math.max(18, rect.height - metrics.cellPaddingY * 2)
    const buttonX = rect.x + rect.width - padding - buttonWidth
    const buttonY = rect.y + (rect.height - buttonHeight) / 2
    const baseline = rect.y + rect.height / 2 + metrics.fontSize / 3

    ctx.fillStyle = colors.text
    ctx.font = `${metrics.fontSize}px ${metrics.fontFamily}`
    ctx.textAlign = 'left'
    ctx.fillText(String(value ?? ''), rect.x + padding, baseline, buttonX - rect.x - padding * 2)

    ctx.fillStyle = colors.menuItemHover
    ctx.fillRect(buttonX, buttonY, buttonWidth, buttonHeight)
    ctx.strokeStyle = colors.gridLineStrong
    ctx.strokeRect(buttonX, buttonY, buttonWidth, buttonHeight)
    ctx.fillStyle = colors.text
    ctx.textAlign = 'center'
    ctx.fillText('Edit', buttonX + buttonWidth / 2, baseline)
  },
  getActionZones({ rect, theme }) {
    const padding = theme.metrics.cellPaddingX
    const buttonWidth = 42
    const buttonHeight = Math.max(18, rect.height - theme.metrics.cellPaddingY * 2)
    return [
      {
        id: 'open-assignee',
        cursor: 'pointer',
        label: 'Edit assignee',
        rect: {
          x: rect.x + rect.width - padding - buttonWidth,
          y: rect.y + (rect.height - buttonHeight) / 2,
          width: buttonWidth,
          height: buttonHeight,
        },
      },
    ]
  },
}

function RatingEditor(props: ReactCellEditorProps<number>) {
  return React.createElement(
    'div',
    { style: { display: 'flex', gap: '4px', padding: '4px', background: 'white' } },
    [1, 2, 3, 4, 5].map((score) =>
      React.createElement(
        'button',
        { key: score, type: 'button', onClick: () => props.commit(score) },
        String(score),
      ),
    ),
  )
}

function AssigneeEditor(props: ReactCellEditorProps<string>) {
  return React.createElement(
    'div',
    { style: { display: 'flex', gap: '4px', padding: '4px', background: 'white' } },
    ['Alice', 'Bob', 'Carol'].map((name) =>
      React.createElement(
        'button',
        { key: name, type: 'button', onClick: () => props.commit(name) },
        name,
      ),
    ),
    React.createElement('button', { type: 'button', onClick: () => props.cancel() }, 'Cancel'),
  )
}

function RatingFilter(props: ReactCellFilterEditorProps) {
  return React.createElement(
    'div',
    { style: { display: 'flex', gap: '4px', padding: '4px', background: 'white' } },
    React.createElement(
      'button',
      {
        type: 'button',
        onClick: () => props.apply({ operatorId: 'rating-gte', value: 3 }),
      },
      '>= 3',
    ),
    React.createElement('button', { type: 'button', onClick: () => props.cancel() }, 'Cancel'),
  )
}

export const CustomExtensions: Story = {
  name: 'Custom field extensions',
  render: () => {
    // Schema 仍属于 DataSource：Grid options 只注册扩展能力，不承载业务 schema。
    const data = new InMemoryDataSource({
      schema: {
        fields: [
          { id: 'title', name: 'Title', type: 'text', width: 180 },
          { id: 'score', name: 'Score', type: 'rating', width: 140 },
          { id: 'owner', name: 'Owner', type: 'assignee', width: 180 },
          { id: 'done', name: 'Done', type: 'progress', width: 160 },
        ],
      },
      rows: [
        { title: 'Renderer and editor', score: 4, owner: 'Alice', done: 0.85 },
        { title: 'Action opens editor', score: 2, owner: 'Bob', done: 0.45 },
        { title: 'Renderer only', score: 5, owner: 'Carol', done: 0.65 },
      ],
    })

    const host = document.createElement('div')
    host.style.display = 'grid'
    host.style.gridTemplateRows = 'auto 1fr'
    host.style.gap = '8px'
    host.style.width = '100%'
    host.style.height = '100%'
    host.style.minHeight = '0'

    const toolbar = document.createElement('div')
    const filterButton = document.createElement('button')
    filterButton.type = 'button'
    filterButton.textContent = 'Open rating filter editor'
    toolbar.appendChild(filterButton)

    const gridHost = document.createElement('div')
    gridHost.style.position = 'relative'
    gridHost.style.minHeight = '0'

    const ratingFilterEditor = createReactCellFilterEditor(RatingFilter)
    filterButton.addEventListener('click', () => {
      const rect = filterButton.getBoundingClientRect()
      ratingFilterEditor.open({
        field: data.getSchema().fields[1]!,
        operatorId: 'rating-gte',
        value: 3,
        rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
        apply: () => ratingFilterEditor.close?.(),
        cancel: () => ratingFilterEditor.close?.(),
      })
    })

    const grid = new Grid(gridHost, {
      data,
      cellTypes: {
        rating: ratingType,
        assignee: assigneeType,
      },
      cellEditors: {
        rating: createReactCellEditor(RatingEditor),
        assignee: createReactCellEditor(AssigneeEditor, { kind: 'popover' }),
      },
      backend: canvas2dBackend({
        cellRenderers: {
          rating: ratingRenderer,
          assignee: assigneeRenderer,
          progress: progressRenderer,
        },
      }),
    })

    host.append(toolbar, gridHost)
    ;(host as unknown as HTMLElement & { __grid: Grid }).__grid = grid
    return host
  },
}
