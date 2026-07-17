import type { Row, Schema } from '@zhiguang/novasheet-core'
import { dateToSerial } from '@zhiguang/novasheet-core'
import { GeneratedDataSource } from './generated-data-source'

/**
 * Three text fields used by the default story schema.
 */
export function basicTextSchema(): Schema {
  return {
    fields: [
      { id: 'name', name: 'Name', type: 'text', width: 200 },
      { id: 'role', name: 'Role', type: 'text', width: 180 },
      { id: 'team', name: 'Team', type: 'text', width: 160 },
    ],
  }
}

/**
 * Covers all seven FieldType values for the FieldTypes story. In M1,
 * non-text / non-number fields use fallback text rendering, but the schema
 * still declares their real field types.
 */
export function mixedTypesSchema(): Schema {
  return {
    fields: [
      { id: 'name', name: 'Name', type: 'text', width: 160 },
      { id: 'score', name: 'Score', type: 'number', width: 90 },
      { id: 'status', name: 'Status', type: 'singleSelect', width: 110 },
      { id: 'tags', name: 'Tags', type: 'multiSelect', width: 160 },
      { id: 'due', name: 'Due', type: 'date', width: 140 },
      { id: 'done', name: 'Done', type: 'checkbox', width: 80 },
      { id: 'link', name: 'Link', type: 'url', width: 200 },
    ],
  }
}

const FIRST_NAMES = [
  'Alice',
  'Bob',
  'Carol',
  'David',
  'Eve',
  'Frank',
  'Grace',
  'Heidi',
  'Ivan',
  'Judy',
  'Kevin',
  'Linda',
  'Mallory',
  'Niaj',
  'Olivia',
  'Peggy',
]
const ROLES = ['Engineer', 'Designer', 'PM', 'Researcher', 'Analyst', 'Manager']
const TEAMS = ['Platform', 'Growth', 'Data', 'Infra', 'Brand', 'Mobile']
const STATUSES = ['Open', 'In Progress', 'Blocked', 'Done']
const TAG_POOL = ['urgent', 'frontend', 'backend', 'design', 'ops', 'docs', 'research']

/**
 * Deterministic mock rows: derive field values from index so repeated renders,
 * SSR, and comparison tests stay stable.
 */
export function generateRows(schema: Schema, n: number): Row[] {
  const rows: Row[] = []
  for (let i = 0; i < n; i++) {
    const row: Row = {}
    for (const field of schema.fields) {
      switch (field.type) {
        case 'text': {
          if (field.id === 'name') {
            row[field.id] =
              `${FIRST_NAMES[i % FIRST_NAMES.length]} ${String(i + 1).padStart(3, '0')}`
          } else if (field.id === 'role') {
            row[field.id] = ROLES[i % ROLES.length] as string
          } else if (field.id === 'team') {
            row[field.id] = TEAMS[i % TEAMS.length] as string
          } else {
            row[field.id] = `${field.name} ${i + 1}`
          }
          break
        }
        case 'number':
          row[field.id] = (i * 37) % 1000
          break
        case 'singleSelect':
          row[field.id] = STATUSES[i % STATUSES.length] as string
          break
        case 'multiSelect': {
          const a = TAG_POOL[i % TAG_POOL.length] as string
          const b = TAG_POOL[(i + 3) % TAG_POOL.length] as string
          row[field.id] = [a, b]
          break
        }
        case 'date': {
          // Deterministic serial dates anchored to 2026-01-01 + i days.
          const base = Date.UTC(2026, 0, 1)
          row[field.id] = dateToSerial(new Date(base + i * 86400000))
          break
        }
        case 'checkbox':
          row[field.id] = i % 2 === 0
          break
        case 'url':
          row[field.id] = `https://example.com/item/${i + 1}`
          break
      }
    }
    rows.push(row)
  }
  return rows
}

/** Schema for row-height autofit / wrapping demos. */
export function wrapAutofitSchema(): Schema {
  return {
    fields: [
      { id: 'name', name: 'Employee', type: 'text', width: 100 },
      { id: 'role', name: 'Role', type: 'text', width: 88 },
      { id: 'desc', name: 'Description', type: 'text', width: 220, wrap: true },
      { id: 'note', name: 'Note', type: 'text', width: 160, wrap: true },
      { id: 'amount', name: 'Amount', type: 'number', width: 100 },
    ],
  }
}

/** Wrapping demo with long, short, symbol-heavy, and empty-note samples. */
export function wrapAutofitSampleRows(): Row[] {
  return [
    {
      name: 'Alice Zhang',
      role: 'Frontend',
      desc: 'Owns frontend architecture and cross-platform rendering systems across Canvas2D, WebGL, and Flutter.',
      note: 'Driving M3 frozen regions and autofit this quarter.',
      amount: 85000,
    },
    {
      name: 'Bob Li',
      role: 'Data',
      desc: 'Data engineer leading ETL pipelines and data quality monitoring; recently migrated OLAP workloads from PostgreSQL to ClickHouse.',
      note: 'Review next-quarter migration plan; attachments live at wiki /data-migration-v2.',
      amount: 92000,
    },
    {
      name: 'Carol Wang',
      role: 'QA',
      desc: 'Short description.',
      note: '—',
      amount: 70000,
    },
    {
      name: 'David Zhao',
      role: 'Design',
      desc: 'Maintains the design system and Storybook; shipped dense / compact themes, empty-state artwork, and dark-mode adaptation.',
      note: 'Coordinates token alignment with brand design; Figma to code sync runs weekly.',
      amount: 78000,
    },
    {
      name: 'Eve Qian',
      role: 'Ops',
      desc: 'Operations: CI dashboard.',
      note: 'Single-line comparison case.',
      amount: 65000,
    },
    {
      name: 'Frank Sun',
      role: 'Product',
      desc: 'PRD-2026-Q2: user segmentation plus analytics schema v3; needs review with growth, data, and client teams.',
      note: 'English note: rollout gated by feature flag `sheet.wrap_beta`.',
      amount: 81000,
    },
    {
      name: 'Grace Zhou',
      role: 'ML',
      desc: 'Model serving latency P99 < 120ms; feature store daily increment is 2.1TB; anomaly rules #42/#57 are scheduled for removal.',
      note: 'Formula included: score = 0.7 x ctr + 0.3 x cvr; threshold tau = 0.15.',
      amount: 105000,
    },
    {
      name: 'Heidi Wu',
      role: 'Security',
      desc: '[High] dependency vulnerability CVE-2026-xxxxx; SBOM scans run every Monday; zero-trust gateway policy window is Wednesday 02:00-04:00 UTC.',
      note: '',
      amount: 99000,
    },
    {
      name: 'Ivan Zheng',
      role: 'I18n',
      desc: 'RTL layout regression; `zh-CN`, `en-US`, and `ja-JP` copy length differences can shift column widths, so wrap columns are the priority.',
      note: 'URL: https://docs.example.com/i18n/grid-wrap',
      amount: 73000,
    },
    {
      name: 'Judy Wang',
      role: 'Intern',
      desc: 'Onboarding week 2: read architecture.md and run bun test; first task is adding CellPainter tests.',
      note: 'Mentor: Alice Zhang; due 2026-06-01.',
      amount: 12000,
    },
  ]
}

const WRAP_BIG_DEPTS = ['Platform', 'Data', 'Design', 'Growth', 'Ops', 'Security']
const WRAP_BIG_REGIONS = ['North', 'East', 'South', 'West']
const WRAP_BIG_STATUSES = ['In progress', 'Done', 'Blocked', 'In review']

/** 10k-row x 10-column wrapping scroll stress-test schema. */
export function wrapAutofitBigSchema(): Schema {
  return {
    fields: [
      { id: 'id', name: 'ID', type: 'number', width: 72 },
      { id: 'name', name: 'Employee', type: 'text', width: 96 },
      { id: 'dept', name: 'Department', type: 'text', width: 80 },
      { id: 'region', name: 'Region', type: 'text', width: 72 },
      { id: 'status', name: 'Status', type: 'text', width: 80 },
      { id: 'desc', name: 'Description', type: 'text', width: 200, wrap: true },
      { id: 'note', name: 'Note', type: 'text', width: 140, wrap: true },
      { id: 'score', name: 'Score', type: 'number', width: 72 },
      { id: 'owner', name: 'Owner', type: 'text', width: 88 },
      { id: 'tags', name: 'Tags', type: 'text', width: 120 },
    ],
  }
}

/** Generates 10k x 10 data on demand; the story expands wrapped row heights in batches. */
export function createWrapAutofitBigDataSource(rowCount = 10_000): GeneratedDataSource {
  const schema = wrapAutofitBigSchema()
  return new GeneratedDataSource(rowCount, schema, (row, fieldId) => {
    switch (fieldId) {
      case 'id':
        return row
      case 'name':
        return `Employee ${row}`
      case 'dept':
        return WRAP_BIG_DEPTS[row % WRAP_BIG_DEPTS.length]!
      case 'region':
        return WRAP_BIG_REGIONS[row % WRAP_BIG_REGIONS.length]!
      case 'status':
        return WRAP_BIG_STATUSES[row % WRAP_BIG_STATUSES.length]!
      case 'score':
        return (row * 17) % 1000
      case 'owner':
        return `Owner-${row % 128}`
      case 'tags':
        return `tag-${row % 20},tag-${(row + 7) % 20}`
      case 'desc': {
        const kind = row % 5
        if (kind === 0) return `Short description row=${row}`
        if (kind === 1) {
          return `Medium: ${WRAP_BIG_REGIONS[row % 4]!} / ${WRAP_BIG_DEPTS[row % 6]!} collaboration item #${row}, with mixed words and symbols ()[].`
        }
        if (kind === 2) {
          return `Long text stress row=${row}: Canvas virtual scrolling plus wrapped text painting; scroll vertically to inspect frame rate and line clipping. `.repeat(
            1 + (row % 3),
          )
        }
        if (kind === 3)
          return `EN-only row ${row}: rollout behind flag sheet.wrap_v2; monitor P99 latency.`
        return `[Blocked] row ${row} depends on an upstream API; failed after 3 retries; log id=0x${((row * 2654435761) >>> 0).toString(16).slice(0, 8)}`
      }
      case 'note': {
        if (row % 7 === 0) return ''
        if (row % 3 === 0) return `Note ${row}`
        return `note-${row}: follow-up in progress / review next week; link https://example.com/t/${row}`
      }
      default:
        return ''
    }
  })
}
