---
# 复制本文件为 L3x-<slug>.md（勿直接改 _template.md）
# id 必须与 layer 一致：excel.L3a.* / excel.L3b.* / excel.L3c.*
id: excel.L3b.your-scenario-id
layer: L3b
summary: 一句话开发向摘要（frontmatter，给开发 / 清单 / 测试标题）
tags: []
status: draft
---

## User Story

作为 <角色>，当 <情境> 时，我希望 <目标>，以便 <价值>。
（可选；可写多段。导出进 SCENARIOS.md，不参与测试匹配。）

## Given

- NovaExcel 已挂载（或写明 data / props / ref 前置条件）
- （可选）spy / mock 说明

## When

- 用户操作或触发路径（点击、快捷键、选区变化等）

## Then

- 可观测结果（DOM 契约、`grid.*` 调用、回调、`toolbarState` / 按钮 disabled）
- Phase 0 不写引擎深层语义（rowCount 还原、cell 值、sort×delete 等 → Core TDD）

---

## 落地 checklist

1. `bun run lint:mbd`
2. `bun run sync:mbd-manifest` → 提交 `scenarios.manifest.json` + `SCENARIOS.md`
3. 在 `tests/excel/` 补 `it('excel.L3b.your-scenario-id …', () => { … })`（标题以场景 id 开头）
4. `bun run lint:scenario-coverage` + `bun test`

### 分层速查

| layer | 职责 | 测试文件（建议） |
| --- | --- | --- |
| **L3a** | 壳层：挂载、props、ref、StrictMode、DOM 契约 | `NovaExcel.test.ts` |
| **L3b** | 接线：toolbar → `grid.*`（spy / `onToolbarAction`） | `NovaExcel.wiring.test.ts` |
| **L3c** | 旅程：UI 状态与回调联动 | `NovaExcel.journeys.test.ts` |
