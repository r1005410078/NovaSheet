---
id: core.L2.grid-view-filter-contains-equals
layer: L2
summary: Grid FilterLayer text-contains 与 text-equals
tags: [grid, view, filter]
status: implemented
---

## User Story

作为 Grid facade 使用者，当我设置筛选条件时，我希望 `getViewPipeline().getComposed()` 只保留匹配 contains 或 equals 的行。

## Given

- 一个 mounted Grid
- 含 Alpha / beta / ALPINE 等文本行

## When

- 设置 `text-contains`（case insensitive）
- 再设置 `text-equals`（case insensitive）

## Then

- contains 保留 Alpha 与 ALPINE
- equals 仅保留 Alpha
