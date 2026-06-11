---
id: core.L0.fill-series-projection-matrix
layer: L0
summary: computeFillWrites 序列外推矩阵与黄金文件一致
tags: [fill, pure, golden]
status: implemented
---

## User Story

作为 Core 使用者，当我拖拽填充柄外推一列样本时，我希望 `computeFillWrites` 对每种序列模式（单样本 clone、等差数、文本尾号含补零/过零、日期等步、非等差回退循环）的投影结果由一份已 review 的黄金矩阵锁定，以便任何外推语义回归立即可见。

## Given

- 单列 schema，每条用例一组源样本
- 向下填充 6 行（含源行），direction = down

## When

- 逐条 `computeFillWrites`，将投影序列 dump（Date 用 ISO）

## Then

- 输出与 `__goldens__/core.L0.fill-series-projection-matrix.golden.txt` 逐字符一致：
  单样本克隆、等差数（含递减/过零）、文本尾号 +1（补零保宽、过零不出 `-0`）、日期按日等步、非等差与无尾号文本回退源样本循环
