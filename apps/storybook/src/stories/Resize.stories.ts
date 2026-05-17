import type { Meta, StoryObj } from '@storybook/html'
import { InMemoryDataSource } from '@novasheet/core'
import { withExcelHeaders } from '@novasheet/web'
import { createGridHost } from '../grid-host'
import { basicTextSchema, generateRows } from '../mock-data'
import { docsMeta, docsStory } from '../story-docs'
import resizeExcelSrc from './snippets/resize.excelHeaders.snippet.ts?raw'

const RESIZE_DOCS = `
Phase 3.4 行列 resize：DOM \`<handle>\` 命中区（spec §6.1），不挡 canvas 滚动。

### 列宽

- 鼠标移到**列头底边**（8px 命中区），光标变为 \`col-resize\`；悬停显示双 pill grip（Sheets 式）
- 拖拽调整列宽；松手后 spacer 与视口同步

### 行高（需 Excel 行号列）

- \`withExcelHeaders()\` 或 \`excelHeaders: true\` 开启左侧行号列后，**行号列右缘**出现 \`row-resize\` 命中区（悬停同样显示 grip）
- 拖拽调整行高

### 键盘（handle 聚焦后）

| 按键 | 列 handle | 行 handle |
|------|-----------|-----------|
| ← / → | 缩窄 / 加宽（Shift 步长 32px） | — |
| ↑ / ↓ | — | 减高 / 加高 |

最小尺寸 **20px**（\`MIN_RESIZE_SIZE\`）。拖拽时显示 Sheets 式竖线/横线预览（松手后表格才更新）。
`.trim()

const meta: Meta = {
  title: '表格/行列 resize',
  ...docsMeta(RESIZE_DOCS),
}
export default meta

type Story = StoryObj

export const ExcelHeadersResize: Story = {
  name: '列头 + 行号列 resize',
  ...docsStory(
    resizeExcelSrc,
    '列头拖列宽；左侧行号列拖行高。冻结区与普通区 handle 每帧随视口同步。',
  ),
  render: () => {
    const schema = basicTextSchema()
    const data = new InMemoryDataSource({ schema, rows: generateRows(schema, 80) })
    return createGridHost(withExcelHeaders({ data }))
  },
}
