import { describe, expect, it, mock } from 'bun:test'
import type { DataSource, Row, Schema } from '@novasheet/core'
import type { WebClipboardRuntimeDeps } from '@novasheet/web'
import { ClipboardController } from '../src'
import { makeMockGridEngine } from './helpers/mock-grid-engine'

const SCHEMA: Schema = {
  fields: [
    { id: 'a', name: 'A', type: 'text', width: 100 },
    { id: 'b', name: 'B', type: 'number', width: 100 },
  ],
}

/** happy-dom 的 navigator 只读，但 navigator.clipboard 子属性可经 defineProperty 覆盖。 */
function stubClipboard(initial = ''): { store: { text: string } } {
  const store = { text: initial }
  Object.defineProperty(navigator, 'clipboard', {
    value: {
      writeText: (t: string) => {
        store.text = t
        return Promise.resolve()
      },
      readText: () => Promise.resolve(store.text),
    },
    configurable: true,
    writable: true,
  })
  return { store }
}

function mutableData(rows: Row[] = [{ a: 'hello', b: 42 }]): DataSource {
  return {
    getRowCount: () => Math.max(1, rows.length),
    getSchema: () => SCHEMA,
    getRows: () => rows,
    getCell: (r: number, f: string) => (rows[r] as Record<string, unknown> | undefined)?.[f] ?? null,
    subscribe: () => () => {},
    updateCell: () => {},
  } as unknown as DataSource
}

/** 不可变 data：无 updateCell。 */
function readonlyData(): DataSource {
  return {
    getRowCount: () => 1,
    getSchema: () => SCHEMA,
    getRows: () => [],
    getCell: () => 'x',
    subscribe: () => () => {},
  } as unknown as DataSource
}

const RANGE_2COL = { startRow: 0, endRow: 0, startCol: 0, endCol: 1 }

function makeDeps(
  data: DataSource,
  over: Partial<WebClipboardRuntimeDeps> = {},
): {
  deps: WebClipboardRuntimeDeps
  spies: { copy: ReturnType<typeof mock>; cut: ReturnType<typeof mock>; paste: ReturnType<typeof mock>; skipped: ReturnType<typeof mock> }
} {
  const spies = { copy: mock(() => {}), cut: mock(() => {}), paste: mock(() => {}), skipped: mock(() => {}) }
  const engine = makeMockGridEngine({
    data,
    selection: {
      activeCell: { rowIndex: 0, colIndex: 0 },
      anchorCell: { rowIndex: 0, colIndex: 0 },
      extentCell: { rowIndex: 0, colIndex: 0 },
      selectedRange: RANGE_2COL,
    },
  })
  engine.clearRange = mock(() => {})
  engine.commitPaste = mock(() => {})
  const deps: WebClipboardRuntimeDeps = {
    engine,
    afterEngineMutation: mock(() => {}),
    onCopy: spies.copy,
    onCut: spies.cut,
    onPaste: spies.paste,
    onPasteSkipped: spies.skipped,
    ...over,
  }
  return { deps, spies }
}

describe('ClipboardController', () => {
  it('copy 序列化选区写入剪贴板并回调 onCopy', async () => {
    const { store } = stubClipboard()
    const { deps, spies } = makeDeps(mutableData())
    expect(await new ClipboardController(deps).copy()).toBe(true)
    expect(store.text).toBe('hello\t42')
    expect(spies.copy).toHaveBeenCalled()
  })

  it('cut 写 TSV 后立即 clearRange + afterEngineMutation', async () => {
    stubClipboard()
    const { deps } = makeDeps(mutableData())
    expect(await new ClipboardController(deps).cut()).toBe(true)
    expect(deps.engine.clearRange).toHaveBeenCalledWith(RANGE_2COL)
    expect(deps.afterEngineMutation).toHaveBeenCalled()
  })

  it('无选区时 copy 返回 false', async () => {
    stubClipboard()
    const { deps } = makeDeps(mutableData())
    deps.engine.getSelection = mock(() => ({ activeCell: null, anchorCell: null, extentCell: null, selectedRange: null }))
    expect(await new ClipboardController(deps).copy()).toBe(false)
  })

  it('paste 内部缓存命中走 typed 路径（保留 number 类型）', async () => {
    stubClipboard()
    const { deps } = makeDeps(mutableData())
    const controller = new ClipboardController(deps)
    await controller.copy() // store.text = 'hello\t42'，缓存 hash 命中
    expect(await controller.paste()).toBe(true)
    const source = (deps.engine.commitPaste as ReturnType<typeof mock>).mock.calls[0]?.[0] as {
      typed: boolean
      cells: unknown[][]
    }
    expect(source.typed).toBe(true)
    expect(source.cells[0]?.[1]).toBe(42)
  })

  it('paste 外部 TSV（hash 不匹配）走 parse + coerce 路径', async () => {
    stubClipboard('external\t99')
    const { deps } = makeDeps(mutableData())
    expect(await new ClipboardController(deps).paste()).toBe(true)
    const source = (deps.engine.commitPaste as ReturnType<typeof mock>).mock.calls[0]?.[0] as {
      typed: boolean
      cells: unknown[][]
    }
    expect(source.typed).toBe(false)
    expect(source.cells[0]).toEqual(['external', 99])
  })

  it('paste 跳过的格经 onPasteSkipped 通知', async () => {
    stubClipboard('ok\tabc')
    const { deps, spies } = makeDeps(mutableData())
    ;(deps.engine.commitPaste as ReturnType<typeof mock>).mockImplementation(
      (_s: unknown, _t: unknown, _f: unknown, onSkipped?: (cells: unknown) => void) => {
        onSkipped?.([{ rowIndex: 0, fieldId: 'b', reason: 'type' }])
      },
    )
    await new ClipboardController(deps).paste()
    expect(spies.skipped).toHaveBeenCalledWith([{ rowIndex: 0, fieldId: 'b', reason: 'type' }])
  })

  it('non-Mutable DataSource：cut/paste no-op；copy 仍允许', async () => {
    stubClipboard('x\ty')
    const { deps } = makeDeps(readonlyData())
    const controller = new ClipboardController(deps)
    expect(await controller.cut()).toBe(false)
    expect(await controller.paste()).toBe(false)
    expect(await controller.copy()).toBe(true)
  })

  it('空剪贴板 paste 返回 false', async () => {
    stubClipboard('')
    const { deps } = makeDeps(mutableData())
    expect(await new ClipboardController(deps).paste()).toBe(false)
    expect(deps.engine.commitPaste).not.toHaveBeenCalled()
  })

  it('onDataReplaced 后 typed 缓存失效（同一 TSV 改走 parse 路径）', async () => {
    stubClipboard()
    const { deps } = makeDeps(mutableData())
    const controller = new ClipboardController(deps)
    await controller.copy() // 缓存 'hello\t42'
    controller.onDataReplaced() // 失效
    expect(await controller.paste()).toBe(true)
    const source = (deps.engine.commitPaste as ReturnType<typeof mock>).mock.calls[0]?.[0] as { typed: boolean }
    expect(source.typed).toBe(false) // 缓存已清 → 走 parse
  })
})
