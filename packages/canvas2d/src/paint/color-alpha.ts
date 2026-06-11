/**
 * CSS 颜色字符串半透明判定（无 DOM 依赖的轻量解析）。
 *
 * 识别 `transparent`、`#RGBA`/`#RRGGBBAA`、`rgb()/rgba()/hsl()/hsla()` 的逗号与
 * 空格斜杠两种 alpha 语法；命名色等无法判定的格式保守返回 false（视为不透明），
 * 保持「fill 盖住网格线」的既有行为不被误改。
 */
export function isTranslucentColor(color: string): boolean {
  const c = color.trim().toLowerCase()
  if (c === 'transparent') return true

  if (c.startsWith('#')) {
    const hex = c.slice(1)
    if (hex.length === 4) return hex[3] !== 'f'
    if (hex.length === 8) return hex.slice(6) !== 'ff'
    return false
  }

  const fn = /^(?:rgba?|hsla?)\((.*)\)$/.exec(c)
  if (!fn) return false
  const body = fn[1]!
  let alphaStr: string | undefined
  if (body.includes('/')) {
    alphaStr = body.split('/')[1]?.trim()
  } else {
    const parts = body.split(',')
    if (parts.length === 4) alphaStr = parts[3]?.trim()
  }
  if (alphaStr === undefined || alphaStr.length === 0) return false
  const alpha = alphaStr.endsWith('%')
    ? Number.parseFloat(alphaStr) / 100
    : Number.parseFloat(alphaStr)
  return Number.isFinite(alpha) && alpha < 1
}
