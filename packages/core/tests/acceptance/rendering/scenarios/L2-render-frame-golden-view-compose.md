---
id: core.L2.render-frame-golden-view-compose
layer: L2
summary: hide×sort 组合视图下 raw 键控格式的整帧黄金快照
tags: [rendering, golden, view, format]
status: implemented
---

## User Story

作为 Core 维护者，当视图被 hide+sort 打散后再施加格式时，我希望整帧快照锁定 raw→view 的翻译结果（格式跟随 raw 行移动、frame cellFormats 以 view 坐标发出），以便这条全项目最易错的不变量有黄金契约罩着。

## Given

- 5 行 name/score 数据，hideRows 隐藏 1 行
- score 降序排序后：对 view 行 0 设置 fillColor（raw 键控）、view 行 0–1 设置 percent 值格式

## When

- 捕获降序态 frame；再切换为升序排序，捕获第二帧

## Then

- 两段 `dumpFrame` 与 `__goldens__/core.L2.render-frame-golden-view-compose.golden.txt` 一致：
  降序态 fill/format 落在 view 行 0；升序后同一 raw 行移位，fill 跟随到新 view 行，原 view 行 0 无填充
