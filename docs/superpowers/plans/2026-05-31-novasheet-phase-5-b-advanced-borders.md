# Plan — Phase 5-B 高级边框（dashed / dotted / double）

Spec: `docs/superpowers/specs/2026-05-31-novasheet-phase-5-b-advanced-borders.md`

每任务 = 失败测试先行 → 实现 → 绿 → 一个 commit。

---

## Task 1 — engine 接受非 solid（core）

- `DefaultGridEngine.setBorders` 去掉 `if (border.lineStyle !== 'solid') return false`。
- 更新该方法 TSDoc（不再「仅 solid」）。
- 测试：`setBorders(range,'outer',{lineStyle:'dashed',...})` 返回 true、`getCellFormat` 边框 lineStyle='dashed'；undo/redo 还原。（更新/移除 5-A 里「非 solid 返回 false」的旧断言。）

## Task 2 — painter 渲染 dashed/dotted/double（web-canvas2d）

- `FormatBorderPainter`：
  - solid：现有 rect（不动）。
  - double：每边两条 1px rect（间隙 1px，忽略 width）；复用 skip-edge / clip。
  - dashed/dotted：收集到独立 stroke 列表，在 clip 后 `ctx.stroke` + `setLineDash`（lineWidth=WIDTH_MAP[width]，沿边中线；dotted `[w,w]` round cap、dashed `[3w,2w]` butt cap）。
- 测试（RecordingContext）：dashed 边 → 出现 `set:lineDash`/`stroke`（按 recording-context 实际记录的 op 名）且 lineWidth 正确；dotted → 对应 dash 模式；double → 两条 fillRect；合并内部边仍跳过。

## Task 3 — Storybook 线型演示（storybook）

- `合并与格式化` 故事加「虚线外框 / 点线外框 / 双线外框」按钮，调 `grid.setBorders(range,'outer',{color,width,lineStyle})`。
- meta 描述补线型。

---

## 收尾

- 全任务后跑四道门；更新 CLAUDE.md「Phase 5 status」5-B → shipped。
