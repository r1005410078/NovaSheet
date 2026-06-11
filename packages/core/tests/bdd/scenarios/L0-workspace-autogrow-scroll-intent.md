---
id: core.L0.workspace-autogrow-scroll-intent
layer: L0
summary: Excel workspace 只在有效 wheel 边缘意图下自动增长
tags: [excel-workspace]
status: implemented
---

## User Story

作为 Excel 工作区使用者，当我滚到已物化内容边缘并继续使用 wheel 滚动时，我希望 workspace 自动增长；但程序化滚动或冷却期内不应重复增长。

## Given

- 当前 workspace 为 100 行 x 10 列
- 可见行已接近底部
- 底部附近存在物化行

## When

- 纯函数 `decideExcelWorkspaceResize` 收到有效 wheel intent
- `ExcelWorkspaceController` 记录同样的 wheel 并进入 scroll frame

## Then

- 纯函数返回 grow 决策
- controller 通过 port append rows
