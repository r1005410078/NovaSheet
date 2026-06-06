import { describe, expect, it } from 'bun:test'
import { Grid } from '@novasheet/core'
import { InMemoryDataSource, type Schema, type UndoCommand } from '@novasheet/core'
import { canvas2dBackend } from '../../src/backend/canvas2dBackend'

const schema: Schema = {
  fields: [
    { id: 'a', name: 'A', type: 'text', width: 80 },
    { id: 'b', name: 'B', type: 'number', width: 80 },
  ],
}

function setupGrid() {
  const container = document.createElement('div')
  Object.assign(container.style, { width: '600px', height: '400px' })
  document.body.appendChild(container)
  const data = new InMemoryDataSource({
    schema,
    rows: [
      { a: 'x', b: 1 },
      { a: 'y', b: 2 },
    ],
  })
  return { container, data }
}

describe('Grid facade — undo/redo', () => {
  it('canUndo / canRedo 初始 false', () => {
    const { container, data } = setupGrid()
    const grid = new Grid(container, { backend: canvas2dBackend, data })
    expect(grid.canUndo()).toBe(false)
    expect(grid.canRedo()).toBe(false)
    grid.destroy()
    container.remove()
  })

  it('setRowHeight 通过 facade 不进 undo 栈(preview path 保持)', () => {
    const { container, data } = setupGrid()
    const grid = new Grid(container, { backend: canvas2dBackend, data })
    grid.setRowHeight(0, 60)
    expect(grid.canUndo()).toBe(false)
    grid.destroy()
    container.remove()
  })

  it('onUndo 注册成功(handler 可注册和取消)', () => {
    const { container, data } = setupGrid()
    const events: UndoCommand[] = []
    const grid = new Grid(container, {
      backend: canvas2dBackend,
      data,
      onUndo: (e) => events.push(e.command),
    })
    // 不直接触发(handleClipboardPaste 需要 navigator.clipboard 等),只验证 API 可调用
    expect(typeof grid.onUndo).toBe('function')
    const off = grid.onUndo((e) => events.push(e.command))
    off()
    grid.destroy()
    container.remove()
  })
})
