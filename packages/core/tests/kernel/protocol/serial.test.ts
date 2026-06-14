import { describe, expect, it } from 'bun:test'
import { dateToSerial, serialToDate, SERIAL_EPOCH_MS } from '../../../src/kernel/protocol/serial'

describe('serial', () => {
  it('纪元锚点：1899-12-30 = 0', () => {
    expect(dateToSerial(new Date(Date.UTC(1899, 11, 30)))).toBe(0)
  })
  it('1899-12-31 = 1', () => {
    expect(dateToSerial(new Date(Date.UTC(1899, 11, 31)))).toBe(1)
  })
  it('1900-01-01 = 2（不复刻 Excel 1900 闰 bug）', () => {
    expect(dateToSerial(new Date(Date.UTC(1900, 0, 1)))).toBe(2)
  })
  it('Unix 纪元 1970-01-01 = 25569（公认常数）', () => {
    expect(dateToSerial(new Date(Date.UTC(1970, 0, 1)))).toBe(25569)
  })
  it('小数 = 日内时间：正午 = .5', () => {
    const s = dateToSerial(new Date(Date.UTC(2000, 0, 1, 12, 0, 0)))
    expect(s % 1).toBe(0.5)
  })
  it('round-trip 保真', () => {
    const d = new Date(Date.UTC(2025, 5, 9, 8, 5, 3))
    expect(serialToDate(dateToSerial(d)).getTime()).toBe(d.getTime())
  })
  it('时区中性：UTC 午夜恒为整数（本地方法会在 DST 区漂移）', () => {
    expect(Number.isInteger(dateToSerial(new Date(Date.UTC(2025, 6, 1))))).toBe(true)
    expect(Number.isInteger(dateToSerial(new Date(Date.UTC(2025, 0, 1))))).toBe(true)
  })
  it('serialToDate(0) 的 UTC 字段为 1899-12-30', () => {
    const d = serialToDate(0)
    expect(d.getUTCFullYear()).toBe(1899)
    expect(d.getUTCMonth()).toBe(11)
    expect(d.getUTCDate()).toBe(30)
  })
  it('SERIAL_EPOCH_MS 导出供消费者复用', () => {
    expect(SERIAL_EPOCH_MS).toBe(Date.UTC(1899, 11, 30))
  })
})
