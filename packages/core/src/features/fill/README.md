# Fill

填充柄 commit 写入门面；值序列 + 格式/合并平铺 + 选区联动。

- `FillController.ts`：`commitFill` 编排——`computeFillWrites`、写 cell、`propagateFillStyles`、push `fill` undo、`selectRange(result)`。
- `FillSeries.ts` / `FillTarget.ts`：序列推导与目标范围计算。
- `FillStylePropagator.ts`：Phase 5-A 格式/合并平铺（engine 注入，非 FillController 内聚 store）。
- `registerFillUndo.ts`：`fill` undo handler。

`FillControllerContext`：`getMutableData`、`viewRowToRaw`、`pushUndo`、`propagateFillStyles`、`selectRange`。

`DefaultGridEngine.commitFill` / `getFillMergeSnap` 委派；`getFillMergeSnap` 仍经 `fillStyles`（~10 行，可后续小 PR 内聚）。
