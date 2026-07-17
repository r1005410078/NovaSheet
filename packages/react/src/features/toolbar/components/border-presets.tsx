import type { BorderPreset } from '@zhiguang/novasheet-core'
import type { ReactElement } from 'react'

import { cn } from '@/lib/utils'

type EdgeFlags = {
  readonly top?: boolean
  readonly bottom?: boolean
  readonly left?: boolean
  readonly right?: boolean
  readonly innerH?: boolean
  readonly innerV?: boolean
}

const PRESET_EDGES: Record<BorderPreset, EdgeFlags> = {
  all: { top: true, bottom: true, left: true, right: true, innerH: true, innerV: true },
  inner: { innerH: true, innerV: true },
  innerHorizontal: { innerH: true },
  innerVertical: { innerV: true },
  clear: {},
  left: { left: true },
  top: { top: true },
  right: { right: true },
  bottom: { bottom: true },
  outer: { top: true, bottom: true, left: true, right: true },
}

type BorderPresetEntry = {
  readonly preset: BorderPreset
  readonly label: string
}

export const BORDER_PRESET_ROWS: readonly BorderPresetEntry[][] = [
  [
    { preset: 'all', label: '全部边框' },
    { preset: 'inner', label: '内部边框' },
    { preset: 'innerHorizontal', label: '内部水平边框' },
    { preset: 'innerVertical', label: '内部垂直边框' },
    { preset: 'clear', label: '无边框' },
  ],
  [
    { preset: 'left', label: '左边框' },
    { preset: 'top', label: '上边框' },
    { preset: 'right', label: '右边框' },
    { preset: 'bottom', label: '下边框' },
    { preset: 'outer', label: '外边框' },
  ],
]

const GRID = {
  min: 3,
  max: 17,
  mid: 10,
} as const

function segment(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  active: boolean,
  key: string,
): ReactElement {
  return (
    <line
      key={key}
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke={active ? '#1f2937' : '#cbd5e1'}
      strokeWidth={active ? 1.6 : 1}
      strokeDasharray={active ? undefined : '1.5 1.5'}
      strokeLinecap="square"
    />
  )
}

export function BorderPresetGlyph({
  preset,
  className,
}: {
  readonly preset: BorderPreset
  readonly className?: string
}): ReactElement {
  const edges = PRESET_EDGES[preset]
  const { min, max, mid } = GRID

  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden
      className={cn('size-5 shrink-0', className)}
      fill="none"
    >
      {segment(min, min, max, min, Boolean(edges.top), 'top')}
      {segment(min, max, max, max, Boolean(edges.bottom), 'bottom')}
      {segment(min, min, min, max, Boolean(edges.left), 'left')}
      {segment(max, min, max, max, Boolean(edges.right), 'right')}
      {segment(min, mid, max, mid, Boolean(edges.innerH), 'inner-h')}
      {segment(mid, min, mid, max, Boolean(edges.innerV), 'inner-v')}
    </svg>
  )
}
