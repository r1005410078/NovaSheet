import type { ReactElement } from 'react'
import {
  ClipboardPaste,
  Copy,
  Grid2x2,
  Hash,
  PaintBucket,
  Redo2,
  Scissors,
  TableColumnsSplit,
  Undo2,
  WrapText,
} from 'lucide-react'

import { TOOLBAR_ICON_CLASS } from '../lib/icon-class'
import type { ToolbarItem } from '../types'

const stroke = 1.75

const icons = {
  undo: <Undo2 aria-hidden className={TOOLBAR_ICON_CLASS} strokeWidth={stroke} />,
  redo: <Redo2 aria-hidden className={TOOLBAR_ICON_CLASS} strokeWidth={stroke} />,
  copy: <Copy aria-hidden className={TOOLBAR_ICON_CLASS} strokeWidth={stroke} />,
  cut: <Scissors aria-hidden className={TOOLBAR_ICON_CLASS} strokeWidth={stroke} />,
  paste: <ClipboardPaste aria-hidden className={TOOLBAR_ICON_CLASS} strokeWidth={stroke} />,
  borders: <Grid2x2 aria-hidden className={TOOLBAR_ICON_CLASS} strokeWidth={stroke} />,
  merge: <TableColumnsSplit aria-hidden className={TOOLBAR_ICON_CLASS} strokeWidth={stroke} />,
  wrap: <WrapText aria-hidden className={TOOLBAR_ICON_CLASS} strokeWidth={stroke} />,
  numberFormat: <Hash aria-hidden className={TOOLBAR_ICON_CLASS} strokeWidth={stroke} />,
}

/** Spreadsheet-style fill control: Lucide bucket + current swatch bar. */
export function FillColorIcon({
  fillColor,
}: {
  readonly fillColor?: string | null
}): ReactElement {
  const swatch = fillColor ?? '#fff2cc'

  return (
    <span className="inline-flex flex-col items-center gap-0.5" aria-hidden>
      <PaintBucket className="size-3.5 shrink-0 text-[#3c4043]" strokeWidth={stroke} />
      <span
        className="block h-1 w-4 rounded-[1px] ring-1 ring-slate-400/80"
        style={{ backgroundColor: swatch }}
      />
    </span>
  )
}

export const defaultToolbarItems: readonly ToolbarItem[] = [
  { id: 'menu-search', kind: 'search', label: '菜单搜索' },
  { id: 'undo', kind: 'button', label: '撤销', icon: icons.undo },
  { id: 'redo', kind: 'button', label: '重做', icon: icons.redo },
  { id: 'copy', kind: 'button', label: '复制', icon: icons.copy, separatorBefore: true },
  { id: 'cut', kind: 'button', label: '剪切', icon: icons.cut },
  { id: 'paste', kind: 'button', label: '粘贴', icon: icons.paste },
  { id: 'zoom', kind: 'select', label: '缩放', value: '100%', separatorBefore: true },
  { id: 'fill-color', kind: 'button', label: '填充颜色', separatorBefore: true },
  { id: 'borders', kind: 'button', label: '边框', icon: icons.borders },
  { id: 'merge-cells', kind: 'button', label: '合并单元格', icon: icons.merge },
  { id: 'text-wrap', kind: 'select', label: '文本换行', icon: icons.wrap, value: '溢出' },
  { id: 'value-format', kind: 'button', label: '数字格式', icon: icons.numberFormat },
]
