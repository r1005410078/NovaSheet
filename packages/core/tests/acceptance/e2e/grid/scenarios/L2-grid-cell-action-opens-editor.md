---
id: core.L2.grid-cell-action-opens-editor
layer: L2
summary: cell action 先 onAction，未拦截则打开同类型 editor
tags: [cell-extension, editing, grid, action]
status: draft
---

## User Story

作为 Grid 集成方，当自定义 renderer 在单元格内声明按钮或其它 action hit zone 时，我希望点击 action 后先给业务类型一次拦截机会，未拦截时再用统一 editor 流程打开同类型编辑器。

## Given

- `assignee` 单元格 renderer 声明 action `{ id: "change-assignee" }`
- `cellTypes.assignee.onAction` 已注册但不调用 `preventOpenEditor`
- `cellEditors.assignee` 已注册 popover editor

## When

- 用户点击该 action hit zone

## Then

- runtime 先调用 `cellTypes.assignee.onAction(ctx)`
- `ctx.trigger` 为 `cell-action` 且 `ctx.actionId` 为 `change-assignee`
- 因未拦截，runtime 随后调用 `cellEditors.assignee.open(ctx)`
- 若 `onAction` 调用 `preventOpenEditor()`，则不打开 editor；可在 `onAction` 中直接 `commit()`，例如 checkbox toggle
