# NovaSheet Phase 5 — Merge + Range Formatting

- **Date**: 2026-05-28
- **Status**: Brainstorm（待评审）
- **Scope**: 单元格合并 + range 样式模型 + 填充色 + Google Sheets 式基础边框；并为高级边框、数字/日期/货币格式、条件格式保留正式规划位置。
- **First delivery slice**: Phase 5-A Merge + Basic Range Styling
- **Out of scope for 5-A（进入 Phase 5 后续，不进首版实现）**:
  - dashed / dotted / double 边框线型
  - top / right / bottom / left 单边边框 UI
  - 数字 / 日期 / 百分比 / 货币格式
  - 条件格式规则
  - 交替行颜色、主题色板 UI
  - 跨 sheet 合并 / 公式引用更新

---

## 1. Problem

README 旧版 Phase 5 把“合并 / 对齐 / 数字格式 / 条件格式”放在一个粗粒度桶里，但实际实现依赖并不相同：

- **合并单元格、填充色、边框颜色/粗细**共享同一套 `CellFormat` / range style store、Canvas 绘制顺序、undo/redo、复制粘贴格式语义。
- **数字 / 日期 / 货币格式**需要 display-value pipeline，影响 `CellPainter` 文本生成，但不改变单元格几何。
- **条件格式**需要规则引擎、优先级、与手动格式叠加策略，不能混进 5-A 的手动样式模型里。

因此 Phase 5 需要重规划为一个总阶段 + 多个子阶段。首版先交付 Google Sheets 高频核心：merge / fill / border；高级格式进入同一 Phase 的后续切片，避免规划缺口。

---

## 2. Phase 5 Breakdown

| 子阶段 | 名称 | 范围 | 首版实现 |
| --- | --- | --- | --- |
| Phase 5-A | Merge + Basic Range Styling | merge/unmerge、fill color、border all/outer/inner/clear、border color、solid thin/medium/thick、undo/redo、内部复制粘贴带格式 | 是 |
| Phase 5-B | Advanced Borders | top/right/bottom/left 单边边框、dashed/dotted/double、border preset UI | 否 |
| Phase 5-C | Number / Date / Currency Format | raw value 不变，display value 按数字/日期/百分比/货币 formatter 输出 | 否 |
| Phase 5-D | Conditional Formatting | 按值/文本/范围规则自动生成样式，处理优先级与手动格式叠加 | 否 |

Phase 5-A 的架构必须能承载 5-B/C/D，但不提前实现它们的 UI 和规则系统。

---

## 3. Goals（Phase 5-A）

1. 新增平台无关 `CellFormat` 数据模型，不把样式塞进 `CellValue`。
2. 支持 sparse range style store，整行/大范围填充不能为 1M 行生成 per-cell object。
3. 支持 `setFillColor(range, color | null)`：cell / range / 整行 selection 都走同一语义。
4. 支持基础边框：
   - preset: `all` / `outer` / `inner` / `clear`
   - color: 任意合法 CSS color string（首版不做色板约束）
   - width: `thin` / `medium` / `thick`
   - style: 5-A 只实现 `solid`
5. 支持 `mergeCells(range)` / `unmergeCells(range)`；合并区域只有 anchor cell 可编辑。
6. 合并区域 hit test、selection、keyboard navigation、copy/paste、fill handle 不破坏现有语义。
7. Canvas 渲染顺序正确：背景填充 → merged cell content → default grid lines → custom borders → selection overlay。
8. fill / border / merge / unmerge 全部进 undo/redo。
9. 同 NovaSheet 内部复制粘贴可带 5-A 格式；外部 TSV 仍只交换值。
10. Storybook 增加手测入口：merge、fill、border、组合场景。

---

## 4. Non-Goals（Phase 5-A）

- 不做 dashed / dotted / double；仅在类型中预留或通过 future enum 标注。
- 不做条件格式规则系统。
- 不做数字 / 日期 / 货币 formatter。
- 不做对齐、字体、字号、加粗、斜体、文本颜色。
- 不做公式引用和跨 sheet 合并语义。
- 不改变 DataSource `getRows(start, end)` 的 inclusive `endIndex` 约定。
- 不引入 DOM cell layer；内容仍由 Canvas 绘制。

---

## 5. UX Contract

### 5.1 Fill Color

| 操作 | 行为 |
| --- | --- |
| 选中单格后设置 fill | 仅该 cell 背景变色 |
| 选中 range 后设置 fill | 整个 range 背景变色 |
| 选中整行后设置 fill | 对可见列范围表现为整行背景；底层记录为 row-scoped range style |
| 设置 `null` / clear fill | 清除该 range 上的 fill override |
| 合并区域设置 fill | 整个 merge range 使用同一 fill |

### 5.2 Borders

5-A 采用 Google Sheets 高频 preset：

| Preset | 行为 |
| --- | --- |
| `all` | range 内所有 cell 边界都画 custom border |
| `outer` | 只画 range 外框 |
| `inner` | 只画 range 内部分隔线 |
| `clear` | 清除 range 内 custom border |

`color` 与 `width` 应用于本次 preset 写入。5-A 的 `style` 固定为 `solid`。

### 5.3 Merge

| 操作 | 行为 |
| --- | --- |
| 单格 merge | no-op，返回 `false` |
| range merge | 生成一个 merge region，左上角为 anchor cell |
| 合并区域内编辑 | 只编辑 anchor cell 的值 |
| 点击非 anchor cell | selection 映射到整个 merge region，active cell 为 anchor |
| unmerge | 删除命中的 merge region；值仍保留在 anchor cell |
| 对重叠 merge 再 merge | 5-A 拒绝并返回 `false`；后续如需 Sheets 式替换策略另开设计 |

### 5.4 Clipboard

| 来源 / 目标 | 行为 |
| --- | --- |
| NovaSheet 内部 copy/paste | 值 + 5-A format + merge metadata 一起复制 |
| 外部 TSV paste | 只粘贴值，不带格式 |
| copy 合并区域到外部 | TSV 输出 anchor 值；非 anchor cell 输出空字符串 |
| paste 到合并区域 | 首版拒绝跨越不匹配 merge region 的结构性 paste，触发 `onPasteSkipped` |

---

## 6. Data Model

### 6.1 CellFormat

```ts
export interface CellFormat {
  readonly fillColor?: string
  readonly borders?: CellBorders
  readonly numberFormat?: NumberFormat // Phase 5-C
  readonly conditionalFormatIds?: readonly string[] // Phase 5-D derived link, not manual style
}

export interface CellBorders {
  readonly top?: BorderStyle
  readonly right?: BorderStyle
  readonly bottom?: BorderStyle
  readonly left?: BorderStyle
}

export interface BorderStyle {
  readonly color: string
  readonly width: 'thin' | 'medium' | 'thick'
  readonly lineStyle: 'solid' | 'dashed' | 'dotted' | 'double'
}
```

5-A 只写入 `lineStyle: 'solid'`；类型保留高级线型是为了避免 5-B 改公共 shape。

### 6.2 Range Style Store

核心约束：

- store 必须 sparse，支持大 range，不按单元格展开。
- style resolve 发生在可见区域 frame 构建或 renderer 绘制前后，不遍历不可见 1M 行。
- 多条 range style 按写入顺序覆盖；后写入的 defined field 覆盖先写入，undefined 不清除。
- clear 操作写入 explicit clear marker 或执行 range split，不能让旧 style 漏出。

推荐新增 core 模块：

| 模块 | 职责 |
| --- | --- |
| `format/CellFormat.ts` | public type |
| `format/RangeStyleStore.ts` | sparse range style 写入、清除、resolve visible cell/range style |
| `merge/MergeStore.ts` | merge region 存储、重叠检测、hit-test 映射 |
| `format/BorderPreset.ts` | all/outer/inner/clear 到 cell edge updates 的纯函数 |

### 6.3 Merge Store

`MergeRegion` 使用 raw row/col index：

```ts
export interface MergeRegion {
  readonly id: string
  readonly range: CellRange
  readonly anchor: { readonly rowIndex: number; readonly colIndex: number }
}
```

首版不支持重叠 merge。行列 insert/delete/reorder 后必须 remap 或删除失效 region；若实现计划发现规则冲突，必须先修 plan 再继续。

---

## 7. Engine API

`DefaultGridEngine` / public `Grid` facade 暴露：

```ts
setFillColor(range: CellRange, color: string | null): boolean
setBorders(range: CellRange, preset: BorderPreset, border: BorderStyle | null): boolean
mergeCells(range: CellRange): boolean
unmergeCells(range: CellRange): boolean
getCellFormat(rowIndex: number, colIndex: number): CellFormat | undefined
getMergeRegion(rowIndex: number, colIndex: number): MergeRegion | null
```

所有 mutation：

1. 先 `finishActiveEdit()`
2. 记录 before snapshot
3. 写 store
4. 更新 selection / active cell
5. invalidate frame
6. push undo command

---

## 8. Rendering

### 8.0 渲染架构决策

Phase 5-A 采用 **single canvas 内部多渲染阶段**：

- 不新增第二个 canvas。
- 不新增 DOM cell / DOM format overlay。
- 不改变 NovaSheet 的 Single Canvas + full visible-region redraw ADR。
- 在现有 `Canvas2DRenderer` 调度中插入独立 painter：
  - `FormatFillPainter`：只画用户填充色。
  - `FormatBorderPainter`：只画用户自定义边框。
- `CellPainter` 继续只负责文字；`GridLinesPainter` 继续只负责 theme 默认网格线。

Rejected option：多真实 canvas 分层（例如 `fillCanvas` / `baseCanvas` / `borderCanvas`）。它的物理隔离和局部重绘优势不足以抵消 DPR、native scroll、frozen region、resize 和 compositor 合成同步成本；且 3-canvas 方案会违反当前 Single Canvas ADR。

### 8.1 绘制顺序

| 顺序 | 内容 |
| --- | --- |
| 1 | canvas background |
| 2 | cell / merged-region fill background |
| 3 | cell text；merge region 只在 anchor range rect 内绘制一次 |
| 4 | default grid lines |
| 5 | custom borders 覆盖 default grid lines |
| 6 | header chrome |
| 7 | DOM selection overlay / fill handle / popovers |

如实现时发现 default grid lines 会压住 custom fill 或 border，优先调整 renderer layer 顺序，不在 painter 内硬编码视觉值。

### 8.2 Theme

- painter / render 仍禁止硬编码颜色与 px。
- 5-A 用户传入的 fill/border color 是数据样式，不属于 theme token。
- border width token 可由 semantic width 映射到 theme metrics，例如 `thin=1`、`medium=2`、`thick=3`；映射必须集中在 theme 或 renderer adapter，不能散落。

---

## 9. Interactions

| 交互 | 5-A 规则 |
| --- | --- |
| hit test | 命中 merge 非 anchor cell 时返回 anchor + merge range |
| click selection | 点击 merge 任意位置选中整个 merge range |
| keyboard navigation | 进入 merge region 时 active cell 跳到 anchor；方向键跨过 merge 的可见边界 |
| editing | 非 anchor cell 不创建独立 editor；editor 覆盖 merge visual rect |
| fill handle | source 或 target 穿越 merge region 时首版保守拒绝，后续单独设计 |
| sort/filter | merge region 跟随 underlying row 语义复杂，5-A 若与 sort/filter 激活冲突则禁用 merge mutation 并提示 |
| row/col reorder | merge/style 按 raw index 或 fieldId remap；计划阶段必须补测试 |

---

## 10. Testing Strategy

| 层级 | 测试 |
| --- | --- |
| core pure tests | `RangeStyleStore` 覆盖写入、覆盖、clear、大范围 resolve |
| core merge tests | merge/unmerge、重叠拒绝、hit-test 映射、selection remap |
| core undo tests | fill / border / merge / unmerge undo-redo |
| canvas2d tests | fill background、custom border 覆盖 default grid、merge text 只绘制一次 |
| web runtime tests | toolbar/menu action 调 facade；selection/editor 与 merge rect 同步 |
| clipboard tests | internal payload 带 format/merge；external TSV 不带格式 |
| storybook | merge + fill + border 手测 story |

验收门禁：

```bash
bun run lint
bun run --filter '*' typecheck
bun test
bun run --filter @novasheet/web build && bun run --filter @novasheet/web-canvas2d build && bun run --filter @novasheet/core build
```

---

## 11. Risks

| 风险 | 处理 |
| --- | --- |
| merge 与 sort/filter 语义冲突 | 5-A 先保守禁用冲突 mutation；后续如要支持，另写 spec |
| range style clear 泄漏旧样式 | 对 clear 行为写纯函数单测；不要依赖 ad hoc 覆盖 |
| 大范围格式导致内存爆炸 | sparse store + visible resolve；禁止 per-cell 展开 |
| custom border 与 default grid line 重叠 | 自定义 border 后绘制，覆盖默认 grid line |
| 多真实 canvas 同步复杂 | 5-A 明确不新增 canvas；用 single canvas 内部 painter/stage 分层 |
| 结构变更 remap 漏边界 | Phase 5-A plan 必须把 insert/delete/reorder/hide 的 remap 单独成任务 |
| theme 与用户样式边界混淆 | theme 管默认视觉；CellFormat 管用户数据样式 |

---

## 12. Decisions

1. Phase 5 改为总阶段，拆成 5-A/B/C/D。
2. 5-A 首版实现 merge + fill + 基础 border，暂不实现高级边框、数字格式、条件格式。
3. `CellFormat` 独立于 `CellValue`。
4. Range style store 必须 sparse，不按 1M 行展开。
5. 5-A 的 border 类型预留 dashed/dotted/double，但 UI 和 renderer 只写 `solid`。
6. 条件格式与数字格式进入 Phase 5 规划，但必须后续独立 spec/plan。
7. 渲染采用 single canvas 内部多阶段；不做多真实 canvas 分层。
