# Format

负责 engine 空间里的格式与合并协调：

- 把 view ranges 翻译为 format/merge mutation 所需的 raw ranges。
- 协调 `RangeStyleStore` 和 `MergeStore`。
- 保持 format 与 merge structural remap 和 row/column 变化对齐。
- 将 visible-frame format resolution 与 mutation 规则分离。

本领域已经存在的抽离模块：

- `FormatController.ts`：format/merge **写入门面 + 编排器**。拥有 5 个正向 mutation
  （`setFillColor`/`setTextWrap`/`setBorders`/`mergeCells`/`unmergeCells`）的完整编排：
  view→raw 翻译、store 写入、快照对比、undo 入栈、mergeCells 选区联动。engine 经此写入，
  不直连 store mutation。**非** CQRS command handler（format mutation 不产领域事件），
  定位/依据同 `selection/SelectionController`。
- `FormatEventHandler.ts`：响应 row/column structural event，做 format/merge remap。
- `../VisibleFormatResolver.ts`：可见帧 format/merge → VIEW 解析（复用 `../MergeViewResolver.ts`）。
- `../FillStylePropagator.ts`：填充柄携带格式/合并的平铺。

`FormatControllerContext` 只暴露 `translateRange` / `pushUndo` / `getSelection` / `selectRange`，
不接收完整 engine。

仍留在 `DefaultGridEngine` 的相关方法（**有意**）：

- `viewRangeToRawRange`：与 fill 等共享的 coordinate translation。
- `getCellFormat` / `getMergeRegion`：**raw** 坐标只读 API。
- undo **restore**（applyUndo/applyRedo 的 `format`/`merge`/`unmerge` 分支）：统一 switch，
  与 selection 一致，待 undo replay 拆分时再迁移。
