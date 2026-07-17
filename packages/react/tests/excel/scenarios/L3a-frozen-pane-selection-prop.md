---
id: excel.L3a.frozen-pane-selection-prop
layer: L3a
summary: selectionBehavior prop 转发到 Grid 构造且不泄漏为 DOM attribute
status: draft
---

## User Story

作为集成方，当我给 `NovaSheetGrid` 传入 `selectionBehavior` 时，我希望它被转发进 `Grid` 构造链并生效，且不作为未知 attribute 落到宿主 DOM 元素上，以便 React 层声明冻结窗格选择语义而无控制台告警。

## Given

- 渲染 `NovaSheetGrid`，传入 `selectionBehavior` 配置

## When

- 组件 mount 完成

## Then

- `Grid` 构造 options 中收到同一 `selectionBehavior` 引用
- 宿主 DOM 元素上不存在 `selectionbehavior` attribute
