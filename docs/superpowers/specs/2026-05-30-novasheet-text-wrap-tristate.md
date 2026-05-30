# NovaSheet — 文本换行三态（Overflow / Wrap / Clip）

- **Date**: 2026-05-30
- **Status**: Brainstorm（待评审 → 进 plan）
- **Scope**: 把文本显示模式做成**单元格级 `CellFormat`** 的三态 `overflow | wrap | clip`，对齐 Google 表格 / Excel；默认 `overflow`。不含垂直对齐、不含全局开关。
- **依赖**: Phase 5-A 的 `RangeStyleStore` / `CellFormat` / 帧 `cellFormats`；[多行文本基线](../../..) `feat/cell-multiline-text`（硬换行渲染 + autofit + 编辑框）

---

## 1. Problem

当前长文本在非 wrap 列被**裁断 + 省略号**（数据网格做法），而 Excel/Google/绝大多数表格默认是
**Overflow**：长文本溢出到右侧空单元格、邻格有内容才裁断；行不变高。换行（Wrap）是另一显示态。
现有 `field.wrap`（列级 schema 布尔）只能整列开 wrap，无法按单元格/区域控制，且不含 overflow/clip。

需把显示模式提升为**单元格级格式三态**，与 fill/border/merge 同族（`CellFormat`）。

---

## 2. 三态语义（对齐 Google 表格）

| 模式 | 长单行 | 硬换行 `\n` | 行高 |
|------|--------|-------------|------|
| `overflow`（默认） | 溢出到右侧连续空格，邻格有内容则在邻格边界裁断 | 仍按 `\n` 多行 | 不因长单行变高；`\n` 行数撑高 |
| `wrap` | 按列宽软折 | 同时按 `\n` 断行 | 按折后行数撑高 |
| `clip` | 在本格右边界**硬裁断、无省略号** | 按 `\n` 多行，每行各自硬裁断 | `\n` 行数撑高 |

注：硬换行 `\n`（Alt+Enter）在三态下都产生多行并撑高（基线已实现）；三态只决定**长单行的横向处理**与软折与否。

---

## 3. 决策（ADR）

| # | 决策 | 取舍 |
|---|------|------|
| D1 | 新增 `CellFormat.textWrap?: 'overflow' \| 'wrap' \| 'clip'`；**缺省回退到该列 `field.wrap`**（true→wrap），都未设则 `overflow` | 平滑迁移、不破坏现有 wrap 列 |
| D2 | Clip = 硬裁断**无省略号** | 对齐 Excel/Sheets |
| D3 | 不做垂直对齐 | 聚焦；单独切片 |
| D4 | 不做全局 on/off 开关 | 真正的控制是单元格级三态 |
| D5 | overflow 溢出范围：沿对齐方向扫到第一个非空格或视口边；左对齐右溢、数字右对齐左溢、居中两侧 | 与 Excel 一致 |
| D6 | overflow 落点在 **Canvas2DRenderer**（有整帧数据可扫邻格空否），CellPainter 接收扩展 clip | painter 只拿单格 value，无邻格信息 |

---

## 4. 改动面

| 层 | 改动 |
|----|------|
| core | `CellFormat` 加 `textWrap`；`RangeStyleStore.resolveCell` 累积 textWrap；engine `setTextWrap(range, mode)` + undo（沿用 format 命令）；`getFrame` 把 textWrap 随 `cellFormats` 发出（VIEW） |
| 渲染 | `Canvas2DRenderer`：overflow 邻格空扫描 + 扩展 clip；`CellPainter`：按 textWrap 选 overflow/wrap/clip 路径，clip 改硬裁断 |
| autofit | `AutofitRowHeights` 用 resolved textWrap===‘wrap’（取代直接读 field.wrap）；overflow/clip 不软折撑高 |
| API/UI | `Grid.setTextWrap`；Storybook 三态按钮；编辑器仍 wrap=off（编辑态不软折，与显示解耦） |

---

## 5. 风险 / 边界

- **绘制层级**：overflow 文字与网格线/选区高亮的顺序——溢出文字应压过网格线（Excel 行为）。需确认 stage 顺序。
- **邻格空判定**：`getCell` 读邻格；合并格、frozen 区、隐藏列的邻接需正确跳过。
- **overflow 与 autofit**：overflow 永不撑高（即使内容很长）；只有 wrap 与 `\n` 撑高。
- **编辑态 vs 显示态**：编辑框统一 wrap=off（基线），显示态由 textWrap 决定，二者刻意解耦（与 Google 一致）。

---

## 6. 不在本切片

- 垂直对齐（top/middle/bottom）
- 水平对齐的用户可调（目前按 field.type 定）
- Center Across Selection
- 旋转文本 / 缩小字体填充
