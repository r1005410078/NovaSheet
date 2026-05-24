import { describe, expect, it, mock } from 'bun:test'
import { HideColToggleHandle } from '../../src/handle/HideColToggleHandle'

describe('HideColToggleHandle', () => {
  it('点击 handle 触发 onUnhide(fieldIds)', () => {
    const onUnhide = mock<(ids: readonly string[]) => void>(() => {})
    const root = document.createElement('div')
    const layer = new HideColToggleHandle(root, { onUnhide })

    layer.update(
      [{ atViewCol: 2, hiddenCount: 3, hiddenFieldIds: ['f3', 'f4', 'f5'], xPx: 200 }],
      { headerHeight: 30 },
    )

    const handle = root.querySelector('[data-handle="hide-col-toggle"]') as HTMLElement
    expect(handle).toBeTruthy()
    handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    expect(onUnhide).toHaveBeenCalledWith(['f3', 'f4', 'f5'])
  })

  it('headerHeight < 24 时不渲染 handle', () => {
    const onUnhide = mock<(ids: readonly string[]) => void>(() => {})
    const root = document.createElement('div')
    const layer = new HideColToggleHandle(root, { onUnhide })

    layer.update([{ atViewCol: 0, hiddenCount: 1, hiddenFieldIds: ['x'], xPx: 50 }], {
      headerHeight: 20,
    })

    expect(root.querySelector('[data-handle="hide-col-toggle"]')).toBeNull()
  })

  it('update 替换旧 handle', () => {
    const onUnhide = mock<(ids: readonly string[]) => void>(() => {})
    const root = document.createElement('div')
    const layer = new HideColToggleHandle(root, { onUnhide })

    layer.update([{ atViewCol: 0, hiddenCount: 1, hiddenFieldIds: ['x'], xPx: 50 }], {
      headerHeight: 30,
    })
    layer.update([], { headerHeight: 30 })

    expect(root.querySelector('[data-handle="hide-col-toggle"]')).toBeNull()
  })

  it('destroy() 幂等清空 handle', () => {
    const root = document.createElement('div')
    const layer = new HideColToggleHandle(root, { onUnhide: () => {} })

    layer.update([{ atViewCol: 0, hiddenCount: 1, hiddenFieldIds: ['x'], xPx: 50 }], {
      headerHeight: 30,
    })

    expect(root.querySelectorAll('[data-handle="hide-col-toggle"]').length).toBe(1)
    layer.destroy()
    expect(root.querySelectorAll('[data-handle="hide-col-toggle"]').length).toBe(0)
    layer.destroy()
  })
})
