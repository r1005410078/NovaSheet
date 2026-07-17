import type { Meta, StoryObj } from '@storybook/html'
import { InMemoryDataSource } from '@zhiguang/core'
import type { CellRange, Row, Schema, ValidationRule, ValidatorDefinition } from '@zhiguang/core'
import { createGridHost } from '../grid-host'
import { docsMeta, docsStory } from '../story-docs'
import { GeneratedDataSource } from '../generated-data-source'

const meta: Meta = {
  title: 'Table/Validation',
  parameters: { layout: 'centered' },
  ...docsMeta(
    'Data validation rules turn cells invalid when they violate constraints, without blocking writes. ' +
      'Column-level defaults come from `Field.options.validation`; range-level overrides via `Grid.setValidation` are undoable. ' +
      'Built-in rules include number-range, text-pattern, list-in, date-range; custom validators register via `GridOptions.validators` ' +
      '(supporting async for server dedup, etc.). Invalid cells show a red border and angle-indicator; hover reveals the error message.',
  ),
}
export default meta
type Story = StoryObj

/** Basic story: built-in number-range (column-level) + text-pattern (range-level). */
export const Basic: Story = {
  name: 'Built-in validators',
  ...docsStory(
    '',
    'Column-level rules declare via Field.options.validation; range overrides go through Grid.setValidation. ' +
      'Validation is warn-only — values always write, invalid cells display a red border and corner marker; hover to see the error.',
  ),
  render: () => {
    function basicSchema(): Schema {
      return {
        fields: [
          { id: 'score', name: 'Score', type: 'number', width: 110, options: { validation: { type: 'number-range', options: { min: 0, max: 100 } } } },
          { id: 'email', name: 'Email', type: 'text', width: 200 },
          { id: 'note', name: 'Note', type: 'text', width: 180 },
        ],
      }
    }

    function basicRows(): Row[] {
      return [
        { score: 50, email: 'alice@example.com', note: 'Valid score and email' },
        { score: 120, email: 'bob@test.org', note: 'Score exceeds max (120)' },
        { score: -5, email: 'invalid-email', note: 'Score below min, email invalid' },
        { score: 88, email: 'charlie@company.co.uk', note: 'Valid' },
        { score: 200, email: 'dave@', note: 'Score way over (200)' },
        { score: 42, email: 'eve@site.io', note: 'All valid' },
      ]
    }

    const schema = basicSchema()
    const data = new InMemoryDataSource({ schema, rows: basicRows() })

    const wrapper = document.createElement('div')
    Object.assign(wrapper.style, {
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      padding: '8px',
      width: '550px',
      height: '420px',
      boxSizing: 'border-box',
    })

    const toolbar = document.createElement('div')
    Object.assign(toolbar.style, { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' })

    function makeBtn(label: string): HTMLButtonElement {
      const btn = document.createElement('button')
      btn.textContent = label
      Object.assign(btn.style, { padding: '4px 10px', cursor: 'pointer', fontSize: '13px' })
      return btn
    }

    const applyEmailBtn = makeBtn('Apply email format')
    const validateAllBtn = makeBtn('Validate all')
    const clearEmailBtn = makeBtn('Clear email rules')

    const statusEl = document.createElement('span')
    Object.assign(statusEl.style, { fontFamily: 'monospace', fontSize: '12px', color: '#555' })
    statusEl.textContent = 'Ready'

    toolbar.appendChild(applyEmailBtn)
    toolbar.appendChild(validateAllBtn)
    toolbar.appendChild(clearEmailBtn)
    toolbar.appendChild(statusEl)

    const gridContainer = document.createElement('div')
    Object.assign(gridContainer.style, { flex: '1', minHeight: '0', position: 'relative' })

    wrapper.appendChild(toolbar)
    wrapper.appendChild(gridContainer)

    const gridEl = createGridHost({ data }, '100%', '100%')
    gridContainer.appendChild(gridEl)

    const grid = (gridEl as unknown as HTMLElement & { __grid: import('@zhiguang/core').Grid }).__grid

    applyEmailBtn.addEventListener('click', () => {
      const emailValidation: ValidationRule = {
        type: 'text-pattern',
        options: {
          pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
        },
      }
      const range: CellRange = { startRow: 0, endRow: 5, startCol: 1, endCol: 1 }
      grid.setValidation(range, emailValidation)
      statusEl.textContent = 'Applied email format validator to column'
    })

    validateAllBtn.addEventListener('click', () => {
      grid.validateAll()
      statusEl.textContent = 'Re-validated all cells'
    })

    clearEmailBtn.addEventListener('click', () => {
      const range: CellRange = { startRow: 0, endRow: 5, startCol: 1, endCol: 1 }
      grid.clearValidation(range)
      grid.validateAll()
      statusEl.textContent = 'Cleared email rules'
    })

    return wrapper
  },
}

/** Stress test: 10 000 rows × 5 columns, 3 columns with column-level validation rules. */
export const LargeDataset: Story = {
  name: 'Stress test (10 000 rows)',
  ...docsStory(
    '',
    '10 000 rows × 5 columns with three column-level validation rules (number-range, text-pattern, list-in). ' +
      'Uses validationBatchSize=500 + validationMaxConcurrent=500 so sync validators drain in ~100 ms. ' +
      'Click "Apply rules + Validate" to trigger full-grid validation and watch the live invalid-cell counter.',
  ),
  render: () => {
    const ROW_COUNT = 10_000
    const STATUSES = ['Active', 'Inactive', 'Pending']
    const DEPTS = ['Engineering', 'Design', 'Product', 'Data', 'Ops']

    const schema: Schema = {
      fields: [
        // ~50 % invalid: (i * 37) % 200, values > 100 fall outside [0, 100]
        {
          id: 'score', name: 'Score', type: 'number', width: 80,
          options: { validation: { type: 'number-range', options: { min: 0, max: 100 } } },
        },
        // ~33 % invalid: i % 3 === 0 → 'invalid-email'
        {
          id: 'email', name: 'Email', type: 'text', width: 220,
          options: { validation: { type: 'text-pattern', options: { pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$' } } },
        },
        // ~33 % invalid: 'Pending' is not in allowed list
        {
          id: 'status', name: 'Status', type: 'text', width: 100,
          options: { validation: { type: 'list-in', options: { values: ['Active', 'Inactive'] } } },
        },
        { id: 'dept', name: 'Department', type: 'text', width: 130 },
        { id: 'notes', name: 'Notes', type: 'text', width: 200 },
      ],
    }

    const dataSource = new GeneratedDataSource(ROW_COUNT, schema, (i, fieldId) => {
      switch (fieldId) {
        case 'score': return (i * 37) % 200          // 0–199; values > 100 are invalid
        case 'email': return i % 3 === 0 ? 'invalid-email' : `user${i}@example.com`
        case 'status': return STATUSES[i % 3]!        // 'Pending' (i % 3 === 2) is invalid
        case 'dept': return DEPTS[i % DEPTS.length]!
        case 'notes': return `Row ${i} notes`
        default: return null
      }
    })

    const wrapper = document.createElement('div')
    Object.assign(wrapper.style, {
      display: 'flex', flexDirection: 'column', gap: '8px',
      padding: '8px', width: '760px', height: '500px', boxSizing: 'border-box',
    })

    const toolbar = document.createElement('div')
    Object.assign(toolbar.style, { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' })

    function makeBtn(label: string): HTMLButtonElement {
      const btn = document.createElement('button')
      btn.textContent = label
      Object.assign(btn.style, { padding: '4px 10px', cursor: 'pointer', fontSize: '13px' })
      return btn
    }

    const applyBtn = makeBtn('Apply rules + Validate')
    const revalidateBtn = makeBtn('Re-validate')
    const clearBtn = makeBtn('Clear rules')

    const statusEl = document.createElement('span')
    Object.assign(statusEl.style, { fontFamily: 'monospace', fontSize: '12px', color: '#555', marginLeft: '4px' })
    statusEl.textContent = `${ROW_COUNT.toLocaleString()} rows — click "Apply rules + Validate"`

    toolbar.append(applyBtn, revalidateBtn, clearBtn, statusEl)

    const gridContainer = document.createElement('div')
    Object.assign(gridContainer.style, { flex: '1', minHeight: '0', position: 'relative' })

    wrapper.append(toolbar, gridContainer)

    const gridEl = createGridHost(
      { data: dataSource, validationBatchSize: 500, validationMaxConcurrent: 500 },
      '100%', '100%',
    )
    gridContainer.appendChild(gridEl)

    const grid = (gridEl as unknown as HTMLElement & { __grid: import('@zhiguang/core').Grid }).__grid

    function countInvalid(): number {
      let n = 0
      for (let r = 0; r < ROW_COUNT; r++) {
        for (let c = 0; c < schema.fields.length; c++) {
          if (grid.getValidationState(r, c) !== null) n++
        }
      }
      return n
    }

    let pollHandle = 0
    function startPoll(t0: number): void {
      cancelAnimationFrame(pollHandle)
      function tick(): void {
        const elapsed = Math.round(performance.now() - t0)
        statusEl.textContent = `${elapsed}ms — ${countInvalid().toLocaleString()} invalid so far…`
        pollHandle = requestAnimationFrame(tick)
      }
      pollHandle = requestAnimationFrame(tick)
      setTimeout(() => {
        cancelAnimationFrame(pollHandle)
        const elapsed = Math.round(performance.now() - t0)
        statusEl.textContent = `Done in ${elapsed}ms — ${countInvalid().toLocaleString()} invalid cells`
      }, 5_000)
    }

    applyBtn.addEventListener('click', () => {
      startPoll(performance.now())
      grid.validateAll()
    })

    revalidateBtn.addEventListener('click', () => {
      startPoll(performance.now())
      grid.validateAll()
    })

    clearBtn.addEventListener('click', () => {
      cancelAnimationFrame(pollHandle)
      const fullRange: CellRange = {
        startRow: 0, endRow: ROW_COUNT - 1,
        startCol: 0, endCol: schema.fields.length - 1,
      }
      grid.clearValidation(fullRange)
      grid.validateAll()
      statusEl.textContent = 'Rules cleared'
    })

    return wrapper
  },
}

/** Custom async validator story. */
export const CustomValidator: Story = {
  name: 'Custom async validator',
  ...docsStory(
    '',
    'Custom validators register via GridOptions.validators; validate() can return a Promise for async checks (e.g., server dedup). ' +
      'Validation is non-blocking async: pending cells show no indicator while checking, results auto-render on completion.',
  ),
  render: () => {
    const duplicateChecker: ValidatorDefinition = {
      validate: async (value, _ctx) => {
        // Simulate async server check (50ms delay)
        await new Promise((r) => setTimeout(r, 50))
        if (typeof value !== 'string' || !value) return null
        const banned = ['admin', 'root', 'test']
        return banned.includes(value.toLowerCase()) ? '该用户名已被占用' : null
      },
    }

    function customSchema(): Schema {
      return {
        fields: [
          { id: 'username', name: 'Username', type: 'text', width: 160 },
          { id: 'role', name: 'Role', type: 'text', width: 120 },
        ],
      }
    }

    function customRows(): Row[] {
      return [
        { username: 'alice', role: 'user' },
        { username: 'admin', role: 'admin' },
        { username: 'bob', role: 'user' },
        { username: 'root', role: 'system' },
        { username: 'charlie', role: 'user' },
      ]
    }

    const schema = customSchema()
    const data = new InMemoryDataSource({ schema, rows: customRows() })

    const wrapper = document.createElement('div')
    Object.assign(wrapper.style, {
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      padding: '8px',
      width: '380px',
      height: '340px',
      boxSizing: 'border-box',
    })

    const toolbar = document.createElement('div')
    Object.assign(toolbar.style, { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' })

    function makeBtn(label: string): HTMLButtonElement {
      const btn = document.createElement('button')
      btn.textContent = label
      Object.assign(btn.style, { padding: '4px 10px', cursor: 'pointer', fontSize: '13px' })
      return btn
    }

    const revalidateBtn = makeBtn('Re-validate')

    const statusEl = document.createElement('span')
    Object.assign(statusEl.style, { fontFamily: 'monospace', fontSize: '12px', color: '#555' })
    statusEl.textContent = 'Starting async validation...'

    toolbar.appendChild(revalidateBtn)
    toolbar.appendChild(statusEl)

    const gridContainer = document.createElement('div')
    Object.assign(gridContainer.style, { flex: '1', minHeight: '0', position: 'relative' })

    wrapper.appendChild(toolbar)
    wrapper.appendChild(gridContainer)

    const gridEl = createGridHost({ data, validators: { duplicate: duplicateChecker } }, '100%', '100%')
    gridContainer.appendChild(gridEl)

    const grid = (gridEl as unknown as HTMLElement & { __grid: import('@zhiguang/core').Grid }).__grid

    // Set validation rule on entire username column
    const usernameValidation: ValidationRule = {
      type: 'duplicate',
    }
    const usernameRange: CellRange = { startRow: 0, endRow: 4, startCol: 0, endCol: 0 }
    grid.setValidation(usernameRange, usernameValidation)

    // Trigger initial validation immediately to show pending → invalid transition
    grid.validateAll()
    statusEl.textContent = 'Async validation in progress (50ms per cell)...'

    revalidateBtn.addEventListener('click', () => {
      statusEl.textContent = 'Re-validating...'
      grid.validateAll()
      setTimeout(() => {
        statusEl.textContent = 'Validation complete'
      }, 150)
    })

    return wrapper
  },
}
