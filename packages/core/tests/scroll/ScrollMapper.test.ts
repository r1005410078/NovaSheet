import { describe, expect, it } from 'bun:test'
import { ScrollMapper, SAFE_MAX } from '../../src/scroll/ScrollMapper'

describe('ScrollMapper', () => {
  describe('computeSpacerSize', () => {
    it('returns content size when smaller than SAFE_MAX', () => {
      const m = new ScrollMapper()
      expect(m.computeSpacerSize(1000)).toBe(1000)
      expect(m.computeSpacerSize(SAFE_MAX - 1)).toBe(SAFE_MAX - 1)
    })

    it('caps at SAFE_MAX for huge content', () => {
      const m = new ScrollMapper()
      expect(m.computeSpacerSize(SAFE_MAX)).toBe(SAFE_MAX)
      expect(m.computeSpacerSize(SAFE_MAX * 5)).toBe(SAFE_MAX)
    })

    it('SAFE_MAX is 6_000_000 (spec §6.2)', () => {
      expect(SAFE_MAX).toBe(6_000_000)
    })
  })

  describe('scrollToLogical', () => {
    it('passes through when content fits in spacer (no compression)', () => {
      // content 5000 ≤ spacer 5000; mapper acts as identity
      const m = new ScrollMapper()
      expect(m.scrollToLogical(0, 5000, 5000, 500)).toBe(0)
      expect(m.scrollToLogical(100, 5000, 5000, 500)).toBe(100)
      expect(m.scrollToLogical(4500, 5000, 5000, 500)).toBe(4500)
    })

    it('non-linearly maps when content exceeds spacer', () => {
      // content 28M, spacer 6M, vp 500
      // maxScroll = 6_000_000 - 500 = 5_999_500
      // maxLogical = 28_000_000 - 500 = 27_999_500
      // ratio ≈ 4.667
      const m = new ScrollMapper()
      expect(m.scrollToLogical(0, 6_000_000, 28_000_000, 500)).toBe(0)
      const mid = m.scrollToLogical(2_999_750, 6_000_000, 28_000_000, 500)
      expect(mid).toBeCloseTo(13_999_750, -1) // half-way maps to half of logical
      const end = m.scrollToLogical(5_999_500, 6_000_000, 28_000_000, 500)
      expect(end).toBeCloseTo(27_999_500, -1)
    })

    it('clamps negative scrollTop to 0 (iOS rubber-band, float error)', () => {
      const m = new ScrollMapper()
      expect(m.scrollToLogical(-100, 6_000_000, 28_000_000, 500)).toBe(0)
    })

    it('clamps scrollTop > maxScroll to maxScroll', () => {
      const m = new ScrollMapper()
      // anything beyond maxScroll should produce maxLogical
      expect(m.scrollToLogical(99_999_999, 6_000_000, 28_000_000, 500)).toBeCloseTo(27_999_500, -1)
    })

    it('returns 0 when maxScroll <= 0 (viewport >= spacer)', () => {
      const m = new ScrollMapper()
      expect(m.scrollToLogical(0, 100, 100, 200)).toBe(0)
      expect(m.scrollToLogical(50, 100, 100, 200)).toBe(0)
    })
  })

  describe('logicalToScroll', () => {
    it('inverts scrollToLogical at boundaries', () => {
      const m = new ScrollMapper()
      expect(m.logicalToScroll(0, 6_000_000, 28_000_000, 500)).toBe(0)
      expect(m.logicalToScroll(27_999_500, 6_000_000, 28_000_000, 500)).toBeCloseTo(5_999_500, -1)
    })

    it('returns 0 when maxLogical <= 0', () => {
      const m = new ScrollMapper()
      expect(m.logicalToScroll(0, 6_000_000, 200, 500)).toBe(0)
      expect(m.logicalToScroll(99, 6_000_000, 200, 500)).toBe(0)
    })

    it('clamps logicalY outside [0, maxLogical]', () => {
      const m = new ScrollMapper()
      expect(m.logicalToScroll(-100, 6_000_000, 28_000_000, 500)).toBe(0)
      expect(m.logicalToScroll(99_999_999, 6_000_000, 28_000_000, 500)).toBeCloseTo(5_999_500, -1)
    })

    it('round-trip: scrollToLogical(logicalToScroll(y)) ≈ y for valid y', () => {
      const m = new ScrollMapper()
      const y = 14_000_000
      const s = m.logicalToScroll(y, 6_000_000, 28_000_000, 500)
      const back = m.scrollToLogical(s, 6_000_000, 28_000_000, 500)
      expect(back).toBeCloseTo(y, -1)
    })
  })
})
