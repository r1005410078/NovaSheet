import type { Meta, StoryObj } from '@storybook/html'
import { InMemoryDataSource } from '@zhiguang/core'
import { createGridHost } from '../grid-host'
import { basicTextSchema, generateRows } from '../mock-data'
import { docsMeta, docsStory } from '../story-docs'
import basicSrc from './snippets/contextMenu.basic.snippet.ts?raw'

const meta: Meta = {
  title: 'Table/Context menu',
  parameters: { layout: 'centered' },
  ...docsMeta(
    'Phase 4.0: right-click a body cell to open Cut / Copy / Paste. Paste is enabled by default for MutableDataSource, and Cut/Copy actions are exposed through `onContextMenuAction`.',
  ),
}
export default meta

type Story = StoryObj

export const Basic: Story = {
  name: 'Basic context menu',
  ...docsStory(
    basicSrc,
    'Right-click the body area to open the menu. Esc closes it, arrow keys move focus, and Enter triggers the callback.',
  ),
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
  name: 'Paste enabled',
  ...docsStory(basicSrc, 'Paste is enabled by default when using a MutableDataSource.'),
  render: () => {
    const schema = basicTextSchema()
    const data = new InMemoryDataSource({ schema, rows: generateRows(schema, 30) })
    return createGridHost({ data })
  },
}

export const CustomExtensions: Story = {
  name: '配置式扩展菜单项',
  render: () => {
    const schema = basicTextSchema()
    const data = new InMemoryDataSource({ schema, rows: generateRows(schema, 30) })
    return createGridHost({
      data,
      contextMenus: {
        columnHeader: {
          items: [
            {
              id: 'demo.freeze-column',
              label: '冻结到当前列',
              icon: { kind: 'builtin', name: 'more' },
              category: 'custom',
              disabled: false,
            },
          ],
        },
      },
      onContextMenuAction(action, ctx) {
        // eslint-disable-next-line no-console
        console.log('context menu action', action, ctx)
      },
    })
  },
}

export const DomOverride: Story = {
  name: 'DOM 覆盖渲染器',
  render: () => {
    const schema = basicTextSchema()
    const data = new InMemoryDataSource({ schema, rows: generateRows(schema, 30) })

    let customEl: HTMLDivElement | null = null

    return createGridHost({
      data,
      contextMenuRenderer: {
        open(options) {
          if (customEl) customEl.remove()
          customEl = document.createElement('div')
          Object.assign(customEl.style, {
            position: 'fixed',
            left: `${options.anchor.clientX}px`,
            top: `${options.anchor.clientY}px`,
            background: '#fff',
            border: '1px solid #ccc',
            borderRadius: '6px',
            padding: '8px',
            zIndex: '9999',
            minWidth: '180px',
            boxShadow: '0 4px 12px rgba(0,0,0,.15)',
          })
          for (const item of options.items) {
            const btn = document.createElement('button')
            btn.textContent = item.disabled ? `${item.label} (禁用)` : item.label
            Object.assign(btn.style, {
              display: 'block',
              width: '100%',
              padding: '6px 12px',
              border: 'none',
              background: 'transparent',
              textAlign: 'left',
              cursor: item.disabled ? 'default' : 'pointer',
              color: item.disabled ? '#aaa' : '#333',
            })
            if (!item.disabled) {
              btn.addEventListener('click', () => {
                options.select(item.id)
                options.close()
              })
            }
            customEl.appendChild(btn)
          }
          document.body.appendChild(customEl)
        },
        close() {
          if (customEl) { customEl.remove(); customEl = null }
        },
        destroy() {
          if (customEl) { customEl.remove(); customEl = null }
        },
      },
    })
  },
}
