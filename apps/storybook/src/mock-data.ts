import type { Row, Schema } from '@novasheet/core'
import { GeneratedDataSource } from './generated-data-source'

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

/** 行高自适应 / 换行 demo 用的 Schema（含 wrap 列）。 */
export function wrapAutofitSchema(): Schema {
  return {
    fields: [
      { id: 'name', name: '员工', type: 'text', width: 100 },
      { id: 'role', name: '角色', type: 'text', width: 88 },
      { id: 'desc', name: '描述', type: 'text', width: 220, wrap: true },
      { id: 'note', name: '备注', type: 'text', width: 160, wrap: true },
      { id: 'amount', name: '金额', type: 'number', width: 100 },
    ],
  }
}

/** 换行 demo：多类文案（长/短/中英混排/符号/空备注）。 */
export function wrapAutofitSampleRows(): Row[] {
  return [
    {
      name: '张三',
      role: '前端',
      desc: '负责前端架构与跨平台渲染系统的设计与实现，覆盖 Canvas2D / WebGL / Flutter 三端。',
      note: '本季度推进 M3 frozen + autofit。',
      amount: 85000,
    },
    {
      name: '李四',
      role: '数据',
      desc: '数据工程师，主导 ETL pipeline 和数据质量监控；近期接入 ClickHouse 替换原 PostgreSQL OLAP。',
      note: '需评审下季度迁移方案；附件见 wiki /data-migration-v2。',
      amount: 92000,
    },
    {
      name: '王五',
      role: '测试',
      desc: '短描述。',
      note: '—',
      amount: 70000,
    },
    {
      name: '赵六',
      role: '设计',
      desc: '设计系统与 Storybook 维护；推动 dense / compact 双主题落地，新增空数据插画与暗色模式适配。',
      note: '协调与品牌团队的 token 对齐；Figma → code 每周 sync。',
      amount: 78000,
    },
    {
      name: '钱七',
      role: '运维',
      desc: '运维：CI 看板。',
      note: '单行对比用例。',
      amount: 65000,
    },
    {
      name: '孙八',
      role: '产品',
      desc: 'PRD-2026-Q2：用户画像分层 + 埋点规范 v3；需与增长、数据、客户端三方评审。',
      note: 'English note: rollout gated by feature flag `sheet.wrap_beta`.',
      amount: 81000,
    },
    {
      name: '周九',
      role: '算法',
      desc: '模型 serving latency P99<120ms；特征仓日增量 2.1TB；异常检测规则 #42/#57 待下线。',
      note: '含公式：score = 0.7×ctr + 0.3×cvr；阈值 τ=0.15（可调）。',
      amount: 105000,
    },
    {
      name: '吴十',
      role: '安全',
      desc: '【高】依赖漏洞 CVE-2026-xxxxx；SBOM 扫描每周一；零信任网关策略变更窗口周三 02:00–04:00 UTC。',
      note: '',
      amount: 99000,
    },
    {
      name: '郑十一',
      role: '国际化',
      desc: 'RTL 布局回归；`zh-CN` / `en-US` / `ja-JP` 文案长度差异导致列宽抖动——优先 wrap 列验证。',
      note: 'URL: https://docs.example.com/i18n/grid-wrap',
      amount: 73000,
    },
    {
      name: '王十二',
      role: '实习',
      desc: 'Onboarding week-2：阅读 architecture.md + 跑通 bun test；首任务：补 CellPainter 单测。',
      note: '导师：张三；截止 2026-06-01。',
      amount: 12000,
    },
  ]
}

const WRAP_BIG_DEPTS = ['平台', '数据', '设计', '增长', '运维', '安全']
const WRAP_BIG_REGIONS = ['华北', '华东', '华南', '西南']
const WRAP_BIG_STATUSES = ['进行中', '已完成', '阻塞', '待评审']

/** 1 万行 × 10 列换行滚动压测 Schema。 */
export function wrapAutofitBigSchema(): Schema {
  return {
    fields: [
      { id: 'id', name: '序号', type: 'number', width: 72 },
      { id: 'name', name: '员工', type: 'text', width: 96 },
      { id: 'dept', name: '部门', type: 'text', width: 80 },
      { id: 'region', name: '区域', type: 'text', width: 72 },
      { id: 'status', name: '状态', type: 'text', width: 80 },
      { id: 'desc', name: '描述', type: 'text', width: 200, wrap: true },
      { id: 'note', name: '备注', type: 'text', width: 140, wrap: true },
      { id: 'score', name: '得分', type: 'number', width: 72 },
      { id: 'owner', name: '负责人', type: 'text', width: 88 },
      { id: 'tags', name: '标签', type: 'text', width: 120 },
    ],
  }
}

/** 按需生成 1W×10 数据；Story 内分批 `autofitRows()` 撑开 wrap 行高。 */
export function createWrapAutofitBigDataSource(rowCount = 10_000): GeneratedDataSource {
  const schema = wrapAutofitBigSchema()
  return new GeneratedDataSource(rowCount, schema, (row, fieldId) => {
    switch (fieldId) {
      case 'id':
        return row
      case 'name':
        return `员工 ${row}`
      case 'dept':
        return WRAP_BIG_DEPTS[row % WRAP_BIG_DEPTS.length]!
      case 'region':
        return WRAP_BIG_REGIONS[row % WRAP_BIG_REGIONS.length]!
      case 'status':
        return WRAP_BIG_STATUSES[row % WRAP_BIG_STATUSES.length]!
      case 'score':
        return (row * 17) % 1000
      case 'owner':
        return `负责人-${row % 128}`
      case 'tags':
        return `tag-${row % 20},tag-${(row + 7) % 20}`
      case 'desc': {
        const kind = row % 5
        if (kind === 0) return `短描述 row=${row}`
        if (kind === 1) {
          return `中等：${WRAP_BIG_REGIONS[row % 4]!}·${WRAP_BIG_DEPTS[row % 6]!} 协作项 #${row}，含中英文 mix & 符号 ()[]。`
        }
        if (kind === 2) {
          return `长文本压测 row=${row}：Canvas 虚拟滚动 + wrap 绘制；请纵向滚动观察帧率与换行截断。`.repeat(
            1 + (row % 3),
          )
        }
        if (kind === 3)
          return `EN-only row ${row}: rollout behind flag sheet.wrap_v2; monitor P99 latency.`
        return `【阻塞】row ${row} 依赖上游 API；重试 3 次后失败；日志 id=0x${((row * 2654435761) >>> 0).toString(16).slice(0, 8)}`
      }
      case 'note': {
        if (row % 7 === 0) return ''
        if (row % 3 === 0) return `备注 ${row}`
        return `note-${row}：跟进中 / 下周复盘；链接 https://example.com/t/${row}`
      }
      default:
        return ''
    }
  })
}
