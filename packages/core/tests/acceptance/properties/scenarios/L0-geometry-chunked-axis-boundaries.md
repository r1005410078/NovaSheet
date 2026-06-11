---
id: core.L0.geometry-chunked-axis-boundaries
layer: L0
summary: ChunkedAxis 边界索引与 CHUNK_SIZE
tags: [geometry, pure]
status: implemented
---

## User Story

作为 Core 集成方，当我访问轴边界索引时，我希望 `CHUNK_SIZE` 为 1024 且 `getSize`/`getChunkCount` 在边界行为正确。

## Given

- count=1025 的 ChunkedAxis

## When

- 读取 `CHUNK_SIZE`、`getSize(1024)`、`getChunkCount()`

## Then

- CHUNK_SIZE 为 1024
- 末索引 size 非 0
- chunk 数为 2
