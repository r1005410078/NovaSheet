import type { Meta, StoryObj } from '@storybook/html'
import { InMemoryDataSource } from '@novasheet/core'
import { createGridHost } from '../grid-host'
import { mixedTypesSchema, generateRows } from '../mock-data'
import { docsMeta, docsStory } from '../story-docs'

const EDIT_DOCS = `
Phase 3.5 基础单元格编辑（\`text\` / \`number\` 列）。

### 进入编辑（Google Sheets 式）

- **单击选中**后**直接打字**（首字符覆盖原内容，继续输入追加）
- **F2** 或 **双击**：在原内容末尾编辑（不全选）
- **Enter** 在未编辑时**下移一行**（不进入编辑）

### 提交 / 取消

| 操作 | 效果 |
|------|------|
| **Enter** | 提交并下移一行 |
| 点击其他单元格 / 失焦 | 提交，焦点留在当前格 |
| **Esc** | 取消，恢复原值 |

编辑器为 DOM \`<input>\`，叠在单元格上（Theme 边框色与选区一致）。
`.trim()

const meta: Meta = {
  title: '表格/基础编辑',
  ...docsMeta(EDIT_DOCS),
}
export default meta

type Story = StoryObj

export const TextAndNumber: Story = {
  ...docsStory(EDIT_DOCS),
  render: () => {
    const schema = mixedTypesSchema()
    const data = new InMemoryDataSource({ schema, rows: generateRows(schema, 30) })
    return createGridHost({ data, excelHeaders: true })
  },
}
