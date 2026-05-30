# NovaSheet — 填充柄 × 合并/格式 集成

- **Date**: 2026-05-30
- **Status**: 已实现（`fix/fill-handle-merge-format-snap`）
- **Scope**: 让 Phase 4.3 的填充柄（autofill）携带 Phase 5-A 的填充色 / 边框 / 合并区，并对齐 Google 表格的合并填充语义。
- **依赖**: [Phase 4.3 填充柄](2026-05-21-fill-handle-design.md) + [Phase 5-A 合并与 range 格式](2026-05-28-novasheet-phase-5-merge-range-formatting.md)

---

## 1. Problem

填充柄是 Phase 4.3 产物，早于 Phase 5-A 的合并/格式。其提交链路
`commitFill → computeFillWrites` **只写单元格值**，从不读写 `RangeStyleStore` /
`MergeStore`。因此：

- 从带填充色/边框的源拖填充柄，目标格不带任何格式（"颜色填充柄无效"）。
- 从合并源拖填充柄不复制合并区；盖到已有合并上时因 `MergeStore.merge` 拒绝重叠而完全无反应。

这不是回归，而是 autofill 从未实现「携带格式/合并」。本切片补齐该集成。

---

## 2. 行为基线（实现后）

### 2.1 填充柄 × 合并/格式 交互矩阵

| 源 (A) | 拖到目标 (B) | 行为 |
|--------|------|------|
| 任意 | 空白区 | 值按序列/平铺；携带源的填充色+边框（先清目标陈旧格式，精确等于源） |
| 含合并块 | 空白区 | 合并块沿轴按整块平铺；拖到非整块边界吸附补齐整块（不留裸格） |
| 合并块(N格) | 已有合并 B(M格) | 吸附到 B 边界 → 清除 B → 平铺源块（如 2 格源盖 3 格 B = **2+1**） |
| 单格(无合并) | 已有合并 B | 取消 B 合并，恢复普通格（对齐 Google 表格） |
| 任意 | 排序/筛选散裂视图 | 保守：只填值，不动格式/合并 |

### 2.2 统一吸附规则

> 光标落在已有合并上 → 填充区吸附到该合并的远端边界（不再 round-up 越过它）；
> 落在空白 → round-up 取整到源合并块的整倍数（末块补齐为整块）。
> 两种情况都先清除目标区已有合并，再平铺源块。

该规则由两个用户期望唯一确定：①拖到空白时末格不应留裸格（补齐合并）；
②盖到已有合并 B 时应按源块在 B 内平铺、末尾留单格（2+1）。

---

## 3. 设计决策（ADR）

| # | 决策 | 取舍 |
|---|------|------|
| D1 | Undo：`fill` 命令附带 `format/merge` store 快照，undo/redo 一并 `restore` | 与 insertRows/moveRows 等结构命令一致 |
| D2 | 格式平铺：目标格复制对应源格已解析格式，沿轴 `positiveModulo` 平铺；写前先 clear 目标使其精确等于源 | 与值序列平铺语义一致；含"源无格式则清空目标陈旧" |
| D3 | 合并平铺：源块沿轴按整块步长复制；尾部放不下整块的 tile 跳过 | 合并不可重叠 + 保守 |
| D4 | 非连续 raw 映射（排序/筛选散裂）：跳过格式/合并传播，值照填 | Phase 5-A「保守禁用冲突 mutation」 |
| D5 | 整块吸附在 `computeFillTarget` 内完成 | preview 与 commit 走同一函数，保证一致 |
| D6 | 填充覆盖目标区一律先 `unmerge(rawFill)`，再按源是否含合并决定是否平铺 | 单格源取消合并 + 合并源替换，统一为一条无条件清除 |

---

## 4. 实现位置

| 改动 | 文件 |
|------|------|
| `commitFill` 后调 `propagateFillStyles`；`tileFillFormat` / `tileFillMerge` / `getFillMergeSnap` | `packages/core/src/engine/DefaultGridEngine.ts` |
| `computeFillTarget` 加 `snap?` / `targetMerge?` 参数 + `snapFillToBlocks` | `packages/core/src/fill/FillTarget.ts` |
| `fill` undo 命令加可选 `format/merge` 快照字段 | `packages/core/src/undo/UndoCommand.ts` |
| `GridEngine.getFillMergeSnap` 接口 | `packages/core/src/engine/GridEngine.ts` |
| runtime 拖拽时注入 snap + 光标所在合并（`frame.mergeRegions`）；`cellInRange` | `packages/web/src/runtime/WebGridRuntime.ts` |

---

## 5. 坐标 / Undo 不变量

- `RangeStyleStore` / `MergeStore` 以 RAW 行列为键；传播 mutation 先把 view source/fill 翻成连续 raw，散裂则整体跳过（D4）。
- `propagateFillStyles` 在连续映射时快照前后 store，挂到 `fill` undo 命令；undo/redo 的 `fill` 分支按存在性 `restore`。
- 渲染：`getFrame()` 翻译 raw→view 输出 `cellFormats` / `mergeRegions`；`commitFill` 后照常触发帧，无新增 DOM。

---

## 6. 未覆盖 / 后续

- 单格源部分盖住合并时，preview 仅显示拖拽范围，但 commit 会整体取消该合并（与 Google 表格一致，预览/提交存在轻微不一致）。
- 跨多个不同尺寸目标合并的复杂吸附只处理光标所在合并，其余相交合并被整体清除。
- 高级边框线型（dashed/dotted/double）渲染仍属 Phase 5-B。
