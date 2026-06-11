import { describe, expect, it } from 'bun:test'
import { ScrollMapper, SAFE_MAX } from '../../../src/dom/scroll/ScrollMapper'
import { expectGolden } from '../../acceptance/_helpers/golden'

describe('ScrollMapper — 滚动映射', () => {
  describe('computeSpacerSize — spacer 尺寸', () => {
    it('内容小于 SAFE_MAX 时原样返回', () => {
      const m = new ScrollMapper()
      expect(m.computeSpacerSize(1000)).toBe(1000)
      expect(m.computeSpacerSize(SAFE_MAX - 1)).toBe(SAFE_MAX - 1)
    })

    it('超大内容封顶 SAFE_MAX', () => {
      const m = new ScrollMapper()
      expect(m.computeSpacerSize(SAFE_MAX)).toBe(SAFE_MAX)
      expect(m.computeSpacerSize(SAFE_MAX * 5)).toBe(SAFE_MAX)
    })

    it('SAFE_MAX 为 6_000_000（spec §6.2）', () => {
      expect(SAFE_MAX).toBe(6_000_000)
    })
  })

  describe('scrollToLogical — DOM→逻辑', () => {
    it('内容未超 spacer 时直通（无压缩）', () => {
      // content 5000 ≤ spacer 5000; mapper acts as identity
      const m = new ScrollMapper()
      expect(m.scrollToLogical(0, 5000, 5000, 500)).toBe(0)
      expect(m.scrollToLogical(100, 5000, 5000, 500)).toBe(100)
      expect(m.scrollToLogical(4500, 5000, 5000, 500)).toBe(4500)
    })

    it('内容超 spacer 时非线性映射', () => {
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

    it('负 scrollTop 钳制为 0', () => {
      const m = new ScrollMapper()
      expect(m.scrollToLogical(-100, 6_000_000, 28_000_000, 500)).toBe(0)
    })

    it('scrollTop 超 maxScroll 钳制到 maxScroll', () => {
      const m = new ScrollMapper()
      // anything beyond maxScroll should produce maxLogical
      expect(m.scrollToLogical(99_999_999, 6_000_000, 28_000_000, 500)).toBeCloseTo(27_999_500, -1)
    })

    it('maxScroll≤0 时返回 0', () => {
      const m = new ScrollMapper()
      expect(m.scrollToLogical(0, 100, 100, 200)).toBe(0)
      expect(m.scrollToLogical(50, 100, 100, 200)).toBe(0)
    })
  })

  describe('logicalToScroll — 逻辑→DOM', () => {
    it('边界处与 scrollToLogical 互逆', () => {
      const m = new ScrollMapper()
      expect(m.logicalToScroll(0, 6_000_000, 28_000_000, 500)).toBe(0)
      expect(m.logicalToScroll(27_999_500, 6_000_000, 28_000_000, 500)).toBeCloseTo(5_999_500, -1)
    })

    it('maxLogical≤0 时返回 0', () => {
      const m = new ScrollMapper()
      expect(m.logicalToScroll(0, 6_000_000, 200, 500)).toBe(0)
      expect(m.logicalToScroll(99, 6_000_000, 200, 500)).toBe(0)
    })

    it('logicalY 越界钳制到 [0, maxLogical]', () => {
      const m = new ScrollMapper()
      expect(m.logicalToScroll(-100, 6_000_000, 28_000_000, 500)).toBe(0)
      expect(m.logicalToScroll(99_999_999, 6_000_000, 28_000_000, 500)).toBeCloseTo(5_999_500, -1)
    })

    it('往返：scrollToLogical(logicalToScroll(y))≈y', () => {
      const m = new ScrollMapper()
      const y = 14_000_000
      const s = m.logicalToScroll(y, 6_000_000, 28_000_000, 500)
      const back = m.scrollToLogical(s, 6_000_000, 28_000_000, 500)
      expect(back).toBeCloseTo(y, -1)
    })
  })

  describe('非线性映射采样表（黄金文件）', () => {
    it('identity / 超限 / 退化三档采样与黄金文件一致', () => {
      // SAFE_MAX 封顶是 locked decision（spec §6.2）：直通段、压缩段（1M 行 × 28px）、
      // 退化段的正反向映射 + 往返漂移一并锁进采样表，比例公式回归立即可见。
      const m = new ScrollMapper()
      const fmt = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(4))
      const lines: string[] = []

      const table = (title: string, content: number, viewport: number): void => {
        const spacer = m.computeSpacerSize(content)
        const maxScroll = spacer - viewport
        lines.push(`== ${title}: content=${content} spacer=${spacer} viewport=${viewport} ==`)
        const samples = [
          -100,
          0,
          1,
          28,
          100,
          Math.floor(maxScroll / 2),
          maxScroll - 1,
          maxScroll,
          maxScroll + 500,
        ]
        for (const scrollTop of samples) {
          const logical = m.scrollToLogical(scrollTop, spacer, content, viewport)
          const back = m.logicalToScroll(logical, spacer, content, viewport)
          lines.push(`scrollTop=${scrollTop} → logical=${fmt(logical)} → back=${fmt(back)}`)
        }
      }

      table('identity（content ≤ SAFE_MAX）', 100_000, 800)
      table('clamped（1M 行 × 28px = 28M）', 28_000_000, 800)
      table('degenerate（viewport ≥ content）', 500, 800)

      expectGolden(import.meta.dir, 'scroll-mapper-nonlinear-table', `${lines.join('\n')}\n`)
    })
  })
})
