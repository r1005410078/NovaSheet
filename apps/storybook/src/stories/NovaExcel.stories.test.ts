import { describe, expect, it } from 'bun:test'

import { NovaExcelOutOfTheBox } from './NovaExcel.stories'

describe('NovaExcel Storybook stories', () => {
  it('renders NovaExcel with toolbar and grid', async () => {
    const render = NovaExcelOutOfTheBox.render
    expect(render).toBeDefined()

    const host = render!({}, {} as never) as HTMLElement
    await Promise.resolve()

    expect(host.querySelector('[data-novasheet-react-excel]')).not.toBeNull()
    expect(host.querySelector('[data-novasheet-react-grid]')).not.toBeNull()
    expect(host.querySelector('[role="toolbar"]')).not.toBeNull()
    expect(host.querySelector('canvas')).not.toBeNull()

    ;(host as unknown as { __reactRoot: { unmount(): void } }).__reactRoot.unmount()
  })
})
