---
id: core.L0.clipboard-tsv-roundtrip
layer: L0
summary: TSV 序列化与解析往返公开契约
tags: [clipboard, pure]
status: implemented
---

## User Story

作为 Core 集成方，当我处理剪贴板 TSV 时，我希望 `serializeRowsToTsv` 与 `parseTsvToCells` 对 text/number/boolean 保持可逆语义。

## Given

- 含 text、number、checkbox 列的 schema
- 两行 row 数据

## When

- `serializeRowsToTsv` 后 `parseTsvToCells`

## Then

- serialize 输出与 `__goldens__/core.L0.clipboard-tsv-roundtrip.golden.txt` 逐字节一致（TSV 是对外文本格式契约）
- 解析结果与原始 cell 值一致
