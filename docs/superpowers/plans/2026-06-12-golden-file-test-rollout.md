# 黄金文件测试推广 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (推荐) 或 superpowers:executing-plans 逐 task 执行。Steps 用 checkbox（`- [ ]`）跟踪。

**Goal:** 把项目中「输出可文本序列化 + 契约面宽 + 漂移应过 review」的测试系统性改造为黄金文件断言，覆盖 canvas2d/core/react 三包。

**背景：** 本轮已落地 P0（见下「已完成」），本文档记录 **P1/P2 剩余批次** 以防上下文丢失。挑选标准三条同时满足才黄金化：① 输出能确定性文本序列化；② 契约面宽（多分支/多字段，点断言挂一漏万）；③ 漂移本应显式过 review（对外格式、视觉值、公开 API 面、最易错不变量）。**不黄金化**：kernel 白盒算法（CLAUDE.md 定为纯 TDD，点断言表达意图更准）、依赖 happy-dom 假布局的 DOM 几何、未钉死 locale 的 Intl 输出。

---

## 黄金文件基建约定（已确立，照搬即可）

- **helper：`expectGolden(testDir, name, actual)`**——`actual` 与 `<testDir>/__goldens__/<name>.golden.txt` 逐字符比较；`GOLDEN_UPDATE=1` 时写入而非比较；缺文件报错提示重生成。
  - core：`packages/core/tests/acceptance/_helpers/golden.ts`（已存在）。
  - canvas2d：`packages/canvas2d/tests/helpers/golden.ts`（已存在，P0-1 复制了一份——**测试 helper 不跨包共享**）。
  - **react：尚无**，P1-4 需复制同一份到 `packages/react/tests/helpers/golden.ts`。
- **重生成流程：** `GOLDEN_UPDATE=1 bun test <file>` → `git diff` 人工 review 生成内容 → 提交。**生成后必须人工 review，禁止盲目更新掩盖回归。**（`Bash(GOLDEN_UPDATE=1 bun test *)` 已加入 allowlist。）
- **dump 序列化器：** 已有 `dumpFrame`（`core/tests/acceptance/_helpers/frame-dump.ts`，RenderFrame→文本）、`dumpOps`（`canvas2d/tests/helpers/op-dump.ts`，RecordedOp[]→缩进文本）。新批次复用或新增同风格 dumper。
- **dump 设计要点（防抖动）：** 迭代集合先排序；Date 用手写 label 而非 `toISOString()`（UTC 抖时区）；Intl 输出钉死 locale 或避免入金；浮点 `toFixed`。
- **场景 MD（仅 core acceptance / react excel 需要）：** 黄金化的 L0–L3 场景在 frontmatter `tags` 加 `golden`，`status: implemented`，Then 段描述「与 `__goldens__/<id>.golden.txt` 一致」。改动后 `bun run lint:mbd`（core 在 packages/core 下跑）+ `manifest:mbd` 重建，更新 acceptance README 计数。

---

## 已完成（P0，已提交）

| Commit | 范围 | 黄金文件 |
| --- | --- | --- |
| `49c024e` | canvas2d 整帧 op-log | `oplog-{base,format-merge-border-value,frozen-quadrants,overflow-translucent}.golden.txt` |
| `9f240ad` | ScrollMapper 非线性映射采样表 | `core/tests/dom/scroll/__goldens__/scroll-mapper-nonlinear-table.golden.txt` |
| `62b82b3` | view compose 整帧（hide×sort raw 键控格式） | `core/.../rendering/__goldens__/core.L2.render-frame-golden-view-compose.golden.txt` |
| 早前 | theme/menu/formatValue/TSV/engine-frame/public-api 6 处点断言黄金化 + rendering 3 份 frame golden | 见 `find packages -name '*.golden.txt'` |

---

## P1 — 契约清单类（本文档主体，按 ROI 排序）

### Task P1-1: mutation 事件流黄金（row/col CommandHandler）

**动机：** `*CommandHandler.execute(op)→event→dispatch` 是 event-source 结构域唯一写缝（架构不变量 #3）。事件载荷字段多、undo/redo 往返易回归，点断言覆盖不全。

**Files:**
- 源参考：`packages/core/src/features/{row,column}/*CommandHandler.ts`（Delete/Hide/Insert/Move/Unhide × Rows/Cols 共 10 个）
- Test 落点：`packages/core/tests/acceptance/functional/data-ops/bdd.test.ts`（或新增 `interaction/structure/bdd.test.ts`，若新目录则补 `scenarios/` + README taxonomy）
- 新 dumper：`packages/core/tests/acceptance/_helpers/event-dump.ts`（`dumpEvents(events): string`，每事件一行 `kind field=val …`，按发出顺序，不排序）

- [ ] **Step 1** 写失败测试：对每个结构 op（insertRows/deleteRows/moveRows/hideRows/unhideRows + cols 对称）订阅事件，执行 op → undo → redo，dump 三段事件流入金。用 `createMutableData()` fixture。
- [ ] **Step 2** `GOLDEN_UPDATE=1` 生成 → review：确认事件 kind、受影响 index 范围、undo 逆事件对称。
- [ ] **Step 3** 场景 MD `core.L2.structure-command-event-stream`（tags `[structure, event, golden]`）+ lint:mbd + manifest。
- [ ] **Step 4** commit `test(core): 结构命令事件流黄金——row/col mutation execute→event 契约`。

### Task P1-2: fill-series 矩阵黄金

**动机：** `FillSeries` 的数字递增、日期步进、文本+数字后缀等模式分支多，现仅 2 条场景抽查。

**Files:**
- 源参考：`packages/core/src/features/fill/FillSeries.ts`
- Test 落点：`packages/core/tests/acceptance/interaction/editing/bdd.test.ts`
- dumper：行内构造（`输入序列 × 方向 → 输出序列`），无需独立文件

- [ ] **Step 1** 写失败测试：矩阵覆盖 [纯数字递增、等差、纯文本重复、文本+数字后缀、日期、混合]，每行 `seed × direction(down/right) × count → 输出`，dump 入金。
- [ ] **Step 2** `GOLDEN_UPDATE=1` 生成 → review 各模式外推正确。
- [ ] **Step 3** 更新现有 `L2-grid-fill-series-down-right.md` 的 Then 指向黄金 + tags `golden`；lint:mbd + manifest。
- [ ] **Step 4** commit `test(core): fill-series 外推矩阵黄金`。

### Task P1-3: clipboard parse 矩阵黄金

**动机：** TSV **serialize** 已入金（`core.L0.clipboard-tsv-roundtrip`），**parse** 侧仍点断言。parse 对 text/number/checkbox/date 各类型 + 空值/前导零/科学计数等边角分支多。

**Files:**
- 源参考：`packages/core/src/features/clipboard/TsvFormat.ts`
- Test 落点：`packages/core/tests/acceptance/contract/file-format/bdd.test.ts`

- [ ] **Step 1** 写失败测试：固定多类型 schema，喂入覆盖边角的 TSV 文本，`parseTsvToCells` 结果 dump（`行: 单元格类型化值`）入金。
- [ ] **Step 2** `GOLDEN_UPDATE=1` 生成 → review 类型解析与空值语义。
- [ ] **Step 3** 复用 `core.L0.clipboard-tsv-roundtrip` 场景 Then 追加 parse 矩阵描述，或新增 `core.L0.clipboard-tsv-parse-matrix`；lint:mbd + manifest。
- [ ] **Step 4** commit `test(core): TSV parse 类型矩阵黄金`。

### Task P1-4: react 工具栏面 + 色板清单黄金

**动机：** `fillPaletteRows`（80 swatch）+ `standardFillColors`（8）+ 工具栏 `data-action-id`/title/aria 清单，改一个 hex 或动作现在无测试可见。**需先把 golden helper 引入 react 包。**

**Files:**
- Create：`packages/react/tests/helpers/golden.ts`（复制 core 版，改注释「与 core 同约定」）
- 源参考：`packages/react/src/features/toolbar/lib/colors.ts`、`components/NovaSheetToolbar.tsx`
- Test 落点：`packages/react/tests/features/toolbar/`（色板数据清单）+ `tests/excel/`（工具栏 DOM 面，若做成 L3 场景）

- [ ] **Step 1** 复制 golden helper 到 react 包。
- [ ] **Step 2** 写失败测试 A（数据）：`fillPaletteRows`+`standardFillColors` flatten 成 `label hex` 清单 dump 入金（纯数据，不挂 DOM）。
- [ ] **Step 3** 写失败测试 B（DOM 面）：mount `NovaSheetToolbar`，收集所有 `[data-action-id]` 的 id+title+aria-label 清单 dump 入金。
- [ ] **Step 4** `GOLDEN_UPDATE=1` 生成 → review。
- [ ] **Step 5**（可选）若 B 做成外环场景：新增 `L3a-toolbar-action-inventory.md`，excel manifest 重建，`lint:scenario-coverage` 不退化。
- [ ] **Step 6** commit `test(react): 工具栏动作面与色板清单黄金`。

---

## P2 — 锦上添花（低优先，单独评估再做）

| # | 目标 | 落点 | 备注 |
| --- | --- | --- | --- |
| P2-1 | 单 painter op golden（HeaderPainter 列字母/选中态、RowHeaderPainter、EmptyStatePainter） | `canvas2d/tests/painters/` | 复用 `dumpOps`；各 painter 一份 |
| P2-2 | UndoCommand 全 21 kind JSON 形态清单 | `core/.../interaction/undo/bdd.test.ts` | 现 `core.L0.undo-command-serialization` 仅验单 kind 可序列化；扩为全 kind 代表性实例 → `JSON.stringify` 清单入金 |
| P2-3 | mbd 生成器契约（fixture 场景 MD → manifest JSON/SCENARIOS.md 输出） | `packages/mbd/tests/` | 防 manifest 格式漂移；需 fixture 场景目录 |

---

## 验收（每 task 通用）

- `bun test <改动包>` 全绿；黄金内容**已人工 review**。
- core 改场景：`cd packages/core && bun run lint:mbd && bun run manifest:mbd` 通过，acceptance README 计数同步。
- react 改场景：`bun run --filter '@novasheet/react' lint:scenario-coverage` 不退化。
- 相关包 `typecheck` 0、`lint` 无新增 warning。
- 一 task 一 commit，中文 subject。

## 续接提示

冷启动时：`find packages -name '*.golden.txt' | sort` 看已落地清单；本文档「已完成」表对照 git log 确认进度；未打勾的 Task 即剩余工作。P1 四个 task 相互独立，可并行或任意顺序。
