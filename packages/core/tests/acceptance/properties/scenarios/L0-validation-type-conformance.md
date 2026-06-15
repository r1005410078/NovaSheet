---
id: core.L0.validation-type-conformance
layer: L0
summary: checkTypeConformance 对内置字段类型的值域合规矩阵
tags: [validation, type-conformance, layer-a]
status: implemented
---

## User Story

作为 Core 维护者，我希望 `checkTypeConformance` 为每种内置字段类型提供一致的值域检查（Layer A），null/undefined 始终合法、custom type 跳过检查，以便在 Layer B/C 规则运行前过滤类型不匹配错误。

## Given

- `checkTypeConformance(value, resolvedType)` 函数
- 内置类型：text、number、date、checkbox、url、singleSelect、multiSelect
- 已知 number/date 列存储 JS number（serial），checkbox 存储 boolean，multiSelect 存储 string[]

## When

- 对每种类型传入合法值、不合法值、null、undefined

## Then

- null / undefined 对任意类型返回 null（合法）
- number: number 合法，string 返回含"数字"的错误消息
- date: number（serial）合法，string 返回含"日期"的错误消息
- checkbox: boolean 合法，string 返回含"复选框"的错误消息
- text / url / singleSelect: string 合法，number 返回含对应类型名称的错误消息
- multiSelect: string[] 合法，string 返回含"多选"的错误消息
- 未注册 custom type（如 'rating'）：任意值返回 null（跳过检查）
