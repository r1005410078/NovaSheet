import { describe, expect, it } from 'bun:test'
import { resolveShouldPaintColumnLetters } from '../../src/render/column-letters-policy'

describe('resolveShouldPaintColumnLetters', () => {
  it('excel 关闭时不画列标', () => {
    expect(
      resolveShouldPaintColumnLetters(false, undefined, [
        { id: 'leaf-0', name: '', type: 'text', width: 90 },
      ]),
    ).toBe(false)
  })

  it('有 columnGroups 时不画列标（叶头用字段名）', () => {
    expect(
      resolveShouldPaintColumnLetters(
        true,
        {
          depth: 1,
          rows: [],
          leafTopRowByViewCol: [1],
        },
        [{ id: 'leaf-0', name: '簇1', type: 'text', width: 90 }],
      ),
    ).toBe(false)
  })

  it('扁平列且 field.name 有值时不画列标（一层头显示 name）', () => {
    expect(
      resolveShouldPaintColumnLetters(true, undefined, [
        { id: 'leaf-0', name: '液冷A1', type: 'text', width: 90 },
        { id: 'leaf-1', name: '液冷A2', type: 'text', width: 90 },
      ]),
    ).toBe(false)
  })

  it('扁平列且字段均无名时画 A/B 列标', () => {
    expect(
      resolveShouldPaintColumnLetters(true, undefined, [
        { id: 'leaf-0', name: '', type: 'text', width: 90 },
        { id: 'leaf-1', name: '', type: 'text', width: 90 },
      ]),
    ).toBe(true)
  })
})
