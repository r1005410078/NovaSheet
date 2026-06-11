# 工具栏调色板自定义区改造 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把调色板「自定义」stub 换成真功能：手写 HSV+alpha 取色器、EyeDropper 吸管（feature-detect）、localStorage 自定义 swatch，fill 与 border 双入口接入。

**Architecture:** 纯函数色彩转换（`color-convert`）+ localStorage hook（`use-custom-colors`）+ 受控 `CustomColorPicker` 组件；fill/border 宿主各持 `'palette' | 'picker'` 视图 state 就地切换，不开嵌套 popover。BDD 外环：3 条 L3 场景先以 `it.todo` 落地（标题带场景 id，coverage 认可），最后一个接线任务翻绿。

**Tech Stack:** React 18、bun:test + happy-dom、Tailwind class、`@novasheet/mbd`（场景 validate/manifest）。

**Spec:** `docs/superpowers/specs/2026-06-11-toolbar-custom-color-picker-design.md`

**Plan-risk（执行时遇到与计划矛盾必须 STOP+ASK，不许静默改期望）:**
- HSV↔RGB 往返浮点误差：测试用 palette 实色断言往返相等，若个别色差 1（舍入），是 plan bug，先修 plan。
- happy-dom 对 `PointerEvent`/`setPointerCapture` 支持不全：组件内 `setPointerCapture?.()` 可选调用；SV 面板测试需 stub `getBoundingClientRect`。
- React 受控 input 必须用 native value setter + `dispatchEvent(new Event('input', {bubbles:true}))` 驱动（`setInputValue` helper）。

---

## File Structure

| 文件 | 动作 | 职责 |
| --- | --- | --- |
| `packages/react/src/features/toolbar/lib/color-convert.ts` | Create | hex/rgb() ↔ HSVA 纯函数 |
| `packages/react/src/features/toolbar/lib/use-custom-colors.ts` | Create | localStorage swatch hook |
| `packages/react/src/features/toolbar/components/CustomColorPicker.tsx` | Create | HSV+alpha 取色面板 |
| `packages/react/src/features/toolbar/components/ColorPalette.tsx` | Modify | swatch 规范化比较 + 棋盘格；重写自定义区；删 stray 吸管 |
| `packages/react/src/features/toolbar/components/NovaSheetToolbar.tsx` | Modify | FillColorPalette 视图切换接线 |
| `packages/react/src/features/toolbar/components/BorderPalette.tsx` | Modify | border color 子面板接自定义区 |
| `packages/react/tests/excel/scenarios/L3b-custom-fill-color.md` 等 3 个 | Create | BDD 场景 |
| `packages/react/tests/features/toolbar/{color-convert,use-custom-colors,CustomColorPicker,ColorPalette}.test.ts(x 路径用 .ts)` | Create | 内环单测 |
| `packages/react/tests/helpers/dom.ts` | Modify | `setInputValue` helper |

所有命令在 repo 根执行；只用 **bun**。

---

### Task 1: BDD 场景定稿

**Files:**
- Create: `packages/react/tests/excel/scenarios/L3b-custom-fill-color.md`
- Create: `packages/react/tests/excel/scenarios/L3c-custom-color-persist.md`
- Create: `packages/react/tests/excel/scenarios/L3c-eyedropper-feature-detect.md`

- [ ] **Step 1: 写 3 个场景 MD**

`L3b-custom-fill-color.md`：

```markdown
---
id: excel.L3b.custom-fill-color
layer: L3b
summary: 自定义取色器选半透明色后派发 fill-color
tags: []
status: draft
---

## User Story

作为表格用户，当内置色板没有我要的颜色时，我希望用自定义取色器（含透明度）选色并应用到选区，以便实现半透明填充效果。

## Given

- NovaExcel 已挂载，监听 onToolbarAction

## When

- 打开填充颜色 popover → 点「+」进入取色器 → hex 输入 `#ff000080` → 点确定

## Then

- onToolbarAction 收到 `{ id: 'fill-color', color: '#ff000080' }`
- popover 关闭
```

`L3c-custom-color-persist.md`：

```markdown
---
id: excel.L3c.custom-color-persist
layer: L3c
summary: 自定义颜色 swatch 跨卸载重挂留存
tags: []
status: draft
---

## User Story

作为表格用户，当我添加过自定义颜色后，我希望下次打开调色板时它还在，以便复用同一颜色。

## Given

- localStorage 干净；NovaExcel 已挂载

## When

- 经取色器添加 `#00ff0080` 并应用 → 卸载 → 重新挂载 → 再次打开填充颜色 popover

## Then

- 自定义区出现 `data-fill-color="#00ff0080"` swatch
```

`L3c-eyedropper-feature-detect.md`：

```markdown
---
id: excel.L3c.eyedropper-feature-detect
layer: L3c
summary: 无 EyeDropper API 时吸管不渲染
tags: []
status: draft
---

## User Story

作为 Firefox/Safari 用户，我不希望看到一个点了没反应的吸管按钮，以便界面诚实反映能力。

## Given

- 环境无 `window.EyeDropper`（happy-dom 默认）

## When

- 打开填充颜色 popover

## Then

- 自定义区不渲染吸管按钮（`[data-custom-color-eyedropper]` 不存在）
```

- [ ] **Step 2: 校验 + 重建 manifest**

Run: `bun run lint:mbd && bun run sync:mbd-manifest`
Expected: validate 通过；`packages/react/tests/excel/scenarios.manifest.json` 与 `SCENARIOS.md` 更新（+3 条）。

- [ ] **Step 3: Commit**

```bash
git add packages/react/tests/excel/scenarios/
git commit -m "test(react): 调色板自定义区 3 条 L3 行为场景定稿"
```

---

### Task 2: 行为测试落地为 it.todo（外环红的替身，保持套件绿）

**Files:**
- Modify: `packages/react/tests/helpers/dom.ts`
- Modify: `packages/react/tests/excel/NovaExcel.wiring.test.ts`
- Modify: `packages/react/tests/excel/NovaExcel.journeys.test.ts`

- [ ] **Step 1: 给 `tests/helpers/dom.ts` 加受控 input 驱动 helper**

```ts
/** React 受控 input 需经 native setter 改值再派发 input 事件才能触发 onChange。 */
export function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  act(() => {
    if (setter) setter.call(input, value)
    else input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
```

并在 `tests/excel/helpers.ts` 的 re-export 行补 `setInputValue`（与 `clickElement` 等并列导入导出）。

- [ ] **Step 2: 在 `NovaExcel.wiring.test.ts` 追加 it.todo（完整测试体，先不执行）**

```ts
it.todo('excel.L3b.custom-fill-color applies translucent color from custom picker', async () => {
  const { container, onToolbarAction, unmount } = await mountWiringExcel()
  clickAction(container, 'fill-color')
  await flushReactEffects()
  clickBody('[data-custom-color-add]')
  await flushReactEffects()

  const hexInput = document.body.querySelector<HTMLInputElement>(
    '[data-novasheet-color-picker] input[aria-label="十六进制颜色"]',
  )
  expect(hexInput).not.toBeNull()
  setInputValue(hexInput!, '#ff000080')
  await flushReactEffects()
  clickBody('[data-novasheet-color-picker-confirm]')
  await flushReactEffects()

  expect(onToolbarAction).toHaveBeenCalledWith({ id: 'fill-color', color: '#ff000080' })
  expect(document.body.querySelector('[data-novasheet-fill-palette]')).toBeNull()
  unmount()
})
```

`setInputValue` 加入该文件顶部的 `./helpers` 导入列表。

- [ ] **Step 3: 在 `NovaExcel.journeys.test.ts` 追加两条 it.todo**

```ts
it.todo('excel.L3c.custom-color-persist keeps custom swatch across remount', async () => {
  localStorage.clear()
  const first = await mountNovaExcel({ data: createDenseData() })
  clickAction(first.container, 'fill-color')
  await flushReactEffects()
  clickBody('[data-custom-color-add]')
  await flushReactEffects()
  const hexInput = document.body.querySelector<HTMLInputElement>(
    '[data-novasheet-color-picker] input[aria-label="十六进制颜色"]',
  )
  setInputValue(hexInput!, '#00ff0080')
  await flushReactEffects()
  clickBody('[data-novasheet-color-picker-confirm]')
  await flushReactEffects()
  first.unmount()

  const second = await mountNovaExcel({ data: createDenseData() })
  clickAction(second.container, 'fill-color')
  await flushReactEffects()
  expect(
    document.body.querySelector('[data-novasheet-fill-palette] [data-fill-color="#00ff0080"]'),
  ).not.toBeNull()
  second.unmount()
})

it.todo('excel.L3c.eyedropper-feature-detect hides eyedropper without EyeDropper API', async () => {
  delete (globalThis as { EyeDropper?: unknown }).EyeDropper
  const { container, unmount } = await mountNovaExcel({ data: createDenseData() })
  clickAction(container, 'fill-color')
  await flushReactEffects()
  expect(document.body.querySelector('[data-custom-color-eyedropper]')).toBeNull()
  unmount()
})
```

按需补 `setInputValue` / `clickBody` / `clickAction` / `createDenseData` 导入。

- [ ] **Step 4: 验证 coverage 与套件**

Run: `bun run --filter '@novasheet/react' lint:scenario-coverage && bun test packages/react`
Expected: coverage 含 3 个新 id（todo 计入）、无 missing/orphan；测试全绿（todo 不执行）。

- [ ] **Step 5: Commit**

```bash
git add packages/react/tests/
git commit -m "test(react): 自定义取色场景行为测试以 it.todo 落地（接线后翻绿）"
```

---

### Task 3: color-convert 纯函数（TDD）

**Files:**
- Create: `packages/react/src/features/toolbar/lib/color-convert.ts`
- Test: `packages/react/tests/features/toolbar/color-convert.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'bun:test'
import {
  hsvaToCss,
  normalizeColor,
  parseColor,
} from '../../../src/features/toolbar/lib/color-convert'

describe('color-convert', () => {
  it('解析 6 位 hex 并往返保真', () => {
    for (const hex of ['#fff2cc', '#cc0000', '#4a86e8', '#000000', '#ffffff']) {
      const parsed = parseColor(hex)
      expect(parsed).toBeDefined()
      expect(parsed!.a).toBe(1)
      expect(hsvaToCss(parsed!)).toBe(hex)
    }
  })

  it('解析 8 位 hex（alpha）并往返保真', () => {
    const parsed = parseColor('#FF000080')
    expect(parsed).toBeDefined()
    expect(parsed!.a).toBeCloseTo(128 / 255, 5)
    expect(hsvaToCss(parsed!)).toBe('#ff000080')
  })

  it('解析 3/4 位短 hex', () => {
    expect(hsvaToCss(parseColor('#f00')!)).toBe('#ff0000')
    expect(hsvaToCss(parseColor('#f00c')!)).toBe('#ff0000cc')
  })

  it('解析 rgb()/rgba() 两种语法', () => {
    expect(hsvaToCss(parseColor('rgb(255, 0, 0)')!)).toBe('#ff0000')
    expect(hsvaToCss(parseColor('rgba(255, 0, 0, 0.5)')!)).toBe('#ff000080')
    expect(hsvaToCss(parseColor('rgb(255 0 0 / 50%)')!)).toBe('#ff000080')
  })

  it('alpha=1 序列化为 6 位 hex', () => {
    expect(hsvaToCss(parseColor('rgba(0, 255, 0, 1)')!)).toBe('#00ff00')
  })

  it('非法输入返回 undefined', () => {
    for (const bad of ['', 'red', '#ff', '#ggg', 'rgb(1,2)', 'rgba(a,b,c,d)', 'hsl(0,0%,0%)']) {
      expect(parseColor(bad)).toBeUndefined()
    }
  })

  it('normalizeColor 统一等价形式', () => {
    expect(normalizeColor('#FFF2CC')).toBe('#fff2cc')
    expect(normalizeColor('rgba(255, 242, 204, 1)')).toBe('#fff2cc')
    expect(normalizeColor('not-a-color')).toBeUndefined()
  })

  it('灰阶 hue 退化稳定（黑白灰可往返）', () => {
    for (const hex of ['#000000', '#808080', '#ffffff']) {
      expect(hsvaToCss(parseColor(hex)!)).toBe(hex)
    }
  })
})
```

- [ ] **Step 2: 跑测验证失败**

Run: `bun test packages/react/tests/features/toolbar/color-convert.test.ts`
Expected: FAIL（module 不存在）。

- [ ] **Step 3: 实现**

```ts
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
```

- [ ] **Step 4: 跑测验证通过**

Run: `bun test packages/react/tests/features/toolbar/color-convert.test.ts`
Expected: PASS 全绿。

- [ ] **Step 5: Commit**

```bash
git add packages/react/src/features/toolbar/lib/color-convert.ts packages/react/tests/features/toolbar/color-convert.test.ts
git commit -m "feat(react): 调色板颜色转换纯函数（hex/rgb ↔ HSVA，含 alpha）"
```

---

### Task 4: useCustomColors hook（TDD）

**Files:**
- Create: `packages/react/src/features/toolbar/lib/use-custom-colors.ts`
- Test: `packages/react/tests/features/toolbar/use-custom-colors.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { beforeEach, describe, expect, it } from 'bun:test'
import React from 'react'
import { createRoot } from 'react-dom/client'

import { useCustomColors } from '../../../src/features/toolbar/lib/use-custom-colors'
import { clickElement, mountReactRoot, unmountReactRoot } from '../../helpers/dom'

function HookProbe({ color }: { readonly color: string }): JSX.Element {
  const { colors, add } = useCustomColors()
  return React.createElement(
    'div',
    null,
    React.createElement('button', { 'data-add': '', onClick: () => add(color) }),
    React.createElement('span', { 'data-colors': colors.join(',') }),
  )
}

async function mountProbe(color: string) {
  const container = document.createElement('div')
  const root = createRoot(container)
  await mountReactRoot(root, React.createElement(HookProbe, { color }))
  return {
    container,
    colorsAttr: () => container.querySelector('span')!.getAttribute('data-colors'),
    addClick: () => clickElement(container.querySelector('button')!),
    unmount: () => unmountReactRoot(root),
  }
}

describe('useCustomColors', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('add 后规范化存入并持久化到 localStorage', async () => {
    const probe = await mountProbe('#FF000080')
    probe.addClick()
    expect(probe.colorsAttr()).toBe('#ff000080')
    expect(localStorage.getItem('novasheet:custom-colors')).toBe('["#ff000080"]')
    probe.unmount()
  })

  it('重挂载读取已存颜色', async () => {
    localStorage.setItem('novasheet:custom-colors', '["#00ff0080","#fff2cc"]')
    const probe = await mountProbe('#000000')
    expect(probe.colorsAttr()).toBe('#00ff0080,#fff2cc')
    probe.unmount()
  })

  it('去重：重复 add 移到队首不重复', async () => {
    localStorage.setItem('novasheet:custom-colors', '["#fff2cc","#ff000080"]')
    const probe = await mountProbe('#FF000080')
    probe.addClick()
    expect(probe.colorsAttr()).toBe('#ff000080,#fff2cc')
    probe.unmount()
  })

  it('FIFO 上限 16', async () => {
    const seed = Array.from({ length: 16 }, (_, i) => `#0000${i.toString(16).padStart(2, '0')}`)
    localStorage.setItem('novasheet:custom-colors', JSON.stringify(seed))
    const probe = await mountProbe('#ff0000')
    probe.addClick()
    const colors = probe.colorsAttr()!.split(',')
    expect(colors).toHaveLength(16)
    expect(colors[0]).toBe('#ff0000')
    expect(colors).not.toContain('#00000f')
    probe.unmount()
  })

  it('localStorage 损坏 JSON 时回退空列表不抛错', async () => {
    localStorage.setItem('novasheet:custom-colors', '{not json')
    const probe = await mountProbe('#ff0000')
    expect(probe.colorsAttr()).toBe('')
    probe.addClick()
    expect(probe.colorsAttr()).toBe('#ff0000')
    probe.unmount()
  })
})
```

- [ ] **Step 2: 跑测验证失败**

Run: `bun test packages/react/tests/features/toolbar/use-custom-colors.test.ts`
Expected: FAIL（module 不存在）。

- [ ] **Step 3: 实现**

```ts
import { useCallback, useState } from 'react'

import { normalizeColor } from './color-convert'

const STORAGE_KEY = 'novasheet:custom-colors'
const MAX_CUSTOM_COLORS = 16

function readStoredColors(): readonly string[] {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((entry): entry is string => typeof entry === 'string')
      .slice(0, MAX_CUSTOM_COLORS)
  } catch {
    return []
  }
}

function writeStoredColors(colors: readonly string[]): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(colors))
  } catch {
    // storage 不可用（quota/隐私模式）只丢持久化，会话内功能不受影响
  }
}

/**
 * 自定义颜色 swatch（localStorage 持久化，FIFO 上限 16、规范化去重）。
 * fill / border 两个 popover 各自实例化；popover 关闭即卸载，重开时重读 storage，
 * 因此无需跨实例同步。
 */
export function useCustomColors(): {
  readonly colors: readonly string[]
  readonly add: (color: string) => void
} {
  const [colors, setColors] = useState<readonly string[]>(readStoredColors)

  const add = useCallback((color: string) => {
    const normalized = normalizeColor(color) ?? color.trim().toLowerCase()
    setColors((prev) => {
      const next = [normalized, ...prev.filter((c) => c !== normalized)].slice(
        0,
        MAX_CUSTOM_COLORS,
      )
      writeStoredColors(next)
      return next
    })
  }, [])

  return { colors, add }
}
```

- [ ] **Step 4: 跑测验证通过**

Run: `bun test packages/react/tests/features/toolbar/use-custom-colors.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add packages/react/src/features/toolbar/lib/use-custom-colors.ts packages/react/tests/features/toolbar/use-custom-colors.test.ts
git commit -m "feat(react): useCustomColors hook——localStorage 自定义色 swatch（FIFO 16、去重、容错）"
```

---

### Task 5: CustomColorPicker 组件（TDD）

**Files:**
- Create: `packages/react/src/features/toolbar/components/CustomColorPicker.tsx`
- Test: `packages/react/tests/features/toolbar/CustomColorPicker.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it, mock } from 'bun:test'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

import { CustomColorPicker } from '../../../src/features/toolbar/components/CustomColorPicker'
import {
  clickElement,
  mountReactRoot,
  setInputValue,
  unmountReactRoot,
} from '../../helpers/dom'

async function mountPicker(initialColor = '#ff0000') {
  const onConfirm = mock((_c: string) => {})
  const onCancel = mock(() => {})
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await mountReactRoot(
    root,
    React.createElement(CustomColorPicker, { initialColor, onConfirm, onCancel }),
  )
  const q = <T extends Element>(sel: string): T => {
    const el = container.querySelector<T>(sel)
    if (!el) throw new Error(`not found: ${sel}`)
    return el
  }
  return {
    container,
    onConfirm,
    onCancel,
    hexInput: () => q<HTMLInputElement>('input[aria-label="十六进制颜色"]'),
    hueInput: () => q<HTMLInputElement>('input[aria-label="色相"]'),
    alphaInput: () => q<HTMLInputElement>('input[aria-label="透明度"]'),
    confirm: () => clickElement(q<HTMLElement>('[data-novasheet-color-picker-confirm]')),
    cancel: () => clickElement(q<HTMLElement>('[data-novasheet-color-picker-cancel]')),
    unmount: () => {
      unmountReactRoot(root)
      container.remove()
    },
  }
}

describe('CustomColorPicker', () => {
  it('初始色回填 hex 输入，确定回传规范 hex', async () => {
    const p = await mountPicker('#FF8000')
    expect(p.hexInput().value).toBe('#ff8000')
    p.confirm()
    expect(p.onConfirm).toHaveBeenCalledWith('#ff8000')
    p.unmount()
  })

  it('hex 输入合法值后确定回传该色（含 8 位 alpha）', async () => {
    const p = await mountPicker()
    setInputValue(p.hexInput(), '#00ff0080')
    p.confirm()
    expect(p.onConfirm).toHaveBeenCalledWith('#00ff0080')
    p.unmount()
  })

  it('非法 hex 标红且不改当前色', async () => {
    const p = await mountPicker('#ff0000')
    setInputValue(p.hexInput(), '#zzz')
    expect(p.hexInput().getAttribute('aria-invalid')).toBe('true')
    p.confirm()
    expect(p.onConfirm).toHaveBeenCalledWith('#ff0000')
    p.unmount()
  })

  it('alpha 滑条改变后确定回传 8 位 hex', async () => {
    const p = await mountPicker('#ff0000')
    setInputValue(p.alphaInput(), '50')
    p.confirm()
    expect(p.onConfirm).toHaveBeenCalledWith('#ff000080')
    p.unmount()
  })

  it('hue 滑条改变色相（红→绿）', async () => {
    const p = await mountPicker('#ff0000')
    setInputValue(p.hueInput(), '120')
    p.confirm()
    expect(p.onConfirm).toHaveBeenCalledWith('#00ff00')
    p.unmount()
  })

  it('SV 面板 pointer 选色（stub getBoundingClientRect）', async () => {
    // 初始灰色（s=0, v≈0.5），点 SV 面板右上角 → s=1, v=1, hue 0 → 纯红。
    // 初始色不能取 #ff0000，否则 handler 不工作断言也平凡通过。
    const p = await mountPicker('#808080')
    const sv = p.container.querySelector<HTMLElement>('[data-novasheet-color-picker-sv]')!
    sv.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
    act(() => {
      sv.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, clientX: 200, clientY: 0 }),
      )
    })
    p.confirm()
    expect(p.onConfirm).toHaveBeenCalledWith('#ff0000')
    p.unmount()
  })

  it('取消触发 onCancel 不触发 onConfirm', async () => {
    const p = await mountPicker()
    p.cancel()
    expect(p.onCancel).toHaveBeenCalledTimes(1)
    expect(p.onConfirm).not.toHaveBeenCalled()
    p.unmount()
  })
})
```

- [ ] **Step 2: 跑测验证失败**

Run: `bun test packages/react/tests/features/toolbar/CustomColorPicker.test.ts`
Expected: FAIL（module 不存在）。

- [ ] **Step 3: 实现组件**

```tsx
import { useRef, useState } from 'react'

import { hsvaToCss, parseColor, type Hsva } from '../lib/color-convert'

const FALLBACK: Hsva = { h: 0, s: 0, v: 0, a: 1 }
export const CHECKERBOARD_BG = 'repeating-conic-gradient(#e2e8f0 0% 25%, #ffffff 0% 50%)'

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}

/**
 * 自定义取色面板：SV 方块 + 色相/透明度滑条 + hex 输入 + 确定/取消。
 * 受控边界：HSVA 为内部规范状态；hex 输入仅在解析成功时回写状态，非法值标红不应用。
 * 确定回传 hsvaToCss 序列化结果（a=1 → 6 位 hex，否则 8 位）。
 */
export function CustomColorPicker({
  initialColor,
  onConfirm,
  onCancel,
}: {
  readonly initialColor: string
  readonly onConfirm: (color: string) => void
  readonly onCancel: () => void
}): JSX.Element {
  const [hsva, setHsva] = useState<Hsva>(() => parseColor(initialColor) ?? FALLBACK)
  const [hexInput, setHexInput] = useState<string>(() =>
    hsvaToCss(parseColor(initialColor) ?? FALLBACK),
  )
  const [hexInvalid, setHexInvalid] = useState(false)
  const svRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)

  const applyHsva = (next: Hsva): void => {
    setHsva(next)
    setHexInput(hsvaToCss(next))
    setHexInvalid(false)
  }

  const pickFromPointer = (clientX: number, clientY: number): void => {
    const el = svRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    applyHsva({
      ...hsva,
      s: clamp01((clientX - rect.left) / rect.width),
      v: 1 - clamp01((clientY - rect.top) / rect.height),
    })
  }

  const currentCss = hsvaToCss(hsva)
  const opaqueCss = hsvaToCss({ ...hsva, a: 1 })

  return (
    <div data-novasheet-color-picker="" className="flex flex-col gap-2">
      <div
        ref={svRef}
        data-novasheet-color-picker-sv=""
        role="presentation"
        className="h-30 w-full cursor-crosshair rounded"
        style={{
          background: `linear-gradient(to top, #000000, transparent), linear-gradient(to right, #ffffff, hsl(${hsva.h} 100% 50%))`,
          touchAction: 'none',
        }}
        onPointerDown={(e) => {
          draggingRef.current = true
          e.currentTarget.setPointerCapture?.(e.pointerId)
          pickFromPointer(e.clientX, e.clientY)
        }}
        onPointerMove={(e) => {
          if (draggingRef.current) pickFromPointer(e.clientX, e.clientY)
        }}
        onPointerUp={() => {
          draggingRef.current = false
        }}
      />

      <label className="flex items-center gap-2">
        <span className="w-10 shrink-0 text-slate-700">色相</span>
        <input
          type="range"
          aria-label="色相"
          min={0}
          max={360}
          step={1}
          value={Math.round(hsva.h)}
          className="h-2 w-full"
          style={{
            background:
              'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
          }}
          onChange={(e) => applyHsva({ ...hsva, h: Number(e.target.value) })}
        />
      </label>

      <label className="flex items-center gap-2">
        <span className="w-10 shrink-0 text-slate-700">透明度</span>
        <span className="relative h-2 w-full rounded" style={{ background: CHECKERBOARD_BG, backgroundSize: '8px 8px' }}>
          <input
            type="range"
            aria-label="透明度"
            min={0}
            max={100}
            step={1}
            value={Math.round(hsva.a * 100)}
            className="absolute inset-0 h-2 w-full"
            style={{ background: `linear-gradient(to right, transparent, ${opaqueCss})` }}
            onChange={(e) => applyHsva({ ...hsva, a: Number(e.target.value) / 100 })}
          />
        </span>
      </label>

      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="inline-block size-6 shrink-0 rounded-full border border-slate-300"
          style={{
            background: `linear-gradient(${currentCss}, ${currentCss}), ${CHECKERBOARD_BG}`,
            backgroundSize: 'auto, 8px 8px',
          }}
        />
        <input
          type="text"
          aria-label="十六进制颜色"
          aria-invalid={hexInvalid ? 'true' : undefined}
          value={hexInput}
          spellCheck={false}
          className={`h-7 w-full rounded border px-2 font-mono text-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 ${
            hexInvalid ? 'border-red-500' : 'border-slate-300'
          }`}
          onChange={(e) => {
            const raw = e.target.value
            setHexInput(raw)
            const parsed = parseColor(raw)
            if (parsed) {
              setHsva(parsed)
              setHexInvalid(false)
            } else {
              setHexInvalid(true)
            }
          }}
        />
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          data-novasheet-color-picker-cancel=""
          className="h-7 rounded px-3 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          onClick={onCancel}
        >
          取消
        </button>
        <button
          type="button"
          data-novasheet-color-picker-confirm=""
          className="h-7 rounded bg-slate-800 px-3 text-white hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          onClick={() => onConfirm(hsvaToCss(hsva))}
        >
          确定
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 跑测验证通过**

Run: `bun test packages/react/tests/features/toolbar/CustomColorPicker.test.ts`
Expected: PASS。若 `PointerEvent` 在 happy-dom 缺失导致 SV 测试报错（非断言失败），把该测试的事件构造换成 `new MouseEvent('pointerdown', …)` 并在测试旁注明原因；属断言失败则 STOP+ASK。

- [ ] **Step 5: Commit**

```bash
git add packages/react/src/features/toolbar/components/CustomColorPicker.tsx packages/react/tests/features/toolbar/CustomColorPicker.test.ts
git commit -m "feat(react): CustomColorPicker——HSV+alpha 手写取色面板（hex 双向、非法标红）"
```

---

### Task 6: ColorPalette 改造（swatch 规范化 + 棋盘格 + 自定义区重写 + 删 stray 吸管）

**Files:**
- Modify: `packages/react/src/features/toolbar/components/ColorPalette.tsx`
- Test: `packages/react/tests/features/toolbar/ColorPalette.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { afterEach, describe, expect, it, mock } from 'bun:test'
import React from 'react'
import { createRoot } from 'react-dom/client'

import {
  ToolbarColorPalette,
  ToolbarColorPaletteCustom,
} from '../../../src/features/toolbar/components/ColorPalette'
import {
  clickElement,
  flushReactEffects,
  mountReactRoot,
  unmountReactRoot,
} from '../../helpers/dom'

async function mountEl(element: React.ReactElement) {
  const container = document.createElement('div')
  const root = createRoot(container)
  await mountReactRoot(root, element)
  return { container, unmount: () => unmountReactRoot(root) }
}

afterEach(() => {
  delete (globalThis as { EyeDropper?: unknown }).EyeDropper
})

describe('ToolbarColorPalette', () => {
  it('不再渲染「标准」行旁的 stray 吸管', async () => {
    const { container, unmount } = await mountEl(
      React.createElement(ToolbarColorPalette, { selectedColor: null, onSelect: () => {} }),
    )
    expect(container.querySelector('[title="吸管"]')).toBeNull()
    unmount()
  })

  it('selectedColor 经规范化比较命中 swatch（rgba 等价形式）', async () => {
    const { container, unmount } = await mountEl(
      React.createElement(ToolbarColorPalette, {
        selectedColor: 'rgba(255, 242, 204, 1)',
        onSelect: () => {},
      }),
    )
    const swatch = container.querySelector('[data-fill-color="#fff2cc"]')
    expect(swatch?.textContent).toBe('✓')
    unmount()
  })
})

describe('ToolbarColorPaletteCustom', () => {
  const baseProps = {
    onSelect: () => {},
    onOpenPicker: () => {},
    customColors: [] as readonly string[],
    selectedColor: null,
  }

  it('渲染已存自定义 swatch，点击回传颜色', async () => {
    const onSelect = mock((_c: string) => {})
    const { container, unmount } = await mountEl(
      React.createElement(ToolbarColorPaletteCustom, {
        ...baseProps,
        onSelect,
        customColors: ['#ff000080', '#fff2cc'],
      }),
    )
    const swatch = container.querySelector<HTMLElement>('[data-fill-color="#ff000080"]')
    expect(swatch).not.toBeNull()
    clickElement(swatch!)
    expect(onSelect).toHaveBeenCalledWith('#ff000080')
    unmount()
  })

  it('「+」触发 onOpenPicker', async () => {
    const onOpenPicker = mock(() => {})
    const { container, unmount } = await mountEl(
      React.createElement(ToolbarColorPaletteCustom, { ...baseProps, onOpenPicker }),
    )
    clickElement(container.querySelector<HTMLElement>('[data-custom-color-add]')!)
    expect(onOpenPicker).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('无 EyeDropper API 时吸管不渲染', async () => {
    const { container, unmount } = await mountEl(
      React.createElement(ToolbarColorPaletteCustom, baseProps),
    )
    expect(container.querySelector('[data-custom-color-eyedropper]')).toBeNull()
    unmount()
  })

  it('有 EyeDropper API 时吸管取色直接 onSelect', async () => {
    ;(globalThis as { EyeDropper?: unknown }).EyeDropper = class {
      open(): Promise<{ sRGBHex: string }> {
        return Promise.resolve({ sRGBHex: '#123456' })
      }
    }
    const onSelect = mock((_c: string) => {})
    const { container, unmount } = await mountEl(
      React.createElement(ToolbarColorPaletteCustom, { ...baseProps, onSelect }),
    )
    clickElement(container.querySelector<HTMLElement>('[data-custom-color-eyedropper]')!)
    await flushReactEffects()
    expect(onSelect).toHaveBeenCalledWith('#123456')
    unmount()
  })
})
```

- [ ] **Step 2: 跑测验证失败**

Run: `bun test packages/react/tests/features/toolbar/ColorPalette.test.ts`
Expected: FAIL——stray 吸管仍在、`ToolbarColorPaletteCustom` 旧签名无 `customColors` 等。

- [ ] **Step 3: 改造 `ColorPalette.tsx`**

顶部 import 改为：

```tsx
import { CirclePlus, Pipette } from 'lucide-react'

import { normalizeColor, parseColor } from '../lib/color-convert'
import { fillPaletteRows, standardFillColors } from '../lib/colors'
import { TOOLBAR_ICON_CLASS } from '../lib/icon-class'
import { CHECKERBOARD_BG } from './CustomColorPicker'
```

`ColorSwatch` 内部两处替换——选中比较与背景：

```tsx
  const normalizedSelected =
    selectedColor != null ? (normalizeColor(selectedColor) ?? selectedColor.toLowerCase()) : null
  const selected = normalizedSelected === (normalizeColor(color) ?? color.toLowerCase())
  const translucent = (parseColor(color)?.a ?? 1) < 1
```

按钮 `style` 由 `{{ backgroundColor: color }}` 改为：

```tsx
      style={
        translucent
          ? {
              background: `linear-gradient(${color}, ${color}), ${CHECKERBOARD_BG}`,
              backgroundSize: 'auto, 8px 8px',
            }
          : { backgroundColor: color }
      }
```

`ToolbarColorPalette` 中删除「标准」行旁的整个吸管 `<button>`（保留 `<span>标准</span>`；`Pipette`/`CirclePlus` import 若仅剩自定义区使用则相应保留）。

`ToolbarColorPaletteCustom` 整体替换为：

```tsx
interface EyeDropperResult {
  readonly sRGBHex: string
}

/** 自定义区：已存 swatch + 取色器入口 + 吸管（feature-detect）。无 IO，数据由宿主注入。 */
export function ToolbarColorPaletteCustom({
  onSelect,
  onOpenPicker,
  customColors,
  selectedColor,
}: {
  readonly onSelect: (color: string) => void
  readonly onOpenPicker: () => void
  readonly customColors: readonly string[]
  readonly selectedColor?: string | null
}): JSX.Element {
  const eyeDropperCtor = (
    globalThis as { EyeDropper?: new () => { open(): Promise<EyeDropperResult> } }
  ).EyeDropper
  const pickScreenColor = (): void => {
    if (!eyeDropperCtor) return
    new eyeDropperCtor()
      .open()
      .then((result) => onSelect(result.sRGBHex))
      .catch(() => {
        // 用户 Esc 取消——静默忽略
      })
  }

  return (
    <>
      <div className="mb-2 text-slate-700">自定义</div>
      {customColors.length > 0 ? (
        <div className="mb-2 grid grid-cols-10 gap-1">
          {customColors.map((color) => (
            <ColorSwatch
              key={color}
              color={color}
              label={color}
              selectedColor={selectedColor}
              onSelect={onSelect}
            />
          ))}
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-custom-color-add=""
          className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          title="添加自定义颜色"
          onClick={onOpenPicker}
        >
          <CirclePlus aria-hidden className={TOOLBAR_ICON_CLASS} strokeWidth={1.75} />
        </button>
        {eyeDropperCtor ? (
          <button
            type="button"
            data-custom-color-eyedropper=""
            className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            title="吸管"
            onClick={pickScreenColor}
          >
            <Pipette aria-hidden className={TOOLBAR_ICON_CLASS} strokeWidth={1.75} />
          </button>
        ) : null}
      </div>
    </>
  )
}
```

- [ ] **Step 4: 跑测——新测试过，旧调用点编译破（预期）**

Run: `bun test packages/react/tests/features/toolbar/ColorPalette.test.ts`
Expected: PASS。
Run: `bun run --filter '@novasheet/react' typecheck`
Expected: FAIL——`NovaSheetToolbar.tsx` 旧 `ToolbarColorPaletteCustom` 调用缺新 props（Task 7 修复）。为保持 commit 可编译，本 task 先在 `NovaSheetToolbar.tsx` 调用处补**最小**接线：`<ToolbarColorPaletteCustom onSelect={dispatchColor} onOpenPicker={() => {}} customColors={[]} selectedColor={selectedColor} />`（行为与 stub 等价，Task 7 换成真实现）。再跑 typecheck 应 PASS。

- [ ] **Step 5: 全量回归**

Run: `bun test packages/react && bun run --filter '@novasheet/react' typecheck`
Expected: 全绿（`excel.L3b.fill-color` 等既有场景测试不受影响）。

- [ ] **Step 6: Commit**

```bash
git add packages/react/src/features/toolbar/components/ColorPalette.tsx packages/react/src/features/toolbar/components/NovaSheetToolbar.tsx packages/react/tests/features/toolbar/ColorPalette.test.ts
git commit -m "feat(react): 调色板自定义区重写——swatch 注入/吸管 feature-detect/棋盘格/规范化选中，删 stray 吸管"
```

---

### Task 7: FillColorPalette 接线 + 翻绿 3 条外环场景

**Files:**
- Modify: `packages/react/src/features/toolbar/components/NovaSheetToolbar.tsx`（`FillColorPalette`）
- Modify: `packages/react/tests/excel/NovaExcel.wiring.test.ts`（`it.todo` → `it`）
- Modify: `packages/react/tests/excel/NovaExcel.journeys.test.ts`（`it.todo` → `it` ×2）

- [ ] **Step 1: 翻绿外环测试（先红）**

把 Task 2 的三条 `it.todo` 改为 `it`。
Run: `bun test packages/react/tests/excel`
Expected: 3 条 FAIL——点击 `[data-custom-color-add]` 后没有 `[data-novasheet-color-picker]`。

- [ ] **Step 2: 实现 FillColorPalette 视图切换**

`NovaSheetToolbar.tsx`：确保 `useState` 在 react import 中；新增 import：

```tsx
import { CustomColorPicker } from './CustomColorPicker'
import { useCustomColors } from '../lib/use-custom-colors'
```

`FillColorPalette` 函数体改为：

```tsx
  const [view, setView] = useState<'palette' | 'picker'>('palette')
  const { colors: customColors, add: addCustomColor } = useCustomColors()

  const dispatchColor = (color: string | null): void => {
    onAction?.({ id: 'fill-color', color })
    onClose()
  }

  return (
    <div
      ref={paletteRef}
      role="menu"
      aria-label="填充颜色"
      data-novasheet-fill-palette=""
      className="fixed z-[10000] w-[260px] rounded bg-white p-3 text-[13px] text-slate-800 shadow-lg ring-1 ring-slate-200"
      style={{ top: position.top, left: position.left }}
    >
      {view === 'picker' ? (
        <CustomColorPicker
          initialColor={selectedColor ?? '#000000'}
          onConfirm={(color) => {
            addCustomColor(color)
            dispatchColor(color)
          }}
          onCancel={() => setView('palette')}
        />
      ) : (
        <>
          {/* 原有内容原样保留：重置按钮、ToolbarColorPalette、分隔线 */}
          <ToolbarColorPaletteCustom
            onSelect={dispatchColor}
            onOpenPicker={() => setView('picker')}
            customColors={customColors}
            selectedColor={selectedColor}
          />
          {/* 原有内容原样保留：分隔线、条件格式、交替颜色 */}
        </>
      )}
    </div>
  )
```

注释标注处不改动既有 JSX，仅把 `view === 'palette'` 分支包住原内容、替换 `ToolbarColorPaletteCustom` 的 props（去掉 Task 6 的临时 `onOpenPicker={() => {}}` / `customColors={[]}`）。

- [ ] **Step 3: 跑外环测试验证转绿**

Run: `bun test packages/react/tests/excel`
Expected: 3 条场景测试 PASS，其余不回归。

- [ ] **Step 4: coverage 与全量**

Run: `bun run --filter '@novasheet/react' lint:scenario-coverage && bun test packages/react && bun run --filter '@novasheet/react' typecheck`
Expected: 全绿，无 missing/orphan。

- [ ] **Step 5: Commit**

```bash
git add packages/react/src/features/toolbar/components/NovaSheetToolbar.tsx packages/react/tests/excel/
git commit -m "feat(react): fill picker 接入自定义取色器视图切换，3 条 L3 场景转绿"
```

---

### Task 8: BorderPalette 接入自定义区（TDD）

**Files:**
- Modify: `packages/react/src/features/toolbar/components/BorderPalette.tsx`
- Modify: `packages/react/tests/features/toolbar/ColorPalette.test.ts`（追加 describe）

- [ ] **Step 1: 写失败测试（追加到 ColorPalette.test.ts）**

```ts
import { BorderPalette } from '../../../src/features/toolbar/components/BorderPalette'

describe('BorderPalette — 自定义颜色', () => {
  it('color 子面板含自定义区，取色器确定后 reapply 并收起', async () => {
    localStorage.clear()
    const onApply = mock((_preset: unknown, _border: unknown) => {})
    const { container, unmount } = await mountEl(
      React.createElement(BorderPalette, {
        position: { top: 0, left: 0 },
        paletteRef: () => {},
        lastBorderPreset: 'all' as const,
        onApply,
        onClose: () => {},
      }),
    )
    clickElement(container.querySelector<HTMLElement>('[title="边框颜色"]')!)
    await flushReactEffects()
    clickElement(container.querySelector<HTMLElement>('[data-custom-color-add]')!)
    await flushReactEffects()

    const hexInput = container.querySelector<HTMLInputElement>(
      '[data-novasheet-color-picker] input[aria-label="十六进制颜色"]',
    )
    expect(hexInput).not.toBeNull()
    setInputValue(hexInput!, '#33445580')
    await flushReactEffects()
    clickElement(
      container.querySelector<HTMLElement>('[data-novasheet-color-picker-confirm]')!,
    )
    await flushReactEffects()

    expect(onApply).toHaveBeenCalledWith(
      'all',
      expect.objectContaining({ color: '#33445580' }),
    )
    // 子面板收起回 palette 视图
    expect(container.querySelector('[data-novasheet-border-color-palette]')).toBeNull()
    unmount()
  })
})
```

`setInputValue` 加入该文件 helpers 导入。

- [ ] **Step 2: 跑测验证失败**

Run: `bun test packages/react/tests/features/toolbar/ColorPalette.test.ts`
Expected: 新增 describe FAIL（border color 子面板无 `[data-custom-color-add]`）。

- [ ] **Step 3: 实现**

`BorderPalette.tsx`：import 增加

```tsx
import { ToolbarColorPalette, ToolbarColorPaletteCustom } from './ColorPalette'
import { CustomColorPicker } from './CustomColorPicker'
import { useCustomColors } from '../lib/use-custom-colors'
```

组件 state 区追加：

```tsx
  const [colorView, setColorView] = useState<'palette' | 'picker'>('palette')
  const { colors: customColors, add: addCustomColor } = useCustomColors()

  const applyDraftColor = (color: string): void => {
    reapplyWithDraft({ ...draft, color })
    setColorOpen(false)
    setColorView('palette')
  }
```

`{colorOpen ? (...) : null}` 块内容替换为：

```tsx
        <div className="border-t border-slate-200 p-3" data-novasheet-border-color-palette="">
          {colorView === 'picker' ? (
            <CustomColorPicker
              initialColor={draft.color}
              onConfirm={(color) => {
                addCustomColor(color)
                applyDraftColor(color)
              }}
              onCancel={() => setColorView('palette')}
            />
          ) : (
            <>
              <ToolbarColorPalette selectedColor={draft.color} onSelect={applyDraftColor} />
              <div className="my-3 h-px bg-slate-300" />
              <ToolbarColorPaletteCustom
                onSelect={applyDraftColor}
                onOpenPicker={() => setColorView('picker')}
                customColors={customColors}
                selectedColor={draft.color}
              />
            </>
          )}
        </div>
```

（原 `onSelect` 内联箭头函数逻辑并入 `applyDraftColor`。）

- [ ] **Step 4: 跑测验证通过 + 回归**

Run: `bun test packages/react && bun run --filter '@novasheet/react' typecheck`
Expected: 全绿。

- [ ] **Step 5: Commit**

```bash
git add packages/react/src/features/toolbar/components/BorderPalette.tsx packages/react/tests/features/toolbar/ColorPalette.test.ts
git commit -m "feat(react): border picker color 子面板接入自定义取色器与 swatch"
```

---

### Task 9: 收尾全 gate

**Files:** 无新改动（仅验证；有问题回上游 task 修）

- [ ] **Step 1: 全仓 gate**

Run:

```bash
bun test
bun run --filter '@novasheet/core' typecheck && bun run --filter '@novasheet/canvas2d' typecheck && bun run --filter '@novasheet/react' typecheck
bun run lint
bun run --filter '@novasheet/react' lint:scenario-coverage
bun run lint:mbd
```

Expected: 全绿；lint 无 react 包新增 warning（mbd/storybook 既有债除外，storybook typecheck 失败为分支既有问题）。

- [ ] **Step 2: storybook 手动验收（报告即可，不阻塞）**

`bun run --filter '@novasheet/storybook' dev` 打开 toolbar story：fill → 自定义「+」→ 半透明色确定 → 画布出现 alpha 填充且隐约可见格线；刷新页面 swatch 留存；Chrome 下吸管可取色。

- [ ] **Step 3: 若 Step 1 有修复产生，按所属 task 范围单独 commit**
