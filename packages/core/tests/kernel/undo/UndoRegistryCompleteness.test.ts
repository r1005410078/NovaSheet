import { describe, expect, it } from 'bun:test'

import { UndoRegistry } from '../../../src/kernel/undo/UndoRegistry'
import { registerCellUndo } from '../../../src/features/edit/registerCellUndo'
import { registerFillUndo } from '../../../src/features/fill/registerFillUndo'
import { registerFormatUndo } from '../../../src/features/format/registerFormatUndo'
import { registerCellTypeUndo } from '../../../src/features/cell-types/registerCellTypeUndo'
import { registerRowUndo } from '../../../src/features/row/registerRowUndo'
import { registerRowStructureUndo } from '../../../src/features/row/registerRowStructureUndo'
import { registerColumnUndo } from '../../../src/features/column/registerColumnUndo'
import { registerColumnStructureUndo } from '../../../src/features/column/registerColumnStructureUndo'
import type { UndoCommand } from '../../../src/kernel/undo/UndoCommand'

// 全 22 个 kind —— 删除 engine 旧 switch / UndoReplay fallback 前的兜底：
// 若新增 kind 而未注册 handler，本测试会失败（resolve 漏网 = 运行期无声 no-op）。
const ALL_KINDS: ReadonlyArray<UndoCommand['kind']> = [
  'editCell',
  'clearRange',
  'paste',
  'fill',
  'resizeRow',
  'resizeColumn',
  'insertRows',
  'deleteRows',
  'hideRows',
  'unhideRows',
  'resizeRowsMulti',
  'moveRows',
  'insertCols',
  'deleteCols',
  'hideCols',
  'unhideCols',
  'resizeColumnsMulti',
  'moveCols',
  'format',
  'merge',
  'unmerge',
  'cellType',
]

// resolve/has 只调 handler.handles(kind)，不触 ctx —— 故用空 ctx 占位即可。
const noopCtx = {} as never

function buildFullRegistry(): UndoRegistry {
  const registry = new UndoRegistry()
  registerCellUndo(registry, noopCtx)
  registerFormatUndo(registry, noopCtx)
  registerCellTypeUndo(registry, noopCtx)
  registerRowUndo(registry, noopCtx)
  registerColumnUndo(registry, noopCtx)
  registerFillUndo(registry, noopCtx)
  registerRowStructureUndo(registry, noopCtx)
  registerColumnStructureUndo(registry, noopCtx)
  return registry
}

describe('UndoRegistry 完整性（全 22 kind 均有 handler）', () => {
  it('恰好 22 个 kind', () => {
    expect(ALL_KINDS.length).toBe(22)
    expect(new Set(ALL_KINDS).size).toBe(22)
  })

  it('每个 kind 都能 resolve 到唯一 handler', () => {
    const registry = buildFullRegistry()
    for (const kind of ALL_KINDS) {
      expect(registry.resolve(kind), `kind "${kind}" 未注册 handler`).toBeDefined()
      expect(registry.has(kind)).toBe(true)
    }
  })
})
