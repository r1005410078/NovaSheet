import { describe, expect, it } from 'bun:test'
import { act } from 'react'
import { richTextEditor } from '../../src/rich-text/RichTextCellEditor'
import type { CellEditorOpenContext } from '@novasheet/core'

function open(over: Partial<CellEditorOpenContext> = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const committed: { value: unknown; runs: unknown } = { value: undefined, runs: undefined }
  const ctx: CellEditorOpenContext = {
    cell: { rowIndex: 0, colIndex: 0 },
    field: { id: 't', name: 'T', type: 'text', width: 120 },
    value: 'abcd',
    container,
    rect: { x: 0, y: 0, width: 120, height: 24 },
    trigger: 'double-click',
    commit: (v) => { committed.value = v },
    setAttachment: (_ns, data) => { committed.runs = data; return true },
    cancel: () => {},
    ...over,
  }
  return { ctx, container, committed }
}

describe('richTextEditor', () => {
  it('renders contenteditable seeded with current value', async () => {
    const { ctx, container } = open()
    await act(async () => { richTextEditor.open(ctx) })
    const ce = container.querySelector('[contenteditable]') as HTMLElement
    expect(ce).toBeTruthy()
    expect(ce.textContent).toBe('abcd')
  })

  it('commit serializes DOM → value + runs (bold substring preserved)', async () => {
    const { ctx, container, committed } = open()
    await act(async () => { richTextEditor.open(ctx) })
    const ce = container.querySelector('[contenteditable]') as HTMLElement
    // 模拟用户把 'bc' 加粗：直接设 DOM（toolbar 行为在 Task 6 测）
    ce.innerHTML = '<span>a</span><span style="font-weight:bold">bc</span><span>d</span>'
    // 触发提交（组件暴露的提交入口——blur）
    // happy-dom: React onBlur maps to focusout internally
    await act(async () => { ce.dispatchEvent(new FocusEvent('focusout', { bubbles: true })) })
    expect(committed.value).toBe('abcd')
    expect(committed.runs).toEqual([{ start: 1, end: 3, attrs: { bold: true } }])
  })
})
