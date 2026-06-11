---
id: core.L2.render-frame-golden-base
layer: L2
summary: 基础网格 RenderFrame 文本快照与黄金文件一致
tags: [rendering, golden, frame]
status: implemented
---

## User Story

作为引擎维护者，当我改动几何/可见域/frame 组装的任何环节时，我希望基础网格的整帧快照与已 review 的黄金文件比对，以便任何区域几何、可见范围或单元格文本的意外漂移立即被发现。

## Given

- 一个 recording backend + 3 行 4 列数据源（mutableSchema）
- 容器 400×300，默认主题

## When

- 挂载 Grid 并 flush 首帧

## Then

- `dumpFrame(lastFrame)` 与 `__goldens__/core.L2.render-frame-golden-base.golden.txt` 逐字符一致
- 快照覆盖 viewport 几何、regions、可见单元格文本
