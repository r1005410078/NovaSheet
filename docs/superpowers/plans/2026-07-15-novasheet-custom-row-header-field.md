# NovaSheet Custom Row Header Field Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Excel 模式通过 `rowHeaderField` 从每行数据读取最左侧行头标签，并在缺失或不支持值时保持现有 1-based 序号。

**Architecture:** `GridEngineOptions` 保存字段选择器并随 `RenderFrame` 下发；Canvas2DRenderer 只从 frame 的 view `DataSource` 读取标签值，RowHeaderPainter 负责文本转换和回退。React 适配层显式转发该构造期选项，避免未知 prop 落到宿主 DOM。

**Tech Stack:** TypeScript 6、React 18、Canvas2D、`bun:test`、`RecordingContext2D`、NovaSheet MBD 场景工具。

**Design:** `docs/superpowers/specs/2026-07-15-novasheet-custom-row-header-field-design.md`

**Method:** `docs/superpowers/specs/2026-06-10-novasheet-bdd-tdd-method-design.md`

---

## File Map

| File | Responsibility |
| --- | --- |
| `packages/react/tests/excel/scenarios/L3a-custom-row-header-field.md` | Excel L3a 用户可观测契约 |
| `packages/react/tests/excel/scenarios.manifest.json` | MBD 生成的场景清单 |
| `packages/react/tests/excel/SCENARIOS.md` | MBD 生成的可读场景清单 |
| `packages/react/tests/excel/NovaExcel.test.ts` | React 真实挂载外环：标签绘制 + DOM prop 不泄漏 |
| `packages/core/src/engine/GridEngine.ts` | 公开 `GridEngineOptions.rowHeaderField` 类型 |
| `packages/core/src/Grid.ts` | `GridOptions` 到 engine options 的公开门面转发 |
| `packages/core/src/kernel/render/RenderFrame.ts` | backend-neutral frame 字段选择器契约 |
| `packages/core/src/engine/FrameAssembler.ts` | 把字段选择器装配进 frame |
| `packages/core/src/engine/DefaultGridEngine.ts` | 保存构造期字段选择器并传给 FrameAssembler |
| `packages/core/tests/engine/DefaultGridEngine.test.ts` | engine frame 默认值与显式值 TDD |
| `packages/core/tests/acceptance/_helpers/fixtures.ts` | recording Grid helper 接收 Excel 行头选项 |
| `packages/core/tests/acceptance/e2e/grid/bdd.test.ts` | `Grid` facade 到 RenderFrame 的 L2 接线回归 |
| `packages/canvas2d/src/painters/RowHeaderPainter.ts` | 标签值转文本、回退和现有行头视觉 |
| `packages/canvas2d/tests/painters/RowHeaderPainter.test.ts` | string/number/缺失/不支持值白盒 TDD |
| `packages/canvas2d/src/render/Canvas2DRenderer.ts` | 按 view row + field 从 frame.data 解析标签 |
| `packages/canvas2d/tests/render/Canvas2DRenderer.test.ts` | renderer 使用 frame 数据而非构造期/raw 数据 |
| `packages/react/src/features/grid/NovaSheetGrid.ts` | 从 React props 取出选项，避免 DOM 泄漏 |
| `packages/react/src/features/grid/useNovaSheetGrid.ts` | 创建 `Grid` 时转发构造期选项 |

执行期间保留当前工作区中与本功能无关的四个既有修改，不纳入本功能 commit：

- `packages/canvas2d/src/painters/HeaderPainter.ts`
- `packages/canvas2d/tests/painters/HeaderPainter.column-groups.test.ts`
- `packages/core/src/dom/host/DomGridHost.ts`
- `packages/core/tests/dom/host/DomGridHost.test.ts`

### Task 1: 定稿 Excel L3a 行为场景

**Files:**
- Create: `packages/react/tests/excel/scenarios/L3a-custom-row-header-field.md`
- Modify (generated): `packages/react/tests/excel/scenarios.manifest.json`
- Modify (generated): `packages/react/tests/excel/SCENARIOS.md`

- [ ] **Step 1: 创建 draft 场景**

```md
---
id: excel.L3a.custom-row-header-field
layer: L3a
summary: Excel 行头从数据字段显示自定义标签
tags: [excel, row-header]
status: draft
---

## User Story

作为业务表格使用者，当每行数据包含设备编码时，我希望 Excel 最左侧行头显示该编码，以便排序、筛选或移动行后仍能识别对应业务记录。

## Given

- `NovaExcel` 接收包含 `deviceCode` 附加字段的数据
- `rowHeaderField="deviceCode"`
- `deviceCode` 不在 `schema.fields` 中

## When

- 组件挂载并完成首帧绘制

## Then

- 左侧行头显示 `设备-001` 和 `设备-002`
- `rowHeaderField` 不落到宿主 grid DOM attribute
```

- [ ] **Step 2: 校验场景格式**

Run:

```bash
bun run --filter @novasheet/react lint:mbd
```

Expected: `mbd validate` reports all React scenarios valid.

- [ ] **Step 3: 生成 manifest 与 SCENARIOS**

Run:

```bash
bun run --filter @novasheet/react manifest:mbd
```

Expected: command rewrites `packages/react/tests/excel/scenarios.manifest.json` and `packages/react/tests/excel/SCENARIOS.md`, both containing `excel.L3a.custom-row-header-field` with `status: draft`.

- [ ] **Step 4: 检查生成结果**

Run:

```bash
rg -n "excel.L3a.custom-row-header-field|Excel 行头从数据字段" packages/react/tests/excel/scenarios.manifest.json packages/react/tests/excel/SCENARIOS.md
```

Expected: both generated artifacts contain the new scenario exactly once.

- [ ] **Step 5: 提交场景契约**

```bash
git add packages/react/tests/excel/scenarios/L3a-custom-row-header-field.md packages/react/tests/excel/scenarios.manifest.json packages/react/tests/excel/SCENARIOS.md
git commit -m "test(react): 定义自定义行头字段场景"
```

### Task 2: 建立 Excel L3a 外环红灯

**Files:**
- Modify: `packages/react/tests/excel/NovaExcel.test.ts`

- [ ] **Step 1: 引入 RecordingContext helper**

在 import 区加入：

```ts
import { createRecordingContext } from '../../../canvas2d/tests/helpers/recording-context'
```

- [ ] **Step 2: 写真实挂载失败测试**

在 `describe('NovaExcel L3a shell', ...)` 中加入：

```ts
it('excel.L3a.custom-row-header-field paints labels from row data without leaking the prop to DOM', async () => {
  const originalGetContext = HTMLCanvasElement.prototype.getContext
  const recordings: ReturnType<typeof createRecordingContext>[] = []
  HTMLCanvasElement.prototype.getContext = function getContext(type: string) {
    if (type !== '2d') return null
    const recording = createRecordingContext(this.width || 800, this.height || 600)
    recordings.push(recording)
    return recording.ctx as never
  } as never

  const data = new InMemoryDataSource({
    schema: {
      fields: [{ id: 'name', name: '名称', type: 'text', width: 180 }],
    },
    rows: [
      { deviceCode: '设备-001', name: '电池组 A' },
      { deviceCode: '设备-002', name: '电池组 B' },
    ],
  })

  let mounted: Awaited<ReturnType<typeof mountNovaExcel>> | undefined
  try {
    mounted = await mountNovaExcel({
      data,
      excelWorkspace: false,
      rowHeaderField: 'deviceCode',
      showToolbar: false,
    })
    mounted.ref.current!.refresh()
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

    const texts = recordings.flatMap(({ ops }) =>
      ops
        .filter((op) => op.op === 'fillText')
        .map((op) => (op.op === 'fillText' ? op.args[0] : '')),
    )
    expect(texts).toContain('设备-001')
    expect(texts).toContain('设备-002')

    const gridRoot = mounted.container.querySelector('[data-novasheet-react-grid]')!
    expect(gridRoot.hasAttribute('rowHeaderField')).toBe(false)
  } finally {
    mounted?.unmount()
    HTMLCanvasElement.prototype.getContext = originalGetContext
  }
})
```

- [ ] **Step 3: 运行测试确认外环为红**

Run:

```bash
bun test packages/react/tests/excel/NovaExcel.test.ts -t "excel.L3a.custom-row-header-field"
```

Expected: FAIL because `设备-001` / `设备-002` are absent; before React wiring is added, `rowHeaderField` may also appear as an unknown host attribute.

- [ ] **Step 4: 保留红测供后续任务转绿**

Do not commit this failing test alone. Keep it in the working tree; Task 6 commits it together with the React wiring after the Core and Canvas inner loops are green.

### Task 3: Core 将 rowHeaderField 下发到 RenderFrame

**Files:**
- Modify: `packages/core/src/engine/GridEngine.ts`
- Modify: `packages/core/src/Grid.ts`
- Modify: `packages/core/src/kernel/render/RenderFrame.ts`
- Modify: `packages/core/src/engine/FrameAssembler.ts`
- Modify: `packages/core/src/engine/DefaultGridEngine.ts`
- Modify: `packages/core/tests/engine/DefaultGridEngine.test.ts`
- Modify: `packages/core/tests/acceptance/_helpers/fixtures.ts`
- Modify: `packages/core/tests/acceptance/e2e/grid/bdd.test.ts`

- [ ] **Step 1: 写 engine frame 失败测试**

在 `packages/core/tests/engine/DefaultGridEngine.test.ts` 的默认引擎 describe 中加入：

```ts
it('把 rowHeaderField 放进 RenderFrame，缺省时保持 undefined', () => {
  const custom = new DefaultGridEngine({
    data: makeData(2),
    excelHeaders: true,
    rowHeaderField: 'deviceCode',
  })
  const defaults = new DefaultGridEngine({ data: makeData(2), excelHeaders: true })

  expect(custom.getFrame().rowHeaderField).toBe('deviceCode')
  expect(defaults.getFrame().rowHeaderField).toBeUndefined()
})
```

- [ ] **Step 2: 写 Grid facade 失败测试**

先扩展 `mountRecordingGrid` 的 options 类型与构造参数：

```ts
excelHeaders?: boolean
rowHeaderField?: string
```

把这两个属性加在现有 `data?: InMemoryDataSource` 后；其余 callback/registry 属性不改。

在 `new Grid(container, ...)` 的 `backend` 后加入：

```ts
excelHeaders: options.excelHeaders,
rowHeaderField: options.rowHeaderField,
```

在 `packages/core/tests/acceptance/e2e/grid/bdd.test.ts` 的 Grid facade describe 中加入：

```ts
it('Grid facade 把自定义行头字段转发到 RenderFrame', () =>
  withManualRaf((flushRaf) => {
    const { container, grid, recorder } = mountRecordingGrid({
      excelHeaders: true,
      rowHeaderField: 'deviceCode',
    })

    grid.refresh()
    flushRaf()

    expect(lastFrame(recorder).rowHeaderField).toBe('deviceCode')

    grid.destroy()
    document.body.removeChild(container)
  }))
```

- [ ] **Step 3: 运行 Core 红测**

Run:

```bash
bun test packages/core/tests/engine/DefaultGridEngine.test.ts packages/core/tests/acceptance/e2e/grid/bdd.test.ts
```

Expected: Type/runtime failure because `rowHeaderField` is not yet declared on options or `RenderFrame`.

- [ ] **Step 4: 增加 Core 类型契约**

在 `GridEngineOptions` 中加入：

```ts
/** Excel 行头标签来源字段；缺省或值不可显示时使用 1-based 序号。 */
readonly rowHeaderField?: string
```

在 `RenderFrame` 中加入：

```ts
/** Excel 行头标签来源字段；renderer 按 view row 从 frame.data 读取。 */
readonly rowHeaderField?: string
```

在 `FrameAssemblerInput` 中加入：

```ts
readonly rowHeaderField?: string
```

并在 `assembleRenderFrame()` 返回对象中加入：

```ts
rowHeaderField: input.rowHeaderField,
```

- [ ] **Step 5: 在 DefaultGridEngine 保存并装配字段**

与 `excelHeaders` 构造期字段放在一起：

```ts
private readonly rowHeaderField: string | undefined
```

构造函数中赋值：

```ts
this.rowHeaderField = options.rowHeaderField
```

`getFrame()` 调 `assembleRenderFrame()` 时加入：

```ts
rowHeaderField: this.rowHeaderField,
```

- [ ] **Step 6: 从 Grid facade 转发到 engine options**

在 `Grid` 构造函数的 `engineOptions` 中加入：

```ts
rowHeaderField: options.rowHeaderField,
```

- [ ] **Step 7: 运行 Core 定向测试与 typecheck**

Run:

```bash
bun test packages/core/tests/engine/DefaultGridEngine.test.ts packages/core/tests/acceptance/e2e/grid/bdd.test.ts
bun run --filter @novasheet/core typecheck
```

Expected: both commands PASS.

- [ ] **Step 8: 提交 Core frame vertical slice**

```bash
git add packages/core/src/engine/GridEngine.ts packages/core/src/Grid.ts packages/core/src/kernel/render/RenderFrame.ts packages/core/src/engine/FrameAssembler.ts packages/core/src/engine/DefaultGridEngine.ts packages/core/tests/engine/DefaultGridEngine.test.ts packages/core/tests/acceptance/_helpers/fixtures.ts packages/core/tests/acceptance/e2e/grid/bdd.test.ts
git commit -m "feat(core): 下发自定义行头字段到渲染帧"
```

### Task 4: RowHeaderPainter 解析标签并回退序号

**Files:**
- Modify: `packages/canvas2d/src/painters/RowHeaderPainter.ts`
- Modify: `packages/canvas2d/tests/painters/RowHeaderPainter.test.ts`

- [ ] **Step 1: 写 string 与 number 标签失败测试**

在 `RowHeaderPainter.test.ts` 中加入：

```ts
it('优先绘制调用方提供的 string 与有限 number 行头标签', () => {
  const { ctx, ops } = createRecordingContext(240, 200)
  const rowsAxis = new ChunkedAxis({ count: 3, defaultSize: 28 })
  const labels = ['设备-001', 2002, '设备-003'] as const

  new RowHeaderPainter(denseGridTheme).paint(ctx, {
    rowsAxis,
    rowRange: [0, 2],
    rect: { x: 0, y: 32, width: 80, height: 120 },
    scrollOffsetY: 0,
    resolveLabel: (rowIndex) => labels[rowIndex],
  })

  const texts = ops
    .filter((op) => op.op === 'fillText')
    .map((op) => (op.op === 'fillText' ? op.args[0] : ''))
  expect(texts).toEqual(['设备-001', '2002', '设备-003'])
})
```

- [ ] **Step 2: 写缺失和不支持值回退失败测试**

```ts
it('缺失或不支持的标签值回退 1-based 行号，空字符串保持有效', () => {
  const { ctx, ops } = createRecordingContext(240, 320)
  const rowsAxis = new ChunkedAxis({ count: 8, defaultSize: 28 })
  const labels = [
    undefined,
    null,
    true,
    ['x'],
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    '',
  ] as const

  new RowHeaderPainter(denseGridTheme).paint(ctx, {
    rowsAxis,
    rowRange: [0, 7],
    rect: { x: 0, y: 32, width: 80, height: 240 },
    scrollOffsetY: 0,
    resolveLabel: (rowIndex) => labels[rowIndex],
  })

  const texts = ops
    .filter((op) => op.op === 'fillText')
    .map((op) => (op.op === 'fillText' ? op.args[0] : ''))
  expect(texts).toEqual(['1', '2', '3', '4', '5', '6', '7', ''])
})
```

- [ ] **Step 3: 运行 Painter 红测**

Run:

```bash
bun test packages/canvas2d/tests/painters/RowHeaderPainter.test.ts
```

Expected: FAIL because `RowHeaderPaintParams.resolveLabel` does not exist and the painter still always renders `r + 1`.

- [ ] **Step 4: 增加 backend-neutral 值解析入口**

更新 type import：

```ts
import type { Axis, CellValue, Theme } from '@novasheet/core'
```

在 `RowHeaderPaintParams` 中加入：

```ts
readonly resolveLabel?: (rowIndex: number) => CellValue | undefined
```

在 painter 类中加入：

```ts
private resolveText(rowIndex: number, resolveLabel: RowHeaderPaintParams['resolveLabel']): string {
  const value = resolveLabel?.(rowIndex)
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return String(rowIndex + 1)
}
```

把循环中的固定文本：

```ts
ctx.fillText(String(r + 1), rect.x + rect.width / 2, y)
```

替换为：

```ts
ctx.fillText(this.resolveText(r, params.resolveLabel), rect.x + rect.width / 2, y)
```

- [ ] **Step 5: 运行 Painter 测试与 Canvas typecheck**

Run:

```bash
bun test packages/canvas2d/tests/painters/RowHeaderPainter.test.ts packages/canvas2d/tests/painters/painter-oplog-golden.test.ts
bun run --filter @novasheet/canvas2d typecheck
```

Expected: both commands PASS; the existing default row-number golden remains unchanged.

- [ ] **Step 6: 提交 Painter inner loop**

```bash
git add packages/canvas2d/src/painters/RowHeaderPainter.ts packages/canvas2d/tests/painters/RowHeaderPainter.test.ts
git commit -m "feat(canvas2d): 支持自定义行头标签文本"
```

### Task 5: Canvas2DRenderer 从 frame view data 读取标签

**Files:**
- Modify: `packages/canvas2d/src/render/Canvas2DRenderer.ts`
- Modify: `packages/canvas2d/tests/render/Canvas2DRenderer.test.ts`

- [ ] **Step 1: 写 renderer frame 数据失败测试**

在 `Canvas2DRenderer.test.ts` 中加入：

```ts
it('render 按 rowHeaderField 从 frame view data 绘制自定义行头', () => {
  const { renderer, ops, viewport, rowsAxis, colsAxis } = setup()
  const viewData = new InMemoryDataSource({
    schema: SCHEMA,
    rows: [
      { deviceCode: '设备-002', name: 'Bob', age: 25 },
      { deviceCode: '设备-001', name: 'Alice', age: 30 },
      { deviceCode: null, name: 'Carol', age: 40 },
    ],
  })
  viewport.setRowHeaderWidth(80)
  ops.length = 0

  renderer.render({
    data: viewData,
    theme: denseGridTheme,
    rowsAxis,
    colsAxis,
    viewport: viewport.snapshot(),
    collapsedRowGaps: [],
    collapsedColGaps: [],
    rowHeaderField: 'deviceCode',
  })

  const texts = ops
    .filter((op) => op.op === 'fillText')
    .map((op) => (op.op === 'fillText' ? op.args[0] : ''))
  expect(texts.filter((text) => text.startsWith('设备-') || text === '3')).toEqual([
    '设备-002',
    '设备-001',
    '3',
  ])
})
```

- [ ] **Step 2: 运行 Renderer 红测**

Run:

```bash
bun test packages/canvas2d/tests/render/Canvas2DRenderer.test.ts -t "rowHeaderField"
```

Expected: FAIL because Canvas2DRenderer does not pass a label resolver to RowHeaderPainter.

- [ ] **Step 3: 让 paintRowHeaders 接收完整 frame**

把 `paintRowHeaders` 签名改为：

```ts
private paintRowHeaders(
  frame: RenderFrame,
  regions: RenderRegion[],
  rowsAxis: Axis,
  snapshot: RenderFrame['viewport'],
  selectedRowRange?: Pick<CellRange, 'startRow' | 'endRow'>,
): void {
```

两个调用点都把 `ctx.frame` 作为首参：

```ts
this.paintRowHeaders(
  ctx.frame,
  regions,
  rowsAxis,
  snapshot,
  this.getSelectedRowHeaderRange(ctx.frame),
)
```

- [ ] **Step 4: 从 frame.data 构造 view label resolver**

在 gutter 校验后加入：

```ts
const rowHeaderField = frame.rowHeaderField
const resolveLabel =
  rowHeaderField === undefined
    ? undefined
    : (viewRowIndex: number) => frame.data.getCell(viewRowIndex, rowHeaderField)
```

向 topRegion 与 main 的两个 `rowHeaderPainter.paint()` 参数都加入：

```ts
resolveLabel,
```

该 resolver 必须读取 `frame.data`，不能读取构造期 `this.data`、raw DataSource 或自行调用 `resolveUnderlyingRow()`。

- [ ] **Step 5: 运行 Canvas 定向回归**

Run:

```bash
bun test packages/canvas2d/tests/render/Canvas2DRenderer.test.ts packages/canvas2d/tests/painters/RowHeaderPainter.test.ts packages/canvas2d/tests/runtime/GridRuntime.selection-overlay.test.ts
bun run --filter @novasheet/canvas2d typecheck
```

Expected: all tests and typecheck PASS; selected row-header repaint also uses the same custom labels.

- [ ] **Step 6: 提交 Renderer inner loop**

```bash
git add packages/canvas2d/src/render/Canvas2DRenderer.ts packages/canvas2d/tests/render/Canvas2DRenderer.test.ts
git commit -m "feat(canvas2d): 从帧数据解析自定义行头"
```

### Task 6: React 转发 rowHeaderField 并让 L3 外环转绿

**Files:**
- Modify: `packages/react/src/features/grid/NovaSheetGrid.ts`
- Modify: `packages/react/src/features/grid/useNovaSheetGrid.ts`
- Modify: `packages/react/tests/excel/NovaExcel.test.ts`
- Modify: `packages/react/tests/excel/scenarios/L3a-custom-row-header-field.md`
- Modify (generated): `packages/react/tests/excel/scenarios.manifest.json`
- Modify (generated): `packages/react/tests/excel/SCENARIOS.md`

- [ ] **Step 1: 在 NovaSheetGrid 截获并传递 prop**

在 `NovaSheetGrid` props 解构中，把 `rowHeaderField` 放在 `excelHeaders` 后：

```ts
rowHeaderField,
```

调用 `useNovaSheetGrid` 时同样在 `excelHeaders` 后加入：

```ts
rowHeaderField,
```

这样该 prop 不会进入 `...domProps`。

- [ ] **Step 2: 在 useNovaSheetGrid 构造 Grid 时转发**

从 options 解构：

```ts
rowHeaderField,
```

在 `new Grid(container, ...)` 中加入：

```ts
rowHeaderField,
```

该选项继续沿用当前构造期配置约定，不加入 effect 或 runtime setter。

- [ ] **Step 3: 运行 L3 外环确认转绿**

Run:

```bash
bun test packages/react/tests/excel/NovaExcel.test.ts -t "excel.L3a.custom-row-header-field"
```

Expected: PASS; RecordingContext contains both device labels and grid root has no `rowHeaderField` attribute.

- [ ] **Step 4: 将场景状态改为 implemented 并重新生成清单**

把场景 frontmatter：

```md
status: draft
```

改为：

```md
status: implemented
```

Run:

```bash
bun run --filter @novasheet/react lint:mbd
bun run --filter @novasheet/react manifest:mbd
bun run --filter @novasheet/react lint:scenario-coverage
```

Expected: all commands PASS and generated artifacts report the scenario as implemented.

- [ ] **Step 5: 运行 React 定向回归与 typecheck**

Run:

```bash
bun test packages/react/tests/excel/NovaExcel.test.ts packages/react/tests/features/grid/NovaSheetGrid.test.ts
bun run --filter @novasheet/react typecheck
```

Expected: both commands PASS.

- [ ] **Step 6: 提交 React vertical slice 与外环测试**

```bash
git add packages/react/src/features/grid/NovaSheetGrid.ts packages/react/src/features/grid/useNovaSheetGrid.ts packages/react/tests/excel/NovaExcel.test.ts packages/react/tests/excel/scenarios/L3a-custom-row-header-field.md packages/react/tests/excel/scenarios.manifest.json packages/react/tests/excel/SCENARIOS.md
git commit -m "feat(react): 转发 Excel 自定义行头字段"
```

### Task 7: 全量验证与代码审查

**Files:**
- Review only; modify only files already in this plan when a verification failure is caused by this feature.

- [ ] **Step 1: 运行功能定向测试**

Run:

```bash
bun test packages/core/tests/engine/DefaultGridEngine.test.ts packages/core/tests/acceptance/e2e/grid/bdd.test.ts packages/canvas2d/tests/painters/RowHeaderPainter.test.ts packages/canvas2d/tests/render/Canvas2DRenderer.test.ts packages/canvas2d/tests/runtime/GridRuntime.selection-overlay.test.ts packages/react/tests/excel/NovaExcel.test.ts packages/react/tests/features/grid/NovaSheetGrid.test.ts
```

Expected: PASS with zero failures.

- [ ] **Step 2: 运行 lint**

Run:

```bash
bun run lint
```

Expected: exit 0 with 0 errors and 0 warnings. If the known unrelated `packages/core/tests/kernel/data/windowed/BlockCache.test.ts` warning remains, report it separately instead of changing that file in this feature.

- [ ] **Step 3: 运行 workspace typecheck**

Run:

```bash
bun run --filter '*' typecheck
```

Expected: PASS. If unrelated workspace dependency/type failures reproduce, preserve their exact package and diagnostic in the handoff; Core, Canvas2D and React package-local typechecks must still pass.

- [ ] **Step 4: 运行全量测试**

Run:

```bash
bun test
```

Expected: PASS with zero failures.

- [ ] **Step 5: 按依赖顺序构建受影响包**

Run:

```bash
bun run --filter @novasheet/core build && bun run --filter @novasheet/canvas2d build && bun run --filter @novasheet/react build
```

Expected: all three builds PASS.

- [ ] **Step 6: 核对提交范围与 diff**

Run:

```bash
git status --short
git diff --check HEAD~5..HEAD
git log -5 --oneline
```

Expected: feature commits only contain files listed in this plan; the four pre-existing unrelated modifications remain unstaged/uncommitted unless the user separately asks to include them.

- [ ] **Step 7: 请求代码审查**

Dispatch a reviewer with these explicit references:

```text
Review implementation against:
- docs/superpowers/specs/2026-07-15-novasheet-custom-row-header-field-design.md
- docs/superpowers/plans/2026-07-15-novasheet-custom-row-header-field.md
- docs/superpowers/specs/2026-06-10-novasheet-bdd-tdd-method-design.md
- packages/react/tests/excel/scenarios/L3a-custom-row-header-field.md

Focus on view/raw coordinate correctness, RenderFrame-only backend reads, React prop leakage,
fallback behavior, selected row-header repaint, and missing regression tests.
Return DONE, DONE_WITH_CONCERNS, BLOCKED, or NEEDS_CONTEXT.
```

Expected: reviewer returns `DONE`; address any Major finding with a new failing test before changing implementation.
