import type { Canvas2DCellRenderer } from '@zhiguang/novasheet-canvas2d'
import { paintStyledText } from '@zhiguang/novasheet-canvas2d'
import { splitIntoSegments, type CellTextDefault } from './segments'
import type { RichTextValue } from './types'

/**
 * rich-text renderer（注册到内置 'text'）：读 'richText' 附件切多段 → paintStyledText。
 * runs 仅在显示串 === raw String(value) 时生效（spec §9：valueFormat 转换时不挂 runs）。
 * 未注册附件 / 无 runs / 已格式化 → 单段，等同内置纯文本。
 */
export const richTextRenderer: Canvas2DCellRenderer = {
  paint(ctx, params) {
    const { value, rect, field, theme, rowIndex, colIndex, getAttachment, formatCell, textWrap, measurer } = params
    const raw = value == null ? '' : String(value)

    const display =
      rowIndex != null && colIndex != null && formatCell
        ? formatCell(rowIndex, colIndex, field, value as never)
        : undefined
    const text = display ?? raw

    const runs =
      rowIndex != null && colIndex != null && getAttachment
        ? getAttachment<RichTextValue>('richText', rowIndex, colIndex)
        : undefined

    const def: CellTextDefault = {
      fontSize: theme.metrics.fontSize,
      fontFamily: theme.metrics.fontFamily,
      color: theme.colors.text,
    }

    // runs 仅在显示 = raw string（无 valueFormat 转换）时生效。
    const applyRuns = !!runs && runs.length > 0 && (display === undefined || display === raw)
    const segments = applyRuns ? splitIntoSegments(text, runs, def) : splitIntoSegments(text, [], def)

    // custom renderer 无法静态枚举 BuiltInFieldType，故以宽 string key 动态查 textAlignByType；
    // 自定义 type 未命中时 fallback 'text'，对齐内置 CellPainter 的 default case 语义。
    const align =
      (theme.cell.textAlignByType as Readonly<Record<string, CanvasTextAlign>>)[field.type] ??
      theme.cell.textAlignByType['text']
    paintStyledText(ctx, segments, {
      rect,
      padX: theme.metrics.cellPaddingX,
      padY: theme.metrics.cellPaddingY,
      align,
      wrap: textWrap ?? 'overflow',
      lineHeightMultiplier: theme.text.lineHeightMultiplier,
      themeText: theme.text,
      measurer,
    })
  },
}
