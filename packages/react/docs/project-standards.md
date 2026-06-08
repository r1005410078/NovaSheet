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
