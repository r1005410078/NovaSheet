# @novasheet/react 项目规范

## 工具链

- 包管理 / 测试 / 构建：`bun`（禁止 npm / yarn / pnpm）
- 测试：`bun:test`（`import { describe, expect, it } from 'bun:test'`）
- 类型：`verbatimModuleSyntax` 开启；只读类型用 `import type`

## 命名

- **保持现有风格**：组件文件 PascalCase（`NovaExcel.tsx`）；hooks camelCase（`useNovaSheetGrid.ts`）；工具 camelCase（`deriveToolbarState.ts`）
- 目录：小写（`excel/`、`toolbar/`）

## 分层约束

1. **不实现引擎状态**——mutation、undo、坐标映射在 `@novasheet/core`
2. **不绕过 `Grid` facade**——React 层只调公开 `Grid` API
3. **不跨 feature import**——组合放在 `excel/`（见 `project-structure.md` R1–R5）
4. **不硬编码视觉值**——主题来自 core tokens；Tailwind 仅用于容器与工具栏布局

## Import 约定

- 包内跨层：优先 `@/features/grid`、`@/lib/utils` 等 path alias
- 跨 feature：仅 `excel/` 通过 `@/features/<name>`（即 feature `index.ts`）
- 对外：消费者只 `import { ... } from '@novasheet/react'`

## 测试

- 路径镜像 `src/`：`tests/excel/`、`tests/features/`
- React 生命周期测试须覆盖 Strict Mode mount → unmount → mount
- 纯函数（如 `deriveToolbarStateFromGrid`）优先单测，少依赖 `createRoot`

### 与 Core 的分工（Phase 0）

| | `@novasheet/core` | `@novasheet/react`（本包） |
| --- | --- | --- |
| **TDD** | **继续** — `kernel/`、`features/`、`engine/` 驱动实现 | 不适用 |
| **行为测试** | **暂缓** — 不扩 Grid 门面 E2E / `acceptance` | **`tests/excel/` 主战场** |
| **场景结构覆盖率** | — | **`lint:scenario-coverage`**（读 mbd 导出的 manifest，非 mbd CLI） |

完整分层见：[`docs/superpowers/specs/2026-06-08-novasheet-behavioral-testing-design.md`](../../../docs/superpowers/specs/2026-06-08-novasheet-behavioral-testing-design.md)（含 Phase 0 节与附录 C）。场景 MD 由 [`@novasheet/mbd`](../../../docs/superpowers/specs/2026-06-09-novasheet-mbd-package-design.md) 导出 `scenarios.manifest.json`；**场景结构覆盖率**由本包 `lint:scenario-coverage`（实现期，`scripts/check-scenario-coverage.ts` 读 manifest）计算，**不在 mbd 包**。

新场景从 `tests/excel/scenarios/_template.md` 复制并重命名（`_` 前缀文件不参与 mbd 扫描）。

### 行为测试分层（excel-first）

| 子层 | 路径 | 职责 |
| --- | --- | --- |
| **L3a 壳层** | `tests/excel/` | DOM 契约、props、ref、StrictMode |
| **L3b 接线** | `tests/excel/` | toolbar 点击 → `grid.*`（spy / `onToolbarAction`） |
| **L3c 旅程** | `tests/excel/` | 用户流程；只断言 toolbar 状态与回调，**不断言** `rowCount` / cell 值等引擎语义 |
| **feature 单测** | `tests/features/toolbar/` | 孤立 UI、`deriveToolbarState` 纯函数；不扩 merge→undo 数据链 |
| **feature grid** | `tests/features/grid/` | mount/destroy/ref；不扩 scroll/sort E2E |

**规则**：

1. **引擎语义**（paste 写入、undo 还原 rowCount、sort×delete）→ Core TDD 或未来 L2；**不写进** `tests/excel/` 深断言
2. **产品组合**（toolbar 是否调对 `grid.*`、回调是否触发、UI 状态是否同步）→ **`tests/excel/`**
3. 跨端 DOM 契约以规格附录为准；`data-novasheet-react-excel` 实现期统一为 `data-novasheet-excel`

## 新增 Public API 流程

1. 在 `packages/react/README.md` 或本 docs 说明职责
2. 实现于对应 feature 或 `excel/`
3. 经 feature `index.ts` → 根 `index.ts` 导出
4. 补测试；跑 `lint`、`typecheck`、`test`、`build`

## Lint 边界

```bash
bun run lint:react-boundary   # 根 monorepo
bun run --filter @novasheet/react lint:boundary   # 仅 react 包
```

违规示例：`features/grid` import `features/toolbar/...`；`components/button.ts` import `features/grid/...`。
