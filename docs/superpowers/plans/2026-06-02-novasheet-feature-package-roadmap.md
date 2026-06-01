# NovaSheet Feature Package 拆分总计划

> **用途：** 这是 feature package 重构的总路线图。每完成一个大的能力拆包，就在这里打勾。具体实施细节写在对应的单项实施计划里。

**目标：** 把历史上已经做完、已经验证过的产品能力，从固定内置在 `@novasheet/web` / `DefaultGridEngine` 的形态，逐步整理成可通过 `SheetContext` 安装的 feature package。

**原则：**

- 优先移动旧代码，不重写旧功能。
- 每个 feature package 对应一个用户可感知、可安装、可替换或可禁用的能力。
- `@novasheet/core` 保持 DOM-free，只提供 contracts / context / engine kernel。
- `@novasheet/web` 提供 browser runtime contribution contracts，不默认拥有产品能力。
- `@novasheet/sheet` 是默认 assembled product，负责安装默认 features。
- 每个大的 feature 拆包必须有独立计划、独立测试、独立提交。

---

## 总进度

| 状态 | 阶段 | Feature | 目标包 | 实施计划 | 验收口径 |
|---|---:|---|---|---|---|
| [ ] | 0 | Feature contribution 基座 | `@novasheet/core` / `@novasheet/web` | `2026-06-02-novasheet-row-column-reorder-feature-package.md` Task 1-2 | `SheetContext` 支持 generic contributions；`web` 支持 typed drag contributions |
| [ ] | 1 | 行列拖拽排序 | `@novasheet/feature-row-column-reorder` | `2026-06-02-novasheet-row-column-reorder-feature-package.md` | `RowHeaderDrag` / `ColumnHeaderDrag` 通过 feature 安装，默认行为不变 |
| [ ] | 2 | 行高列宽 resize | `@novasheet/feature-resize` | 未开始：实施前单独写计划 | `ResizeDrag` 从 runtime 固定创建改为 feature 安装 |
| [ ] | 3 | 填充柄 | `@novasheet/feature-fill-handle` | 未开始：实施前单独写计划 | `FillHandleDrag` 和填充 preview/commit 通过 feature 安装 |
| [ ] | 4 | 单元格编辑 | `@novasheet/feature-editing` | 未开始：实施前单独写计划 | `DomCellEditor` / edit lifecycle 通过 feature 安装，自定义 editor 仍可用 |
| [ ] | 5 | 剪贴板 | `@novasheet/feature-clipboard` | 未开始：实施前单独写计划 | copy/paste adapter 与 paste commit 通过 feature 安装 |
| [ ] | 6 | 右键菜单 | `@novasheet/feature-context-menu` | 未开始：实施前单独写计划 | 菜单项通过 contribution 汇聚，DOM menu layer 不硬编码产品菜单 |
| [ ] | 7 | 排序筛选 | `@novasheet/feature-sort-filter` | 未开始：实施前单独写计划 | `SortLayer` / `FilterLayer` / popover 通过 feature 安装 |
| [ ] | 8 | 行列结构操作 | `@novasheet/feature-structure` | 未开始：实施前单独写计划 | 插入、删除、隐藏、取消隐藏行列从默认菜单动作中拆包 |
| [ ] | 9 | 合并单元格 | `@novasheet/feature-merge-cells` | 未开始：实施前单独写计划 | merge/unmerge API 和菜单动作成为可安装能力 |
| [ ] | 10 | 格式化 | `@novasheet/feature-formatting` | 未开始：实施前单独写计划 | fill/border/textWrap 等格式 API 与 UI action 成为可安装能力 |
| [ ] | 11 | undo/redo | `@novasheet/feature-undo-redo` 或保留 kernel | 未开始：阶段 11 前先做架构决策 | 明确 undo 是 feature 还是 engine transaction kernel |
| [ ] | 12 | 默认 cell types | `@novasheet/feature-basic-cells` | 未开始：实施前单独写计划 | `installBasicCells` 从 `sheet/defaults` 迁为 feature |
| [ ] | 13 | 默认组装收口 | `@novasheet/sheet` | 未开始：实施前单独写计划 | `installDefaultExtensions(ctx)` 只组合 feature installers |

## 当前执行焦点

当前只执行阶段 0-1：

- 基座：`SheetContext` generic contributions + `@novasheet/web` typed drag contributions。
- 第一包：`@novasheet/feature-row-column-reorder`。

不要在阶段 0-1 中顺手拆 resize、fill handle、editing、clipboard。每个 feature 都需要单独计划，避免一次性改穿 runtime。

## 大能力拆包顺序

推荐顺序：

1. `row-column-reorder`
2. `resize`
3. `fill-handle`
4. `editing`
5. `clipboard`
6. `context-menu`
7. `sort-filter`
8. `structure`
9. `merge-cells`
10. `formatting`
11. `basic-cells`
12. `undo-redo` 决策
13. `sheet` 默认组装收口

排序依据：

- 先拆边界清晰、已有独立 drag state machine 的能力。
- 再拆依赖 runtime lifecycle 的能力。
- 最后拆 `undo/redo`、format/merge 这类跨 feature 状态能力。

## 每个 feature 拆包的固定验收清单

每个大 feature 完成前，都必须满足：

- [ ] 旧实现优先 `git mv`，没有无必要重写。
- [ ] 新 package 有 `package.json`、`build.ts`、`tsconfig.json`、`tsconfig.build.json`。
- [ ] 新 package 有 `src/index.ts` 和 `installXxx(ctx)`。
- [ ] 默认 `@novasheet/sheet` 通过 `installDefaultExtensions(ctx)` 安装该 feature。
- [ ] 原行为测试迁移或保留到正确 ownership。
- [ ] 禁用该 feature 时不会让 runtime crash。
- [ ] `bun run lint` 通过。
- [ ] `bun run --filter '*' typecheck` 通过。
- [ ] `bun test` 通过。
- [ ] 相关 package build 通过。
- [ ] `docs/architecture.md` 记录新的 package 边界。

## Feature 候选边界

| Feature | 用户是否感知 | 是否可禁用 | 是否可替换 | 是否应该拆包 |
|---|---|---:|---:|---:|
| 行列拖拽排序 | 是 | 是 | 是 | 是 |
| 行高列宽 resize | 是 | 是 | 是 | 是 |
| 填充柄 | 是 | 是 | 是 | 是 |
| 单元格编辑 | 是 | 部分 | 是 | 是 |
| 剪贴板 | 是 | 是 | 是 | 是 |
| 右键菜单 | 是 | 是 | 是 | 是 |
| 排序筛选 | 是 | 是 | 是 | 是 |
| 行列结构操作 | 是 | 是 | 部分 | 是 |
| 合并单元格 | 是 | 是 | 部分 | 是 |
| 格式化 | 是 | 是 | 部分 | 是 |
| 默认 cell types | 是 | 是 | 是 | 是 |
| `ColumnMoveNormalizer` 等 helper | 否 | 否 | 否 | 否，属于 feature/engine 内部实现 |

## 不做事项

- 不在本轮把所有 feature 一次性拆完。
- 不为了插件化重写已验证行为。
- 不让 `@novasheet/core` import DOM / web 类型。
- 不让 `@novasheet/web` 依赖具体 feature package。
- 不在没有单项计划的情况下继续新增 feature package。

## 打勾规则

只有满足以下条件，才能把总进度里的对应阶段打勾：

1. 对应单项计划全部 Task 完成。
2. 默认 sheet 行为测试通过。
3. 全量 gates 至少跑过一次并通过。
4. 文档记录了新的包边界。
5. 工作区干净，且该阶段有明确提交记录。
