# Format

负责 engine 空间里的格式与合并协调：

- 把 view ranges 翻译为 format/merge mutation 所需的 raw ranges。
- 协调 `RangeStyleStore` 和 `MergeStore`。
- 保持 format 与 merge structural remap 和 row/column 变化对齐。
- 将 visible-frame format resolution 与 mutation 规则分离。

本领域已经存在的抽离模块：

- `../VisibleFormatResolver.ts`
- `../FillStylePropagator.ts`

Internal format context 只应暴露 `RangeStyleStore`、`MergeStore` 和 coordinate translation。
Structural mutation hooks 应作为来自 row/column 领域的显式输入。

当前位于 `DefaultGridEngine` 中的候选方法：

- `viewRangeToRawRange`
- `commitFormatChange`
- `setFillColor`
- `setTextWrap`
- `setBorders`
- `getCellFormat`
- `mergeCells`
- `unmergeCells`
- `getMergeRegion`
