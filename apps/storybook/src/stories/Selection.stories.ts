import type { Meta, StoryObj } from '@storybook/html'
import { InMemoryDataSource } from '@novasheet/core'
import { createGridHost } from '../grid-host'
import { basicTextSchema, generateRows } from '../mock-data'
import { docsMeta, docsStory } from '../story-docs'
import keyboardNavSrc from './snippets/selection.keyboardNavigation.snippet.ts?raw'

const SELECTION_DOCS = `
Phase 3 选择与键盘导航。交互由 \`DomGridHost\` + \`WebGridRuntime\` 自动接入，**无需在业务代码里监听 keydown**。

### 使用前

1. **先点击表格任意单元格**（让 \`scroll-host\` 获得焦点，\`outline\` 已隐藏）
2. 再按下方快捷键；若按键无反应，再点一次表格

### 鼠标

| 操作 | 效果 |
|------|------|
| 单击单元格 | 选中单格；\`activeCell\` = \`anchorCell\` = \`extentCell\` |
| Shift + 单击 | 从 \`anchorCell\` 扩展到点击格，\`activeCell\` 保持不动 |
| 拖拽 | 框选；边缘自动滚动 |

### 键盘（Phase 3.3）

| 按键 | 效果 |
|------|------|
| ↑ ↓ ← → | 移动 \`activeCell\`，选区收成单格 |
| Shift + ↑↓←→ | 移动 \`extentCell\`，扩展 \`selectedRange\`，\`anchorCell\` / \`activeCell\` 不动 |
| Tab | 右移；末列时换到下一行首列 |
| Shift + Tab | 左移；首列时换到上一行末列 |
| Enter | 下移一行 |
| Shift + Enter | 上移一行 |
| 直接打字 | 进入编辑（Phase 3.5，Sheets 式） |
| F2 | 在原内容末尾编辑 |

导航后若焦点格不在视口内，会自动 **滚动跟随**（\`computeScrollReveal\`）。

### 视觉

- 选区底色与活动格边框在 Canvas **overlay** 层绘制（\`theme.colors.selectionBg\` / \`selectionBorder\`）
- Excel 模式（\`excelHeaders: true\`）下，行列头也会联动高亮

### 引擎 API（可选）

\`\`\`ts
engine.selectCell({ rowIndex, colIndex }, { extend: true })
engine.navigateSelection('ArrowDown', false) // 一般由 runtime 调用
engine.getSelection() // activeCell / anchorCell / extentCell / selectedRange
\`\`\`
`.trim()

const meta: Meta = {
  title: '表格/选择与键盘',
  ...docsMeta(SELECTION_DOCS),
}
export default meta

type Story = StoryObj

/** 200 行，便于验证方向键与滚入视口。 */
export const KeyboardNavigation: Story = {
  name: '键盘导航（200 行）',
  ...docsStory(
    keyboardNavSrc,
    '点击表格后：方向键移动、Shift+方向键扩展、Tab/Enter 换格；滚出视口会自动滚回来。',
  ),
  render: () => {
    const schema = basicTextSchema()
    const data = new InMemoryDataSource({ schema, rows: generateRows(schema, 200) })
    return createGridHost({ data })
  },
}
