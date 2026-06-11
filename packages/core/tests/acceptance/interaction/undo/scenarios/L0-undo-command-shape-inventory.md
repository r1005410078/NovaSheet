---
id: core.L0.undo-command-shape-inventory
layer: L0
summary: 全 21 个 UndoCommand kind 的字段集与黄金文件一致
tags: [undo, pure, golden]
status: implemented
---

## User Story

作为 Core 维护者，当 undo 历史被持久化或跨版本读取时，我希望每个 `UndoCommand` kind 的字段集由一份已 review 的黄金清单锁定，以便任何字段增删改（影响序列化格式与回放兼容）显式过 review。

## Given

- 每个 kind 一个最小代表实例（全字段齐全，fill 含可选 format/merge）

## When

- 逐实例 `assertSerializable`（JSON 往返无损）并取排序后的字段键集

## Then

- 21 行 `kind: field, …` 与 `__goldens__/core.L0.undo-command-shape-inventory.golden.txt` 一致；每个 kind 均 JSON 可序列化
