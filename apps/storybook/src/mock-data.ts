import type { Row, Schema } from '@novasheet/core'

/**
 * 3 个 text 字段——Default story 默认 schema。
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
 * 覆盖全部 7 种 FieldType——FieldTypes story 用。M1 里非 text/number
 * 都走 fallback（toString → text），但 schema 仍按真实类型声明。
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
  'Alice', 'Bob', 'Carol', 'David', 'Eve', 'Frank', 'Grace', 'Heidi',
  'Ivan', 'Judy', 'Kevin', 'Linda', 'Mallory', 'Niaj', 'Olivia', 'Peggy',
]
const ROLES = ['Engineer', 'Designer', 'PM', 'Researcher', 'Analyst', 'Manager']
const TEAMS = ['Platform', 'Growth', 'Data', 'Infra', 'Brand', 'Mobile']
const STATUSES = ['Open', 'In Progress', 'Blocked', 'Done']
const TAG_POOL = ['urgent', 'frontend', 'backend', 'design', 'ops', 'docs', 'research']

/**
 * 确定性 mock 行：通过 index 派生字段值，保证多次渲染、SSR、对比测试结果稳定。
 */
export function generateRows(schema: Schema, n: number): Row[] {
  const rows: Row[] = []
  for (let i = 0; i < n; i++) {
    const row: Row = {}
    for (const field of schema.fields) {
      switch (field.type) {
        case 'text': {
          if (field.id === 'name') {
            row[field.id] = `${FIRST_NAMES[i % FIRST_NAMES.length]} ${String(i + 1).padStart(3, '0')}`
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
          // Deterministic dates anchored to 2026-01-01 + i days.
          const base = Date.UTC(2026, 0, 1)
          row[field.id] = new Date(base + i * 86400000)
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
