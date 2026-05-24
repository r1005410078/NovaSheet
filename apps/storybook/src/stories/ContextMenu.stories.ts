import type { Meta, StoryObj } from '@storybook/html'
import type { Grid } from '@novasheet/web'
import { InMemoryDataSource } from '@novasheet/core'
import { createGridHost } from '../grid-host'
import { basicTextSchema, generateRows } from '../mock-data'
import { docsMeta, docsStory } from '../story-docs'
import basicSrc from './snippets/contextMenu.basic.snippet.ts?raw'

const meta: Meta = {
  title: '表格/右键菜单',
  parameters: { layout: 'centered' },
  ...docsMeta(
    'Phase 4.0：body 单元格右键打开 Cut / Copy / Paste。Paste 默认 disabled——Phase 4.1 剪贴板就绪后通过 `grid.setClipboardReady(true)` 启用。点击 Cut/Copy 通过 `onContextMenuAction` 回调外抛，4.0 内部不动剪贴板。',
  ),
}
export default meta

type Story = StoryObj

export const Basic: Story = {
  name: '基础右键菜单',
  ...docsStory(basicSrc, '右键 body 区域看菜单；Esc 关闭；↑↓ 切换；Enter 触发回调（看控制台）。'),
  render: () => {
    const schema = basicTextSchema()
    const data = new InMemoryDataSource({ schema, rows: generateRows(schema, 30) })
    return createGridHost({
      data,
      onContextMenuAction: (action, ctx) => {
        // eslint-disable-next-line no-console
        const detail =
          ctx.targetKind === 'columnHeader'
            ? ctx.field
            : ctx.targetKind === 'rowHeader'
              ? ctx.targetRowIndex
              : ctx.cell
        console.log('[ContextMenu]', action, detail)
      },
    })
  },
}

export const PasteEnabled: Story = {
  name: 'Paste 启用（模拟 4.1）',
  ...docsStory(
    basicSrc.replace(
      '// Phase 4.1 引擎实现后挂上：grid.setClipboardReady(true) 让 Paste 变可用',
      'grid.setClipboardReady(true) // 4.0 测试用',
    ),
    'mount 后调用 `setClipboardReady(true)`——Paste 项变可用。',
  ),
  render: () => {
    const schema = basicTextSchema()
    const data = new InMemoryDataSource({ schema, rows: generateRows(schema, 30) })
    const host = createGridHost({ data })
    requestAnimationFrame(() => {
      const grid = (host as HTMLElement & { __grid: Grid }).__grid
      grid.setClipboardReady(true)
    })
    return host
  },
}
