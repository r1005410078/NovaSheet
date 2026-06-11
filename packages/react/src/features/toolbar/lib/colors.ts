export interface ToolbarColorSwatch {
  readonly color: string
  readonly label: string
}

/** Google Docs/Sheets/Slides 标准填充色板（10 列 × 8 行）。 */
const HUE_LABELS = [
  '红莓',
  '红',
  '橙',
  '黄',
  '绿',
  '青',
  '天蓝',
  '蓝',
  '紫',
  '洋红',
] as const

const LIGHT_SHADE_LABELS = ['浅色 1', '浅色 2', '浅色 3'] as const
const DARK_SHADE_LABELS = ['深色 1', '深色 2', '深色 3'] as const

function hueRow(
  colors: readonly string[],
  shadeLabel: string,
): readonly ToolbarColorSwatch[] {
  return colors.map((color, i) => ({
    color,
    label: `${HUE_LABELS[i]!} ${shadeLabel}`,
  }))
}

/** 与 Google Workspace 标准色板 hex 对齐（kierandixon.com / SO #54936833）。 */
export const fillPaletteRows: readonly (readonly ToolbarColorSwatch[])[] = [
  [
    { color: '#000000', label: '黑色' },
    { color: '#434343', label: '深灰 4' },
    { color: '#666666', label: '深灰 3' },
    { color: '#999999', label: '深灰 2' },
    { color: '#b7b7b7', label: '深灰 1' },
    { color: '#cccccc', label: '灰色' },
    { color: '#d9d9d9', label: '浅灰 1' },
    { color: '#efefef', label: '浅灰 2' },
    { color: '#f3f3f3', label: '浅灰 3' },
    { color: '#ffffff', label: '白色' },
  ],
  hueRow(
    [
      '#980000',
      '#ff0000',
      '#ff9900',
      '#ffff00',
      '#00ff00',
      '#00ffff',
      '#4a86e8',
      '#0000ff',
      '#9900ff',
      '#ff00ff',
    ],
    '亮色',
  ),
  hueRow(
    [
      '#e6b8af',
      '#f4cccc',
      '#fce5cd',
      '#fff2cc',
      '#d9ead3',
      '#d0e0e3',
      '#c9daf8',
      '#cfe2f3',
      '#d9d2e9',
      '#ead1dc',
    ],
    LIGHT_SHADE_LABELS[0]!,
  ),
  hueRow(
    [
      '#dd7e6b',
      '#ea9999',
      '#f9cb9c',
      '#ffe599',
      '#b6d7a8',
      '#a2c4c9',
      '#a4c2f4',
      '#9fc5e8',
      '#b4a7d6',
      '#d5a6bd',
    ],
    LIGHT_SHADE_LABELS[1]!,
  ),
  hueRow(
    [
      '#cc4125',
      '#e06666',
      '#f6b26b',
      '#ffd966',
      '#93c47d',
      '#76a5af',
      '#6d9eeb',
      '#6fa8dc',
      '#8e7cc3',
      '#c27ba0',
    ],
    LIGHT_SHADE_LABELS[2]!,
  ),
  hueRow(
    [
      '#a61c00',
      '#cc0000',
      '#e69138',
      '#f1c232',
      '#6aa84f',
      '#45818e',
      '#3c78d8',
      '#3d85c6',
      '#674ea7',
      '#a64d79',
    ],
    DARK_SHADE_LABELS[0]!,
  ),
  hueRow(
    [
      '#85200c',
      '#990000',
      '#b45f06',
      '#bf9000',
      '#38761d',
      '#134f5c',
      '#1155cc',
      '#0b5394',
      '#351c75',
      '#741b47',
    ],
    DARK_SHADE_LABELS[1]!,
  ),
  hueRow(
    [
      '#5b0f00',
      '#660000',
      '#783f04',
      '#7f6000',
      '#274e13',
      '#0c343d',
      '#1c4587',
      '#073763',
      '#20124d',
      '#4c1130',
    ],
    DARK_SHADE_LABELS[2]!,
  ),
]

export const standardFillColors: readonly ToolbarColorSwatch[] = [
  { color: '#000000', label: '黑色' },
  { color: '#ffffff', label: '白色' },
  { color: '#4285f4', label: '蓝色' },
  { color: '#ea4335', label: '红色' },
  { color: '#fbbc04', label: '黄色' },
  { color: '#34a853', label: '绿色' },
  { color: '#ff6d01', label: '橙色' },
  { color: '#46bdc6', label: '青色' },
]
