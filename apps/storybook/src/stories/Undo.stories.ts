import type { Meta, StoryObj } from '@storybook/html'
import { InMemoryDataSource } from '@novasheet/core'
import { createGridHost } from '../grid-host'
import { docsMeta, docsStory } from '../story-docs'
import basicSrc from './snippets/undo.basic.snippet.ts?raw'

const meta: Meta = {
  title: 'Table/Undo and redo',
  parameters: { layout: 'centered' },
  ...docsMeta(
    'Phase 4.2: UndoStack with depth 100 and discriminated UndoCommand variants. Cell edit, Cut, Paste, and row/column resize enter the stack. Cmd/Ctrl+Z undoes, Cmd+Shift+Z or Ctrl+Y redoes, and Grid exposes undo(), redo(), canUndo(), canRedo(), onUndo, and onRedo.',
  ),
}
export default meta
type Story = StoryObj

export const Basic: Story = {
  name: 'Basic undo and redo',
  ...docsStory(
    basicSrc,
    'Double-click a cell to edit, or use Ctrl/Cmd+X/V clipboard actions, then Ctrl/Cmd+Z to undo. Toolbar buttons show canUndo / canRedo state.',
  ),
  render: () => {
    const schema = {
      fields: [
        { id: 'name', name: 'Name', type: 'text' as const, width: 140 },
        { id: 'qty', name: 'Quantity', type: 'number' as const, width: 100 },
      ],
    }

    const data = new InMemoryDataSource({
      schema,
      rows: Array.from({ length: 30 }, (_, i) => ({
        name: `Product ${i + 1}`,
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
    statusEl.textContent = 'Latest event: (none)'

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
          statusEl.textContent = `Latest event: undo (${e.command.kind})`
          syncButtons()
        },
        onRedo: (e) => {
          statusEl.textContent = `Latest event: redo (${e.command.kind})`
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
