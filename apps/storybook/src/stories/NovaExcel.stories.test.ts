import { describe, expect, it } from 'bun:test'

import { NovaExcelOutOfTheBox } from './NovaExcel.stories'

describe('NovaExcel Storybook stories', () => {
  it('renders NovaExcel with toolbar and sparse excel workspace', async () => {
    const render = NovaExcelOutOfTheBox.render
    expect(render).toBeDefined()

    const host = render!({}, {} as never) as HTMLElement & {
      __excelWorkspaceData: { getRowCount(): number; getSchema(): { fields: readonly unknown[] } }
    }
    await Promise.resolve()

    expect(host.querySelector('[data-novasheet-react-excel]')).not.toBeNull()
    expect(host.querySelector('[data-novasheet-react-grid]')).not.toBeNull()
    expect(host.querySelector('[role="toolbar"]')).not.toBeNull()
    expect(host.querySelector('canvas')).not.toBeNull()
    expect(host.__excelWorkspaceData.getRowCount()).toBe(1_000)
    expect(host.__excelWorkspaceData.getSchema().fields).toHaveLength(26)

    ;(host as unknown as { __reactRoot: { unmount(): void } }).__reactRoot.unmount()
  })
})
