---
id: core.L0.datasource-windowed-initial-skeleton
layer: L0
summary: WindowedDataSource 构造即得完整骨架，hintWindow 驱动首次拉取落地后单元格从 miss 变为实际值
tags: [datasource, windowed]
status: draft
---

## User Story

作为 Core 集成方，当我用 10 万行 schema 构造 `WindowedDataSource` 时，我希望立即获得完整的行数与 schema（无需等待任何网络 IO），使 Grid 能渲染骨架结构；随后首个 `hintWindow` 触发的拉取落地后，对应区域的 `getCell` 从 `undefined` 变为实际值。

## Given

- `rowCount = 100000`、2 列 schema 的 `WindowedDataSourceOptions`
- `FakeProvider.loadRange` 返回一个可手动 resolve 的 Promise，尚未 resolve
- 尚未调用 `hintWindow`

## When

- 构造 `WindowedDataSource`
- 读取 `getRowCount()` / `getSchema()`
- 读取窗口内某单元格 `getCell(0, 'name')`（拉取前）
- 调用 `hintWindow({ startRow: 0, endRow: 39, startCol: 0, endCol: 1 })`
- resolve `FakeProvider.loadRange` 的 Promise，携带该窗口的 `rows`

## Then

- 构造后立即 `getRowCount()` 返回 `100000`，`getSchema()` 返回传入 schema（不等待 IO）
- 拉取前 `getCell(0, 'name')` 返回 `undefined`
- `hintWindow` 恰好触发一次 `loadRange` 调用，窗口按 `preloadScreens` 对称外扩并 clamp 到数据边界
- resolve 后 `getCell(0, 'name')` 返回落地的值，订阅的 listener 收到一次 `rowsChanged`
