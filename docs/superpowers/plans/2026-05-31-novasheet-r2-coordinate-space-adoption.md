# R2 — CoordinateSpace 全面落地 + 内部 RawRange brand（实现计划）

- **Date**: 2026-05-31
- **Status**: plan → 执行
- **依据**: `docs/architecture-review-2026-05-31.md` R2（坐标系散点、无封装，本系统头号 bug 源）。
- **前置**: R2-A 已立 `CoordinateSpace`（`packages/core/src/view/CoordinateSpace.ts`），但仅 2 处使用；R3 共享几何 `geometry/range.ts` 已落地。
- **决策**: 内部 `RawRange` brand（sweet spot）——只给 **raw 空间**打 brand，public `CellRange` 仍是 view 语义不变；编译器挡住引擎内部 raw/view 混用（真正的 bug 源），public API / painters / 外部 Grid 调用零改动。

---

## 1. 现状（证据）

- 引擎持有 `this.coords = new CoordinateSpace(...)`，但只用在 2 处（`viewRangeToRaw`、`viewColToRaw`）。
- 仍绕过 coords 的散点：
  - **23 处** `resolveUnderlyingRow(this.data, …)` / `findViewRow(this.data, …)` 直接调用（含 `remap*` 内部的 `findViewRow`）。
  - `getRawColumnIndex(fieldId)`（schema fieldId→raw col）coords 未覆盖；6 处调用。
  - `viewRangeToRawRange`（私有，已委托 coords）+ `getRawColumnIndexForViewIndex`（已委托）是薄包装，可保留或内联。
- `CellRange` 定义于 `interaction/SelectionModel.ts`，跨 3 包 26 文件引用；stores（`RangeStyleStore`/`MergeStore`）按 **raw** 键入，却与 view 共用同一 `CellRange` 类型 → 混用无编译保护。

---

## 2. 目标

1. **唯一翻译入口**：所有 raw↔view 翻译走 `this.coords`；引擎不再直接 import `resolveUnderlyingRow`/`findViewRow`。
2. **内部 RawRange brand**：`RawRange = CellRange & { __space:'raw' }`，仅 coords 内部构造（`asRawRange`）；stores 与引擎 raw 侧只收 `RawRange`，传 view `CellRange` → 编译报错。
3. geometry/range.ts 纯函数保持 space-agnostic（`RawRange` 结构兼容 `CellRange`，无需改）。

---

## 3. 切片（每片一 commit、TDD、四门全绿）

### T1 — Slice 1：翻译收口走 coords（无类型变化）

- coords 新增 `fieldIdToRaw(fieldId: string): number`（schema fieldId→raw col index，复用引擎现 `getRawColumnIndex` 体；越界 -1）。ctx 增 `getRawSchema` 已有。
- 引擎替换：
  - `resolveUnderlyingRow(this.data, x)` → `this.coords.viewRowToRaw(x)`（23 处的行侧）。
  - `findViewRow(this.data, x)` → `this.coords.rawRowToView(x)`（含 `remapRangeEndpoint`/`remapSelectedRows` 内部）。
  - `getRawColumnIndex` 体改为 `return this.coords.fieldIdToRaw(fieldId)`（保留方法名做内部短名，或全替换调用点——择简）。
- 删除引擎对 `resolveUnderlyingRow`/`findViewRow` 的直接 import（若全替换干净）。
- **保留** `oldResolveUnderlyingRow` 回调参数（pre-mutation 快照，非 live 映射）。
- 测试：先加 `CoordinateSpace.fieldIdToRaw` 单测（TDD）；引擎现有 832 测试零改动保绿（行为不变证据）。

### T2 — Slice 2：内部 RawRange brand

- `view/coordinates.ts`（或新 `view/RawRange.ts`）：
  ```ts
  export type RawRange = CellRange & { readonly __space: 'raw' }
  /** 唯一构造点：仅 coords 翻译出 raw 区时调用。 */
  export const asRawRange = (r: CellRange): RawRange => r as RawRange
  ```
- `coords.viewRangeToRaw` 返回 `RawRange | null`（内部 `asRawRange`）。
- stores public mutation 入参 `range: CellRange` → `RawRange`：
  - `RangeStyleStore.apply/clearFill/clearBorders/applyBorders/resolveVisible`（resolveVisible 读侧也 raw）。
  - `MergeStore` 的 merge/unmerge/查询入参。
- 引擎 raw-range 局部变量类型标 `RawRange`（来自 `coords.viewRangeToRaw`），传 stores 编译通过；任何「把 view CellRange 直接喂 store」的旧点 → 编译红 → 即潜在 bug，逐个查修。
- **不** brand 单个 index（number）——churn 大、边际低；range 级已覆盖 review 点名的 bug（非连续 no-op、合并 anchor、union/replace 分裂）。
- 若 stores + engine 改动量大，可拆 T2a（stores 签名 + brand 定义）/ T2b（engine 穿线修红）两 commit。
- 测试：stores 现有测试改 `RawRange`（用 `asRawRange` 包测试夹具）；引擎测试保绿。

### T3 — 收尾

- 更新 `docs/architecture-review-2026-05-31.md` R2 状态 → 「已落地（翻译收口 + 内部 RawRange brand）」。
- 四门全绿 + 自检（散点扫描：引擎不再直接 import 翻译函数；stores 入参全 `RawRange`）。

---

## 4. 硬点 / 风险

1. **brand 是 phantom**：`asRawRange` 是 `as` 断言，运行时零开销、零行为变化；安全网纯在编译期。误标会把 view 当 raw——但唯一构造点在 coords，审查面收敛到一处。
2. **resolveVisible 读侧**：`RangeStyleStore.resolveVisible(range)` 当前收 view 还是 raw？落地时确认——getFrame 用它时传的是 raw 可见区（raw→view 翻译在外层）。需核对调用点，标对 brand。
3. **public API 不动**：`Grid.setBorders/setFillColor/mergeCells` 仍收 view `CellRange`；引擎入口处 `coords.viewRangeToRaw` 翻译后才进 raw 域——brand 边界 = 引擎的 view→raw 翻译点，唯一。
4. **行为不变**：纯类型 + 收口，无运行时逻辑改动；832 测试零改动保绿是验收硬证据。

---

## 5. 验收

- 引擎源码 0 处直接 `resolveUnderlyingRow(this.\|findViewRow(this.`（全走 coords）。
- stores public mutation 入参全 `RawRange`；传 view `CellRange` 编译报错（手验一例）。
- 四门全绿；既有测试零行为改动通过。
- 架构 review R2 状态更新。
