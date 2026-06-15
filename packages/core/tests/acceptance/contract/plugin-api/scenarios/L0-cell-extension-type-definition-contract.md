---
id: core.L0.cell-extension-type-definition-contract
layer: L0
summary: CellTypeDefinition 锁定编辑、剪贴板、排序与筛选语义
tags: [cell-extension, plugin-api, filter]
status: implemented
---

## User Story

作为 Core 集成方，当我为自定义类型注册 `CellTypeDefinition` 时，我希望编辑解析、剪贴板序列化、排序值和 filter operator 都由同一份类型语义驱动，以便业务类型在不同入口保持一致。

## Given

- 注册 `rating` 类型定义
- `rating` 定义包含 `formatForEdit`、`parseEditInput`、`serializeClipboard`、`parseClipboard`、`sortValue`、`isEmpty` 与 `filterOperators`
- `rating` 字段 options 含 `{ max: 5 }`

## When

- 对 raw value `4` 调用 edit format / parse
- 对剪贴板文本 `3` 和非法文本 `bad` 调用 parse
- 对多个 rating value 计算 sort key
- 用 `gte` filter operator 匹配 `>= 3` 的值

## Then

- edit draft 为 `"4"`，合法输入解析为 clamp 后 number
- 非法 edit / clipboard 输入返回失败 sentinel，不写入数据
- sort key 使用 number 值而不是 fallback string
- filter operator 只匹配满足业务谓词的单元格
