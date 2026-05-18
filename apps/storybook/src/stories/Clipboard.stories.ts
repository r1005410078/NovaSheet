import type { Meta, StoryObj } from '@storybook/html'
import { InMemoryDataSource } from '@novasheet/core'
import { createGridHost } from '../grid-host'
import { basicTextSchema, generateRows } from '../mock-data'
import { docsMeta, docsStory } from '../story-docs'
import basicSrc from './snippets/clipboard.basic.snippet.ts?raw'

const meta: Meta = {
  title: '表格/剪贴板',
  parameters: { layout: 'centered' },
  ...docsMeta(
    'Phase 4.1：Cut / Copy / Paste。Ctrl/Cmd+X/C/V 快捷键 + 右键菜单同一引擎；与 Excel / Sheets 双向互通（TSV）；类型不匹配跳过 + onPasteSkipped 事件。',
  ),
}
export default meta
type Story = StoryObj

export const Basic: Story = {
  name: '基础剪贴板',
  ...docsStory(
    basicSrc,
    '点选区域 → Ctrl/Cmd+C/X/V 或右键菜单；打开浏览器 console 看 onCopy/onCut/onPaste 输出。',
  ),
  render: () => {
    const schema = basicTextSchema()
    const data = new InMemoryDataSource({ schema, rows: generateRows(schema, 50) })
    return createGridHost({
      data,
      onCopy: (r) => {
        // eslint-disable-next-line no-console
        console.log('[clipboard] copy', r)
      },
      onCut: (r) => {
        // eslint-disable-next-line no-console
        console.log('[clipboard] cut', r)
      },
      onPaste: (t) => {
        // eslint-disable-next-line no-console
        console.log('[clipboard] paste', t)
      },
      onPasteSkipped: (c) => {
        // eslint-disable-next-line no-console
        console.warn('[clipboard] skipped', c)
      },
    })
  },
}
