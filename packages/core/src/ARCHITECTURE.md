# `@novasheet/core` 源码导航

> **状态：过渡态**（分支 `refactor-default-grid-engine-decomposition`）  
> 顶层目录尚未收敛到终态；**找代码以本文「现在在哪」列为准**，勿假设已搬完。  
> 设计终态：`docs/superpowers/specs/2026-06-06-novasheet-features-kernel-restructure-design.md`  
> 搬移计划：`docs/superpowers/plans/2026-06-06-novasheet-features-kernel-restructure.md`  
> Engine 领域化进度（第 1–7 步）：`engine/README.md`

---

## 三层依赖（终态不变）

```text
kernel/          原语 + 跨域协议 + undo 机制 + 交互基建（不依赖 feature）
    ↑
features/        行为领域垂直切片（只依赖 kernel/）
    ↑
engine/          组合根：DefaultGridEngine + GridEngine（组装各域、事件管线、undo registry）
```

**判准（单一 feature 主人）：** 一段代码若只服务一个用户可见能力 → `features/<domain>/`；被多域共用、无单一主人 → `kernel/`。

**外部包** 只从 `@novasheet/core` 的 `index.ts` 按名导入，**不要**深引 `src/` 内部路径。

---

## 迁移总进度

| 批次 | 内容 | 状态 |
| --- | --- | --- |
| kernel 底座 | `geometry` `data` `theme` `measure` `render` `util` `coords` → `kernel/*` | ✅ |
| kernel 协议/机制 | `protocol/` `undo/` `interaction/`（HitTest 等基建） | ✅ |
| features | `selection/` | ✅ |
| features | `row/` | ✅ |
| features | `column/` | ✅ |
| features | `layout/` `fill/` `clipboard/` `view/` `edit/` `context-menu/` | ⬜ 仍在 `engine/*` 或顶层 |
| features | `format/` + `merge/`（含 engine 第 7 步协调收口） | ⬜ 分裂在 `format/` + `engine/format/` + `merge/` |
| 收尾 | 顶层只剩 `kernel/` `features/` `engine/` + `index.ts`；删空壳目录 | ⬜ |

Engine 行为 refactor（与目录搬移并行）：`engine/README.md` 第 1–6 步 ✅，**第 7 步 format/merge 协调 🟡**。

---

## 「我要找 X」→ 现在在哪 / 终态在哪

| 找什么 | 现在 | 终态 |
| --- | --- | --- |
| ChunkedAxis、Viewport、range | `kernel/geometry/` | 同左 |
| DataSource、Schema | `kernel/data/` | 同左 |
| Theme tokens | `kernel/theme/` | 同左 |
| RenderFrame 契约 | `kernel/render/` | 同左 |
| view↔raw 坐标 | `kernel/coords/` + `view/CoordinateSpace.ts` | coords 收进 kernel；ViewPipeline 留 `features/view/` |
| GridOperation / 事件管线 | `kernel/protocol/` | 同左 |
| UndoStack、UndoCommand、UndoReplay | `kernel/undo/` + 各域 `*UndoHandler` | 机制在 kernel；handler 跟 feature |
| 命中测试、CellLayout | `kernel/interaction/` | 同左 |
| 行 insert/delete/hide/move | `features/row/` | 同左 |
| 列 insert/delete/hide/move | `features/column/` | 同左 |
| 选区、键盘导航 | `features/selection/` | 同左 |
| 轴、frozen、viewport | `engine/layout/` | `features/layout/` |
| 单元格格式 store | `format/`（RangeStyleStore） | `features/format/` |
| 格式 mutation / 事件 | `engine/format/` | 并入 `features/format/` |
| 合并 store | `merge/MergeStore.ts` | `features/merge/` |
| merge view 解析 | `engine/MergeViewResolver.ts` | `features/merge/` |
| 填充序列、fill target | `fill/` | `features/fill/` |
| 填充样式传播 | `engine/FillStylePropagator.ts` | `features/fill/` |
| 剪贴板 paste/TSV | `clipboard/` | `features/clipboard/` |
| 排序/筛选/隐藏行层 | `view/` | `features/view/` |
| 单元格编辑 | `interaction/CellEdit*.ts` | `features/edit/` |
| 右键菜单项模型 | `interaction/ContextMenuModel.ts` | `features/context-menu/` |
| 组装入口 | `engine/DefaultGridEngine.ts` | 同左（组合根不迁 kernel） |

---

## 同名分裂（过渡期最乱处）

搬完前，下列概念**拆在两个目录**，按上表「现在」列查找：

| 概念 | 位置 A | 位置 B |
| --- | --- | --- |
| format | `format/` store 类型 | `engine/format/` controller/handler |
| merge | `merge/` store | `engine/MergeViewResolver` + engine 内 mutation |
| undo | `kernel/undo/` 机制 | `engine/{row,column,format,undo}/` 各域 handler |
| interaction | `kernel/interaction/` 基建 | `interaction/` 编辑/菜单模型 |

---

## 建议搬移顺序（plan 已定，勿 ad-hoc）

1. ~~`engine/row` → `features/row`~~ ✅
2. ~~`engine/column` → `features/column`~~ ✅
3. `engine/layout` → `features/layout`
4. `fill/` + `FillStylePropagator` → `features/fill`
5. `clipboard/` → `features/clipboard`
6. `view/` → `features/view`
7. `interaction/` 编辑/菜单 → `features/edit` + `features/context-menu`
8. **`format/` + `merge/` + `engine/format/*`** → `features/format` + `features/merge`（**顺带 engine 第 7 步**）

每步：`git mv` → typecheck 修 import → `bun test` 全绿 → 单 commit。

---

## 测试目录镜像

`packages/core/tests/` 结构与 `src/` 对齐迁移中：

- 已对齐：`tests/kernel/*`、`tests/features/selection/`、`tests/features/row/`、`tests/features/column/`
- 仍镜像旧路径：`tests/engine/*`、`tests/format/`、`tests/view/` 等

写新测试时：**优先放在与 `src` 目标路径一致的目录**（例如 selection 测放 `tests/features/selection/`）。

---

## 空壳 / 待删

迁移收尾时应删除无 `.ts` 的占位目录，例如历史上遗留的空 `engine/event/`、`engine/operation/`（协议已迁 `kernel/protocol/`）。
