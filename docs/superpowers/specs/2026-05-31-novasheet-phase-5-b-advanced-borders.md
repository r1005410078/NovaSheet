# NovaSheet Phase 5-B — 高级边框（dashed / dotted / double）

- **Date**: 2026-05-31
- **Status**: Brainstorm → plan
- **Scope**: 把已定义但被禁用的非 solid 线型端到端打通：dashed / dotted / double 的渲染 + engine 接受 + Storybook 演示。位置预设（单边/内部等）5-A 已有，不重做。
- **依赖**: Phase 5-A（`RangeStyleStore` / `setBorders` / `FormatBorderPainter` edge-rect 模型）

---

## 1. 现状与缺口

5-A 已有：位置预设全套（`all/inner/innerHorizontal/innerVertical/outer/top/bottom/left/right/clear`）、类型层 `lineStyle: solid|dashed|dotted|double` + `width: thin|medium|thick`。

缺口：
- `DefaultGridEngine.setBorders` 对 `lineStyle !== 'solid'` 直接 `return false`。
- `FormatBorderPainter` 对非 solid 边 `continue`（只画 solid 矩形）。

→ 只有 solid 能用。5-B 把非 solid 打通。

---

## 2. 决策（ADR）

| # | 决策 | 取舍 |
|---|------|------|
| D1 | 保留 `lineStyle × width` 模型（不改 API） | 已发布、是 Google 6 项枚举的超集；UI 把 Google 常用组合包成预设 |
| D2 | `double` 固定细双线、**忽略 width** | 对齐 Google（DOUBLE 无粗细变体）；窄行避免双粗线错位 |
| D3 | dashed/dotted 用 `ctx.stroke` + `setLineDash`（沿边中线描线，受 width 影响）；solid/double 仍走 edge-rect 矩形 | solid 路径已测不动；dashed/dotted 描线更标准、易测（断言 setLineDash） |
| D4 | dash/dot 图案随 width 缩放：dotted=`[w, w]` round cap；dashed=`[3w, 2w]` butt cap | 标准且粗细一致 |

---

## 3. Google 模型（调研，仅作参照）

线型下拉 6 项：SOLID(细) / SOLID_MEDIUM / SOLID_THICK / DOTTED / DASHED / DOUBLE。位置选择与 5-A 预设一一对应。颜色取色器 + HEX。

---

## 4. 改动面

| 层 | 改动 |
|----|------|
| core | `setBorders` 去掉 `lineStyle !== 'solid'` 守卫（接受全部线型）；其余 5-A 逻辑不变 |
| 渲染 | `FormatBorderPainter`：solid→现有 rect；double→两条 1px rect（间隙 1px，忽略 width）；dashed/dotted→clip 后 stroke + setLineDash（lineWidth=width，沿边中线） |
| UI | Storybook `合并与格式化`（或新故事）加线型演示：虚线/点线/双线 外框按钮 |

---

## 5. 风险 / 边界

- **stroke 与 rect 混用**：dashed/dotted 走独立 stroke pass（同样 clip 到 region+outset），与 solid/double 的 rect fill pass 互不干扰；绘制顺序：default 格线 → 自定义边框（本 painter）之上。
- **合并格跳边**：5-A 已有 `skipTop/Bottom/Left/Right`（合并内部不画），dashed/dotted/double 复用同一跳边逻辑。
- **double 在 thin 行高**：两条 1px + 1px 间隙 = 3px，窄行可接受；忽略 width 避免更粗。
- **dash 相位**：跨格边的 dash 不强求相位连续（每格独立描线），与 Google 一致（够用）。

---

## 6. 不在本切片

- 边框选择器富 UI（位置×线型×颜色三联弹层）——Storybook 用按钮演示即可，正式工具栏后续。
- 斜线 / 对角线边框。
