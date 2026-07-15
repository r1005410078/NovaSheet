import { describe, expect, it } from 'bun:test'

import { renderStoryHost, unmountReactRoot } from '../react-test-helpers'
import { CustomRowHeader, NovaExcelOutOfTheBox } from './NovaExcel.stories'

describe('NovaExcel Storybook stories', () => {
  it('renders NovaExcel with toolbar and sparse excel workspace', async () => {
    const render = NovaExcelOutOfTheBox.render
    expect(render).toBeDefined()

    const host = (await renderStoryHost(
      () => render!({}, {} as never) as HTMLElement,
    )) as HTMLElement & {
      __excelWorkspaceData: { getRowCount(): number; getSchema(): { fields: readonly unknown[] } }
    }

    expect(host.querySelector('[data-novasheet-react-excel]')).not.toBeNull()
    expect(host.querySelector('[data-novasheet-react-grid]')).not.toBeNull()
    expect(host.querySelector('[role="toolbar"]')).not.toBeNull()
    expect(host.querySelector('canvas')).not.toBeNull()
    expect(host.__excelWorkspaceData.getRowCount()).toBe(1_000)
    expect(host.__excelWorkspaceData.getSchema().fields).toHaveLength(26)

    unmountReactRoot((host as unknown as { __reactRoot: { unmount(): void } }).__reactRoot)
  })

  it('renders NovaExcel with device codes as custom row headers', async () => {
    const render = CustomRowHeader.render
    expect(render).toBeDefined()

    const host = (await renderStoryHost(
      () => render!({}, {} as never) as HTMLElement,
    )) as HTMLElement & {
      __customRowHeaderData: {
        getCell(rowIndex: number, fieldId: string): unknown
        getSchema(): { fields: readonly { id: string }[] }
      }
    }

    expect(host.querySelector('[data-novasheet-react-excel]')).not.toBeNull()
    expect(host.querySelector('[data-novasheet-react-grid]')).not.toBeNull()
    expect(host.querySelector('canvas')).not.toBeNull()
    expect(host.__customRowHeaderData.getCell(0, 'deviceCode')).toBe('设备-001')
    expect(host.__customRowHeaderData.getSchema().fields.map((field) => field.id)).toEqual([
      'name',
      'status',
    ])

    unmountReactRoot((host as unknown as { __reactRoot: { unmount(): void } }).__reactRoot)
  })
})
