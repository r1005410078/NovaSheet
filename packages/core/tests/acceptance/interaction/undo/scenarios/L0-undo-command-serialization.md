---
id: core.L0.undo-command-serialization
layer: L0
summary: UndoCommand JSON 序列化 round-trip smoke
tags: [undo, pure]
status: implemented
---

## User Story

作为 Core 集成方，当我持久化 undo 命令时，我希望代表性 `UndoCommand` 经 JSON round-trip 后结构不变。

## Given

- editCell 与 format 两类 UndoCommand 样例

## When

- JSON.stringify 后 parse 比对

## Then

- 深等于原命令
