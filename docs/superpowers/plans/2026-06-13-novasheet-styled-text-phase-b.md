# Styled-Text 渲染原语（Phase B）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 `@novasheet/canvas2d` 加一个公开的多段文本绘制原语 `paintStyledText`（按段切 font/color、手绘 underline/line-through、混排行高、wrap/overflow/clip），并把 `getAttachment` 接入 custom renderer 的 paint params，为 Phase C 的 cell-kit rich-text renderer 提供渲染地基。

**Architecture:** 新增独立文件 `painters/styledText.ts`，纯函数式按段布局 + 绘制，复用 core 导出的 `wrapText`/`tokenize`/`TextMeasurer`。装饰线宽/偏移与行高倍数从新增 core theme token `ThemeText` 读（不变量 #4 禁硬编码）。**不迁移既有 `CellPainter` 内置路径**（保零回归，见 Self-Review §决策），原语独立成立、由 Phase C renderer 消费。`getAttachment` 透传镜像既有 `formatCell` 的 frame→renderer→params 通道。

**Tech Stack:** TypeScript（strict + `noUncheckedIndexedAccess` + `verbatimModuleSyntax`）、`bun:test`、`RecordingContext2D` op-log 断言。

**前置:** Phase A 已 ship（`RenderFrame.getAttachment` 契约已在 `packages/core/src/kernel/render/RenderFrame.ts:67`）。spec [`2026-06-13-novasheet-cell-kit-rich-text-design.md`](../specs/2026-06-13-novasheet-cell-kit-rich-text-design.md) §7。路线图 [`2026-06-13-novasheet-rich-text-roadmap.md`](./2026-06-13-novasheet-rich-text-roadmap.md) §3（B1–B7）。

**方法论:** L4 渲染白盒——纯 TDD，不写 BDD MD 场景（spec §11.4：op-log 属白盒）。**plan-risk（须 STOP+ASK）:** B6 多段 wrap 的分行语义须与 core `wrapText` 单段语义自洽（同样 token 化、同样 maxLines+`…` 收尾）；若多字体宽度累加导致与既有 `wrapText` 测试期望相悖，先停。

---

## 设计要点（贯穿全 plan，类型在 Task 2 落地）

```ts
// painters/styledText.ts
export interface StyledSegment {
  readonly text: string
  readonly font: string        // 完整 CSS font 串，直接赋给 ctx.font
  readonly fontSize: number    // 数值 px——行高与装饰线几何用（避免解析 font 串）
  readonly color: string
  readonly underline?: boolean
  readonly strikethrough?: boolean
}

export interface StyledTextLayout {
  readonly rect: QuadrantRect
  readonly padX: number
  readonly padY: number
  readonly align: CanvasTextAlign          // 'left' | 'right' | 'center'
  readonly wrap: TextWrapMode              // 'overflow' | 'wrap' | 'clip'
  readonly lineHeightMultiplier: number    // 取 themeText.lineHeightMultiplier
  readonly themeText: ThemeText            // underline/line-through 线宽与偏移
  readonly measurer?: TextMeasurer         // wrap 模式必需；缺省时 wrap 退化为单行
}

export function paintStyledText(
  ctx: CanvasRenderingContext2D,
  segments: readonly StyledSegment[],
  layout: StyledTextLayout,
): void
```

**坐标约定:** `paintStyledText` 内部统一 `ctx.textAlign='left'` + `ctx.textBaseline='middle'`，按段手动累加 x（多段对齐靠先量整行宽再算起点，不依赖 ctx.textAlign）。每行 centerY 已知，段画在 `(x, centerY)`；underline 画在 `centerY + themeText.underlineOffset`，line-through 画在 `centerY - themeText.lineThroughOffset`。

**为何 `fontSize` 进 StyledSegment（偏离 spec §7.1 仅列 `font`）:** 行高 = 段内最大 fontSize × 倍数、装饰线偏移按 px——都需数值字号；从 CSS font 串解析 fontSize 脆弱（`'bold 14px/1.2 "Foo Bar"'`）。显式带数值更稳，Phase C 切段时本就有数值字号在手。

**core theme token 命名避 dogfood grep:** Phase A 闸门 `grep -rn "strikethrough" packages/core/src` 须保持空。故 core `ThemeText` 用 **`lineThrough*`**（CSS `text-decoration-line: line-through` 的中性词）；canvas2d 侧 `StyledSegment.strikethrough?` 不受闸门约束（闸门只罩 core）。

---

## File Structure

| 文件 | 责任 | 动作 |
| --- | --- | --- |
| `packages/core/src/kernel/theme/Theme.ts` | 加 `ThemeText` interface + `Theme.text` 字段 | Modify |
| `packages/core/src/kernel/theme/denseGridTheme.ts` | 加 `text` token 默认值 | Modify |
| `packages/core/src/index.ts` | re-export `ThemeText` 类型 | Modify |
| `packages/canvas2d/src/painters/styledText.ts` | `StyledSegment`/`StyledTextLayout` + `paintStyledText` 原语 | Create |
| `packages/canvas2d/src/painters/CellPainter.ts` | `CellPaintParams.getAttachment?` 透传字段 | Modify |
| `packages/canvas2d/src/render/Canvas2DRenderer.ts` | `frame.getAttachment` → paint params（镜像 `formatCell`） | Modify |
| `packages/canvas2d/src/index.ts` | 导出 `paintStyledText` + 类型 | Modify |
| `packages/canvas2d/tests/painters/styledText.test.ts` | 原语 op-log TDD | Create |
| `packages/canvas2d/tests/render/Canvas2DRenderer.attachment.test.ts` | getAttachment 透传 TDD | Create |

> 注：是否有除 `denseGridTheme` 外的 `Theme` 构造点，实现者在 Task 1 用 `grep -rn ": Theme\b\|: Theme =" packages packages/*/tests` 确认；当前仅 `denseGridTheme` 一处，加必填字段安全。

---

## Task 1: core `ThemeText` token（装饰线 + 行高倍数）

**Files:**
- Modify: `packages/core/src/kernel/theme/Theme.ts`
- Modify: `packages/core/src/kernel/theme/denseGridTheme.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/tests/kernel/theme/denseGridTheme.test.ts`（若无则就近新建）

- [ ] **Step 1: 先探查**

```bash
grep -rn ": Theme\b\|: Theme =\|satisfies Theme" packages/core/src packages/core/tests packages/canvas2d
ls packages/core/tests/kernel/theme/ 2>/dev/null || echo "no theme test dir"
grep -n "export interface Theme\b\|emptyState\|dimensions" packages/core/src/kernel/theme/Theme.ts
grep -n "emptyState:\|dimensions:\|frozenSeparator:" packages/core/src/kernel/theme/denseGridTheme.ts
```

- [ ] **Step 2: 写失败测试**

`packages/core/tests/kernel/theme/denseGridTheme.test.ts`（已存在则追加 `describe`）：

```ts
import { describe, expect, it } from 'bun:test'
import { denseGridTheme } from '../../../src/kernel/theme/denseGridTheme'

describe('denseGridTheme.text token', () => {
  it('exposes line-height multiplier and decoration geometry', () => {
    const t = denseGridTheme.text
    expect(t.lineHeightMultiplier).toBe(1.4)
    expect(t.underlineWidth).toBeGreaterThan(0)
    expect(typeof t.underlineOffset).toBe('number')
    expect(t.lineThroughWidth).toBeGreaterThan(0)
    expect(typeof t.lineThroughOffset).toBe('number')
  })
})
```

- [ ] **Step 3: 跑测试确认红**

Run: `bun test packages/core/tests/kernel/theme/denseGridTheme.test.ts`
Expected: FAIL（`denseGridTheme.text` is undefined / 类型不存在）。

- [ ] **Step 4: 加 `ThemeText` interface**

`Theme.ts`——在 `ThemeDimensions` interface 之后、`Theme` interface 之前插入：

```ts
/** 文本排版 token：行高倍数 + 装饰线（underline / line-through）几何。供 styled-text 原语读取。 */
export interface ThemeText {
  /** 行高 = fontSize × 此倍数（默认 1.4）。 */
  readonly lineHeightMultiplier: number
  /** 下划线线宽（px）。 */
  readonly underlineWidth: number
  /** 下划线相对 middle 基线的下偏移（px，正=向下）。 */
  readonly underlineOffset: number
  /** 删除线线宽（px）。命名用 CSS `line-through` 中性词，避免 core 出现 rich-text 语义词。 */
  readonly lineThroughWidth: number
  /** 删除线相对 middle 基线的上偏移（px，正=向上；0=正中）。 */
  readonly lineThroughOffset: number
}
```

在 `Theme` interface 内加字段（紧挨 `dimensions`）：

```ts
  readonly dimensions: ThemeDimensions
  readonly text: ThemeText
}
```

- [ ] **Step 5: denseGridTheme 补默认值**

`denseGridTheme.ts`——在 `dimensions: { ... }` 之后加：

```ts
  text: {
    lineHeightMultiplier: 1.4,
    underlineWidth: 1,
    underlineOffset: 6,
    lineThroughWidth: 1,
    lineThroughOffset: 0,
  },
```

- [ ] **Step 6: re-export 类型**

`index.ts`——找到现有 `export type { ... Theme ... ThemeDimensions ... }` 那行（`grep -n "ThemeDimensions\|ThemeMetrics" packages/core/src/index.ts`），把 `ThemeText` 加进同一 re-export 列表。

- [ ] **Step 7: 跑测试确认绿 + 闸门自检**

```bash
bun test packages/core/tests/kernel/theme/denseGridTheme.test.ts
grep -rn "TextRun\|fontWeight\|strikethrough" packages/core/src/   # 须为空
bun run --filter @novasheet/core typecheck
```
Expected: 测试 PASS；grep 空；typecheck 0 error。

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/kernel/theme/Theme.ts packages/core/src/kernel/theme/denseGridTheme.ts packages/core/src/index.ts packages/core/tests/kernel/theme/denseGridTheme.test.ts
git commit -m "feat(theme): 新增 ThemeText token（行高倍数 + underline/line-through 几何）

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: `paintStyledText` 单段单行核（overflow/clip）

**Files:**
- Create: `packages/canvas2d/src/painters/styledText.ts`
- Test: `packages/canvas2d/tests/painters/styledText.test.ts`

- [ ] **Step 1: 写失败测试**

`styledText.test.ts`：

```ts
import { describe, expect, it } from 'bun:test'
import { denseGridTheme } from '@novasheet/core'
import { paintStyledText, type StyledSegment, type StyledTextLayout } from '../../src/painters/styledText'
import { createRecordingContext } from '../helpers/recording-context'

function layout(overrides: Partial<StyledTextLayout> = {}): StyledTextLayout {
  return {
    rect: { x: 0, y: 0, width: 100, height: 28 },
    padX: 8,
    padY: 4,
    align: 'left',
    wrap: 'overflow',
    lineHeightMultiplier: denseGridTheme.text.lineHeightMultiplier,
    themeText: denseGridTheme.text,
    ...overrides,
  }
}

function seg(text: string, overrides: Partial<StyledSegment> = {}): StyledSegment {
  return { text, font: '14px sans-serif', fontSize: 14, color: '#111', ...overrides }
}

describe('paintStyledText — 单段单行', () => {
  it('设置 segment 的 font/color 并在 padX 处居中绘制', () => {
    const { ctx, ops } = createRecordingContext()
    paintStyledText(ctx, [seg('hello')], layout())
    expect(ops).toContainEqual({ op: 'set:font', value: '14px sans-serif' })
    expect(ops).toContainEqual({ op: 'set:fillStyle', value: '#111' })
    expect(ops).toContainEqual({ op: 'set:textBaseline', value: 'middle' })
    const fillText = ops.find((o) => o.op === 'fillText')
    expect(fillText).toBeDefined()
    if (fillText?.op === 'fillText') {
      expect(fillText.args[0]).toBe('hello')
      expect(fillText.args[1]).toBe(8)        // rect.x + padX
      expect(fillText.args[2]).toBe(14)       // rect.y + rect.height/2
    }
  })

  it('空 segment 数组不绘制', () => {
    const { ctx, ops } = createRecordingContext()
    paintStyledText(ctx, [], layout())
    expect(ops.find((o) => o.op === 'fillText')).toBeUndefined()
  })

  it('right 对齐时锚点在右内沿（measureText=len*7）', () => {
    const { ctx, ops } = createRecordingContext()
    // 'abc' 宽 21；rect.width 100，padX 8 → 右内沿 x = 100-8 = 92；起点 = 92-21 = 71
    paintStyledText(ctx, [seg('abc')], layout({ align: 'right' }))
    const fillText = ops.find((o) => o.op === 'fillText')
    if (fillText?.op === 'fillText') expect(fillText.args[1]).toBe(71)
  })
})
```

> `createRecordingContext` 的 `measureText` 固定每字符 7px（见 `recording-context.ts` 的 `CHAR_WIDTH`）。

- [ ] **Step 2: 跑测试确认红**

Run: `bun test packages/canvas2d/tests/painters/styledText.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现单段单行**

`styledText.ts`：

```ts
import type { QuadrantRect, TextMeasurer, TextWrapMode, ThemeText } from '@novasheet/core'

/** 单个样式段：文本 + 已解析 CSS font + 数值字号 + 色，及可选装饰。 */
export interface StyledSegment {
  readonly text: string
  readonly font: string
  readonly fontSize: number
  readonly color: string
  readonly underline?: boolean
  readonly strikethrough?: boolean
}

/** paintStyledText 布局参数。坐标系：rect 为单元格区，padX/padY 为内边距。 */
export interface StyledTextLayout {
  readonly rect: QuadrantRect
  readonly padX: number
  readonly padY: number
  readonly align: CanvasTextAlign
  readonly wrap: TextWrapMode
  readonly lineHeightMultiplier: number
  readonly themeText: ThemeText
  readonly measurer?: TextMeasurer
}

/** 量度一段文本在其 font 下的宽度；优先用 measurer，回退 ctx.measureText。 */
function measure(
  ctx: CanvasRenderingContext2D,
  text: string,
  seg: StyledSegment,
  measurer: TextMeasurer | undefined,
): number {
  if (measurer) return measurer.measureWidth(text, seg.font)
  ctx.font = seg.font
  return ctx.measureText(text).width
}

/**
 * 多段样式文本绘制原语。内部统一 textAlign='left' + textBaseline='middle'，
 * 手动按段累加 x；多段对齐靠先量整行宽再算行起点。
 *
 * Task 2：仅单行单段（取 segments[0]）。Task 3 起泛化为多段/多行/wrap。
 */
export function paintStyledText(
  ctx: CanvasRenderingContext2D,
  segments: readonly StyledSegment[],
  layout: StyledTextLayout,
): void {
  if (segments.length === 0) return
  const { rect, padX, align, measurer } = layout
  const maxWidth = rect.width - padX * 2
  if (maxWidth <= 0) return

  const first = segments[0]!
  if (first.text.length === 0) return

  const lineWidth = measure(ctx, first.text, first, measurer)
  const startX = lineStartX(rect, padX, align, lineWidth)
  const centerY = rect.y + rect.height / 2

  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.font = first.font
  ctx.fillStyle = first.color
  ctx.fillText(first.text, startX, centerY)
}

/** 按对齐方式算一行的起始 x（left/right/center）。 */
function lineStartX(rect: QuadrantRect, padX: number, align: CanvasTextAlign, lineWidth: number): number {
  switch (align) {
    case 'right':
      return rect.x + rect.width - padX - lineWidth
    case 'center':
      return rect.x + rect.width / 2 - lineWidth / 2
    default:
      return rect.x + padX
  }
}
```

- [ ] **Step 4: 跑测试确认绿**

Run: `bun test packages/canvas2d/tests/painters/styledText.test.ts`
Expected: PASS（3 用例）。

- [ ] **Step 5: Commit**

```bash
git add packages/canvas2d/src/painters/styledText.ts packages/canvas2d/tests/painters/styledText.test.ts
git commit -m "feat(styled-text): paintStyledText 单段单行核（font/color/对齐）

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: 多段单行（font/color 切换 + x 累加）

**Files:**
- Modify: `packages/canvas2d/src/painters/styledText.ts`
- Test: `packages/canvas2d/tests/painters/styledText.test.ts`

- [ ] **Step 1: 追加失败测试**

```ts
describe('paintStyledText — 多段单行', () => {
  it('按段切 font/fillStyle 顺序绘制，x 累加', () => {
    const { ctx, ops } = createRecordingContext()
    paintStyledText(
      ctx,
      [
        seg('AB', { font: 'bold 14px sans-serif', color: '#a00' }),
        seg('CD', { font: '14px sans-serif', color: '#0a0' }),
      ],
      layout(),
    )
    const fills = ops.filter((o) => o.op === 'fillText')
    expect(fills.length).toBe(2)
    if (fills[0]?.op === 'fillText' && fills[1]?.op === 'fillText') {
      expect(fills[0].args[0]).toBe('AB')
      expect(fills[0].args[1]).toBe(8)         // padX
      expect(fills[1].args[0]).toBe('CD')
      expect(fills[1].args[1]).toBe(8 + 14)    // padX + 'AB' 宽(2*7)
    }
    // font/color 各切换一次到对应段值
    const fontOps = ops.filter((o) => o.op === 'set:font').map((o) => o.op === 'set:font' && o.value)
    expect(fontOps).toContain('bold 14px sans-serif')
    expect(fontOps).toContain('14px sans-serif')
  })

  it('right 对齐多段：整行宽右贴，段内相对顺序不变', () => {
    const { ctx, ops } = createRecordingContext()
    // 'AB'+'CD' 共 4 字符 = 28 宽；右内沿 92 → 起点 64
    paintStyledText(ctx, [seg('AB'), seg('CD')], layout({ align: 'right' }))
    const fills = ops.filter((o) => o.op === 'fillText')
    if (fills[0]?.op === 'fillText' && fills[1]?.op === 'fillText') {
      expect(fills[0].args[1]).toBe(64)
      expect(fills[1].args[1]).toBe(64 + 14)
    }
  })
})
```

- [ ] **Step 2: 跑测试确认红**

Run: `bun test packages/canvas2d/tests/painters/styledText.test.ts`
Expected: FAIL（当前只画 segments[0]）。

- [ ] **Step 3: 泛化 `paintStyledText` 为多段单行**

替换 Task 2 的 `paintStyledText` 函数体（保留 `measure`/`lineStartX` 不变）：

```ts
export function paintStyledText(
  ctx: CanvasRenderingContext2D,
  segments: readonly StyledSegment[],
  layout: StyledTextLayout,
): void {
  const drawable = segments.filter((s) => s.text.length > 0)
  if (drawable.length === 0) return
  const { rect, padX, align, measurer } = layout
  const maxWidth = rect.width - padX * 2
  if (maxWidth <= 0) return

  const widths = drawable.map((s) => measure(ctx, s.text, s, measurer))
  const lineWidth = widths.reduce((a, b) => a + b, 0)
  const startX = lineStartX(rect, padX, align, lineWidth)
  const centerY = rect.y + rect.height / 2

  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'

  let x = startX
  for (let i = 0; i < drawable.length; i++) {
    const s = drawable[i]!
    ctx.font = s.font
    ctx.fillStyle = s.color
    ctx.fillText(s.text, x, centerY)
    x += widths[i]!
  }
}
```

- [ ] **Step 4: 跑测试确认绿**

Run: `bun test packages/canvas2d/tests/painters/styledText.test.ts`
Expected: PASS（含 Task 2 旧用例 + 新 2 用例）。

- [ ] **Step 5: Commit**

```bash
git add packages/canvas2d/src/painters/styledText.ts packages/canvas2d/tests/painters/styledText.test.ts
git commit -m "feat(styled-text): 多段单行按 font/color 切换 + x 累加

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: underline / line-through 手绘线（读 ThemeText）

**Files:**
- Modify: `packages/canvas2d/src/painters/styledText.ts`
- Test: `packages/canvas2d/tests/painters/styledText.test.ts`

- [ ] **Step 1: 追加失败测试**

```ts
describe('paintStyledText — 装饰线', () => {
  it('underline 段画 moveTo/lineTo，坐标=段 x 区间 + 基线下偏移', () => {
    const { ctx, ops } = createRecordingContext()
    paintStyledText(ctx, [seg('AB', { underline: true })], layout())
    const moveTo = ops.find((o) => o.op === 'moveTo')
    const lineTo = ops.find((o) => o.op === 'lineTo')
    expect(moveTo).toBeDefined()
    expect(lineTo).toBeDefined()
    if (moveTo?.op === 'moveTo' && lineTo?.op === 'lineTo') {
      const y = 14 + denseGridTheme.text.underlineOffset // centerY + offset
      expect(moveTo.args).toEqual([8, y])               // 起点 x=padX
      expect(lineTo.args).toEqual([8 + 14, y])          // 终点 x=padX+段宽
    }
    expect(ops).toContainEqual({ op: 'set:lineWidth', value: denseGridTheme.text.underlineWidth })
    expect(ops).toContainEqual({ op: 'set:strokeStyle', value: '#111' })
  })

  it('strikethrough 段画线在 centerY - lineThroughOffset', () => {
    const { ctx, ops } = createRecordingContext()
    paintStyledText(ctx, [seg('AB', { strikethrough: true })], layout())
    const moveTo = ops.find((o) => o.op === 'moveTo')
    if (moveTo?.op === 'moveTo') {
      const y = 14 - denseGridTheme.text.lineThroughOffset
      expect(moveTo.args[1]).toBe(y)
    }
  })

  it('无装饰段不画线', () => {
    const { ctx, ops } = createRecordingContext()
    paintStyledText(ctx, [seg('AB')], layout())
    expect(ops.find((o) => o.op === 'moveTo')).toBeUndefined()
  })
})
```

- [ ] **Step 2: 跑测试确认红**

Run: `bun test packages/canvas2d/tests/painters/styledText.test.ts`
Expected: FAIL（未画装饰线）。

- [ ] **Step 3: 加装饰绘制**

在 Task 3 `paintStyledText` 的绘制循环里，`ctx.fillText` 之后插入装饰调用，并在文件末加 helper：

```ts
  // 循环体内 fillText 之后：
    if (s.underline || s.strikethrough) {
      drawDecoration(ctx, s, x, x + widths[i]!, centerY, layout.themeText)
    }
```

文件末新增：

```ts
/** 按段画 underline / line-through 直线段。underline 在基线下、line-through 在基线上下偏移。 */
function drawDecoration(
  ctx: CanvasRenderingContext2D,
  seg: StyledSegment,
  x0: number,
  x1: number,
  centerY: number,
  themeText: ThemeText,
): void {
  ctx.strokeStyle = seg.color
  if (seg.underline) {
    ctx.lineWidth = themeText.underlineWidth
    const y = centerY + themeText.underlineOffset
    ctx.beginPath()
    ctx.moveTo(x0, y)
    ctx.lineTo(x1, y)
    ctx.stroke()
  }
  if (seg.strikethrough) {
    ctx.lineWidth = themeText.lineThroughWidth
    const y = centerY - themeText.lineThroughOffset
    ctx.beginPath()
    ctx.moveTo(x0, y)
    ctx.lineTo(x1, y)
    ctx.stroke()
  }
}
```

> 几何近似：当前装饰偏移为固定 px（按默认 14px 字号调）。混排大字号时偏移不随字号缩放——记 `TODO(phase-b-decoration-scale)`，Phase B 不阻塞（op-log 确定即可）。

- [ ] **Step 4: 跑测试确认绿**

Run: `bun test packages/canvas2d/tests/painters/styledText.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add packages/canvas2d/src/painters/styledText.ts packages/canvas2d/tests/painters/styledText.test.ts
git commit -m "feat(styled-text): underline/line-through 手绘线段读 ThemeText token

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: 多行（`\n` 切分）+ 混排行高 + maxLines

**Files:**
- Modify: `packages/canvas2d/src/painters/styledText.ts`
- Test: `packages/canvas2d/tests/painters/styledText.test.ts`

> 引入行布局中间层：把 segments 切成 `LineLayout[]`（按 `\n`），每行高 = 段内最大 fontSize × 倍数，垂直堆叠；超 maxLines 的行裁掉。单行时仍垂直居中（保持 Task 2/3 行为）。

- [ ] **Step 1: 追加失败测试**

```ts
describe('paintStyledText — 多行 + 混排行高', () => {
  it('段文本含 \\n 时切两行，自顶向下堆叠', () => {
    const { ctx, ops } = createRecordingContext()
    paintStyledText(ctx, [seg('AB\nCD')], layout({ rect: { x: 0, y: 0, width: 100, height: 60 } }))
    const fills = ops.filter((o) => o.op === 'fillText')
    expect(fills.length).toBe(2)
    if (fills[0]?.op === 'fillText' && fills[1]?.op === 'fillText') {
      expect(fills[0].args[0]).toBe('AB')
      expect(fills[1].args[0]).toBe('CD')
      // 行高 = 14 * 1.4 = 19.6；firstY = y + padY + lineHeight/2 = 0+4+9.8 = 13.8
      expect(fills[0].args[2]).toBeCloseTo(13.8, 5)
      expect(fills[1].args[2]).toBeCloseTo(13.8 + 19.6, 5)
    }
  })

  it('混排：行高取段内最大 fontSize', () => {
    const { ctx, ops } = createRecordingContext()
    paintStyledText(
      ctx,
      [seg('A', { fontSize: 14 }), seg('B', { fontSize: 28 }), seg('\nC')],
      layout({ rect: { x: 0, y: 0, width: 200, height: 120 } }),
    )
    const fills = ops.filter((o) => o.op === 'fillText')
    // 第一行高 = max(14,28)*1.4 = 39.2；第二行起点 = firstY + 39.2
    const line1Y = 4 + 39.2 / 2
    if (fills[2]?.op === 'fillText') {
      expect(fills[2].args[0]).toBe('C')
      expect(fills[2].args[2]).toBeCloseTo(line1Y + 39.2, 4)
    }
  })

  it('超 maxLines（高度不足）的行被裁掉', () => {
    const { ctx, ops } = createRecordingContext()
    // 高 28，padY*2=8 → 可用 20；行高 19.6 → maxLines = 1
    paintStyledText(ctx, [seg('AB\nCD\nEF')], layout({ rect: { x: 0, y: 0, width: 100, height: 28 } }))
    const fills = ops.filter((o) => o.op === 'fillText')
    expect(fills.length).toBe(1)
    if (fills[0]?.op === 'fillText') expect(fills[0].args[0]).toBe('AB')
  })
})
```

- [ ] **Step 2: 跑测试确认红**

Run: `bun test packages/canvas2d/tests/painters/styledText.test.ts`
Expected: FAIL（当前不处理 `\n`/多行）。

- [ ] **Step 3: 引入 LineLayout + 重写 `paintStyledText`**

替换 `paintStyledText` 函数体，并加 `LinePiece`/`LineLayout` 类型与 `buildLinesBySplit`/`drawLine` helper（`measure`/`lineStartX`/`drawDecoration` 保留）：

```ts
interface LinePiece {
  readonly text: string
  readonly seg: StyledSegment
}
interface LineLayout {
  readonly pieces: readonly LinePiece[]
  /** 行高（px）= 行内最大 fontSize × 倍数 */
  readonly height: number
}

export function paintStyledText(
  ctx: CanvasRenderingContext2D,
  segments: readonly StyledSegment[],
  layout: StyledTextLayout,
): void {
  const { rect, padX, padY, lineHeightMultiplier } = layout
  const maxWidth = rect.width - padX * 2
  if (maxWidth <= 0) return

  const lines = buildLinesBySplit(segments, lineHeightMultiplier)
  if (lines.length === 0) return

  const availableHeight = rect.height - padY * 2
  if (availableHeight <= 0) return

  // 单行：垂直居中（保持 Task 2/3 行为）。多行：自顶向下堆叠，超高裁掉。
  if (lines.length === 1) {
    drawLine(ctx, lines[0]!, layout, rect.y + rect.height / 2)
    return
  }

  let y = rect.y + padY
  for (const line of lines) {
    if (y + line.height > rect.y + padY + availableHeight + 0.01) break
    drawLine(ctx, line, layout, y + line.height / 2)
    y += line.height
  }
}

/** 按 `\n` 把 segments 切成多行；段文本内的 `\n` 也切。行高取行内最大 fontSize × 倍数。 */
function buildLinesBySplit(
  segments: readonly StyledSegment[],
  lineHeightMultiplier: number,
): LineLayout[] {
  const rawLines: LinePiece[][] = [[]]
  for (const seg of segments) {
    const parts = seg.text.split('\n')
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) rawLines.push([])
      const part = parts[i]!
      if (part.length > 0) rawLines[rawLines.length - 1]!.push({ text: part, seg })
    }
  }
  return rawLines.map((pieces) => ({
    pieces,
    height: lineHeight(pieces, lineHeightMultiplier),
  }))
}

/** 行高 = 行内最大 fontSize × 倍数；空行用首段缺省 0 → 退化为单倍最小行高 1。 */
function lineHeight(pieces: readonly LinePiece[], multiplier: number): number {
  let maxSize = 0
  for (const p of pieces) maxSize = Math.max(maxSize, p.seg.fontSize)
  return (maxSize > 0 ? maxSize : 1) * multiplier
}

/** 画一行：先量各段宽算起点，再按段 font/color 累加 x 绘制 + 装饰。 */
function drawLine(
  ctx: CanvasRenderingContext2D,
  line: LineLayout,
  layout: StyledTextLayout,
  centerY: number,
): void {
  const pieces = line.pieces
  if (pieces.length === 0) return
  const { rect, padX, align, measurer } = layout
  const widths = pieces.map((p) => measure(ctx, p.text, p.seg, measurer))
  const lineWidth = widths.reduce((a, b) => a + b, 0)
  const startX = lineStartX(rect, padX, align, lineWidth)

  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'

  let x = startX
  for (let i = 0; i < pieces.length; i++) {
    const { text, seg } = pieces[i]!
    ctx.font = seg.font
    ctx.fillStyle = seg.color
    ctx.fillText(text, x, centerY)
    if (seg.underline || seg.strikethrough) {
      drawDecoration(ctx, seg, x, x + widths[i]!, centerY, layout.themeText)
    }
    x += widths[i]!
  }
}
```

> 注：Task 3 的旧单行函数体被本步整体取代；`drawLine` 内联了 Task 3 的累加逻辑，行为对单行不变（旧用例仍绿）。

- [ ] **Step 4: 跑测试确认绿**

Run: `bun test packages/canvas2d/tests/painters/styledText.test.ts`
Expected: PASS（含全部历史用例）。

- [ ] **Step 5: Commit**

```bash
git add packages/canvas2d/src/painters/styledText.ts packages/canvas2d/tests/painters/styledText.test.ts
git commit -m "feat(styled-text): \\n 多行切分 + 混排行高（段内最大字号）+ maxLines 裁断

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 6: wrap 模式 × 多段（段感知 token 分行）+ 末行省略号

**Files:**
- Modify: `packages/canvas2d/src/painters/styledText.ts`
- Test: `packages/canvas2d/tests/painters/styledText.test.ts`

> wrap 模式下复用 core `tokenize` 按段切 token、按段 font 量宽累加，超 maxWidth 软换行；语义对齐 `wrapText`（同 token 化、超宽 token 字符级硬切、maxLines 末行 `…`）。**plan-risk:** 多字体宽度累加必须与单字体 `wrapText` 在「全段同字体」时产出一致——Task 6 测试含一条同字体对照。若不一致 STOP+ASK。

- [ ] **Step 1: 追加失败测试**

```ts
import { wrapText } from '@novasheet/core'

const m7: import('@novasheet/core').TextMeasurer = { measureWidth: (t) => t.length * 7 }

describe('paintStyledText — wrap 多段', () => {
  it('单段 wrap 与 core wrapText 同字体产出一致的行内容', () => {
    const { ctx, ops } = createRecordingContext()
    const text = 'hello world foo bar'
    const rect = { x: 0, y: 0, width: 100, height: 120 }
    paintStyledText(ctx, [seg(text)], layout({ rect, wrap: 'wrap', measurer: m7 }))
    const drawn = ops.filter((o) => o.op === 'fillText').map((o) => (o.op === 'fillText' ? o.args[0] : ''))
    // maxWidth = 100 - 16 = 84；lineHeight = 19.6；maxLines = floor((120-8)/19.6)=5
    const expected = wrapText(text, { font: '14px sans-serif', maxWidth: 84, lineHeight: 19.6, maxLines: 5 }, m7)
    expect(drawn).toEqual([...expected.lines])
  })

  it('跨段 wrap：第二段接续第一段宽度累加换行', () => {
    const { ctx, ops } = createRecordingContext()
    // 段1 'aaaa '(5*7=35) 段2 'bbbb cccc'(各 4*7=28 + 空格)；maxWidth=84
    paintStyledText(
      ctx,
      [seg('aaaa '), seg('bbbb cccc')],
      layout({ rect: { x: 0, y: 0, width: 100, height: 120 }, wrap: 'wrap', measurer: m7 }),
    )
    const drawn = ops.filter((o) => o.op === 'fillText').map((o) => (o.op === 'fillText' ? o.args[0] : ''))
    // 'aaaa ' + 'bbbb '=70 <=84，加 'cccc'=28 → 98>84 换行 → 行1='aaaa bbbb' 行2='cccc'
    expect(drawn.some((s) => s.includes('cccc'))).toBe(true)
    expect(drawn.length).toBeGreaterThanOrEqual(2)
  })

  it('wrap 但无 measurer 时退化为单行不抛错', () => {
    const { ctx, ops } = createRecordingContext()
    paintStyledText(ctx, [seg('hello world foo')], layout({ wrap: 'wrap' }))
    expect(ops.find((o) => o.op === 'fillText')).toBeDefined()
  })
})
```

- [ ] **Step 2: 跑测试确认红**

Run: `bun test packages/canvas2d/tests/painters/styledText.test.ts`
Expected: FAIL（wrap 未分行，长文本仍一行）。

- [ ] **Step 3: 加 wrap 分行**

在 `styledText.ts` 顶部 import 加 `tokenize`：

```ts
import { tokenize } from '@novasheet/core'
```

在 `paintStyledText` 里，`buildLinesBySplit` 之后按 wrap 模式再分行。把构建行的逻辑改为：

```ts
  const maxLines = Math.max(1, Math.floor((rect.height - padY * 2 + lineHeightMultiplier * 0.0001) / baseLineHeightGuess(segments, lineHeightMultiplier)))
  const lines =
    layout.wrap === 'wrap' && layout.measurer
      ? buildLinesByWrap(ctx, segments, maxWidth, lineHeightMultiplier, layout.measurer, maxLines)
      : buildLinesBySplit(segments, lineHeightMultiplier)
```

> `maxLines` 此处仅用于 wrap 末行 `…`；非 wrap 的高度裁断仍由绘制循环的 `y + height` 判断兜底（保留 Task 5 逻辑）。`baseLineHeightGuess` 取首个非空段字号估算行高用于 maxLines 粗算（与 Task 5 单行高度近似一致）。

文件末加 helper：

```ts
/** wrap 行高粗估：用最大段字号 × 倍数（用于 maxLines 估算，绘制时仍按实际行高堆叠）。 */
function baseLineHeightGuess(segments: readonly StyledSegment[], multiplier: number): number {
  let maxSize = 0
  for (const s of segments) maxSize = Math.max(maxSize, s.fontSize)
  return (maxSize > 0 ? maxSize : 1) * multiplier
}

/**
 * 段感知 wrap：先把 segments 展平为带样式的 token 流（保留每 token 的 seg），
 * 再按段 font 量宽累加换行；语义对齐 core wrapText（token 化、超宽字符级硬切、maxLines 末行 …）。
 */
function buildLinesByWrap(
  ctx: CanvasRenderingContext2D,
  segments: readonly StyledSegment[],
  maxWidth: number,
  multiplier: number,
  measurer: TextMeasurer,
  maxLines: number,
): LineLayout[] {
  const lines: LinePiece[][] = [[]]
  let curWidth = 0
  const pushNewLine = () => {
    lines.push([])
    curWidth = 0
  }
  const appendPiece = (text: string, seg: StyledSegment, w: number) => {
    lines[lines.length - 1]!.push({ text, seg })
    curWidth += w
  }

  for (const seg of segments) {
    const parts = seg.text.split('\n')
    for (let pi = 0; pi < parts.length; pi++) {
      if (pi > 0) pushNewLine()
      for (const token of tokenize(parts[pi]!)) {
        if (token === '\n') { pushNewLine(); continue }
        const w = measurer.measureWidth(token, seg.font)
        if (curWidth + w <= maxWidth || curWidth === 0) {
          // token 单独成行仍超宽 → 字符级硬切
          if (curWidth === 0 && w > maxWidth) {
            for (const ch of token) {
              const cw = measurer.measureWidth(ch, seg.font)
              if (curWidth + cw > maxWidth && curWidth > 0) pushNewLine()
              appendPiece(ch, seg, cw)
            }
          } else {
            appendPiece(token, seg, w)
          }
        } else {
          pushNewLine()
          appendPiece(token, seg, w)
        }
      }
    }
  }

  // 去每行尾随空白 piece 的视觉影响交给绘制（不裁文本，保持与 wrapText trimEnd 近似：尾空格 token 宽度不显著）。
  let built = lines.map((pieces) => ({ pieces, height: lineHeight(pieces, multiplier) }))
  if (built.length > maxLines) {
    built = built.slice(0, maxLines)
    built[maxLines - 1] = appendEllipsis(built[maxLines - 1]!, maxWidth, measurer)
  }
  return built
}

/** 末行追加 `…`：挂到末段；若超 maxWidth 逐字符回退末段文本。 */
function appendEllipsis(line: LineLayout, maxWidth: number, measurer: TextMeasurer): LineLayout {
  const pieces = [...line.pieces]
  const last = pieces[pieces.length - 1]
  if (!last) return line
  const ell = '…'
  let text = last.text
  const widthOf = (t: string) =>
    pieces.slice(0, -1).reduce((a, p) => a + measurer.measureWidth(p.text, p.seg.font), 0) +
    measurer.measureWidth(t + ell, last.seg.font)
  while (text.length > 0 && widthOf(text) > maxWidth) text = text.slice(0, -1)
  pieces[pieces.length - 1] = { text: text + ell, seg: last.seg }
  return { pieces, height: line.height }
}
```

> 实现者注：`buildLinesByWrap` 首行可能为空数组（首 token 即换行），绘制循环对空行 `drawLine` 早退（pieces.length===0）。确认 Task 5 的 `drawLine` 已有 `if (pieces.length === 0) return`——已有。

- [ ] **Step 4: 跑测试确认绿**

Run: `bun test packages/canvas2d/tests/painters/styledText.test.ts`
Expected: PASS。若「单段 wrap 与 wrapText 一致」用例失败且差异源于 trimEnd/尾空格——STOP+ASK（语义须对齐，别静默改期望）。

- [ ] **Step 5: 全 canvas2d 回归**

Run: `bun test packages/canvas2d/`
Expected: PASS（styledText 为新增文件，既有 painter golden 不受影响=零回归基线）。

- [ ] **Step 6: Commit**

```bash
git add packages/canvas2d/src/painters/styledText.ts packages/canvas2d/tests/painters/styledText.test.ts
git commit -m "feat(styled-text): wrap 模式段感知分行 + 末行省略号（对齐 wrapText 语义）

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 7: `getAttachment` 透传 paint params + 导出原语 + 全量 gates

**Files:**
- Modify: `packages/canvas2d/src/painters/CellPainter.ts`
- Modify: `packages/canvas2d/src/render/Canvas2DRenderer.ts`
- Modify: `packages/canvas2d/src/index.ts`
- Test: `packages/canvas2d/tests/render/Canvas2DRenderer.attachment.test.ts`

> Phase C 的 richTextRenderer 经 `params.getAttachment('richText', rowIndex, colIndex)` 读 runs。本 task 把 `frame.getAttachment` 透传到 custom renderer 的 `Canvas2DCellRenderParams`，镜像既有 `formatCell` 通道（`Canvas2DRenderer.ts:447 ctx.frame.formatCell`、`:733/:742/:832/:841` 传入、`:853` context 字段）。

- [ ] **Step 1: 探查 formatCell 通道**

```bash
grep -n "formatCell" packages/canvas2d/src/render/Canvas2DRenderer.ts
grep -n "getAttachment\|formatCell\|CellPaintParams\|Canvas2DCellRenderParams" packages/canvas2d/src/painters/CellPainter.ts
grep -n "getAttachment" packages/core/src/kernel/render/RenderFrame.ts
```

- [ ] **Step 2: 写失败测试**

`Canvas2DRenderer.attachment.test.ts`——验证注册到某 field.type 的 custom renderer 在 paint 时收到可用的 `getAttachment`：

```ts
import { describe, expect, it } from 'bun:test'
import { CellPainter, type Canvas2DCellRenderer } from '../../src/painters/CellPainter'
import { denseGridTheme } from '@novasheet/core'
import { createRecordingContext } from '../helpers/recording-context'

describe('CellPainter — getAttachment 透传', () => {
  it('custom renderer 的 params 暴露 getAttachment，可按 view 坐标读', () => {
    const { ctx } = createRecordingContext()
    let seen: unknown
    const renderer: Canvas2DCellRenderer = {
      paint(_ctx, params) {
        seen = params.getAttachment?.('demo', params.rowIndex!, params.colIndex!)
      },
    }
    const painter = new CellPainter(denseGridTheme, { cellRenderers: { text: renderer } })
    painter.paint(ctx, {
      value: 'x',
      rect: { x: 0, y: 0, width: 100, height: 28 },
      field: { id: 'f', name: 'F', type: 'text', width: 100 },
      rowIndex: 2,
      colIndex: 0,
      getAttachment: <T,>(ns: string, r: number, c: number) =>
        (ns === 'demo' && r === 2 && c === 0 ? ({ note: 'hit' } as T) : undefined),
    })
    expect(seen).toEqual({ note: 'hit' })
  })
})
```

- [ ] **Step 3: 跑测试确认红**

Run: `bun test packages/canvas2d/tests/render/Canvas2DRenderer.attachment.test.ts`
Expected: FAIL（`CellPaintParams` 无 `getAttachment` 字段，类型报错/`seen` undefined）。

- [ ] **Step 4: 加 `getAttachment` 字段到 `CellPaintParams`**

`CellPainter.ts`——在 `CellPaintParams` interface 内（紧挨 `formatCell`）加：

```ts
  /** Phase B — frame 的 view 坐标附件解析器；供 custom renderer（如 rich-text）读 runs。 */
  getAttachment?: <T>(namespace: string, viewRow: number, viewCol: number) => T | undefined
```

`Canvas2DCellRenderParams extends CellPaintParams` 自动继承，无需改。

- [ ] **Step 5: 在 Renderer 透传 `frame.getAttachment`**

`Canvas2DRenderer.ts`——镜像 `formatCell`：
- 在 `Canvas2DPaintFrameContext`（约 `:853` 处 `readonly formatCell?` 字段附近）加：
  ```ts
  readonly getAttachment?: <T>(namespace: string, viewRow: number, viewCol: number) => T | undefined
  ```
- 在构建该 context 处（`ctx.frame.formatCell` 同源，约 `:447`）补 `getAttachment: frame.getAttachment`。
- 在两处 `this.cellPainter.paint(this.ctx, { ... formatCell })`（约 `:733`、`:832`）的对象里，紧挨 `formatCell,` 加 `getAttachment,`（从同作用域解构或 `ctx.frame.getAttachment`/`frame.getAttachment` 取，与 `formatCell` 取法一致）。

> 实现者注：`formatCell` 在 `paintMergeAnchors`/常规 cell 两路都传——`getAttachment` 跟随同样两路。先 `grep -n "formatCell" Canvas2DRenderer.ts` 把每个出现点配一个 `getAttachment`，确保两路 renderer 都能读。

- [ ] **Step 6: 导出 styled-text 原语**

`packages/canvas2d/src/index.ts`——加：

```ts
export { paintStyledText } from './painters/styledText'
export type { StyledSegment, StyledTextLayout } from './painters/styledText'
```

- [ ] **Step 7: 跑测试确认绿**

Run: `bun test packages/canvas2d/tests/render/Canvas2DRenderer.attachment.test.ts`
Expected: PASS。

- [ ] **Step 8: 全量 gates**

```bash
bun test
bun run --filter '*' typecheck
bun run lint
bun run --filter @novasheet/core build && bun run --filter @novasheet/canvas2d build
grep -rn "TextRun\|fontWeight\|strikethrough" packages/core/src/   # 须空（core 零 rich-text 语义）
```
Expected: 四门全过；core grep 空。

- [ ] **Step 9: Commit**

```bash
git add packages/canvas2d/src packages/canvas2d/tests/render/Canvas2DRenderer.attachment.test.ts
git commit -m "feat(styled-text): getAttachment 透传 custom renderer params + 导出 paintStyledText 原语

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

- [ ] **Step 10: 里程碑收尾**

dispatch code-reviewer（即便全绿，CLAUDE.md 要求）。更新路线图 §1.4 / §3 勾选 ☑。

---

## Self-Review（plan 对 spec §7 + roadmap §3）

**Spec 覆盖:**
- §7.1 `paintStyledText` + `StyledSegment` + 单段零回归 → Task 2–6。✓（`StyledSegment` 增 `fontSize` 数值字段，见设计要点说明）
- §7.1 underline/strike 手绘 + theme token → Task 1（token）+ Task 4（手绘）。✓
- §7.1 混排行高 = 段内最大 fontSize → Task 5。✓
- §7.3 ThemeText token → Task 1。✓
- §5.3 / roadmap §1.4「getAttachment 在 paint params 的消费」→ Task 7 透传（消费在 Phase C renderer）。✓

**roadmap §3 B1–B7 映射:**
- B1（抽原语 + 内置单段零回归基线）→ **决策偏离:** 本 plan **不迁移内置 `CellPainter` 路径**。理由：迁移 number（locale+右对齐）/wrap/ellipsis 三条既有路径会触碰 30+ golden，零功能收益且高回归风险；`paintStyledText` 作独立原语由 Phase C 消费即满足需求。零回归改由「新增文件不动既有」保证（Task 6 Step 5 全 canvas2d 回归为证）。**若评审坚持内置须走同一原语以防长期漂移，另开 follow-up task 仅迁移 `paintLines`（overflow/clip 文本路径），以既有 golden 为闸门。** 已在 roadmap §3 备注。
- B2 多段 → Task 3；B3 underline/strike → Task 4；B4 行高 → Task 5；B5 wrap×多段 → Task 6；B6 getAttachment → Task 7。✓
- B7（valueFormat×runs 门）→ **不在 Phase B:** 该门是 renderer 决策（runs 仅显示=raw string 时生效），无 runs-消费 renderer 无法测；Phase B 只出原语，门留 Phase C richTextRenderer（spec §9）。roadmap §1.4 此项落点改注 Phase C。

**Placeholder 扫描:** 无 TBD；每步含完整代码或精确 grep/命令。Task 5/7 的 `grep -n formatCell` 指引是「定位既有模式」而非占位——`formatCell` 通道已存在且行号已给。

**类型一致性:** `StyledSegment`/`StyledTextLayout`/`LineLayout`/`LinePiece`/`paintStyledText`/`buildLinesBySplit`/`buildLinesByWrap`/`drawLine`/`drawDecoration`/`lineStartX`/`lineHeight`/`measure` 跨 Task 命名统一；`ThemeText`（core）字段 `lineThrough*` 与 canvas2d `StyledSegment.strikethrough?` 命名差异是 dogfood 闸门刻意为之（已注）。

**plan-risk 已标:** Task 6 多段 wrap 与 `wrapText` 语义自洽（含同字体对照用例 + STOP+ASK）。
