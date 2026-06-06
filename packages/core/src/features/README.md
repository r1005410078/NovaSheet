# features/

行为领域垂直切片：operation、rules、structure、command handler、domain event、undo handler。

**只依赖** `kernel/`（及过渡期仍顶层的 `format/`、`merge/`、`view/coordinates` 等，待 format/merge plan 收口）。

## 模板（以 `row/` 为准）

```text
<domain>/
  README.md
  *Structure.ts / Default*Structure.ts
  *Rules.ts
  *Operation.ts / *Event.ts
  *CommandHandler.ts
  *UndoHandler.ts / register*Undo.ts
```

## 已迁入域

| 域 | 职责 |
| --- | --- |
| `row/` | 行 insert/delete/hide/move、行高、AutofitRowHeights |
| `column/` | 列 insert/delete/hide/move、列宽 |
| `selection/` | 选区、键盘导航、结构 remap |
| `layout/` | rowsAxis/colsAxis/frozen/viewport 聚合 |
| `fill/` | 填充序列、FillStylePropagator、FillUndoHandler |
| `clipboard/` | TSV、paste 写入 |
| `view/` | SortLayer、FilterLayer、HideRowsLayer、ViewPipeline |
| `edit/` | CellEdit、CellEditModel、CellUndoHandler |
| `context-menu/` | ContextMenuModel |

## 约束

- Feature **不互相**直接发起 mutation；结构变化经 `GridEventPipeline` 同步。
- 每个 feature 通过 `register*Undo` 向组合根注册 undo handler；`kernel/undo` 只保留派发机制。
- 测试镜像：`tests/features/<domain>/`。

## 范围外（待单独 plan）

`format/`、`merge/` 及 `engine/format/*`、`MergeViewResolver` — 见 `docs/superpowers/plans/2026-06-06-novasheet-features-kernel-restructure.md`「范围外」。
