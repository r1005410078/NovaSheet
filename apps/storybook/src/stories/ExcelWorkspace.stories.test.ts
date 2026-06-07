import { describe, expect, it } from 'bun:test'

import { AutoGrowWorkspace } from './ExcelWorkspace.stories'

describe('ExcelWorkspace Storybook stories', () => {
  it('renders a sparse Excel workspace demo', () => {
    const render = AutoGrowWorkspace.render
    expect(render).toBeDefined()

    const host = render!({}, {} as never) as HTMLElement & {
      __excelWorkspaceData: { getRowCount(): number; getSchema(): { fields: readonly unknown[] } }
    }

    expect(host.querySelector('canvas')).not.toBeNull()
    expect(host.__excelWorkspaceData.getRowCount()).toBe(1_000)
    expect(host.__excelWorkspaceData.getSchema().fields).toHaveLength(26)
  })
})
