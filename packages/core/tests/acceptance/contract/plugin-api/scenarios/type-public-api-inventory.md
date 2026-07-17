---
id: core.type.public-api-inventory
layer: type-only
summary: index.ts 公开 type 导出由 typecheck 覆盖
tags: [inventory, type-only]
status: implemented
---

## User Story

作为 Core 维护者，我希望 `packages/core/src/index.ts` 中所有 `export type` 符号在 strict typecheck 下可导入，运行时 BDD 仅做代表性 smoke。

## Given

- `@zhiguang/core` 公开 barrel

## When

- `bun run --filter @zhiguang/core typecheck` 与 BDD smoke 引用代表性类型

## Then

- 无 type 导出断裂
- 运行时 value 导出名排序清单与 `__goldens__/core.type.public-api-inventory.golden.txt` 一致——公开 API 面增删显式过 review
- 文档矩阵标记 type-only，type 导出仍由 strict typecheck 覆盖
