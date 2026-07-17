import { describe, expect, it } from 'bun:test'
import { resolveSelectionBehavior } from '../../../src/kernel/interaction/SelectionBehavior'

describe('resolveSelectionBehavior', () => {
  it('缺省全部 region 为 cell、headerCorner 为 none', () => {
    const resolved = resolveSelectionBehavior()
    expect(resolved.regionIntents).toEqual({
      main: 'cell',
      middleLeft: 'cell',
      middleRight: 'cell',
      topCenter: 'cell',
      topLeft: 'cell',
      topRight: 'cell',
    })
    expect(resolved.headerCorner).toBe('none')
  })

  it('按 frozenPanes 键映射 region intent，未配置键保持 cell', () => {
    const resolved = resolveSelectionBehavior({
      frozenPanes: { left: 'row', top: 'column', topRight: 'column' },
      headerCorner: 'all',
    })
    expect(resolved.regionIntents.middleLeft).toBe('row')
    expect(resolved.regionIntents.topCenter).toBe('column')
    expect(resolved.regionIntents.topRight).toBe('column')
    expect(resolved.regionIntents.middleRight).toBe('cell')
    expect(resolved.regionIntents.topLeft).toBe('cell')
    expect(resolved.regionIntents.main).toBe('cell')
    expect(resolved.headerCorner).toBe('all')
  })
})
