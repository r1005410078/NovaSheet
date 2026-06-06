# NovaSheet Core Perf Hardening — 设计

> 状态：设计已确认，待 writing-plans
> 分支基线：`refactor-default-grid-engine-decomposition`（未合并 `main`）
> 性质：纯重构 + 一处坐标修正。除组件 3 在 hide+sort/filter 组合下行为由「错」变「对」外，对外行为零变化。

---

## 背景

`packages/core/src` code review（2026-06-06）发现三处与「1M+ 行」目标或长会话可扩展性相关的债，决定在推进 5-C 功能线之前先收口：

1. **ChunkedAxis.insertRange/deleteRange 全量重建**——文件头注释把「插入只 invalidate 命中 chunk、无需重建整轴」列为分块设计卖点，但实现是 `flattenSizes()` + `rebuild()` + 逐项 `setSize` 恢复，复杂度 O(count × n_chunks)，与承诺脱节。
2. **RangeStyleStore append-only 永不回收 + applyBorders 每格一层**——100×100 边框写入产生 1 万层，`resolveCell` O(layers)，每帧 `resolveVisible` 为 O(可见格 × 总层数）。
3. **HideRowsLayer.getCollapsedGaps 坐标系混用**——`makeGap` 在 raw-id 空间分组并 `visibleRows.indexOf(rawId)`，而 `visibleRows` 装的是 upstream 位置；仅在 upstream 为恒等映射（无 sort/filter）时正确。hide+sort/filter 组合下塌缩指示线定位错误或落到 -1。

三者互不依赖，可独立实现与测试。

---

## 组件 1 — ChunkedAxis 真·chunk-local insert/delete

### 核心矛盾

现有 `getSize` / `indexToPosition` / `positionToIndex` / `setSize` / `flattenSizes` 全靠固定寻址
`chunkIdx = index >>> 10`、`offset = index & 1023` 定位 chunk。该寻址硬性要求「chunk i 永远覆盖全局索引
`[i·CHUNK_SIZE, (i+1)·CHUNK_SIZE)`」。插入 `count` 项会把插入点之后所有项重新编号，固定寻址下要么搬动后续
全部数据（仍 O(count)），要么破坏映射。**要真正次线性，必须更换寻址方案为变长 chunk + 累计计数二分。**

### 寻址方案变更

| 维度 | 现状 | 新方案 |
| --- | --- | --- |
| 寻址 | 固定 `index>>>10`，O(1) | 变长 chunk + `chunkCountPrefix` 累计计数，二分定位 O(log n_chunks) |
| chunk 长度 | 恒 CHUNK_SIZE（末块例外） | 变长；超 `2×CHUNK_SIZE` 分裂，过小相邻合并 |
| insert/delete | flatten + rebuild + setSize 风暴，O(count × n_chunks) | 命中 chunk 内 splice + 后续 prefix 增量，O(n_chunks + CHUNK_SIZE) |
| 热路径 lookup | O(1) | **O(log n_chunks)**（1M 行 ≈ 977 块 ⇒ ~10 次比较，仍 <1µs） |

**已知代价：渲染热路径 lookup 从 O(1) 退到 O(log n_chunks)。** 已确认接受——lookup 仍亚微秒，且 Viewport
每帧只查可见区 ~50 项；换 1M 行单次插入从「1M 数组分配 + N×977 prefix 写」降到次线性。

### 数据结构

- `chunkCountPrefix: Int32Array`，长度 `chunks.length + 1`，`chunkCountPrefix[i]` = chunk i 之前的项数累计；
  `chunkCountPrefix[0] === 0`，`chunkCountPrefix[chunks.length] === count`。
- `chunkPrefixSum: Float64Array`（沿用），`chunkPrefixSum[i]` = chunks[0..i) 尺寸累计。
- `Chunk.length` 变为可变；`sizes` 容量按需，可超 CHUNK_SIZE 直到触发分裂。
- 新增私有 `indexToChunk(index): { chunkIdx, offset }`——二分 `chunkCountPrefix` 替代 `>>> 10`。
  所有读写访问器统一改走它。

### rebalance 策略

- **分裂**：单 chunk `length > SPLIT_THRESHOLD`（= `2×CHUNK_SIZE`）时从中点切成两块。
- **合并**：删除后相邻两 chunk `length` 之和 `≤ CHUNK_SIZE` 时合并，避免碎片化退化二分深度。
- 分裂/合并后重算受影响区间的 `chunkCountPrefix` 与 `chunkPrefixSum`（O(n_chunks)）。

### 不变量（更新）

- `chunkCountPrefix.length === chunks.length + 1`，单调非降，`[0]===0`，`[last]===count`。
- `chunkPrefixSum.length === chunks.length + 1`，`[0]===0`，`[last]===totalSize`。
- 每 chunk `0 < length ≤ SPLIT_THRESHOLD`（空 chunk 不存在；末块允许 < CHUNK_SIZE）。
- `chunk.sizes` 非空 iff 该块内至少一项 `!== defaultSize`；遍历用 `chunk.length`，不用 `sizes.length`。

### 接口与行为

`Axis` / `MutableAxis` 公开接口不变。`getSize` / `indexToPosition` / `positionToIndex` / `getVisibleRange` /
`setSize` / `setDefaultSize` / `getTotalSize` / `getCount` 对外行为逐字节不变。文件头注释更新复杂度承诺
（lookup O(log n_chunks)、insert/delete O(n_chunks + CHUNK_SIZE)）。`CHUNK_SIZE = 1024` 保留（不变量 #3）。

### 测试

复用现有 ChunkedAxis 测试守住读写访问器行为；新增：

- 跨 chunk 边界插入（在块尾、块首、正中）后 `indexToPosition` / `positionToIndex` 一致。
- 插入致分裂、删除致合并后所有访问器与 `getTotalSize` 正确。
- 大量非默认尺寸下 insert/delete 保持 override（与旧 flatten 路径等价对拍）。
- 末块 partial chunk 插入/删除语义。
- `setSize` / `setDefaultSize` 与变长 chunk 交互。
- 不变量断言：countPrefix / prefixSum 单调、首尾、每块长度边界。

---

## 组件 2 — RangeStyleStore：applyBorders 单层化

### 变更

| 维度 | 现状 | 新方案 |
| --- | --- | --- |
| 边框写入 | 每格 `push` 一层 | 整个 range `push` 一层 `{ range, patch: {}, borderPreset, borderStyle, order }` |
| 边缘归属 | 写时 `borderPatchForCell` 算好存死 | 读时 `resolveCell` 按 `(preset, 该格在 range 中位置)` 现算 |
| 层数 | O(cells)/次 | O(1)/次 |

### 实现

- `FormatLayer` 增可选字段 `borderPreset?: Exclude<BorderPreset, 'clear'>` 与 `borderStyle?: BorderStyle`。
- `applyBorders(range, preset, border)`：`preset === 'clear'` 仍走 `clearBorders`；其余 push 单层带
  `borderPreset` / `borderStyle`，删除 per-cell 循环。
- `resolveCell`：命中带 `borderPreset` 的层时调
  `borderPatchForCell(layer.range, rowIndex, colIndex, layer.borderPreset, layer.borderStyle)` 取该格边缘 patch，
  并入 `borders`（沿用 `{ ...borders, ...patch }`、`hasBorders` 语义）。空 patch 不置 `hasBorders`。
- `anyLayerContributesBorders`：带 `borderPreset` 的层视为贡献边框。
- `snapshot` / `restore` 仍输出/接收 `FormatLayer[]`——**undo 契约不变**；新字段随层快照。

### 测试

- 单层 border resolve 与旧逐格 resolve 对拍等价（含 outer/all/inner 各 preset 的边缘归属）。
- 边框 + 填充 + textWrap 叠加 resolve 顺序不变。
- `setBorders` undo/redo round-trip。
- 结构 remap（行列插删/reorder）后单层 range 平移，边缘仍按新 range 位置正确解析。
- `clearBorders` 对单层边框生效。

---

## 组件 3 — HideRowsLayer：getCollapsedGaps view 空间重写

### 算法

把 gap 计算从 raw-id 空间迁到 upstream 位置空间，基于 `visibleRows`（升序 upstream 位置）：

```
首段：visibleRows[0] > 0 ⇒ 文件顶部有隐藏段
  atViewRow = -1
  hiddenIds = [0, visibleRows[0]) 各 upstream 位置 → resolveUnderlyingRow

相邻对 (prev = visibleRows[k], cur = visibleRows[k+1])：
  cur > prev + 1 ⇒ (prev, cur) 间有隐藏位置 ⇒ 生成一个 gap
    atViewRow = k                     // 左 view 行下标
    hiddenIds = (prev, cur) 间各 upstream 位置 → resolveUnderlyingRow
    hiddenCount = hiddenIds.length
```

`hiddenIds` 经 `upstream.resolveUnderlyingRow(pos) ?? pos` 映射回 underlying id（与 `getHiddenUnderlyingRows`
同空间，供 UI 与 unhide 用）。私有 `makeGap` 被新逻辑取代。

### 等价性

无 sort/filter 时 upstream 位置 == raw underlying id，新算法逐字节复现现状；有 sort/filter 时由错变对。
`CollapsedGap` 接口（`atViewRow` / `hiddenCount` / `hiddenIds`）不变；`FrameAssembler` 消费方不变。

### 测试

- hide-only：与现状结果等价（多段、单段、相邻段）。
- hide + sort：gap `atViewRow` 落在正确 view 行，`hiddenIds` 为正确 underlying id。
- 顶部隐藏段 `atViewRow === -1`。
- 全隐藏 / 无隐藏边界。
- 隐藏 + 行结构变更后 gap 重算正确。

---

## 实现顺序与提交

三组件独立，各自一条 TDD 提交（`refactor(core): ...` / `fix(core): ...`）：

1. `refactor(core): ChunkedAxis 变长 chunk + 累计计数寻址，insert/delete 次线性`
2. `refactor(core): RangeStyleStore applyBorders 单层化，边缘读时解析`
3. `fix(core): HideRowsLayer.getCollapsedGaps view 空间重写，修 hide+sort 塌缩定位`

每条遵循 TDD：先写失败测试，见红，实现，见绿，提交。门禁（lint / typecheck / test / build）全绿方可提交。

## 非目标（本轮不做）

- RangeStyleStore 阈值 compaction 与读时空间索引（已评估，暂不做）。
- ChunkedAxis 退回固定寻址的「只去二次因子」方案（已否决，选定 chunk-local）。
- 任何对外 API / 渲染契约 / undo 命令形状的变更。
