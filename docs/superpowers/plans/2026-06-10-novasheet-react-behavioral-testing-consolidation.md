# React 行为测试巩固 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 巩固现有 21 条 excel 行为测试 harness——修 NovaExcel toolbar 同步产品债、orphan lint fail、去掉测试 hack、瘦身 Storybook 重复测试。

**Architecture:** `composeGridCallback` 包装 Grid mutation 回调并在其后 `syncToolbarState`；测试改回 `insertRows` 真实路径；`check-scenario-coverage` 增加 `--fail-on-orphan` 并由根 lint 启用。

**Tech Stack:** bun:test、happy-dom（core preload）、React 18、`@novasheet/mbd` manifest

**Spec:** `docs/superpowers/specs/2026-06-10-novasheet-react-behavioral-testing-consolidation-design.md`

---

## 文件地图

| 文件 | 职责 |
| --- | --- |
| `packages/react/src/excel/composeGridCallback.ts` | `composeGridCallback` 纯函数 |
| `packages/react/src/excel/NovaExcel.tsx` | 解构 grid 回调 + compose |
| `packages/react/tests/excel/helpers.ts` | 删除 `syncToolbarViaFill` |
| `packages/react/tests/excel/NovaExcel.wiring.test.ts` | undo-redo / selection-sync 去 hack |
| `packages/react/tests/excel/NovaExcel.journeys.test.ts` | undo-button-state / external-on-undo 去 hack |
| `packages/react/scripts/check-scenario-coverage.ts` | `--fail-on-orphan` |
| `packages/react/tests/scripts/check-scenario-coverage.test.ts` | orphan exit code 单测 |
| `packages/react/package.json` | script 转发 fail flags |
| `package.json`（根） | lint 串联 `--fail-on-orphan` |
| `apps/storybook/src/stories/React.stories.test.ts` | 删重复 it |
| `apps/storybook/src/stories/ExcelWorkspace.stories.test.ts` | 补 unmount |
| `packages/react/tests/excel/composeGridCallback.test.ts` | helper 单测（可选，也可并入 excel 行为测） |

---

### Task 1: `composeGridCallback` + NovaExcel 接线

**Files:**
- Create: `packages/react/src/excel/composeGridCallback.ts`
- Create: `packages/react/tests/excel/composeGridCallback.test.ts`
- Modify: `packages/react/src/excel/NovaExcel.tsx`

- [ ] **Step 1: 写失败单测**

```ts
// packages/react/tests/excel/composeGridCallback.test.ts
import { describe, expect, it, mock } from 'bun:test'
import { composeGridCallback } from '../../src/excel/composeGridCallback'

describe('composeGridCallback', () => {
  it('calls user then after hook', () => {
    const user = mock(() => {})
    const after = mock(() => {})
    const composed = composeGridCallback(user, after)

    composed({ at: 0, count: 1, newIds: [0] })

    expect(user).toHaveBeenCalledWith({ at: 0, count: 1, newIds: [0] })
    expect(after).toHaveBeenCalledTimes(1)
  })

  it('runs after hook when user is undefined', () => {
    const after = mock(() => {})
    const composed = composeGridCallback(undefined, after)

    composed()

    expect(after).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: 运行确认失败**

```bash
bun test packages/react/tests/excel/composeGridCallback.test.ts
```

Expected: FAIL（module not found）

- [ ] **Step 3: 实现 helper**

```ts
// packages/react/src/excel/composeGridCallback.ts
/** Invoke optional user callback, then always run after-hook (e.g. toolbar sync). */
export function composeGridCallback<T extends (...args: never[]) => void>(
  user: T | undefined,
  after: () => void,
): T {
  return ((...args: Parameters<T>) => {
    user?.(...args)
    after()
  }) as T
}
```

- [ ] **Step 4: 修改 NovaExcel.tsx**

从 props 解构（在 `...gridProps` 之前或从 gridProps 解构）：

```ts
const {
  className,
  // ...existing...
  onSelectionChange,
  onUndo,
  onRedo,
  data,
  onCopy,
  onCut,
  onPaste,
  onFill,
  onRowsInserted,
  onRowsDeleted,
  onColumnsInserted,
  onColumnsDeleted,
  ...gridProps
} = props

const syncIfToolbar = showToolbar ? syncToolbarState : () => {}
```

`NovaSheetGrid` 上传：

```tsx
<NovaSheetGrid
  {...gridProps}
  onCopy={onCopy}
  onCut={composeGridCallback(onCut, syncIfToolbar)}
  onPaste={composeGridCallback(onPaste, syncIfToolbar)}
  onFill={composeGridCallback(onFill, syncIfToolbar)}
  onRowsInserted={composeGridCallback(onRowsInserted, syncIfToolbar)}
  onRowsDeleted={composeGridCallback(onRowsDeleted, syncIfToolbar)}
  onColumnsInserted={composeGridCallback(onColumnsInserted, syncIfToolbar)}
  onColumnsDeleted={composeGridCallback(onColumnsDeleted, syncIfToolbar)}
  onSelectionChange={(selection) => {
    onSelectionChange?.(selection)
    syncIfToolbar()
  }}
  onUndo={(event) => {
    onUndo?.(event)
    syncIfToolbar()
  }}
  onRedo={(event) => {
    onRedo?.(event)
    syncIfToolbar()
  }}
  // ...rest unchanged
/>
```

- [ ] **Step 5: 运行单测绿**

```bash
bun test packages/react/tests/excel/composeGridCallback.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add packages/react/src/excel/composeGridCallback.ts packages/react/src/excel/NovaExcel.tsx packages/react/tests/excel/composeGridCallback.test.ts
git commit -m "fix(react): Grid mutation 回调后同步 toolbar 状态"
```

---

### Task 2: 删除 `syncToolbarViaFill`，改行为测试

**Files:**
- Modify: `packages/react/tests/excel/helpers.ts`
- Modify: `packages/react/tests/excel/NovaExcel.wiring.test.ts`
- Modify: `packages/react/tests/excel/NovaExcel.journeys.test.ts`

- [ ] **Step 1: 改 `excel.L3c.undo-button-state` 为 insertRows 路径（应先红若未做 Task 1）**

`NovaExcel.journeys.test.ts`：

```ts
it('excel.L3c.undo-button-state toggles undo disabled after undo stack changes', async () => {
  const ref = React.createRef<NovaExcelRef>()
  const { container, unmount } = mountNovaExcel({ data: createDenseData(), ref })

  const undoButton = () =>
    container.querySelector<HTMLButtonElement>('[data-action-id="undo"]')

  expect(undoButton()?.disabled).toBe(true)

  ref.current!.grid.insertRows(0, 1)
  await flushGridSelectionEffects()

  expect(undoButton()?.disabled).toBe(false)

  undoButton()!.click()
  await flushGridSelectionEffects()
  expect(undoButton()?.disabled).toBe(true)

  unmount()
})
```

- [ ] **Step 2: 改 `excel.L3b.undo-redo` — 去掉 syncToolbarViaFill**

```ts
ref.current!.grid.insertRows(0, 1)
ref.current!.grid.insertRows(0, 1)
await flushGridSelectionEffects()
```

- [ ] **Step 3: 改 `excel.L3c.external-on-undo-on-redo` — 同上**

- [ ] **Step 4: `selection-sync` 保留 fill 点击（测 toolbar 格式态），仅确保 import 无 syncToolbarViaFill**

- [ ] **Step 5: 从 helpers.ts 删除 `syncToolbarViaFill` 及无用 import**

- [ ] **Step 6: 运行 excel 测试**

```bash
bun test packages/react/tests/excel
```

Expected: 全部 PASS

- [ ] **Step 7: Commit**

```bash
git add packages/react/tests/excel/
git commit -m "test(react): 用 insertRows 替代 syncToolbarViaFill 测 toolbar undo 态"
```

---

### Task 3: `--fail-on-orphan` 门禁

**Files:**
- Modify: `packages/react/scripts/check-scenario-coverage.ts`
- Modify: `packages/react/tests/scripts/check-scenario-coverage.test.ts`
- Modify: `packages/react/package.json`
- Modify: `package.json`（根）

- [ ] **Step 1: 写失败单测**

```ts
it('returns exit code 1 when failOnOrphans and orphan ids exist', async () => {
  const code = await runScenarioCoverageCheck({
    manifestPath: '...', // use inline manifest via temp or mock readManifest — 实现期可 spy readManifest
    testRoots: ['...'],
    failOnOrphans: true,
  })
  expect(code).toBe(1)
})
```

实现期更简单做法：直接测 `runScenarioCoverageCheck` 传入内存 manifest 路径指向 fixture，或导出内部函数单独测 exit 逻辑：

```ts
// 在 check-scenario-coverage.test.ts 增加：
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

it('exits 1 on orphan when failOnOrphans', async () => {
  const dir = join(tmpdir(), `scenario-cov-${Date.now()}`)
  mkdirSync(dir, { recursive: true })
  const manifestPath = join(dir, 'manifest.json')
  writeFileSync(manifestPath, JSON.stringify(manifest))
  const testDir = join(dir, 'tests')
  mkdirSync(testDir)
  writeFileSync(
    join(testDir, 'orphan.test.ts'),
    `it('excel.L3z.orphan-case demo', () => {})`,
  )
  const code = await runScenarioCoverageCheck({
    manifestPath,
    testRoots: [testDir],
    failOnOrphans: true,
  })
  expect(code).toBe(1)
})
```

- [ ] **Step 2: 实现 `failOnOrphans`**

`ScenarioCoverageOptions` 增加 `failOnOrphans?: boolean`。

`runScenarioCoverageCheck` 末尾：

```ts
if (options.failOnOrphans === true && report.orphan.length > 0) {
  console.error(`${report.orphan.length} orphan scenario id(s) in tests`)
  return 1
}
return options.failOnMissing === true && report.missing.length > 0 ? 1 : 0
```

CLI `main` 块：

```ts
const failOnOrphans = process.argv.includes('--fail-on-orphan')
```

- [ ] **Step 3: 更新 package.json scripts**

`packages/react/package.json`:

```json
"lint:scenario-coverage": "bun scripts/check-scenario-coverage.ts --fail-on-missing --fail-on-orphan"
```

根 `package.json` 保持 `lint:scenario-coverage` 调 react filter（flags 已在 react 脚本内）。

- [ ] **Step 4: 验证**

```bash
bun run lint:scenario-coverage
bun test packages/react/tests/scripts/check-scenario-coverage.test.ts
```

- [ ] **Step 5: Commit**

```bash
git commit -m "chore(react): 场景覆盖率 lint 增加 --fail-on-orphan"
```

---

### Task 4: Storybook 测试卫生

**Files:**
- Modify: `apps/storybook/src/stories/React.stories.test.ts`
- Modify: `apps/storybook/src/stories/ExcelWorkspace.stories.test.ts`

- [ ] **Step 1: 删除 `React.stories.test.ts` 第二条 it**

- [ ] **Step 2: ExcelWorkspace 补 unmount**

```ts
;(host as unknown as { __reactRoot: { unmount(): void } }).__reactRoot.unmount()
```

- [ ] **Step 3: 运行 storybook 测试**

```bash
bun test apps/storybook
```

- [ ] **Step 4: Commit**

```bash
git commit -m "test(storybook): 去掉与 L3 重复的 toolbar 测并补 unmount"
```

---

### Task 5: 文档 + 全量验证

**Files:**
- Modify: `docs/superpowers/specs/2026-06-08-novasheet-behavioral-testing-design.md`（Phase 0 状态一句）
- Modify: `docs/superpowers/plans/2026-06-09-novasheet-mbd-package-phase-2.md`（风险表）
- Modify: `packages/react/docs/project-standards.md`

- [ ] **Step 1: 更新三份文档**（各 1–3 句，无 TBD）

- [ ] **Step 2: 全量门禁**

```bash
bun run lint
bun run --filter '*' typecheck
bun test
```

- [ ] **Step 3: Commit**

```bash
git commit -m "docs(spec): React 行为测试巩固完成说明"
```

---

## 风险点（STOP+ASK）

| 风险 | 处理 |
| --- | --- |
| `insertRows` 不触发 `onRowsInserted` | 先跑一条最小 Grid 集成测；若不触发则改 compose 挂点或补 Grid 回调 |
| `flushGridSelectionEffects` 不足 | 改用双 rAF 或 `act`+`requestAnimationFrame`（helpers 已有） |
| compose 导致用户 `onRowsInserted` 内读 toolbar 仍为旧态 | 文档约定：toolbar 态在回调返回后更新；与 `onSelectionChange` 一致 |
| orphan 测试误用 `excel.L3z.*` 标题 | fail 即修 title 或补 manifest |

---

## Plan self-review

| Spec 章节 | Task |
| --- | --- |
| §3.1 compose | Task 1 |
| §3.2 删 hack | Task 2 |
| §3.3 orphan fail | Task 3 |
| §3.4 Storybook | Task 4 |
| §4 文档 | Task 5 |

Placeholder scan: 无 TBD。类型：`composeGridCallback` 签名全文在 Task 1。
