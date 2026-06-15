import { describe, expect, it } from 'bun:test'
import { ValidationService } from '../../../src/features/validation/ValidationService'
import { ValidationRuleStore } from '../../../src/features/validation/ValidationRuleStore'
import { ValidationResultStore } from '../../../src/features/validation/ValidationResultStore'
import type { ValidatorDefinition } from '../../../src/kernel/protocol/ValidationTypes'
import type { Field } from '../../../src/kernel/data/Schema'
import { asRawRange } from '../../../src/kernel/coords/coordinates'

function makeService(overrides?: {
  getCell?: (rawRow: number, fieldId: string) => import('../../../src/kernel/data/Schema').CellValue | undefined
  getField?: (rawCol: number) => Field | undefined
  getResolvedType?: (rawRow: number, rawCol: number) => import('../../../src/kernel/data/Schema').FieldType
}) {
  const ruleStore = new ValidationRuleStore()
  const resultStore = new ValidationResultStore()
  const customValidator: ValidatorDefinition = {
    validate: async (value) => (value === 'bad' ? '不允许该值' : null),
  }
  const service = new ValidationService({
    ruleStore,
    resultStore,
    getCell: overrides?.getCell ?? ((_rawRow, _fieldId) => null),
    getField: overrides?.getField ?? ((_rawCol) => ({ id: 'f', name: 'F', type: 'text', width: 100 } satisfies Field)),
    getResolvedType: overrides?.getResolvedType ?? ((_rawRow, _rawCol) => 'text'),
    validators: { custom: customValidator },
    locale: 'en-US',
  })
  return { service, ruleStore, resultStore }
}

describe('ValidationService', () => {
  it('validates ok cell: result deleted (null)', async () => {
    const { service, resultStore } = makeService({ getCell: () => 'good' })
    await service.validateCell(0, 0)
    expect(resultStore.get(0, 0)).toBeNull()
  })

  it('Layer A: type mismatch sets invalid', async () => {
    const { service, resultStore } = makeService({
      getCell: () => 'text-value',
      getResolvedType: () => 'number',
    })
    await service.validateCell(0, 0)
    const state = resultStore.get(0, 0)
    expect(state?.status).toBe('invalid')
    expect(state?.status === 'invalid' ? state.message : '').toContain('数字')
  })

  it('Layer A short-circuits: rule not run when type fails', async () => {
    const { service, ruleStore, resultStore } = makeService({
      getCell: () => 'text',
      getResolvedType: () => 'number',
    })
    ruleStore.setRange(asRawRange({ startRow: 0, endRow: 0, startCol: 0, endCol: 0 }), { type: 'number-range' })
    await service.validateCell(0, 0)
    // State is type error, not number-range error
    expect(resultStore.get(0, 0)?.status).toBe('invalid')
  })

  it('custom validator: error sets invalid', async () => {
    const { service, ruleStore, resultStore } = makeService({ getCell: () => 'bad' })
    ruleStore.setRange(asRawRange({ startRow: 0, endRow: 0, startCol: 0, endCol: 0 }), { type: 'custom' })
    await service.validateCell(0, 0)
    const state1 = resultStore.get(0, 0)
    expect(state1?.status).toBe('invalid')
    expect(state1?.status === 'invalid' ? state1.message : '').toBe('不允许该值')
  })

  it('rule.message overrides validator message', async () => {
    const { service, ruleStore, resultStore } = makeService({ getCell: () => 'bad' })
    ruleStore.setRange(asRawRange({ startRow: 0, endRow: 0, startCol: 0, endCol: 0 }), { type: 'custom', message: '自定义错误' })
    await service.validateCell(0, 0)
    const state2 = resultStore.get(0, 0)
    expect(state2?.status === 'invalid' ? state2.message : '').toBe('自定义错误')
  })

  it('no rule + type ok: result is null (ok)', async () => {
    const { service, resultStore } = makeService({ getCell: () => 'hello' })
    await service.validateCell(0, 0)
    expect(resultStore.get(0, 0)).toBeNull()
  })
})
