/**
 * TextMeasurer——平台无关的文本度量与换行算法（M3 autofit）。
 *
 * 拆分动机：
 *   - 行高 autofit 需要在 `@novasheet/core` 里跑算法，但 core 不依赖 Canvas / DOM
 *   - 平台侧（`@novasheet/web-canvas2d` 的 Canvas2DTextMeasurer）实现 `measureWidth`，
 *     core 这边的 `wrapText` 调用 measurer 做行宽测量
 *
 * 切分规则：
 *   - 英文 / 数字 / 符号：按空格切「词 token」
 *   - CJK（中日韩）字符：每字符各成一个 token（中文在哪里换行都行）
 *   - 一个 token 比 maxWidth 还宽时退化为「字符级硬切」
 */

/**
 * 平台侧需要实现的最小度量接口。
 *
 * `measureWidth` 必须同步且无副作用（wrapText 每次决策都会调用），实现侧请做缓存。
 */
export interface TextMeasurer {
  /**
   * 在给定字体下测量一段文本的渲染宽度（CSS px）。
   *
   * @param text 待测文本（不应包含换行符；wrapText 内部会传 token 或拼接片段）
   * @param font Canvas2D 风格的 font 字符串，例如 `'12px sans-serif'`
   */
  measureWidth(text: string, font: string): number
}

/** 换行结果：一行字符串数组 + 总高度（line count × lineHeight）。 */
export interface WrappedText {
  /** 换行后的每行内容（已去掉行间空格） */
  readonly lines: readonly string[]
  /** 渲染总高度（CSS px）= lines.length × lineHeight */
  readonly height: number
}

/** wrapText 入参选项。 */
export interface WrapOptions {
  /** Canvas2D 风格 font 字符串 */
  font: string
  /** 单元格内可写区域宽度（CSS px），= cell.width − 2 × cellPaddingX */
  maxWidth: number
  /** 单行行高（CSS px）；建议取 theme.metrics.fontSize × lineHeightMultiplier（默认 1.4） */
  lineHeight: number
  /**
   * 最大行数。超过则截断最后一行尾部，加 `…`。
   * undefined 表示不限制。
   */
  maxLines?: number
}

/**
 * CJK Unified Ideographs / Hiragana / Katakana / Hangul / 常用 CJK 标点
 * 用作「字符级切分」触发的判断。
 */
function isCJK(codePoint: number): boolean {
  return (
    (codePoint >= 0x3000 && codePoint <= 0x303f) || // CJK Symbols and Punctuation
    (codePoint >= 0x3040 && codePoint <= 0x309f) || // Hiragana
    (codePoint >= 0x30a0 && codePoint <= 0x30ff) || // Katakana
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) || // CJK Unified Ideographs
    (codePoint >= 0xac00 && codePoint <= 0xd7af) || // Hangul Syllables
    (codePoint >= 0xff00 && codePoint <= 0xffef) // Halfwidth and Fullwidth Forms
  )
}

/**
 * 把文本切分为换行候选 token 数组。
 *
 * 规则：
 *   - CJK 字符：每字符独立 token
 *   - 非 CJK 的连续字符 + 跟随的空格：合并为一个 token（避免英文单词中间断）
 *
 * 例子：`'hello 中文 world'` → `['hello ', '中', '文', ' ', 'world']`
 */
export function tokenize(text: string): string[] {
  if (text.length === 0) return []
  const tokens: string[] = []
  let buffer = ''
  const isWS = (c: string) => c === ' ' || c === '\t'
  for (const char of text) {
    const code = char.codePointAt(0)!
    if (isCJK(code)) {
      if (buffer.length > 0) {
        tokens.push(buffer)
        buffer = ''
      }
      tokens.push(char)
    } else if (char === '\n') {
      if (buffer.length > 0) {
        tokens.push(buffer)
        buffer = ''
      }
      tokens.push('\n') // 硬换行 token
    } else if (isWS(char)) {
      // 空白追加到当前 buffer，等待下一个非空白字符再结算
      buffer += char
    } else {
      // 非 CJK 非空白字符。
      // 若 buffer 末尾是空白 → 上一个词 + 空格构成「词 token」，结算，开新词
      // 否则 → 词内部，继续累积
      if (buffer.length > 0 && isWS(buffer[buffer.length - 1]!)) {
        tokens.push(buffer)
        buffer = char
      } else {
        buffer += char
      }
    }
  }
  if (buffer.length > 0) tokens.push(buffer)
  return tokens
}

/**
 * 按列宽对文本做贪心换行。
 *
 * 算法：
 *   1. 切分 token
 *   2. 累加 token 到当前行，每次问 measurer 当前行宽
 *   3. 若加上下一个 token 会超出 maxWidth → 当前行收尾，开新行
 *   4. 单个 token 比 maxWidth 还宽 → 字符级硬切
 *   5. maxLines 命中 → 最后一行尾部追加 `…`
 *
 * 性能：每行至多 measureWidth 一次（增量累加），不需要每 token 都重测整行。
 * 单元格普遍 < 10 个 token，~< 0.05ms / cell。
 *
 * @example
 * ```ts
 * const measurer: TextMeasurer = { measureWidth: (t) => t.length * 7 }
 * wrapText('hello world foo bar', { font: '12px sans-serif', maxWidth: 80, lineHeight: 18 })
 * // → { lines: ['hello world ', 'foo bar'], height: 36 }
 * ```
 */
export function wrapText(text: string, options: WrapOptions, measurer: TextMeasurer): WrappedText {
  const { font, maxWidth, lineHeight, maxLines } = options
  if (text.length === 0 || maxWidth <= 0) {
    return { lines: text.length === 0 ? [] : [text], height: text.length === 0 ? 0 : lineHeight }
  }

  const tokens = tokenize(text)
  const lines: string[] = []
  let currentLine = ''
  let currentWidth = 0

  const ellipsis = '…'

  const flushLine = () => {
    lines.push(currentLine.trimEnd())
    currentLine = ''
    currentWidth = 0
  }

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!
    if (token === '\n') {
      flushLine()
      continue
    }
    const tokenWidth = measurer.measureWidth(token, font)

    if (currentWidth + tokenWidth <= maxWidth) {
      currentLine += token
      currentWidth += tokenWidth
      continue
    }

    if (currentLine.length > 0) {
      flushLine()
    }

    // token 单独成行仍超宽 → 字符级硬切
    if (tokenWidth > maxWidth) {
      for (const char of token) {
        const charWidth = measurer.measureWidth(char, font)
        if (currentWidth + charWidth > maxWidth && currentLine.length > 0) {
          flushLine()
        }
        currentLine += char
        currentWidth += charWidth
      }
    } else {
      currentLine = token
      currentWidth = tokenWidth
    }
  }
  if (currentLine.length > 0) flushLine()

  if (maxLines !== undefined && lines.length > maxLines) {
    const truncated = lines.slice(0, maxLines)
    // 末行追加 `…`，若放不下就再砍字符
    let lastLine = truncated[maxLines - 1] ?? ''
    while (lastLine.length > 0 && measurer.measureWidth(lastLine + ellipsis, font) > maxWidth) {
      lastLine = lastLine.slice(0, -1)
    }
    truncated[maxLines - 1] = `${lastLine}${ellipsis}`
    return { lines: truncated, height: maxLines * lineHeight }
  }

  return { lines, height: lines.length * lineHeight }
}
