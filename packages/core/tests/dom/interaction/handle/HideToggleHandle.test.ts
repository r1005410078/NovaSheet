import { describe, expect, it, mock } from 'bun:test'
import { HideToggleHandle } from '../../../../src/dom/interaction/handle/HideToggleHandle'

describe('HideToggleHandle', () => {
  it('点击 handle 触发 onUnhide(hiddenIds)', () => {
    const onUnhide = mock<(ids: readonly number[]) => void>(() => {})
    const root = document.createElement('div')
    const layer = new HideToggleHandle(root, { onUnhide })

    layer.update([{ atViewRow: 2, hiddenCount: 3, hiddenIds: [3, 4, 5], yPx: 60 }], {
      rowHeaderWidth: 30,
    })

    const handle = root.querySelector('[data-handle="hide-toggle"]') as HTMLElement
    expect(handle).toBeTruthy()
    handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    expect(onUnhide).toHaveBeenCalledWith([3, 4, 5])
  })

  it('rowHeaderWidth < 24 时不渲染 handle', () => {
    const onUnhide = mock<(ids: readonly number[]) => void>(() => {})
    const root = document.createElement('div')
    const layer = new HideToggleHandle(root, { onUnhide })

    layer.update([{ atViewRow: 2, hiddenCount: 3, hiddenIds: [3, 4, 5], yPx: 60 }], {
      rowHeaderWidth: 20,
    })

    expect(root.querySelector('[data-handle="hide-toggle"]')).toBeNull()
  })

  it('update 替换旧 handle', () => {
    const onUnhide = mock<(ids: readonly number[]) => void>(() => {})
    const root = document.createElement('div')
    const layer = new HideToggleHandle(root, { onUnhide })

    layer.update([{ atViewRow: 1, hiddenCount: 2, hiddenIds: [2, 3], yPx: 40 }], {
      rowHeaderWidth: 30,
    })
    layer.update([], { rowHeaderWidth: 30 })

    expect(root.querySelector('[data-handle="hide-toggle"]')).toBeNull()
  })

  it('destroy 移除所有 handle', () => {
    const onUnhide = mock<(ids: readonly number[]) => void>(() => {})
    const root = document.createElement('div')
    const layer = new HideToggleHandle(root, { onUnhide })

    layer.update([{ atViewRow: 1, hiddenCount: 2, hiddenIds: [2, 3], yPx: 40 }], {
      rowHeaderWidth: 30,
    })
    layer.destroy()

    expect(root.querySelector('[data-handle="hide-toggle"]')).toBeNull()
  })
})
