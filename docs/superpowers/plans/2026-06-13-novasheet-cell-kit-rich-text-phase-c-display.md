# cell-kit rich-text 显示半（Phase C-display）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 立起 `@novasheet/cell-kit` 包脚手架（含反向依赖 boundary lint），落地 rich-text 的**数据模型 + 序列化 + 渲染**三件——`TextRun`/`normalize`、`richTextCodec`、`richTextRenderer`（读 attachment 切段 → `paintStyledText`）。完成后默认 Grid 仍纯文本，注册 `richTextExtension`（display 半）即可渲染跨字符样式；编辑器/工具栏留 Phase C-edit。

**Architecture:** 新包 `packages/cell-kit/`，leaf consumer（`core ← canvas2d ← react ← cell-kit`）。本 plan 只触 core/canvas2d 依赖面（renderer + codec），不引 react（编辑器在 C-edit）。`normalize`/`codec` 是纯函数（白盒 TDD）；`richTextRenderer` 是 L4 渲染（op-log TDD）。Phase B 的 `paintStyledText` 原语 + Phase A 的 `getAttachment` 透传是地基。一处 dogfood 缝补：custom renderer 当前拿不到 `measurer`（CellPainter 私有），rich-text wrap 需要它——Task 4 把 `measurer` 透传进 `Canvas2DCellRenderParams`（镜像 `getAttachment`）。

**Tech Stack:** TypeScript（strict + `noUncheckedIndexedAccess` + `verbatimModuleSyntax`）、bun workspaces、`bun:test`、`RecordingContext2D` op-log、`oxlint`。

**前置:** Phase A（attachment 轴 + `getAttachment` 透传）+ Phase B（`paintStyledText` + `ThemeText`）已 ship。spec [`2026-06-13-novasheet-cell-kit-rich-text-design.md`](../specs/2026-06-13-novasheet-cell-kit-rich-text-design.md) §4/§6/§7/§9。路线图 [`2026-06-13-novasheet-rich-text-roadmap.md`](./2026-06-13-novasheet-rich-text-roadmap.md) §4（C1–C4）。

**方法论:** `normalize`/`codec` = kernel 级纯函数 → 纯 TDD；`richTextRenderer` = L4 渲染白盒（op-log）→ 纯 TDD。**本 plan 不写 BDD MD 场景**——Excel L3 场景（`rich-text-toolbar-bold-substring` / `rich-text-default-not-bundled`）罩的是「注册后端到端编辑」+「默认不带」，须等 C-edit 的 editor + 完整装配才可观测，留 C-edit 的 BDD gate。

**plan-risk（须 STOP+ASK）:**
- Task 2 `normalize` 的代理对边界 snap 方向（向外扩 vs 向内缩）若与某条测试期望矛盾，先停——别静默改期望。
- Task 5「runs 仅在 display === raw string 时生效」（spec §9）：若 `formatCell` 通道的 display 语义与此判据冲突（如 text 列也可能有 formatter），STOP+ASK。

---

## 设计要点（贯穿全 plan）

**rich-text 数据模型**（cell-kit，spec §6）：

```ts
export interface TextRunAttrs {
  readonly bold?: boolean
  readonly italic?: boolean
  readonly underline?: boolean
  readonly strikethrough?: boolean
  readonly fontSize?: number       // undefined = 继承 cell 默认（theme）
  readonly fontFamily?: string
  readonly color?: string
}
export interface TextRun {
  readonly start: number           // 半开 [start, end)，UTF-16 code-unit
  readonly end: number
  readonly attrs: TextRunAttrs
}
export type RichTextValue = readonly TextRun[]   // normalized：升序、不重叠、相邻等格已合并
```

**切段**（renderer）：给定 `text` + normalized `runs` + `cellDefault`（theme typography），产出 `StyledSegment[]`：run 覆盖区 = `cellDefault ⊕ run.attrs`，gap 区 = `cellDefault`。每段 `font` 由属性拼 CSS font 串，`fontSize` 带数值（Phase B `StyledSegment.fontSize` 要求）。

**cellDefault**（从 `params.theme` 取）：`{ fontSize: theme.metrics.fontSize, fontFamily: theme.metrics.fontFamily, color: theme.colors.text }`。

**padding / 对齐 / wrap**（renderer 从 `params` + `theme` 取，与内置 CellPainter 同源）：
- `padX = theme.metrics.cellPaddingX`、`padY = theme.metrics.cellPaddingY`
- `align = theme.cell.textAlignByType[field.type]`
- `wrap = params.textWrap ?? 'overflow'`
- `lineHeightMultiplier = theme.text.lineHeightMultiplier`、`themeText = theme.text`、`measurer = params.measurer`（Task 4 透传）

---

## File Structure

| 文件 | 责任 | 动作 |
| --- | --- | --- |
| `packages/cell-kit/package.json` | 包配置（deps: core+canvas2d；照搬 react build 形态） | Create |
| `packages/cell-kit/tsconfig.json` / `tsconfig.build.json` | 照搬 react（无 jsx，本 plan 无 .tsx） | Create |
| `packages/cell-kit/build.ts` | 照搬 react/canvas2d build 脚本（externals: core+canvas2d） | Create |
| `packages/cell-kit/README.md` | 包定位 + opt-in 装配示例 | Create |
| `packages/cell-kit/src/index.ts` | 包根导出 | Create |
| `packages/cell-kit/src/rich-text/types.ts` | `TextRun`/`TextRunAttrs`/`RichTextValue` | Create |
| `packages/cell-kit/src/rich-text/normalize.ts` | `normalize(runs, text)` 纯函数 | Create |
| `packages/cell-kit/src/rich-text/richTextCodec.ts` | `CellAttachmentCodec<RichTextValue>`，namespace='richText' | Create |
| `packages/cell-kit/src/rich-text/richTextRenderer.ts` | `Canvas2DCellRenderer`：读 runs 切段 → `paintStyledText` | Create |
| `packages/cell-kit/src/rich-text/segments.ts` | `splitIntoSegments(text, runs, cellDefault)` | Create |
| `packages/cell-kit/src/rich-text/index.ts` | `richTextExtension`（display 半：codec + renderer） | Create |
| `packages/cell-kit/scripts/check-cellkit-boundary.ts` | 禁 core/canvas2d/react 反向依赖 cell-kit | Create |
| `scripts/check-cellkit-boundary.ts` | 根入口 wrapper（镜像 `check-react-boundary.ts`） | Create |
| `packages/canvas2d/src/painters/CellPainter.ts` | `Canvas2DCellRenderParams` 加 `measurer?` + 透传 | Modify |
| `package.json`（root） | `lint` 串接 `lint:cellkit-boundary` | Modify |
| `packages/cell-kit/tests/**` | 各单元测试镜像 src | Create |

---

## Task 1: cell-kit 包脚手架 + 反向依赖 boundary lint

**Files:**
- Create: `packages/cell-kit/{package.json,tsconfig.json,tsconfig.build.json,build.ts,README.md,src/index.ts}`
- Create: `packages/cell-kit/scripts/check-cellkit-boundary.ts`
- Create: `scripts/check-cellkit-boundary.ts`
- Create: `packages/cell-kit/tests/scripts/check-cellkit-boundary.test.ts`
- Modify: `package.json`（root `lint`）

- [ ] **Step 1: 先探查（确认照搬基线）**

```bash
cat packages/react/tsconfig.json packages/react/tsconfig.build.json
cat packages/canvas2d/build.ts
grep -n '"lint"' package.json
```

- [ ] **Step 2: 写 boundary check 的失败测试**

`packages/cell-kit/tests/scripts/check-cellkit-boundary.test.ts`：

```ts
import { describe, expect, it } from 'bun:test'
import { findCellKitBoundaryViolations } from '../../scripts/check-cellkit-boundary'

describe('check-cellkit-boundary', () => {
  it('flags core/canvas2d/react src importing @novasheet/cell-kit', () => {
    const files = new Map<string, string>([
      ['/repo/packages/core/src/foo.ts', `import { x } from '@novasheet/cell-kit'`],
      ['/repo/packages/canvas2d/src/bar.ts', `import type { Y } from '@novasheet/cell-kit/rich-text'`],
      ['/repo/packages/react/src/baz.ts', `import { z } from '@novasheet/cell-kit'`],
    ])
    const v = findCellKitBoundaryViolations(files)
    expect(v.length).toBe(3)
    expect(v[0]?.path).toContain('core')
  })

  it('allows cell-kit itself importing core/canvas2d/react', () => {
    const files = new Map<string, string>([
      ['/repo/packages/cell-kit/src/a.ts', `import { Grid } from '@novasheet/core'`],
      ['/repo/packages/apps/storybook/x.ts', `import { richTextExtension } from '@novasheet/cell-kit'`],
    ])
    expect(findCellKitBoundaryViolations(files).length).toBe(0)
  })
})
```

- [ ] **Step 3: 跑确认红**

Run: `bun test packages/cell-kit/tests/scripts/check-cellkit-boundary.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 4: 实现 boundary check**

`packages/cell-kit/scripts/check-cellkit-boundary.ts`（镜像 `packages/react/scripts/check-react-boundary.ts` 的读树 + 正则结构）：

```ts
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface CellKitBoundaryViolation {
  readonly path: string
  readonly line: number
  readonly detail: string
}

const IMPORT_RE = /\bimport(?:\s+type)?[\s\S]*?\bfrom\s+['"]([^'"]+)['"]/g
/** core/canvas2d/react 三层禁止反向依赖 cell-kit（spec §4.4）。 */
const FORBIDDEN_IMPORTER = /\/packages\/(core|canvas2d|react)\/src\//
const CELLKIT_SPECIFIER = /^@novasheet\/cell-kit(\/|$)/

export function findCellKitBoundaryViolations(
  files: ReadonlyMap<string, string>,
): readonly CellKitBoundaryViolation[] {
  const violations: CellKitBoundaryViolation[] = []
  for (const [path, source] of files) {
    const norm = path.replace(/\\/g, '/')
    if (!FORBIDDEN_IMPORTER.test(norm)) continue
    for (const match of source.matchAll(IMPORT_RE)) {
      const specifier = match[1]
      if (!specifier || !CELLKIT_SPECIFIER.test(specifier)) continue
      violations.push({
        path: norm,
        line: lineForOffset(source, match.index ?? 0),
        detail: `cell-kit reverse-dependency: '${specifier}'`,
      })
    }
  }
  return violations
}

function lineForOffset(source: string, offset: number): number {
  let line = 1
  for (let i = 0; i < offset; i += 1) if (source.charCodeAt(i) === 10) line += 1
  return line
}

function readTree(dir: string): Map<string, string> {
  const files = new Map<string, string>()
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      for (const [p, s] of readTree(path)) files.set(p, s)
    } else if (entry.isFile() && (path.endsWith('.ts') || path.endsWith('.tsx'))) {
      files.set(path, readFileSync(path, 'utf8'))
    }
  }
  return files
}

export function runCellKitBoundaryCheck(repoRoot: string): number {
  const files = readTree(join(repoRoot, 'packages'))
  let failed = 0
  for (const v of findCellKitBoundaryViolations(files)) {
    console.error(`${v.path}:${v.line} ${v.detail}`)
    failed = 1
  }
  return failed
}

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
if ((import.meta as { main?: boolean }).main) {
  process.exit(runCellKitBoundaryCheck(REPO_ROOT))
}
```

根入口 `scripts/check-cellkit-boundary.ts`（镜像 `scripts/check-react-boundary.ts`）：

```ts
/// <reference types="node" />
import { join } from 'node:path'
import { runCellKitBoundaryCheck } from '../packages/cell-kit/scripts/check-cellkit-boundary'

if ((import.meta as { main?: boolean }).main) {
  process.exit(runCellKitBoundaryCheck(join(import.meta.dirname, '..')))
}
```

- [ ] **Step 5: 跑确认绿**

Run: `bun test packages/cell-kit/tests/scripts/check-cellkit-boundary.test.ts`
Expected: PASS（2 用例）。

- [ ] **Step 6: 脚手架包配置文件**

`packages/cell-kit/package.json`（照搬 react，deps 仅 core+canvas2d，无 react peer——本 plan 无 .tsx；C-edit 再加）：

```json
{
  "name": "@novasheet/cell-kit",
  "version": "0.1.0",
  "description": "First-party opt-in cell components (rich-text) for NovaSheet.",
  "license": "MIT",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "bun run build.ts",
    "test": "bun test",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@novasheet/canvas2d": "^0.1.0",
    "@novasheet/core": "^0.1.0"
  },
  "devDependencies": {
    "@types/bun": "^1.3.14",
    "typescript": "^6.0.3"
  }
}
```

`packages/cell-kit/tsconfig.json`（照搬 react，去 jsx——本 plan 无 .tsx）：

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "../..",
    "outDir": "./dist",
    "types": ["bun"]
  },
  "include": ["src/**/*", "tests/**/*", "scripts/**/*", "build.ts"]
}
```

`packages/cell-kit/tsconfig.build.json`：

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "rootDir": "src",
    "types": []
  },
  "include": ["src/**/*"],
  "exclude": ["tests", "scripts"]
}
```

`packages/cell-kit/build.ts`（照搬 canvas2d build.ts，externals 加 canvas2d）：

```ts
/**
 * Build script for @novasheet/cell-kit. Same artifact shape as core/canvas2d.
 */
import { rm, copyFile } from 'node:fs/promises'

const ROOT = new URL('.', import.meta.url).pathname
await rm(`${ROOT}dist`, { recursive: true, force: true })

const EXTERNALS = ['@novasheet/core', '@novasheet/canvas2d'] as const
const common = {
  entrypoints: [`${ROOT}src/index.ts`],
  outdir: `${ROOT}dist`,
  target: 'browser' as const,
  sourcemap: 'linked' as const,
  minify: false,
  external: [...EXTERNALS],
} satisfies Parameters<typeof Bun.build>[0]

const esm = await Bun.build({ ...common, format: 'esm' })
if (!esm.success) { console.error('ESM build failed:', esm.logs); process.exit(1) }
const cjs = await Bun.build({ ...common, format: 'cjs', naming: '[name].cjs' })
if (!cjs.success) { console.error('CJS build failed:', cjs.logs); process.exit(1) }

const dts = Bun.spawn(
  ['bunx', 'tsc', '-p', 'tsconfig.build.json', '--emitDeclarationOnly',
   '--outDir', `${ROOT}dist`, '--declaration', '--declarationMap'],
  { cwd: ROOT, stdout: 'inherit', stderr: 'inherit' },
)
if ((await dts.exited) !== 0) { console.error('tsc declaration generation failed'); process.exit(1) }
await copyFile(`${ROOT}dist/index.d.ts`, `${ROOT}dist/index.d.cts`)
console.log('Build complete')
```

`packages/cell-kit/src/index.ts`（先占位，Task 6 补 re-export）：

```ts
export {}
```

`packages/cell-kit/README.md`：

```markdown
# @novasheet/cell-kit

第一方 opt-in 单元格组件（首个：rich-text）。默认**不进** `@novasheet/core`/`@novasheet/react`——和外部第三方扩展走同一注册路径。

## 装配（display 半）

\`\`\`ts
import { richTextExtension } from '@novasheet/cell-kit'
import { canvas2dBackend } from '@novasheet/canvas2d'

new Grid(container, {
  data,
  cellAttachments: [richTextExtension.codec],
  backend: canvas2dBackend({ cellRenderers: { text: richTextExtension.renderer } }),
})
\`\`\`

编辑器 / 浮动工具栏见 Phase C-edit。
```

- [ ] **Step 7: 根 `lint` 串接 boundary check**

`package.json`（root）——把 `"lint"` 改为在 `lint:react-boundary` 后接 `&& bun run lint:cellkit-boundary`，并加 script：

```json
    "lint": "bun run lint:architecture && bun run lint:react-boundary && bun run lint:cellkit-boundary && bun run lint:mbd && bun run lint:scenario-coverage && oxlint packages",
    "lint:cellkit-boundary": "bun scripts/check-cellkit-boundary.ts",
```

- [ ] **Step 8: 安装 + 全量门自检**

```bash
bun install
bun run --filter @novasheet/cell-kit typecheck
bun run --filter @novasheet/cell-kit build
bun run lint:cellkit-boundary    # 期望 exit 0（当前无反向依赖）
bun test packages/cell-kit/
```
Expected: typecheck 0 error；build 出 dist；boundary exit 0；测试绿。

> 若 `bun install` 改动 lockfile，连同提交（bun workspace 新增包属预期）。

- [ ] **Step 9: Commit**

```bash
git add packages/cell-kit package.json bun.lock scripts/check-cellkit-boundary.ts
git commit -m "feat(cell-kit): 包脚手架 + 反向依赖 boundary lint（core/canvas2d/react 禁依赖 cell-kit）

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: `TextRun` 类型 + `normalize`（纯函数，代理对安全）

**Files:**
- Create: `packages/cell-kit/src/rich-text/types.ts`
- Create: `packages/cell-kit/src/rich-text/normalize.ts`
- Test: `packages/cell-kit/tests/rich-text/normalize.test.ts`

- [ ] **Step 1: 写失败测试**

`packages/cell-kit/tests/rich-text/normalize.test.ts`：

```ts
import { describe, expect, it } from 'bun:test'
import { normalize } from '../../src/rich-text/normalize'
import type { TextRun } from '../../src/rich-text/types'

const run = (start: number, end: number, attrs: TextRun['attrs'] = {}): TextRun => ({ start, end, attrs })

describe('normalize', () => {
  it('drops empty/inverted runs and clamps to text bounds', () => {
    const out = normalize([run(2, 2, { bold: true }), run(-1, 3, { italic: true }), run(4, 99, { bold: true })], 'hello')
    // [-1,3)→[0,3)，[2,2) 丢弃，[4,99)→[4,5)
    expect(out).toEqual([run(0, 3, { italic: true }), run(4, 5, { bold: true })])
  })

  it('sorts by start ascending', () => {
    const out = normalize([run(3, 5, { bold: true }), run(0, 2, { italic: true })], 'abcdef')
    expect(out.map((r) => r.start)).toEqual([0, 3])
  })

  it('merges adjacent runs with deep-equal attrs', () => {
    const out = normalize([run(0, 2, { bold: true }), run(2, 4, { bold: true })], 'abcd')
    expect(out).toEqual([run(0, 4, { bold: true })])
  })

  it('does NOT merge adjacent runs with differing attrs', () => {
    const out = normalize([run(0, 2, { bold: true }), run(2, 4, { italic: true })], 'abcd')
    expect(out.length).toBe(2)
  })

  it('snaps start/end off surrogate-pair boundaries (no half char)', () => {
    // '😀' = U+1F600 = 2 code units [0,1]; 'a😀b' → indices a=0, hi=1, lo=2, b=3
    const text = 'a\u{1F600}b'
    // run [0,2) 会切在 😀 中间（end=2 落在 low surrogate 后？end=2 指向 b 前，合法）
    // 用 [2,3) 起点落在 low surrogate（index 2）→ 须 snap 回 1（high surrogate）
    const out = normalize([run(2, 3, { bold: true })], text)
    expect(out[0]?.start).toBe(1) // snap 向外扩到 high surrogate
    expect(out[0]?.end).toBe(3)
  })

  it('empty input → empty output', () => {
    expect(normalize([], 'abc')).toEqual([])
  })
})
```

- [ ] **Step 2: 跑确认红**

Run: `bun test packages/cell-kit/tests/rich-text/normalize.test.ts`
Expected: FAIL（模块不存在）。

> **plan-risk:** 代理对 snap 方向定为「向外扩」（start 落在 low surrogate 上 → 退到前一个 high surrogate；end 落在 high surrogate 上 → 进到后一个 low surrogate 之后）。若实现中此约定与上面测试矛盾，STOP+ASK，别静默改期望。

- [ ] **Step 3: 实现 types.ts**

`packages/cell-kit/src/rich-text/types.ts`：

```ts
/** 单 run 的样式覆盖；缺省字段 = 继承 cell 默认（theme typography）。 */
export interface TextRunAttrs {
  readonly bold?: boolean
  readonly italic?: boolean
  readonly underline?: boolean
  readonly strikethrough?: boolean
  readonly fontSize?: number
  readonly fontFamily?: string
  readonly color?: string
}

/** 半开 [start, end)，UTF-16 code-unit 偏移（对齐 contenteditable Selection）。 */
export interface TextRun {
  readonly start: number
  readonly end: number
  readonly attrs: TextRunAttrs
}

/** normalized：按 start 升序、互不重叠、相邻等格已合并；gap 继承 cell 默认。 */
export type RichTextValue = readonly TextRun[]
```

- [ ] **Step 4: 实现 normalize.ts**

`packages/cell-kit/src/rich-text/normalize.ts`：

```ts
import type { TextRun, TextRunAttrs, RichTextValue } from './types'

/**
 * 规整 runs：clamp 到 [0, text.length]、丢空、按 start 升序、snap 代理对边界、合并相邻等格。
 * 假定输入 runs 不重叠（编辑器保证）；重叠不在本函数职责内（C-edit 的 toggle 保证）。
 */
export function normalize(runs: readonly TextRun[], text: string): RichTextValue {
  const len = text.length
  const cleaned: TextRun[] = []
  for (const r of runs) {
    let start = clamp(r.start, 0, len)
    let end = clamp(r.end, 0, len)
    if (start >= end) continue
    start = snapStart(text, start)
    end = snapEnd(text, end)
    cleaned.push({ start, end, attrs: r.attrs })
  }
  cleaned.sort((a, b) => a.start - b.start)

  const merged: TextRun[] = []
  for (const r of cleaned) {
    const prev = merged[merged.length - 1]
    if (prev && prev.end === r.start && sameAttrs(prev.attrs, r.attrs)) {
      merged[merged.length - 1] = { start: prev.start, end: r.end, attrs: prev.attrs }
    } else {
      merged.push(r)
    }
  }
  return merged
}

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n
}

/** start 落在 low surrogate（前一个是 high）上 → 向外退到 high surrogate。 */
function snapStart(text: string, i: number): number {
  if (i > 0 && isLowSurrogate(text.charCodeAt(i)) && isHighSurrogate(text.charCodeAt(i - 1))) return i - 1
  return i
}

/** end 落在 high surrogate（即将切走其 low）上 → 向外进到 low surrogate 之后。 */
function snapEnd(text: string, i: number): number {
  if (i < text.length && isHighSurrogate(text.charCodeAt(i - 1)) && isLowSurrogate(text.charCodeAt(i))) {
    // end 指向 high 与 low 之间（i-1=high, i=low）→ 推到 low 之后
    return i + 1
  }
  return i
}

function isHighSurrogate(c: number): boolean { return c >= 0xd800 && c <= 0xdbff }
function isLowSurrogate(c: number): boolean { return c >= 0xdc00 && c <= 0xdfff }

const ATTR_KEYS = ['bold', 'italic', 'underline', 'strikethrough', 'fontSize', 'fontFamily', 'color'] as const

function sameAttrs(a: TextRunAttrs, b: TextRunAttrs): boolean {
  for (const k of ATTR_KEYS) if (a[k] !== b[k]) return false
  return true
}
```

> snapEnd 的判据：`end=i` 表示半开区间右端，覆盖 `[..., i-1]`。若 `i-1` 是 high surrogate 且 `i` 是 low surrogate，则该字符被切半 → end 推到 `i+1`（含完整代理对）。测试用例 `[2,3)` 的 end=3 指向 b（index 3），`text[2]`=low、`text[1]`=high——end=3 时 `i-1=2`=low、`i=3`=b，非「high+low」，不触发；start=2 触发 snapStart 退到 1。验证：`out = [1,3)`。

- [ ] **Step 5: 跑确认绿**

Run: `bun test packages/cell-kit/tests/rich-text/normalize.test.ts`
Expected: PASS（6 用例）。若代理对用例与实现冲突，STOP+ASK。

- [ ] **Step 6: Commit**

```bash
git add packages/cell-kit/src/rich-text/types.ts packages/cell-kit/src/rich-text/normalize.ts packages/cell-kit/tests/rich-text/normalize.test.ts
git commit -m "feat(cell-kit): TextRun 类型 + normalize（clamp/排序/相邻等格合并/代理对 snap）

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: `richTextCodec`（serialize/deserialize 往返）

**Files:**
- Create: `packages/cell-kit/src/rich-text/richTextCodec.ts`
- Test: `packages/cell-kit/tests/rich-text/richTextCodec.test.ts`

- [ ] **Step 1: 写失败测试**

`packages/cell-kit/tests/rich-text/richTextCodec.test.ts`：

```ts
import { describe, expect, it } from 'bun:test'
import { richTextCodec } from '../../src/rich-text/richTextCodec'
import type { RichTextValue } from '../../src/rich-text/types'

describe('richTextCodec', () => {
  it('registers namespace "richText"', () => {
    expect(richTextCodec.namespace).toBe('richText')
  })

  it('round-trips runs through serialize/deserialize', () => {
    const runs: RichTextValue = [
      { start: 0, end: 3, attrs: { bold: true, color: '#a00' } },
      { start: 5, end: 8, attrs: { italic: true, fontSize: 18 } },
    ]
    const text = richTextCodec.serialize(runs)
    expect(typeof text).toBe('string')
    expect(richTextCodec.deserialize(text)).toEqual(runs)
  })

  it('deserialize returns undefined on malformed JSON', () => {
    expect(richTextCodec.deserialize('not json')).toBeUndefined()
  })

  it('deserialize returns undefined on wrong shape (not array of runs)', () => {
    expect(richTextCodec.deserialize('{"foo":1}')).toBeUndefined()
    expect(richTextCodec.deserialize('[{"start":0}]')).toBeUndefined() // 缺 end/attrs
  })
})
```

- [ ] **Step 2: 跑确认红**

Run: `bun test packages/cell-kit/tests/rich-text/richTextCodec.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 richTextCodec.ts**

`packages/cell-kit/src/rich-text/richTextCodec.ts`：

```ts
import type { CellAttachmentCodec } from '@novasheet/core'
import type { RichTextValue, TextRun } from './types'

/** rich-text 附件 codec：runs ⇄ JSON 串，注册 'richText' namespace（spec §5.1/§6）。 */
export const richTextCodec: CellAttachmentCodec<RichTextValue> = {
  namespace: 'richText',
  serialize(runs) {
    return JSON.stringify(runs)
  },
  deserialize(text) {
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      return undefined
    }
    if (!Array.isArray(parsed)) return undefined
    if (!parsed.every(isTextRun)) return undefined
    return parsed as RichTextValue
  },
}

function isTextRun(v: unknown): v is TextRun {
  if (typeof v !== 'object' || v === null) return false
  const r = v as Record<string, unknown>
  return typeof r.start === 'number' && typeof r.end === 'number' && typeof r.attrs === 'object' && r.attrs !== null
}
```

> `CellAttachmentCodec` 从 `@novasheet/core` 导出（Phase A，`grep -n "CellAttachmentCodec" packages/core/src/index.ts` 确认）。

- [ ] **Step 4: 跑确认绿**

Run: `bun test packages/cell-kit/tests/rich-text/richTextCodec.test.ts`
Expected: PASS（4 用例）。

- [ ] **Step 5: Commit**

```bash
git add packages/cell-kit/src/rich-text/richTextCodec.ts packages/cell-kit/tests/rich-text/richTextCodec.test.ts
git commit -m "feat(cell-kit): richTextCodec serialize/deserialize 往返 + 形状校验

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: canvas2d 缝补 — `measurer` 透传进 `Canvas2DCellRenderParams`

**Files:**
- Modify: `packages/canvas2d/src/painters/CellPainter.ts`
- Test: `packages/canvas2d/tests/painters/CellPainter.measurer.test.ts`

> dogfood 缝缺口：rich-text renderer 要 wrap 必须拿到 `measurer`，但当前 custom renderer 的 params（`{ ...params, theme }`）不含 measurer（CellPainter 私有）。镜像 `getAttachment` 把 measurer 透传。零回归（新增可选字段）。

- [ ] **Step 1: 探查注入点**

```bash
grep -n "custom.paint\|this.measurer\|theme: this.theme\|Canvas2DCellRenderParams" packages/canvas2d/src/painters/CellPainter.ts
```

- [ ] **Step 2: 写失败测试**

`packages/canvas2d/tests/painters/CellPainter.measurer.test.ts`：

```ts
import { describe, expect, it } from 'bun:test'
import { CellPainter, type Canvas2DCellRenderer } from '../../src/painters/CellPainter'
import { denseGridTheme, type TextMeasurer } from '@novasheet/core'
import { createRecordingContext } from '../helpers/recording-context'

describe('CellPainter — measurer 透传 custom renderer', () => {
  it('custom renderer params 暴露注入的 measurer', () => {
    const { ctx } = createRecordingContext()
    const measurer: TextMeasurer = { measureWidth: (t) => t.length * 9 }
    let seen: TextMeasurer | undefined
    const renderer: Canvas2DCellRenderer = {
      paint(_ctx, params) { seen = params.measurer },
    }
    const painter = new CellPainter(denseGridTheme, { cellRenderers: { text: renderer }, measurer })
    painter.paint(ctx, {
      value: 'x',
      rect: { x: 0, y: 0, width: 100, height: 28 },
      field: { id: 'f', name: 'F', type: 'text', width: 100 },
    })
    expect(seen).toBe(measurer)
    expect(seen?.measureWidth('ab', '14px sans-serif')).toBe(18)
  })
})
```

> 先确认 `CellPainter` 构造签名（`new CellPainter(theme, options)`）与 `Canvas2DCellRenderParams` 是否已有 `measurer`——按实际签名调整测试。

- [ ] **Step 3: 跑确认红**

Run: `bun test packages/canvas2d/tests/painters/CellPainter.measurer.test.ts`
Expected: FAIL（`params.measurer` undefined / 类型不存在）。

- [ ] **Step 4: 加 `measurer` 字段 + 透传**

`CellPainter.ts`——在 `Canvas2DCellRenderParams` interface 内（紧挨 `theme`）加：

```ts
  /** Phase C — wrap 量度器（CellPainter 注入）；供 custom renderer 复用 paintStyledText wrap。 */
  readonly measurer?: TextMeasurer
```

确认顶部 `import type { ..., TextMeasurer, ... } from '@novasheet/core'` 已含 `TextMeasurer`（CellPainter 已用，应已 import）。

在 `custom.paint(ctx, { ...params, theme: this.theme })` 调用处改为：

```ts
      custom.paint(ctx, { ...params, theme: this.theme, measurer: this.measurer })
```

（`getActionZones` 调用处若也构造同款 params，一并加 `measurer: this.measurer` 保持一致。）

- [ ] **Step 5: 跑确认绿 + canvas2d 回归**

```bash
bun test packages/canvas2d/tests/painters/CellPainter.measurer.test.ts
bun test packages/canvas2d/
```
Expected: 新用例 PASS；canvas2d 全绿（新增可选字段零回归）。

- [ ] **Step 6: Commit**

```bash
git add packages/canvas2d/src/painters/CellPainter.ts packages/canvas2d/tests/painters/CellPainter.measurer.test.ts
git commit -m "feat(canvas2d): measurer 透传 Canvas2DCellRenderParams（custom renderer wrap 复用）

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: `richTextRenderer` — 切段 + `paintStyledText`

**Files:**
- Create: `packages/cell-kit/src/rich-text/segments.ts`
- Create: `packages/cell-kit/src/rich-text/richTextRenderer.ts`
- Test: `packages/cell-kit/tests/rich-text/segments.test.ts`
- Test: `packages/cell-kit/tests/rich-text/richTextRenderer.test.ts`

- [ ] **Step 1: 写 segments 失败测试**

`packages/cell-kit/tests/rich-text/segments.test.ts`：

```ts
import { describe, expect, it } from 'bun:test'
import { splitIntoSegments, type CellTextDefault } from '../../src/rich-text/segments'
import type { RichTextValue } from '../../src/rich-text/types'

const def: CellTextDefault = { fontSize: 12, fontFamily: 'Arial', color: '#000' }

describe('splitIntoSegments', () => {
  it('no runs → single default segment', () => {
    expect(splitIntoSegments('hello', [], def)).toEqual([
      { text: 'hello', font: '12px Arial', fontSize: 12, color: '#000', underline: false, strikethrough: false },
    ])
  })

  it('run in middle → 3 segments (gap, run, gap) with merged attrs', () => {
    const runs: RichTextValue = [{ start: 2, end: 4, attrs: { bold: true, color: '#f00' } }]
    const segs = splitIntoSegments('abcdef', runs, def)
    expect(segs.map((s) => s.text)).toEqual(['ab', 'cd', 'ef'])
    expect(segs[1]?.font).toBe('bold 12px Arial')
    expect(segs[1]?.color).toBe('#f00')
    expect(segs[0]?.color).toBe('#000')
  })

  it('run attrs override fontSize/family/italic into font string', () => {
    const runs: RichTextValue = [{ start: 0, end: 2, attrs: { italic: true, bold: true, fontSize: 20, fontFamily: 'Times' } }]
    const segs = splitIntoSegments('ab', runs, def)
    expect(segs[0]?.font).toBe('italic bold 20px Times')
    expect(segs[0]?.fontSize).toBe(20)
  })

  it('run carries underline/strikethrough flags', () => {
    const runs: RichTextValue = [{ start: 0, end: 1, attrs: { underline: true, strikethrough: true } }]
    const segs = splitIntoSegments('a', runs, def)
    expect(segs[0]?.underline).toBe(true)
    expect(segs[0]?.strikethrough).toBe(true)
  })
})
```

- [ ] **Step 2: 跑确认红 + 实现 segments.ts**

Run: `bun test packages/cell-kit/tests/rich-text/segments.test.ts` → FAIL（模块不存在）。

`packages/cell-kit/src/rich-text/segments.ts`：

```ts
import type { StyledSegment } from '@novasheet/canvas2d'
import type { RichTextValue, TextRunAttrs } from './types'

/** cell 默认 typography（来自 theme），run 缺省字段继承它。 */
export interface CellTextDefault {
  readonly fontSize: number
  readonly fontFamily: string
  readonly color: string
}

/**
 * 把 text 按 normalized runs 切成 StyledSegment[]：run 覆盖区 = default ⊕ attrs，gap = default。
 * runs 须已 normalize（升序、不重叠）。
 */
export function splitIntoSegments(
  text: string,
  runs: RichTextValue,
  def: CellTextDefault,
): StyledSegment[] {
  if (text.length === 0) return []
  const segments: StyledSegment[] = []
  let cursor = 0
  for (const run of runs) {
    if (run.start > cursor) segments.push(makeSegment(text.slice(cursor, run.start), {}, def))
    segments.push(makeSegment(text.slice(run.start, run.end), run.attrs, def))
    cursor = run.end
  }
  if (cursor < text.length) segments.push(makeSegment(text.slice(cursor), {}, def))
  return segments
}

function makeSegment(text: string, attrs: TextRunAttrs, def: CellTextDefault): StyledSegment {
  const fontSize = attrs.fontSize ?? def.fontSize
  const fontFamily = attrs.fontFamily ?? def.fontFamily
  const parts: string[] = []
  if (attrs.italic) parts.push('italic')
  if (attrs.bold) parts.push('bold')
  parts.push(`${fontSize}px`, fontFamily)
  return {
    text,
    font: parts.join(' '),
    fontSize,
    color: attrs.color ?? def.color,
    underline: attrs.underline ?? false,
    strikethrough: attrs.strikethrough ?? false,
  }
}
```

跑确认绿：`bun test packages/cell-kit/tests/rich-text/segments.test.ts`（4 用例）。

- [ ] **Step 3: 写 renderer 失败测试**

`packages/cell-kit/tests/rich-text/richTextRenderer.test.ts`：

```ts
import { describe, expect, it } from 'bun:test'
import { richTextRenderer } from '../../src/rich-text/richTextRenderer'
import { denseGridTheme, type TextMeasurer } from '@novasheet/core'
import type { Canvas2DCellRenderParams } from '@novasheet/canvas2d'
import type { RichTextValue } from '../../src/rich-text/types'
import { createRecordingContext } from '../../../canvas2d/tests/helpers/recording-context'

const m7: TextMeasurer = { measureWidth: (t) => t.length * 7 }

function params(over: Partial<Canvas2DCellRenderParams> = {}): Canvas2DCellRenderParams {
  return {
    value: 'abcdef',
    rect: { x: 0, y: 0, width: 200, height: 28 },
    field: { id: 'f', name: 'F', type: 'text', width: 200 },
    theme: denseGridTheme,
    rowIndex: 0,
    colIndex: 0,
    measurer: m7,
    ...over,
  }
}

describe('richTextRenderer', () => {
  it('no attachment → single default segment (plain text)', () => {
    const { ctx, ops } = createRecordingContext()
    richTextRenderer.paint(ctx, params({ getAttachment: () => undefined }))
    const fills = ops.filter((o) => o.op === 'fillText')
    expect(fills.length).toBe(1)
    if (fills[0]?.op === 'fillText') expect(fills[0].args[0]).toBe('abcdef')
  })

  it('with runs → multi-segment styled paint (bold substring switches font)', () => {
    const runs: RichTextValue = [{ start: 2, end: 4, attrs: { bold: true } }]
    const { ctx, ops } = createRecordingContext()
    richTextRenderer.paint(ctx, params({ getAttachment: <T,>() => runs as T }))
    const fills = ops.filter((o) => o.op === 'fillText')
    expect(fills.map((o) => (o.op === 'fillText' ? o.args[0] : ''))).toEqual(['ab', 'cd', 'ef'])
    const fonts = ops.filter((o) => o.op === 'set:font').map((o) => (o.op === 'set:font' ? o.value : ''))
    expect(fonts.some((f) => f.includes('bold'))).toBe(true)
  })

  it('runs ignored when display !== raw string (valueFormat 转换，spec §9)', () => {
    const runs: RichTextValue = [{ start: 0, end: 2, attrs: { bold: true } }]
    const { ctx, ops } = createRecordingContext()
    richTextRenderer.paint(ctx, params({
      value: 1234,
      getAttachment: <T,>() => runs as T,
      formatCell: () => '$1,234',   // 转换后显示串 ≠ String(value)
    }))
    const fills = ops.filter((o) => o.op === 'fillText')
    // 单段：忽略 runs，画格式化后的 '$1,234'
    expect(fills.length).toBe(1)
    if (fills[0]?.op === 'fillText') expect(fills[0].args[0]).toBe('$1,234')
  })
})
```

> renderer 测试复用 canvas2d 的 `recording-context` helper（相对路径 import）；cell-kit 测试可跨包读 canvas2d 测试 helper（devDeps 已含 canvas2d 源）。若跨包相对 import 触发 lint/typecheck 问题，改为在 cell-kit 内建最小 recording stub（仅记录 `fillText`/`set:font` ops）。

- [ ] **Step 4: 跑确认红**

Run: `bun test packages/cell-kit/tests/rich-text/richTextRenderer.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 5: 实现 richTextRenderer.ts**

`packages/cell-kit/src/rich-text/richTextRenderer.ts`：

```ts
import type { Canvas2DCellRenderer } from '@novasheet/canvas2d'
import { paintStyledText } from '@novasheet/canvas2d'
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

    const align = theme.cell.textAlignByType[field.type] ?? theme.cell.textAlignByType.text
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
```

> 确认 `paintStyledText`/`StyledSegment`/`Canvas2DCellRenderParams` 均从 `@novasheet/canvas2d` 公开导出（Phase B Task 7 + 既有）。确认 `theme.cell.textAlignByType` 字段名（`grep -n "textAlignByType" packages/core/src/kernel/theme/Theme.ts`）。`align` 取值是 `CanvasTextAlign`——若 theme 存的是 `'left'|'right'|'center'` 字符串，直接可用。

- [ ] **Step 6: 跑确认绿**

Run: `bun test packages/cell-kit/tests/rich-text/richTextRenderer.test.ts`
Expected: PASS（3 用例）。

- [ ] **Step 7: Commit**

```bash
git add packages/cell-kit/src/rich-text/segments.ts packages/cell-kit/src/rich-text/richTextRenderer.ts packages/cell-kit/tests/rich-text/segments.test.ts packages/cell-kit/tests/rich-text/richTextRenderer.test.ts
git commit -m "feat(cell-kit): richTextRenderer 读 runs 切段 → paintStyledText（valueFormat×runs 门）

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 6: `richTextExtension`（display 半）+ 包导出 + 全量 gates

**Files:**
- Create: `packages/cell-kit/src/rich-text/index.ts`
- Modify: `packages/cell-kit/src/index.ts`
- Test: `packages/cell-kit/tests/rich-text/richTextExtension.test.ts`

- [ ] **Step 1: 写失败测试**

`packages/cell-kit/tests/rich-text/richTextExtension.test.ts`：

```ts
import { describe, expect, it } from 'bun:test'
import { richTextExtension } from '../../src/rich-text'

describe('richTextExtension (display half)', () => {
  it('exposes codec (namespace richText) + renderer', () => {
    expect(richTextExtension.codec.namespace).toBe('richText')
    expect(typeof richTextExtension.renderer.paint).toBe('function')
  })
})
```

- [ ] **Step 2: 跑确认红 + 实现 index**

Run: `bun test packages/cell-kit/tests/rich-text/richTextExtension.test.ts` → FAIL。

`packages/cell-kit/src/rich-text/index.ts`：

```ts
import { richTextCodec } from './richTextCodec'
import { richTextRenderer } from './richTextRenderer'

export { richTextCodec } from './richTextCodec'
export { richTextRenderer } from './richTextRenderer'
export { normalize } from './normalize'
export { splitIntoSegments } from './segments'
export type { CellTextDefault } from './segments'
export type { TextRun, TextRunAttrs, RichTextValue } from './types'

/**
 * rich-text 扩展装配（display 半）：core 轴 codec + canvas2d renderer。
 * editor（react）在 Phase C-edit 补入同一对象。组合根分发给各注册点（spec §4.3）。
 */
export const richTextExtension = {
  codec: richTextCodec,
  renderer: richTextRenderer,
} as const
```

`packages/cell-kit/src/index.ts`（替换占位）：

```ts
export * from './rich-text'
```

跑确认绿：`bun test packages/cell-kit/tests/rich-text/richTextExtension.test.ts`。

- [ ] **Step 3: 全量四门**

```bash
bun test
bun run --filter '*' typecheck
bun run lint
bun run --filter @novasheet/core build && bun run --filter @novasheet/canvas2d build && bun run --filter @novasheet/cell-kit build
grep -rn "TextRun\|fontWeight\|strikethrough" packages/core/src/   # 须空（core 零 rich-text 语义）
bun run lint:cellkit-boundary    # exit 0
```
Expected: 四门全过；core grep 空；boundary exit 0。

> `lint` 现含 `oxlint packages`——cell-kit 新增源会被扫，确保 0 warning。

- [ ] **Step 4: Commit**

```bash
git add packages/cell-kit/src/index.ts packages/cell-kit/src/rich-text/index.ts packages/cell-kit/tests/rich-text/richTextExtension.test.ts
git commit -m "feat(cell-kit): richTextExtension display 半装配（codec+renderer）+ 包根导出

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

- [ ] **Step 5: 里程碑收尾**

dispatch code-reviewer（即便全绿，CLAUDE.md 要求）。更新路线图 §1.2/§1.4/§1.6 勾选 ☑（types/normalize/codec/renderer/包脚手架/boundary lint），§4 标 C-display ship。

---

## Self-Review（plan 对 spec §4/§6/§7/§9 + roadmap §4）

**Spec 覆盖:**
- §4.1/§4.2 包拓扑 + 依赖（leaf consumer）→ Task 1。✓（react peer 延 C-edit，本 plan 无 .tsx）
- §4.4 boundary lint（禁反向依赖）→ Task 1 check 脚本 + 根 lint 串接。✓
- §6 数据模型 + normalize（升序/不重叠/相邻合并/代理对）→ Task 2。✓
- §5.1 codec serialize/deserialize → Task 3。✓
- §7.2 renderer 读 runs 切段 + cellDefault ⊕ run.attrs → Task 5。✓
- §9 valueFormat×runs 门（runs 仅 display=raw string 生效）→ Task 5 Step 3 用例 + 实现。✓（roadmap §1.4 此门落点本就标 C richTextRenderer）
- §4.3 richTextExtension 协调集合 → Task 6（display 半 codec+renderer；editor 延 C-edit）。✓

**roadmap §4 C1–C4 映射:**
- C1 包脚手架 + boundary lint → Task 1。✓
- C2 TextRun/normalize → Task 2。✓
- C3 richTextCodec → Task 3。✓
- C4 richTextRenderer → Task 4（measurer 缝补）+ Task 5（renderer）。✓
- C5–C9（editor/toolbar/选区加粗/装配/BDD + D1 fill + D2 clipboard）→ **Phase C-edit**（另 plan）。

**dogfood 缝缺口（新发现，已纳入本 plan）:** custom renderer 拿不到 `measurer` → Task 4 透传。这正是 spec §4 dogfood 设计意图（第一方拼不出 = 缝有缺口，立即补缝，不走私有通道）。

**Placeholder 扫描:** 无 TBD；每步含完整代码或精确 grep/命令。Task 4/5 的 grep 是「定位既有约定」（textAlignByType/measurer 注入点），非占位。

**类型一致性:** `TextRun`/`TextRunAttrs`/`RichTextValue`/`CellTextDefault`/`splitIntoSegments`/`normalize`/`richTextCodec`/`richTextRenderer`/`richTextExtension` 跨 Task 命名统一；`StyledSegment`（canvas2d，含 Phase B 的 `fontSize` 数值）被 `splitIntoSegments` 产出，字段对齐。

**plan-risk 已标:** Task 2 代理对 snap 方向（STOP+ASK）；Task 5 valueFormat×runs 判据（STOP+ASK）。

**无 BDD MD 理由:** 本 plan 全是纯函数（normalize/codec/segments）+ L4 渲染（renderer op-log），按方法论纯 TDD。Excel L3 场景须 C-edit 的 editor 才可观测，留 C-edit BDD gate。
