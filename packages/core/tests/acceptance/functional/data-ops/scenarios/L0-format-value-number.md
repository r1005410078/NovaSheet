---
id: core.L0.format-value-number
layer: L0
summary: formatValue 描述符矩阵（number/percent/currency/date）与黄金文件一致
tags: [format, golden]
status: implemented
---

## User Story

作为 Core 使用者，当我给值应用任意 `ValueFormat` 描述符时，我希望全部描述符 kind 的输出文本由一份已 review 的黄金矩阵锁定，以便任何格式化回归（含数字字符串解析、locale 差异）立即可见。

## Given

- 值 × 描述符矩阵：number（含负数、文本数字 `"1234.5"`）、percent、currency（USD / CNY×zh-CN）、date（两种 pattern）
- 默认 locale `en-US`

## When

- 逐条调用 `formatValue` 并 dump 为文本

## Then

- 输出与 `__goldens__/core.L0.format-value-number.golden.txt` 逐字符一致
