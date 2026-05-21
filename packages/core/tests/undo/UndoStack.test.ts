import { describe, expect, it } from 'bun:test'
import { UndoStack } from '../../src/undo/UndoStack'
import type { UndoCommand } from '../../src/undo/UndoCommand'

const edit = (rowIndex: number): UndoCommand => ({
  kind: 'editCell',
  rowIndex,
  fieldId: 'a',
  before: null,
  after: rowIndex,
})

describe('UndoStack', () => {
  it('push 后 canUndo 为 true,canRedo 为 false', () => {
    const s = new UndoStack()
    expect(s.canUndo()).toBe(false)
    expect(s.canRedo()).toBe(false)
    s.push(edit(0))
    expect(s.canUndo()).toBe(true)
    expect(s.canRedo()).toBe(false)
  })

  it('popUndo 返回最近一条并转移到 redo', () => {
    const s = new UndoStack()
    s.push(edit(0))
    s.push(edit(1))
    expect(s.popUndo()).toEqual(edit(1))
    expect(s.canUndo()).toBe(true)
    expect(s.canRedo()).toBe(true)
  })

  it('popRedo 把 redo 顶弹回 undo', () => {
    const s = new UndoStack()
    s.push(edit(0))
    s.popUndo()
    expect(s.popRedo()).toEqual(edit(0))
    expect(s.canUndo()).toBe(true)
    expect(s.canRedo()).toBe(false)
  })

  it('push 新条目时清空 redo 栈', () => {
    const s = new UndoStack()
    s.push(edit(0))
    s.popUndo()
    expect(s.canRedo()).toBe(true)
    s.push(edit(1))
    expect(s.canRedo()).toBe(false)
  })

  it('空栈 popUndo / popRedo 返回 undefined', () => {
    const s = new UndoStack()
    expect(s.popUndo()).toBeUndefined()
    expect(s.popRedo()).toBeUndefined()
  })

  it('容量 100:第 101 条挤掉第 1 条', () => {
    const s = new UndoStack()
    for (let i = 0; i < 101; i++) s.push(edit(i))
    const popped: UndoCommand[] = []
    while (s.canUndo()) {
      const v = s.popUndo()
      if (v) popped.push(v)
    }
    expect(popped.length).toBe(100)
    expect(popped[0]).toEqual(edit(100))
    expect(popped[99]).toEqual(edit(1))
  })

  it('clear 清空双栈', () => {
    const s = new UndoStack()
    s.push(edit(0))
    s.push(edit(1))
    s.popUndo()
    s.clear()
    expect(s.canUndo()).toBe(false)
    expect(s.canRedo()).toBe(false)
  })
})
