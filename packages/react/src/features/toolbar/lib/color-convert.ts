/**
 * 调色板用的颜色转换纯函数。HSVA 为 picker 的规范内部表示（h∈[0,360)，s/v/a∈[0,1]）。
 * 序列化规则：a=1 → `#rrggbb`，a<1 → `#rrggbbaa`（与引擎 fill 的 isTranslucentColor 兼容）。
 * 不支持命名色等形式——parseColor 返回 undefined，调用方自行回退。
 */
export interface Hsva {
  readonly h: number
  readonly s: number
  readonly v: number
  readonly a: number
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}

function hexPair(value255: number): string {
  return Math.round(Math.min(255, Math.max(0, value255)))
    .toString(16)
    .padStart(2, '0')
}

function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === rn) h = 60 * (((gn - bn) / d) % 6)
    else if (max === gn) h = 60 * ((bn - rn) / d + 2)
    else h = 60 * ((rn - gn) / d + 4)
  }
  if (h < 0) h += 360
  return { h, s: max === 0 ? 0 : d / max, v: max }
}

/** HSVA → RGB（0–255 浮点，序列化时再舍入）。 */
export function hsvaToRgb({ h, s, v }: Hsva): { r: number; g: number; b: number } {
  const c = v * s
  const hp = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let r1 = 0
  let g1 = 0
  let b1 = 0
  if (hp < 1) [r1, g1, b1] = [c, x, 0]
  else if (hp < 2) [r1, g1, b1] = [x, c, 0]
  else if (hp < 3) [r1, g1, b1] = [0, c, x]
  else if (hp < 4) [r1, g1, b1] = [0, x, c]
  else if (hp < 5) [r1, g1, b1] = [x, 0, c]
  else [r1, g1, b1] = [c, 0, x]
  const m = v - c
  return { r: (r1 + m) * 255, g: (g1 + m) * 255, b: (b1 + m) * 255 }
}

/** 解析 #RGB/#RGBA/#RRGGBB/#RRGGBBAA/rgb()/rgba()（逗号或空格斜杠语法）。失败返回 undefined。 */
export function parseColor(input: string): Hsva | undefined {
  const c = input.trim().toLowerCase()
  if (c.startsWith('#')) {
    const hex = c.slice(1)
    if (!/^[0-9a-f]+$/.test(hex)) return undefined
    let r: number
    let g: number
    let b: number
    let a = 1
    if (hex.length === 3 || hex.length === 4) {
      r = Number.parseInt(hex[0]! + hex[0]!, 16)
      g = Number.parseInt(hex[1]! + hex[1]!, 16)
      b = Number.parseInt(hex[2]! + hex[2]!, 16)
      if (hex.length === 4) a = Number.parseInt(hex[3]! + hex[3]!, 16) / 255
    } else if (hex.length === 6 || hex.length === 8) {
      r = Number.parseInt(hex.slice(0, 2), 16)
      g = Number.parseInt(hex.slice(2, 4), 16)
      b = Number.parseInt(hex.slice(4, 6), 16)
      if (hex.length === 8) a = Number.parseInt(hex.slice(6, 8), 16) / 255
    } else {
      return undefined
    }
    return { ...rgbToHsv(r, g, b), a }
  }

  const fn = /^rgba?\((.*)\)$/.exec(c)
  if (!fn) return undefined
  const body = fn[1]!
  let parts: string[]
  if (body.includes('/')) {
    const [rgbPart, alphaPart] = body.split('/') as [string, string?]
    if (alphaPart === undefined) return undefined
    parts = [...rgbPart.trim().split(/[\s,]+/), alphaPart.trim()]
  } else {
    parts = body.split(',').map((p) => p.trim())
  }
  if (parts.length !== 3 && parts.length !== 4) return undefined

  const channel = (raw: string): number =>
    raw.endsWith('%') ? (Number.parseFloat(raw) / 100) * 255 : Number.parseFloat(raw)
  const r = channel(parts[0]!)
  const g = channel(parts[1]!)
  const b = channel(parts[2]!)
  let a = 1
  if (parts.length === 4) {
    const raw = parts[3]!
    a = raw.endsWith('%') ? Number.parseFloat(raw) / 100 : Number.parseFloat(raw)
  }
  if (![r, g, b, a].every((n) => Number.isFinite(n))) return undefined
  return { ...rgbToHsv(Math.min(255, Math.max(0, r)), Math.min(255, Math.max(0, g)), Math.min(255, Math.max(0, b))), a: clamp01(a) }
}

/** HSVA → CSS hex。a=1 → 6 位，否则 8 位。 */
export function hsvaToCss(color: Hsva): string {
  const { r, g, b } = hsvaToRgb(color)
  const base = `#${hexPair(r)}${hexPair(g)}${hexPair(b)}`
  return color.a >= 1 ? base : `${base}${hexPair(color.a * 255)}`
}

/** 任意可解析颜色 → 规范 hex 形式（swatch 选中比较、去重用）。 */
export function normalizeColor(input: string): string | undefined {
  const parsed = parseColor(input)
  return parsed === undefined ? undefined : hsvaToCss(parsed)
}
