---
id: core.L0.clipboard-tsv-parse-matrix
layer: L0
summary: parseTsvToCells 类型强制矩阵与黄金文件一致
tags: [clipboard, pure, golden]
status: implemented
---

## User Story

作为 Core 集成方，当我把外部 TSV 粘贴进表格时，我希望 `parseTsvToCells` 对每种字段类型的强制规则（number 空值/非法/科学计数/前导零、checkbox 真值词表、短行补 null、引号内分隔符）由一份已 review 的黄金矩阵锁定，以便任何解析语义回归立即可见。

## Given

- text/number/checkbox 三列 schema
- 覆盖各强制分支与结构边角的多行 TSV 输入

## When

- 逐条调用 `parseTsvToCells`，将结果按 `typeof(value)` 标注 dump

## Then

- 输出与 `__goldens__/core.L0.clipboard-tsv-parse-matrix.golden.txt` 逐字符一致：
  number 空串→null、非法→保留 raw string（applyPaste 决定 SKIP）；checkbox true/1/yes→true、未知→raw；短行右侧补 null；引号内 `\t` 不分列、`""` 还原字面引号
