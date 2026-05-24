import { describe, expect, it, mock } from 'bun:test'
import { RowHeightPopover } from '../../src/overlay/RowHeightPopover'

describe('RowHeightPopover', () => {
  it('open 后 input 聚焦且预填 currentHeight；Enter 提交 onSubmit(px)', () => {
    const onSubmit = mock<(px: number) => void>(() => {})
    const popover = new RowHeightPopover({ onSubmit })
    popover.open({ x: 100, y: 100, width: 40, height: 20 }, 30)

    const input = document.body.querySelector('input[type=number]') as HTMLInputElement
    expect(input).toBeTruthy()
    expect(input.value).toBe('30')
    input.value = '60'
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(onSubmit).toHaveBeenCalledWith(60)
  })

  it('Esc 不提交', () => {
    const onSubmit = mock<(px: number) => void>(() => {})
    const popover = new RowHeightPopover({ onSubmit })
    popover.open({ x: 0, y: 0, width: 40, height: 20 }, 30)
    const input = document.body.querySelector('input[type=number]') as HTMLInputElement
    input.value = '60'
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
