# `@novasheet/core` 源码导航

> **状态：目录搬移基本完成**（分支 `refactor-default-grid-engine-decomposition`）  
> **仍待行为收口：** engine 第 7 步 `FormatState` 接线（`FormatState.ts` 仍为接口骨架）  
> 设计：`docs/superpowers/specs/2026-06-06-novasheet-features-kernel-restructure-design.md`  
> 子目录：`kernel/README.md`、`features/README.md`；组合根：`engine/README.md`

---

## 三层依赖

```text
kernel/          原语 + 跨域协议 + undo 机制 + 交互基建 + 坐标
    ↑
features/        行为领域垂直切片（含 format/merge store + mutation）
    ↑
engine/          组合根：DefaultGridEngine + GridEngine
```

**外部包** 只从 `@novasheet/core` 的 `index.ts` 按名导入。

---

## 迁移总进度

| 批次 | 内容 | 状态 |
| --- | --- | --- |
| kernel | 底座 + protocol/undo/interaction + coords/coordinates | ✅ |
| features | row/column/selection/layout/fill/clipboard/view/edit/context-menu | ✅ |
| features | format + merge（含 VisibleFormatResolver、MergeViewResolver） | ✅ |
| engine 第 7 步 | `FormatState` 聚合接线，收缩 DefaultGridEngine format 编排 | ⬜ |

---

## 「我要找 X」

| 找什么 | 位置 |
| --- | --- |
| ChunkedAxis、Viewport、Theme、RenderFrame | `kernel/` |
| view↔raw 坐标、RawRange | `kernel/coords/` |
| GridOperation、事件管线、Undo 机制 | `kernel/protocol/`、`kernel/undo/` |
| HitTest、CellLayout | `kernel/interaction/` |
| 行/列/选区/layout/fill/clipboard/view/edit/菜单 | `features/<domain>/` |
| 格式 store + mutation + 帧解析 | `features/format/` |
| 合并 store + view 解析 | `features/merge/` |
| 组装入口 | `engine/DefaultGridEngine.ts` |

---

## 测试目录

- `tests/kernel/*`、`tests/features/*` — 与 `src` 对齐
- `tests/engine/*` — DefaultGridEngine 组合根回归

新测试优先放在与 `src` 目标路径一致的目录。
