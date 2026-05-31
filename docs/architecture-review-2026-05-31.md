# NovaSheet 架构 Review（2026-05-31）

> 视角：高级架构师对地基的体检。目标不是挑代码风格，而是找**会随规模/功能塌掉的结构性风险**，并给可执行的重构路径。证据均来自当前 `main`（commit `d806f74`）。

## 0. 总体判断

地基**整体是健康的**：分层清晰（core 平台无关 / web host / web-canvas2d 渲染）、ADR 与 invariant 明确、TDD 纪律好、Phase 4–5 功能扎实。

但已经出现**两个 god object** 和**几处缺失的共享抽象**——它们正是本轮多个疑难 bug（合并填充柄锚定、autofit 坐标、选区 visualRange、填充吸附）的共同结构性根因。趁现在功能还没更复杂，是收口的最佳窗口。

---

## 1. 优点（保持）

- **ADR + invariant 成文且被遵守**：单 canvas 全量重绘、native scroll + 非线性映射、ChunkedAxis、`getRows` inclusive、theme 唯一视觉源、每 Grid 一个 scheduler。
- **渲染只读 frame 契约**：`RenderFrame`（~17 字段）把 raw→view 翻译收在 engine，painter 只消费 view 坐标——这是对的方向。
- **保守 mutation posture**：非连续 raw 映射时 format/merge 一律 no-op，避免坐标散裂下的错写。
- **测试基建**：`RecordingContext`、per-package setup、TDD 失败先行。

---

## 2. 结构性风险（按 风险×杠杆 排序）

### R1 🔴 两个 god object

| 文件 | 规模 | 职责 |
|------|------|------|
| `DefaultGridEngine.ts` | **2352 行 / 111 个 public 方法** | 数据、双轴、选区、格式、合并、填充、undo、结构增删移、frame 构建——全在一个类 |
| `WebGridRuntime.ts` | **2736 行 / 22 个拖拽状态字段** | 选区拖选、填充柄、resize、列/行 reorder、表头拖选、右键菜单、编辑器、滚动、边缘自动滚动——全在一个类 |

**风险**：单类承载所有变更面 → 改一处易碰一处（本轮 `mergeVisualRange` 在 overlay/填充柄分裂就是症状）；新人/AI 难以局部推理；测试只能整体 mock。

**建议**（增量、低风险）：
- engine 按**能力切片**抽 mixin/子协调器：`FormatCoordinator`、`MergeCoordinator`、`StructuralOps`、`FrameBuilder`、`UndoManager`，`DefaultGridEngine` 退化为装配 + 委托。
- runtime 按**拖拽种类**抽 `DragController`（每种 drag 一个小状态机，共用 `EdgeAutoScroll`），runtime 只做事件路由。
- 不强求一次到位；每抽出一块配既有测试即可。

### R2 🔴 坐标系（raw↔view）散点、无封装

**证据**：`resolveUnderlyingRow / viewRangeToRawRange / getRawColumnIndex / …` 共 **61 处**触点；frame 的 raw→view 翻译、填充/合并的 view→raw、autofit 的坐标各写各的。

**风险**：本系统**头号 bug 源**。本轮 4 个疑难 bug 全在这条线上。约定（「非连续即 no-op」「合并 anchor 取 view」）靠人记，不靠类型/封装强制。

**建议**：抽一个 **`CoordinateSpace` / `ViewProjection`** 对象，唯一持有 raw↔view 映射，暴露：`viewToRaw(range): RawRange|null`、`rawToView`、`resolveMergeAt(view)`、`isContiguous`。所有翻译走它；用 **branded type**（`RawRange` vs `ViewRange`）让编译器挡住混用。这能从根上消掉散点手写。

### R3 🟠 缺共享几何/范围工具层

**证据**：`inRange`+`rangesIntersect` 在 `MergeStore` 与 `RangeStyleStore` **逐字重复**；`clamp` 三处；`cellInRange`、`unionRange`、`positiveModulo` 各自散落。

**风险**：同义逻辑多份 → 修一处漏一处（`mergeVisualRange` 的 union vs replace 分裂即此类）。

**建议**：core 加 `geometry/range.ts`：`cellInRange / rangesIntersect / unionRange / clampRange / normalizeRange`，全仓复用。纯函数、零风险、立刻收敛。

### R4 🟡 Undo 模型：快照式，内存不增量

**证据**：`UndoCommand` **21 种**；format/merge/结构命令携带**整个 store 的 before/after 快照**（`formatBefore/After`、`mergeBefore/After`，17 处）。

**风险**：store 大时每步 undo 复制整表，内存与拷贝成本 O(store)；与 `editCell` 的逐格命令模型不统一；21 种 kind 的 switch 在 apply/redo 两处重复。

**建议**（非紧急，规模上来再做）：格式/合并改**逐层/逐区增量 diff**（记录被覆盖的 layer/region，而非整快照）；undo 的 apply/redo 用**命令对象自带 `undo()/redo()`**（command pattern）取代双 switch。

### R5 🟠 渲染 stage 顺序：内容在网格线之下

**证据**：`paintFrame` 顺序 = background → **content → grid** → overlay。

**风险**：overflow 溢出文字被网格线压一道（已知局限）；自定义边框靠「画在格线之后」补救，是顺序耦合。

**建议**：评估把 stage 拆成 `background → gridlines(default) → content(text+overflow) → custom-borders/format → overlay`，让文字稳定压过默认格线（对齐 Excel）。属中等改动，需回归渲染快照测试。

### R6 🟡 格式模型双轨 + facade 线性膨胀

- `field.wrap`（schema 列级）与 `CellFormat.textWrap`（格级）**双模型并存**（当前靠 painter/autofit 回退兼容）——临时债，应规划 `field.wrap` 退役或正式标注为「列默认」。
- `CellFormat` 在持续加字段（fill/border/textWrap/未来 number-format/align…）；`Grid` facade（416 行）随每条功能线性加方法。需要时按 **format 族 / 结构族 / 选区族** 给 facade 分组，`CellFormat` 考虑 future 的 `numberFormat`/`align` 子结构划分。

### R7 🟡 测试盲区

- **happy-dom 测不出排版**：`scrollHeight/scrollWidth/offset* = 0`，编辑器自增长、overflow 宽度等**视觉/布局逻辑只能 stub 验证骨架**，真实效果无自动化兜底 → 建议补**少量真实浏览器/视觉回归**（Storybook + 截图 diff）覆盖这类。
- **mock engine 用 `as unknown as GridEngine`**：接口漂移时测试不报警（本轮多次手动补 `setTextWrap`/`getFillMergeSnap` 才发现）→ 建议给 mock engine 一个**类型完整的工厂**，新增接口方法编译即红。

### R8 🟢 无界缓存

`CellPainter.truncationCache`（含新增 `hardCut` 缓存）无 LRU 上限（代码内已有 TODO）。大数据 + 多样文本下可能缓慢增长 → 加 LRU 上限或按帧/按字体清理。

---

## 3. 建议的收口顺序（低风险→高杠杆）

1. **R3 共享几何工具** —— 纯函数抽取，零风险，立刻消重复（半天）。
2. **R2 CoordinateSpace + branded type** —— 收口头号 bug 源，杠杆最高（需配测试，1–2 天）。
3. **R1 god object 切片** —— 趁 R2 收口顺势把 engine/runtime 按能力/拖拽拆子协调器（增量进行）。
4. **R7 测试盲区** —— 类型化 mock 工厂 + 视觉回归（与功能开发并行补）。
5. **R5 stage 顺序 / R4 undo 增量 / R6 模型整合 / R8 LRU** —— 规模或体验需要时再做。

> 原则：R1–R3 是**地基收口**，建议在进 5-C（数字格式，会再加 CellFormat 字段 + display pipeline）之前先做 R3+R2，避免在散点坐标/重复 helper 上继续叠功能。

---

## 4. 一句话结论

架构方向对、纪律好；**当前最该投资的是「坐标系收口 + 共享几何 + god object 切片」这三件地基事**，它们的缺位正是本轮疑难 bug 的共同根。趁功能未更复杂，先把地基收口，再叠 5-C/5-D。
