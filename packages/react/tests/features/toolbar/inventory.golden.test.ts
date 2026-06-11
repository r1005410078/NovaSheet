import { describe, it } from 'bun:test'

import { defaultToolbarItems } from '../../../src'
import { fillPaletteRows, standardFillColors } from '../../../src/features/toolbar/lib/colors'
import type { ToolbarItem } from '../../../src/features/toolbar/types'
import { expectGolden } from '../../helpers/golden'

/**
 * 纯数据清单黄金：工具栏动作面与色板 swatch。改一个动作 id/label/顺序或一个 hex
 * 都会显式 diff、过 review。纯数组 dump，不挂 DOM——避免 happy-dom 脆性。
 *
 * 更新：GOLDEN_UPDATE=1 bun test packages/react/tests/features/toolbar/inventory.golden.test.ts
 */
describe('toolbar 数据清单黄金', () => {
  it('defaultToolbarItems 动作面与黄金一致', () => {
    const line = (item: ToolbarItem): string => {
      const parts = [`${item.id} kind=${item.kind} "${item.label}"`]
      if (item.value !== undefined) parts.push(`value="${item.value}"`)
      if (item.separatorBefore) parts.push('|sepBefore')
      return parts.join(' ')
    }
    const dump = defaultToolbarItems.map(line).join('\n')
    expectGolden(import.meta.dir, 'toolbar-action-inventory', `${dump}\n`)
  })

  it('fill 色板 swatch 清单与黄金一致', () => {
    const lines: string[] = []
    fillPaletteRows.forEach((row, rowIndex) => {
      lines.push(`-- row ${rowIndex} (${row.length}) --`)
      for (const sw of row) lines.push(`${sw.color} ${sw.label}`)
    })
    lines.push(`-- standard (${standardFillColors.length}) --`)
    for (const sw of standardFillColors) lines.push(`${sw.color} ${sw.label}`)
    expectGolden(import.meta.dir, 'toolbar-fill-palette', `${lines.join('\n')}\n`)
  })
})
