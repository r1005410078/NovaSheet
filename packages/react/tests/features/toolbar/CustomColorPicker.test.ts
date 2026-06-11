import { describe, expect, it, mock } from 'bun:test'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

import { CustomColorPicker } from '../../../src/features/toolbar/components/CustomColorPicker'
import {
  clickElement,
  mountReactRoot,
  setInputValue,
  unmountReactRoot,
} from '../../helpers/dom'

async function mountPicker(initialColor = '#ff0000') {
  const onConfirm = mock((_c: string) => {})
  const onCancel = mock(() => {})
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await mountReactRoot(
    root,
    React.createElement(CustomColorPicker, { initialColor, onConfirm, onCancel }),
  )
  const q = <T extends Element>(sel: string): T => {
    const el = container.querySelector<T>(sel)
    if (!el) throw new Error(`not found: ${sel}`)
    return el
  }
  return {
    container,
    onConfirm,
    onCancel,
    hexInput: () => q<HTMLInputElement>('input[aria-label="十六进制颜色"]'),
    hueInput: () => q<HTMLInputElement>('input[aria-label="色相"]'),
    alphaInput: () => q<HTMLInputElement>('input[aria-label="透明度"]'),
    confirm: () => clickElement(q<HTMLElement>('[data-novasheet-color-picker-confirm]')),
    cancel: () => clickElement(q<HTMLElement>('[data-novasheet-color-picker-cancel]')),
    unmount: () => {
      unmountReactRoot(root)
      container.remove()
    },
  }
}

describe('CustomColorPicker', () => {
  it('初始色回填 hex 输入，确定回传规范 hex', async () => {
    const p = await mountPicker('#FF8000')
    expect(p.hexInput().value).toBe('#ff8000')
    p.confirm()
    expect(p.onConfirm).toHaveBeenCalledWith('#ff8000')
    p.unmount()
  })

  it('hex 输入合法值后确定回传该色（含 8 位 alpha）', async () => {
    const p = await mountPicker()
    setInputValue(p.hexInput(), '#00ff0080')
    p.confirm()
    expect(p.onConfirm).toHaveBeenCalledWith('#00ff0080')
    p.unmount()
  })

  it('非法 hex 标红且不改当前色', async () => {
    const p = await mountPicker('#ff0000')
    setInputValue(p.hexInput(), '#zzz')
    expect(p.hexInput().getAttribute('aria-invalid')).toBe('true')
    p.confirm()
    expect(p.onConfirm).toHaveBeenCalledWith('#ff0000')
    p.unmount()
  })

  it('alpha 滑条改变后确定回传 8 位 hex', async () => {
    const p = await mountPicker('#ff0000')
    setInputValue(p.alphaInput(), '50')
    p.confirm()
    expect(p.onConfirm).toHaveBeenCalledWith('#ff000080')
    p.unmount()
  })

  it('hue 滑条改变色相（红→绿）', async () => {
    const p = await mountPicker('#ff0000')
    setInputValue(p.hueInput(), '120')
    p.confirm()
    expect(p.onConfirm).toHaveBeenCalledWith('#00ff00')
    p.unmount()
  })

  it('SV 面板 pointer 选色（stub getBoundingClientRect）', async () => {
    // 初始灰色（s=0, v≈0.5），点 SV 面板右上角 → s=1, v=1, hue 0 → 纯红。
    // 初始色不能取 #ff0000，否则 handler 不工作断言也平凡通过。
    const p = await mountPicker('#808080')
    const sv = p.container.querySelector<HTMLElement>('[data-novasheet-color-picker-sv]')!
    sv.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
    act(() => {
      sv.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, clientX: 200, clientY: 0 }),
      )
    })
    p.confirm()
    expect(p.onConfirm).toHaveBeenCalledWith('#ff0000')
    p.unmount()
  })

  it('取消触发 onCancel 不触发 onConfirm', async () => {
    const p = await mountPicker()
    p.cancel()
    expect(p.onCancel).toHaveBeenCalledTimes(1)
    expect(p.onConfirm).not.toHaveBeenCalled()
    p.unmount()
  })
})
