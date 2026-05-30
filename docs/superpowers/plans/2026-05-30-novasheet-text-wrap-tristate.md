# Plan — 文本换行三态（Overflow / Wrap / Clip）

Spec: `docs/superpowers/specs/2026-05-30-novasheet-text-wrap-tristate.md`
基线: `feat/cell-multiline-text`（多行文本）

每个任务 = 失败测试先行 → 实现 → 绿 → 一个 commit。已知风险处 STOP+ASK，不静默选择。

---

## Task 1 — `CellFormat.textWrap` + RangeStyleStore（core）

- `CellFormat` 加 `readonly textWrap?: 'overflow' | 'wrap' | 'clip'`。
- `RangeStyleStore.resolveCell` 在 fill/borders 之外累积 `textWrap`（写序覆盖；clearFill/clearBorders 不影响它，新增 `clearTextWrap` 或并入 apply）。
- `apply(range, { textWrap })` 生效；snapshot/restore、remap（行列增删/move）带上 textWrap（其实 layer 整体快照，已覆盖——确认）。
- 测试：apply 后 resolveCell 返回 textWrap；多层写序覆盖；remap 后仍正确。

## Task 2 — engine `setTextWrap` + 帧输出（core）

- `DefaultGridEngine.setTextWrap(range: CellRange, mode): boolean`：view→raw 翻译（非连续返回 false），`formatStore.apply(raw, { textWrap })`，走 `commitFormatChange`（沿用 format undo 命令）。
- `getCellFormat` 已返回整个 CellFormat（含 textWrap）——确认。
- `getFrame()` 的 `cellFormats` 已携带整个 CellFormat → textWrap 自动随帧到 VIEW。确认 ResolvedCellFormat 带 textWrap。
- 测试：setTextWrap + getCellFormat；undo/redo 还原；非连续映射 false。

## Task 3 — `Grid.setTextWrap` facade（web）

- `Grid.setTextWrap(range, mode)` 委托 engine。
- 测试：Grid.format.test 加用例。

## Task 4 — CellPainter clip 硬裁断 + 按 textWrap 选路径（web-canvas2d）

- painter 解析 `mode = cellFormat?.textWrap ?? (field.wrap ? 'wrap' : 'overflow')`。
- `wrap` → paintWrapped（现有）；`clip` → 新 paintClip（硬裁断**无省略号**，按 \n 多行）；`overflow` → 本任务先按「裁断到本格」占位（真正溢出在 Task 5）。
- 注意：paint() 仍 `ctx.clip()` 到本格——overflow 的扩展 clip 在 Task 5 由 renderer 提供。
- 测试：clip 模式不出现 `…`；wrap 模式走折行；\n 在各模式下分行。

## Task 5 — overflow 溢出渲染（web-canvas2d，最大）

- `Canvas2DRenderer`：对 `textWrap==='overflow'`（含回退默认）且内容超宽的文本格，沿对齐方向扫描邻格是否空（`frame.data.getCell`），算出可溢出的扩展矩形（到第一个非空格或视口边）。
- 把扩展矩形作为 clip 传给 CellPainter（新增可选 `overflowRect`/`clipRect` 入参），painter 用它替代本格做 clip 并整串绘制。
- 方向：左对齐右溢、number 右对齐左溢、居中两侧。
- 绘制层级：确认溢出文字压过网格线（STOP+ASK 若 stage 顺序需大改）。
- 测试（RecordingContext + 构造帧）：右侧空格→clip 宽度扩展、整串绘制；右侧非空→裁断到本格；number 左溢。

## Task 6 — autofit 用 resolved textWrap（core + web）

- `AutofitRowHeights` 把「是否 wrap」从直接读 `field.wrap` 改为入参 `isWrapCell?(row, colIndex)`；缺省回退 `field.wrap`。
- runtime 用 `frame.cellFormats` + schema 构建 `isWrapCell`（textWrap==='wrap' 或 未设且 field.wrap）。
- overflow/clip 不软折撑高；`\n` 仍撑高（已实现，保留）。
- 测试：wrap 格撑高、overflow 长单行不撑高、clip 不撑高。

## Task 7 — Storybook 三态 + 公共 API 故事

- `表格/合并与格式化` 或新故事加 Overflow/Wrap/Clip 三按钮，作用当前选区。
- 文档/README 更新（如需）。

---

## 收尾

- 全任务后 dispatch code-reviewer 子代理过一遍模块边界。
- `field.wrap` 迁移：保留为默认回退（D1），不删；在 spec/CLAUDE.md 注明新写法用 `setTextWrap`。
