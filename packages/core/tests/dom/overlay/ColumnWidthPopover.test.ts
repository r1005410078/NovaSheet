import { describe, expect, it, mock } from 'bun:test'
import { ColumnWidthPopover } from '../../../src/dom/overlay/ColumnWidthPopover'

describe('ColumnWidthPopover', () => {
  it('open 后 input 聚焦且预填 currentWidth；Enter 提交 onSubmit(px)', () => {
    const onSubmit = mock<(px: number) => void>(() => {})
    const popover = new ColumnWidthPopover({ onSubmit })
    popover.open({ x: 100, y: 100, width: 40, height: 20 }, 120)

    const input = document.body.querySelector('input[type=number]') as HTMLInputElement
    expect(input).toBeTruthy()
    expect(input.value).toBe('120')
    input.value = '200'
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(onSubmit).toHaveBeenCalledWith(200)
  })

  it('Esc 不提交', () => {
    const onSubmit = mock<(px: number) => void>(() => {})
    const popover = new ColumnWidthPopover({ onSubmit })
    popover.open({ x: 0, y: 0, width: 40, height: 20 }, 120)
    const input = document.body.querySelector('input[type=number]') as HTMLInputElement
    input.value = '200'
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('destroy() 关闭弹层；重复 destroy 幂等', () => {
    const popover = new ColumnWidthPopover({ onSubmit: () => {} })
    popover.open({ x: 0, y: 0, width: 0, height: 0 }, 120)
    expect(document.body.querySelector('[role=dialog]')).toBeTruthy()
    popover.destroy()
    expect(document.body.querySelector('[role=dialog]')).toBeNull()
    popover.destroy()
  })
})
