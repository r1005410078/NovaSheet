---
id: core.L1.validation-scheduler-large-batch
layer: L1
summary: ValidationScheduler 在 10 000 格大批量下顺序完整处理、无遗漏、无乱序
tags: [validation, scheduler, performance, stress]
status: implemented
---

## User Story

作为引擎消费者，当我对一个 10 000 格（1 000 行 × 10 列）的数据集调用 `validateAll()` 时，我希望所有格最终都能被校验、结果不乱序、不遗漏，以确保调度器在 pool 满时不丢失任何待处理单元格。

## Given

- `DefaultGridEngine`，1 000 行 × 10 列
- 所有列均配置 `Field.options.validation: { type: 'number-range', options: { min: 0, max: 999 } }`（同步 validator）
- 第 0 列所有行的值超出范围（值 = 1 000），其余列值合法（值 = row index % 999）

## When

- 调用 `engine.validateAll()` 并等待所有异步调度完成（通过 flush 直到 scheduler 队列为空）

## Then

- 第 0 列的全部 1 000 个单元格状态为 `{ status: 'invalid' }`
- 第 1–9 列的全部 9 000 个单元格状态为 `null`（无错误）
- 处理顺序：行 0 col 0 先于行 999 col 0 完成（FIFO 顺序保证，不因 pool 满而乱序）
- 无单元格在 resultStore 中缺失（所有 invalid 格均有记录）
