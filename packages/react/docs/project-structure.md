# @zhiguang/react 项目结构

> 基于 [Bulletproof React](https://github.com/alan2207/bulletproof-react) 思想，适配**可发布库**（非 SPA）。组合层用 `excel/` 表达大组件，而非 SPA 的 `app/`。

## 库包 vs SPA 映射

| Bulletproof 层 | 本包路径 | 职责 |
| --- | --- | --- |
| `app/`（组合） | `src/excel/` | Excel 大组件：`NovaExcel` = grid + toolbar |
| `features/` | `src/features/` | 独立业务能力（grid、toolbar） |
| `components/` | `src/components/` | 无业务语义的共享 UI primitive |
| `lib/` | `src/lib/` | 纯工具函数 |
| 包入口 | `src/index.ts` | 对外 Public API；消费者只 import 这里 |

路由、`providers` 等属于消费方应用（如 `apps/storybook`），不在本包。

## 目录树

```text
packages/react/src/
  index.ts
  excel/
    NovaExcel.tsx
    types.ts
    useNovaExcelToolbar.ts
  features/
    grid/
      NovaSheetGrid.ts
      useNovaSheetGrid.ts
      types.ts
      index.ts
    toolbar/
      components/
      hooks/
      lib/
      types.ts
      index.ts
  components/
    button.ts
    input.ts
  lib/
    utils.ts
```

测试镜像：`packages/react/tests/` 与 `src/` 同构（`excel/`、`features/`）。**Phase 0** 大行为测试集中在 `tests/excel/`（壳层 / 接线 / 用户旅程）；Core 继续 TDD、Core 行为测试暂缓——见 `project-standards.md` 与 `docs/superpowers/specs/2026-06-08-novasheet-behavioral-testing-design.md`。

## 依赖方向（单向流）

```text
lib / components  →  features/grid | features/toolbar  →  excel/  →  index.ts
```

| 规则 | 说明 |
| --- | --- |
| R1 | `features/grid` 与 `features/toolbar` 禁止互相 import |
| R2 | `features/*` 禁止 import `excel/**` |
| R3 | `components/`、`lib/` 禁止 import `features/` 或 `excel/` |
| R4 | `excel/` 只从 `features/*/index.ts` 引入 grid、toolbar |
| R5 | feature 内部可自由引用本子目录；禁止跨 feature 深路径 import |

由 `packages/react/scripts/check-react-boundary.ts` 在 `bun run lint` 中强制。

## 新代码放哪里

| 你要加什么 | 放哪里 |
| --- | --- |
| 新表格 React 能力（不含工具栏） | `features/grid/` |
| 工具栏 UI / 状态推导 | `features/toolbar/` |
| Excel 开箱即用组合 | `excel/` |
| 跨 feature 复用按钮、输入框 | `components/` |
| `cn` 等无业务工具 | `lib/` |
| 对外新 export | 先在 feature `index.ts` 或 `excel/` 暴露，再在根 `index.ts` re-export |
| 引擎 mutation、undo、view/raw | **不在本包** → `@zhiguang/core` |

## Feature Public API

每个 feature 提供 `index.ts`，只导出包根 `index.ts` 需要 re-export 的符号。`excel/` 与外部消费者应通过 feature `index.ts` 引用，不深入 `components/`、`hooks/` 子路径。

根 `index.ts` 保持薄：仅 re-export，不含实现逻辑。
