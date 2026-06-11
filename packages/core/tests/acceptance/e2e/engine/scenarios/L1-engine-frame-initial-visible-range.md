---
id: core.L1.engine-frame-initial-visible-range
layer: L1
summary: DefaultGridEngine 初始 frame 快照与黄金文件一致
tags: [engine, frame, golden]
status: implemented
---

## User Story

作为 Core 维护者，当我用一个 2x2 数据源初始化 `DefaultGridEngine` 时，我希望 `getFrame()` 能暴露稳定的行列数量和首格数据，以便后续渲染后端和门面 runner 共享同一份引擎观测契约。

## Given

- 使用 2x2 dense data 初始化 `DefaultGridEngine`
- viewport 设置为 400 × 240

## When

- 调用 `engine.getFrame()`

## Then

- `dumpFrame(engine.getFrame())` 与 `__goldens__/core.L1.engine-frame-initial-visible-range.golden.txt` 一致（可见范围、region 几何、单元格文本整帧锁定）
