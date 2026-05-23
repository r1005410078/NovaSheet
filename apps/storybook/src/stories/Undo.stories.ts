import type { Meta, StoryObj } from '@storybook/html'
import { InMemoryDataSource } from '@novasheet/core'
import { createGridHost } from '../grid-host'
import { docsMeta, docsStory } from '../story-docs'
import basicSrc from './snippets/undo.basic.snippet.ts?raw'

const meta: Meta = {
  title: '表格/撤销重做',
  parameters: { layout: 'centered' },
  ...docsMeta(
    'Phase 4.2：UndoStack（深 100）+ discriminated-union UndoCommand；cell edit / Cut / Paste / Row+Col resize 进栈；Cmd/Ctrl+Z 撤销，Cmd+Shift+Z 或 Ctrl+Y 重做；编辑中 Cmd/Ctrl+Z 交给浏览器 input 原生；Undo/Redo 后选区恢复到受影响范围；Grid.undo() / redo() / canUndo() / canRedo() + onUndo / onRedo 事件。',
  ),
}
export default meta
type Story = StoryObj

export const Basic: Story = {
  name: '基础撤销重做',
  ...docsStory(
    basicSrc,
    '双击单元格编辑，或 Ctrl/Cmd+X/V 剪贴操作，然后 Ctrl/Cmd+Z 撤销；工具栏按钮展示 canUndo / canRedo 状态。',
  ),
  render: () => {
    const schema = {
      fields: [
        { id: 'name', name: '名称', type: 'text' as const, width: 140 },
        { id: 'qty', name: '数量', type: 'number' as const, width: 100 },
      ],
    }

    const data = new InMemoryDataSource({
      schema,
      rows: Array.from({ length: 30 }, (_, i) => ({
        name: `产品 ${i + 1}`,
        qty: 10 + i,
      })),
    })

    // Wrapper with toolbar + grid
    const wrapper = document.createElement('div')
    Object.assign(wrapper.style, {
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      padding: '8px',
      width: '720px',
      height: '440px',
      boxSizing: 'border-box',
    })

    const toolbar = document.createElement('div')
    Object.assign(toolbar.style, { display: 'flex', gap: '8px', alignItems: 'center' })

    const undoBtn = document.createElement('button')
    undoBtn.textContent = 'Undo'
    undoBtn.disabled = true

    const redoBtn = document.createElement('button')
    redoBtn.textContent = 'Redo'
    redoBtn.disabled = true

    const statusEl = document.createElement('span')
    Object.assign(statusEl.style, { fontFamily: 'monospace', fontSize: '12px', color: '#555' })
    statusEl.textContent = '最近事件: (无)'

    toolbar.appendChild(undoBtn)
    toolbar.appendChild(redoBtn)
    toolbar.appendChild(statusEl)

    const gridContainer = document.createElement('div')
    Object.assign(gridContainer.style, { flex: '1', minHeight: '0', position: 'relative' })

    wrapper.appendChild(toolbar)
    wrapper.appendChild(gridContainer)

    const gridEl = createGridHost(
      {
        data,
        onUndo: (e) => {
          statusEl.textContent = `最近事件: undo (${e.command.kind})`
          syncButtons()
        },
        onRedo: (e) => {
          statusEl.textContent = `最近事件: redo (${e.command.kind})`
          syncButtons()
        },
      },
      '100%',
      '100%',
    )
    gridContainer.appendChild(gridEl)

    const grid = (gridEl as unknown as HTMLElement & { __grid: import('@novasheet/web').Grid })
      .__grid

    function syncButtons() {
      undoBtn.disabled = !grid.canUndo()
      redoBtn.disabled = !grid.canRedo()
    }

    undoBtn.addEventListener('click', () => {
      grid.undo()
      syncButtons()
    })
    redoBtn.addEventListener('click', () => {
      grid.redo()
      syncButtons()
    })

    // Poll to sync button state after edits / resize / paste that don't fire onUndo/onRedo
    const pollId = window.setInterval(syncButtons, 200)
    wrapper.dataset['pollId'] = String(pollId)

    return wrapper
  },
}
