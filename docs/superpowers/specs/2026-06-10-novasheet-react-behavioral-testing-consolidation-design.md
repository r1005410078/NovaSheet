# NovaSheet React 行为测试巩固 — 设计

- **日期**：2026-06-10
- **状态**：已批准
- **分支**：`refactor-default-grid-engine-decomposition`
- **前置**：mbd Phase 1 + react Phase 2（21 场景 bootstrap）已 ship
- **相关**：
  - `docs/superpowers/specs/2026-06-08-novasheet-behavioral-testing-design.md`（Phase 0 excel-first）
  - `docs/superpowers/specs/2026-06-09-novasheet-mbd-package-design.md`
  - `docs/superpowers/plans/2026-06-09-novasheet-mbd-package-phase-2.md`

---

## 1. 背景与目标

mbd + react Phase 2 已完成 **21 条** excel 行为场景的 bootstrap（结构覆盖率 100%）。下一波不扩场景、不跟 Phase 5-C，而是 **巩固 harness**：让测试路径更真实、CI 门禁更硬、Storybook 与 L3 重复维护面更窄。

### 成功标准

| 指标 | 目标 |
| --- | --- |
| 场景 MD / manifest 条数 | 仍 **21**（无新增 id） |
| `syncToolbarViaFill` | 从 `tests/excel/` **删除** |
| 根 `bun run lint` | `missing` 与 `orphan` 场景 id **均 fail** |
| `bun test` | 全绿；无并行 DOM flaky 回归 |
| Storybook 测试 | 保留组合根 smoke；去掉与 L3 重复的深断言 |

### 非目标

- 新增 L3 场景或 Phase 5-C 功能
- `NovaSheetGrid` 独立 mbd namespace
- L0–L2 `packages/acceptance`
- 修改 mbd validate/manifest 语义

---

## 2. 问题陈述

### 2.1 产品债：程序化 mutation 后 toolbar 不同步

**现象**：测试调用 `ref.current.grid.insertRows()` 后 `canUndo()` 为 true，但 toolbar undo 按钮仍 `disabled`，因 `useNovaExcelToolbar` 的 `syncToolbarState` 仅在 toolbar action / `onSelectionChange` / `onUndo` / `onRedo` 时触发。

**现状 workaround**：`syncToolbarViaFill()` 在测试中通过填色 action 间接刷新 toolbar（见 Phase 2 plan 风险表）。

**影响用例**：

- `excel.L3b.undo-redo`
- `excel.L3c.undo-button-state`
- `excel.L3c.external-on-undo-on-redo`

### 2.2 门禁缺口：orphan 仅 warn

`check-scenario-coverage.ts` 对 manifest 中不存在的测试 title id 仅 `console.warn`，根 `lint` 不阻断。

### 2.3 Storybook 测试重复

`React.stories.test.ts` 第二条（fill → undo enabled）与 L3b/L3c 行为测试重复。`ExcelWorkspace.stories.test.ts` 缺少 `unmount()`。

---

## 3. 设计

### 3.1 NovaExcel：Grid mutation 回调 compose（ADR-A1）

**决策**：在 `NovaExcel.tsx` 对会改变 undo 栈或 toolbar 可读状态的 Grid 事件回调做 **compose**：先调用用户传入回调，再 `syncToolbarState()`。与现有 `onSelectionChange` / `onUndo` / `onRedo` 模式一致。

**辅助函数**（`packages/react/src/excel/composeGridCallback.ts`）：

```ts
/** Invoke user callback then run after-hook (toolbar sync). */
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

**接线表**（仅 `showToolbar === true` 时 compose；`false` 时透传 `gridProps`）：

| Grid 回调 | compose `syncToolbarState` | 理由 |
| --- | --- | --- |
| `onRowsInserted` / `onRowsDeleted` | ✓ | 推 undo 栈；测试用 `insertRows` |
| `onColumnsInserted` / `onColumnsDeleted` | ✓ | 对称结构 mutation |
| `onFill` / `onPaste` / `onCut` | ✓ | 改 undo / 格式态 |
| `onCopy` | ✗ | 不写 undo |
| `onHideChange` / `onHideColsChange` / `onColumnsMoved` | ✗（Phase 巩固范围外） | 不改变 toolbar undo/格式摘要 |

**实现要点**：

- 从 `gridProps` 解构上述回调，其余 `...restGridProps` 继续 spread
- `onSelectionChange` / `onUndo` / `onRedo` 保持现有内联 compose（或统一改用 helper，行为不变）
- 不修改 `useNovaExcelToolbar` 内部逻辑

### 3.2 测试：移除 `syncToolbarViaFill`

| 文件 | 改动 |
| --- | --- |
| `tests/excel/helpers.ts` | 删除 `syncToolbarViaFill` |
| `NovaExcel.wiring.test.ts` | `undo-redo`、`selection-sync` 用 `insertRows` + `flushGridSelectionEffects`；`selection-sync` 的 fill 路径保留真实 fill 点击 |
| `NovaExcel.journeys.test.ts` | `undo-button-state`、`external-on-undo-on-redo` 用 `insertRows` 替代 fill hack |

**新增回归**（可选并入 `NovaExcel.journeys.test.ts` 或 `NovaExcel.test.ts`）：

- `insertRows` 后 undo 按钮 enabled，**无需** fill palette 交互

### 3.3 门禁：`--fail-on-orphan`

**`ScenarioCoverageOptions`** 增加 `failOnOrphans?: boolean`。

**`runScenarioCoverageCheck` 出口码**：

- `failOnMissing && missing.length > 0` → 1
- `failOnOrphans && orphan.length > 0` → 1

**根 `package.json`**：

```json
"lint:scenario-coverage": "bun run --filter @novasheet/react lint:scenario-coverage -- --fail-on-missing --fail-on-orphan"
```

（react `package.json` 的 script 需转发 argv，或根脚本直接调 bun 路径。实现期以可工作为准。）

**单测**：`check-scenario-coverage.test.ts` 增加 orphan + `failOnOrphans: true` → exit 1 用例。

### 3.4 Storybook 测试卫生

| 文件 | 动作 |
| --- | --- |
| `React.stories.test.ts` | 删除第二条 `wires toolbar clicks…`；保留 mount smoke + unmount |
| `NovaExcel.stories.test.ts` | 不变（`__excelWorkspaceData` 为 story 专有探针） |
| `ExcelWorkspace.stories.test.ts` | 补 `__reactRoot.unmount()` |

---

## 4. 文档更新

| 文档 | 更新 |
| --- | --- |
| `2026-06-08-novasheet-behavioral-testing-design.md` | Phase 0 状态：bootstrap ✅ → **consolidated**（一句） |
| `2026-06-09-novasheet-mbd-package-phase-2.md` | 风险表删除 syncToolbarViaFill 待办；指向本 spec |
| `packages/react/docs/project-standards.md` | orphan fail；程序化 mutation 后 toolbar 由 NovaExcel 同步 |

---

## 5. ADR

### ADR-A：compose 回调 vs 测试 hack

| 方案 | 决策 |
| --- | --- |
| compose Grid mutation 回调 | **采纳** — 产品行为正确，测试反映用户路径 |
| 保留 `syncToolbarViaFill` | 否决 |
| 轮询 `canUndo` | 否决 |

### ADR-B：orphan 默认 warn vs fail

| 方案 | 决策 |
| --- | --- |
| 根 lint `--fail-on-orphan` | **采纳** — 与 missing 对称 |
| 仅 warn | 否决（巩固目标） |

---

## 6. 验证清单

```bash
bun run lint
bun run --filter @novasheet/react typecheck
bun test
bun run --filter @novasheet/core build && bun run --filter @novasheet/react build
```

---

## 7. Spec self-review

| 检查项 | 结果 |
| --- | --- |
| Placeholder / TBD | 无 |
| 内部矛盾 | 无；场景数 21 不变 |
| 范围 | 单 milestone，可一个 implementation plan 覆盖 |
| 歧义 | compose 列表已枚举；hide/move 明确排除 |

---

## 8. 后续（本 spec 之外）

- Phase 5-C 新场景 → 新 spec + 从 `_template.md` 复制
- `NovaSheetGrid` 独立场景 namespace → 另开 spec
- L0–L2 acceptance → 见 `2026-06-08` §Phase 0 切换信号
