---
id: excel.L3a.strict-mode-remount
layer: L3a
summary: Strict Mode 双挂载
status: draft
---
## Given
- React StrictMode 包裹 NovaExcel

## When
- 双次挂载后

## Then
- canvas 不泄漏
- ref 仍可用
