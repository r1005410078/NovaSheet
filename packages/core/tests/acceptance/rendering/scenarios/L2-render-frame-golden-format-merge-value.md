---
id: core.L2.render-frame-golden-format-merge-value
layer: L2
summary: fill+merge+值格式叠加后的 RenderFrame 快照与黄金文件一致
tags: [rendering, golden, format, merge, value-format]
status: implemented
---

## User Story

作为引擎维护者，当 fill / merge / 值格式（5-A/5-C）任一翻译链（raw→view、formatCell 闭包）被改动时，我希望叠加三者后的整帧快照与黄金文件比对，以便格式丢失、坐标翻译错位或格式化文本回归立即可见。

## Given

- 一个 recording backend + 3 行 4 列数据源
- 通过 Grid facade：r0c0 填充 `#fff2cc`、r0c1 设 percent 值格式、r1..r2×c0..c1 合并

## When

- flush 帧并 dump

## Then

- 快照中 cells 段显示 percent 格式化文本（`1,000.0%`）
- merges 段含 `[r1c0..r2c1] anchor=r1c0`；cellFormats 段含 fill 与 valueFormat 条目
- 与 `__goldens__/core.L2.render-frame-golden-format-merge-value.golden.txt` 一致
