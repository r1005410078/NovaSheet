import type { Meta, StoryObj } from '@storybook/html'
import { Grid } from '@novasheet/web'
import { InMemoryDataSource, type Schema } from '@novasheet/core'
import { createGridHost } from '../grid-host'
import { docsMeta, docsStory } from '../story-docs'
import { sources } from '../story-sources'

const meta: Meta = {
  title: '表格/行高自适应',
  parameters: { layout: 'centered' },
  ...docsMeta(
    'M3 autofit：`field.wrap = true` 时支持多行换行；`grid.autofitRows()` 按当前列宽与文本内容批量重算行高。',
  ),
}
export default meta

type Story = StoryObj

const schema: Schema = {
  fields: [
    { id: 'name', name: '员工', type: 'text', width: 100 },
    { id: 'desc', name: '描述', type: 'text', width: 220, wrap: true },
    { id: 'note', name: '备注', type: 'text', width: 160, wrap: true },
    { id: 'amount', name: '金额', type: 'number', width: 100 },
  ],
}

const sampleRows = [
  {
    name: '张三',
    desc: '负责前端架构与跨平台渲染系统的设计与实现，覆盖 Canvas2D / WebGL / Flutter 三端。',
    note: '本季度推进 M3 frozen + autofit。',
    amount: 85000,
  },
  {
    name: '李四',
    desc: '数据工程师，主导 ETL pipeline 和数据质量监控；近期接入 ClickHouse 替换原 PostgreSQL OLAP。',
    note: '需评审下季度迁移方案。',
    amount: 92000,
  },
  {
    name: '王五',
    desc: '短描述。',
    note: '无',
    amount: 70000,
  },
  {
    name: '赵六',
    desc: '设计系统与 Storybook 维护；推动 dense / compact 双主题落地，新增空数据插画与暗色模式适配。',
    note: '协调与品牌团队的 token 对齐。',
    amount: 78000,
  },
  {
    name: '钱七',
    desc: '运维：CI / 构建与发布流水线。一句话能讲清楚，无需换行。',
    note: '负责 CI 看板。',
    amount: 65000,
  },
]

/**
 * 长文本 + autofit：mount 后调用 `grid.autofitRows()` 自动按内容把每行撑开。
 * 横向比较第 1 行（多行）与第 3 行（单行）的高度差异。
 */
export const LongTextAutofit: Story = {
  name: '长文本 + autofitRows()',
  ...docsStory(sources.autofit.longText, '页面加载后自动调用 `grid.autofitRows()`，按文本内容撑开。'),
  render: () => {
    const data = new InMemoryDataSource({ schema, rows: sampleRows })
    const host = createGridHost({ data }, 720, 360)
    requestAnimationFrame(() => {
      const grid = (host as HTMLElement & { __grid: Grid }).__grid
      grid.autofitRows()
    })
    return host
  },
}

/**
 * wrap=true 但 **不调** autofitRows：行高仍是默认值，长文本只展示首行（被单元格底部裁掉）。
 * 用来对比「换行 + 行高自适应」是两件事。
 */
export const WrapWithoutAutofit: Story = {
  name: '只换行不 autofit（对比）',
  ...docsStory(
    sources.autofit.longText.replace('grid.autofitRows()', '// grid.autofitRows() — 故意不调'),
    'CellPainter 仍按 wrap 模式绘制，但行高保持默认；长文本会被单元格底部裁切。',
  ),
  render: () => {
    const data = new InMemoryDataSource({ schema, rows: sampleRows })
    return createGridHost({ data }, 720, 360)
  },
}

/**
 * 调用 autofitRows 后修改列宽——新 wrap 形态下，旧行高不再合适。
 * 该 story 演示：用户改完列宽后需要再次手动调 autofitRows。
 */
export const AfterColumnResize: Story = {
  name: '列宽变化后再次 autofit',
  ...docsStory(
    `grid.autofitRows()
grid.setColumnWidth('desc', 100)  // 列变窄 → 文本应该多换几行
grid.autofitRows()                // 再次手动重算`,
    '本 demo 在 mount 后调用了两次 autofitRows——可观察第二次后 desc 列高度增加。',
  ),
  render: () => {
    const data = new InMemoryDataSource({ schema, rows: sampleRows })
    const host = createGridHost({ data }, 720, 360)
    requestAnimationFrame(() => {
      const grid = (host as HTMLElement & { __grid: Grid }).__grid
      grid.autofitRows()
      // 模拟「用户拖窄了 desc 列」
      setTimeout(() => {
        grid.setColumnWidth('desc', 100)
        grid.autofitRows()
      }, 500)
    })
    return host
  },
}
