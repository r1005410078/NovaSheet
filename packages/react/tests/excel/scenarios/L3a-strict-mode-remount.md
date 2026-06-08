---
id: excel.L3a.strict-mode-remount
layer: L3a
summary: Strict Mode 双挂载
status: draft
---

## User Story

作为 React 应用开发者，在 Strict Mode 下开发时，我希望 NovaExcel 经历双次挂载/卸载后不留泄漏、ref 仍可用，以便与 React 18 开发模式兼容。

## Given
- React StrictMode 包裹 NovaExcel

## When
- 双次挂载后

## Then
- canvas 不泄漏
- ref 仍可用
