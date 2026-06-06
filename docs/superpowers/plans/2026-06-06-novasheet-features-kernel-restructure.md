# core 重组为 features/ + kernel/ — 实现计划（第一批：kernel 层 + 非 format/merge features）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development（推荐）或
> superpowers:executing-plans 逐任务执行。步骤用 `- [ ]` 复选框跟踪。

**Goal:** 把 `packages/core/src/` 重组为 `kernel/`（原语+组合根+协议）+ `features/`（行为领域），
纯结构搬移零行为变化，每个搬移批次单 commit 且全量绿。

**Architecture:** 逐批 `git mv` + import 路径重写 + 既有测试套件（1028）回归验证。无新行为、无新测试；
正确性由「全量测试 + 4 包 typecheck + lint 全绿 + grep 零残留」保证。

**Tech Stack:** TypeScript（strict + verbatimModuleSyntax），bun（test/typecheck/lint），`git mv`。

- Spec：`docs/superpowers/specs/2026-06-06-novasheet-features-kernel-restructure-design.md`
- 分支：`refactor-default-grid-engine-decomposition`（不新建分支）
- **本计划范围**：kernel 层全部 + features 中 row/column/selection/layout/fill/clipboard/view/edit/
  context-menu。**不含 format/merge**（耦合 engine 重构第 7 步，待其设计后单独迁）。

## 工具链（NON-NEGOTIABLE）

- 包管理/运行：`bun`（≥1.2）。禁用 npm/yarn/pnpm。
- 全量回归：`bun test`（当前基线 **1028 pass / 0 fail**，每批次后必须仍为此值）。
- Typecheck（4 包）：`bun run --filter '*' typecheck`（**这是搬移后修 import 的权威工具**：穷举列出
  每个 `error TS2307: Cannot find module ...`，按它逐个修到 0）。
- Lint：`bun run lint`（0 warning）。
- Commit：Conventional Commit 英文前缀 + 中文 subject/正文；正文末行必须是
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`。禁用 `--no-verify`、禁用 `--no-verify`。

## 不变量

- **公共 API 不变**：`packages/core/src/index.ts` 按名 re-export；外部包从 `@novasheet/core` 桶导入，
  零改动。本计划只改 core 内部相对 import + `index.ts` 内部来源路径。
- 每批次结束时 working tree 干净、全绿，方可进入下一批次。

---

## 通用搬移流程（每个搬移任务复用，下方任务只填具体参数）

设把目录 `packages/core/src/<SRC>` 搬到 `packages/core/src/<DEST>`（`<DEST>` 含新增层级，如
`kernel/geometry`）。**严格按序**：

1. **确认目标父目录状态**（避免 `git mv` 嵌套坑）：若 `packages/core/src/<DEST 的父目录>` 已存在，
   `git mv` 单个文件而非整目录到已存在目录；若不存在，`git mv` 整目录可直接重命名。**每次先 `ls` 确认**。
2. **`git mv`** 源到目标（源测试目录 `packages/core/tests/<SRC>` 同步搬到 `packages/core/tests/<DEST>`，
   若存在）。
3. **重写外部引用**（importer 不动、目标深一层 → 在 `../` 之后插入新增路径段）：对被搬目录的每个
   「模块名段」`<SRC-leaf>/`，把 `<SRC-prefix>/<SRC-leaf>/` 形式的相对 import 替换为 `<DEST>/...`。
   具体 sed 命令见各任务（已写死匹配的 leaf 名，不会误伤）。
4. **修被搬文件自身朝外的 import**：被搬文件原先 `../X` 引外部，现深一层。**跑 `bun run --filter '*'
   typecheck`**，按报错的 `Cannot find module` 逐个把该文件里对应 import 的 `../` 补深一层（或改为
   新 kernel/features 路径）。重复 typecheck 直到 0 error。
5. **验证门**：
   - `grep -rnE "<旧路径正则>" packages/core/src packages/core/tests --include=*.ts` → **零命中**（命令见各任务）。
   - `bun test` → 1028 pass / 0 fail。
   - `bun run --filter '*' typecheck` → 4 包 exit 0；`bun run lint` → exit 0。
6. **commit**（信息见各任务）。

> 关键：`typecheck` 是穷举兜底。任何 import 漏改都会报 `TS2307`，不会静默。grep 门确保旧路径零残留。

---

## Task 1：kernel 底座搬移（geometry/data/theme/measure/render/util/coords）

把 7 个被广泛依赖的底座目录搬入 `kernel/`，先落位减少后续反复。

**Files（git mv，源 → 目标）:**
- `src/geometry` → `src/kernel/geometry`；`tests/geometry` → `tests/kernel/geometry`
- `src/data` → `src/kernel/data`；`tests/data`（若有）→ `tests/kernel/data`
- `src/theme` → `src/kernel/theme`；`tests/theme`（若有）→ `tests/kernel/theme`
- `src/measure` → `src/kernel/measure`；`tests/measure`（若有）→ 同理
- `src/render` → `src/kernel/render`；`tests/render`（若有）
- `src/util` → `src/kernel/util`；`tests/util`（若有）
- `src/coords` → `src/kernel/coords`；`tests/coords`（若有）

- [ ] **Step 1：建 kernel 目录并逐个 git mv**

```bash
cd /Users/rongts/NovaSheet
mkdir -p packages/core/src/kernel packages/core/tests/kernel
for d in geometry data theme measure render util coords; do
  git mv "packages/core/src/$d" "packages/core/src/kernel/$d"
  [ -d "packages/core/tests/$d" ] && git mv "packages/core/tests/$d" "packages/core/tests/kernel/$d"
done
ls packages/core/src/kernel/    # 期望: coords data geometry measure render theme util
```

- [ ] **Step 2：重写外部引用（插入 `kernel/`）**

对这 7 个 leaf 名，把相对 import 里的 `<dots>/<leaf>/` 改为 `<dots>/kernel/<leaf>/`。`<dots>` 是一串
`../`（不动其数量）：

```bash
cd /Users/rongts/NovaSheet
grep -rlE "(\.\./)+(geometry|data|theme|measure|render|util|coords)/" packages/core/src packages/core/tests --include=*.ts \
| while read -r f; do
  sed -i.bak -E 's#((\.\./)+)(geometry|data|theme|measure|render|util|coords)/#\1kernel/\3/#g' "$f" && rm -f "$f.bak"
done
```

> 注：被搬入 kernel 的 7 个目录**彼此之间**的 import（如 `render` 引 `geometry`）原为 `../geometry/`，
> 上面 sed 会把它们改成 `../kernel/geometry/` —— 但它们现在同在 `kernel/` 下，正确路径是 `../geometry/`。
> 这类「kernel 内部互引」会被 Step 4 的 typecheck 揪出（报 `../kernel/geometry` 找不到，因为从
> `kernel/render/` 出发 `../kernel/` 多了一层）。Step 4 据 typecheck 改回 `../geometry/`。

- [ ] **Step 3：修被搬文件自身朝外的 import（typecheck 驱动）**

```bash
bun run --filter '*' typecheck 2>&1 | grep "TS2307" | head -50
```
按每条 `Cannot find module '<bad>'`，打开该文件把 import 改成正确相对路径：
- kernel 内部互引（如 `kernel/render/RenderFrame.ts` 引 geometry）：`../kernel/geometry/X` → `../geometry/X`。
- kernel 文件引 features/engine 外部（若有）：补一层 `../`。
反复 `bun run --filter '*' typecheck` 直到 0 error。

- [ ] **Step 4：验证门**

```bash
cd /Users/rongts/NovaSheet
grep -rnE "(\.\./)+(geometry|data|theme|measure|render|util|coords)/" packages/core/src packages/core/tests --include=*.ts | grep -v "kernel/" | head
# 期望: 空（所有这些 leaf 的引用都已带 kernel/ 前缀）
bun test 2>&1 | tail -3                       # 1028 pass / 0 fail
bun run --filter '*' typecheck 2>&1 | tail -4 # 4 包 exit 0
bun run lint >/dev/null 2>&1 && echo LINT_OK
```

- [ ] **Step 5：commit**

```bash
git add -A
git commit -m "$(printf 'refactor(core): kernel 底座搬移(geometry/data/theme/measure/render/util/coords)\n\n7 个被广泛依赖的平台无关底座目录搬入 kernel/;公共 API 经 index.ts 按名 re-export\n不变,外部包零改动。纯结构搬移零行为变化,1028 测试 + 4 包 typecheck + lint 全绿。\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 2：kernel 协议 + undo 机制 + interaction 基建

> **组合根不进 kernel**：`DefaultGridEngine`/`GridEngine` 依赖 features，是最外层组合根，**保留顶层
> `src/engine/`**（依赖单向 kernel ← features ← engine）。本任务不动这两个文件，只搬协议/undo机制/interaction基建。

**Files:**
- `src/engine/operation/` + `src/engine/event/` → `src/kernel/protocol/`（两目录合并入 protocol）
- `src/undo/` + `src/engine/undo/`（仅机制：`UndoRegistry`/`UndoReplay`/`UndoHandler`/`UndoStack`/
  `UndoCommand` + `registerCellUndo` 留待 edit 域，见下注）→ `src/kernel/undo/`
- `src/interaction/{HitTest,CellLayout,HandleLayout,scrollCellIntoView}.ts` → `src/kernel/interaction/`

> **undo 拆分注意**：`engine/undo/` 现含机制（`UndoRegistry`/`UndoReplay`/`UndoHandler`）**和**两个具体
> handler（`CellUndoHandler`/`FillUndoHandler` + `registerCellUndo`/`registerFillUndo`）。本任务**只搬机制**到
> `kernel/undo`；`CellUndoHandler`+`registerCellUndo` 留到 Task 9（edit 域），`FillUndoHandler`+
> `registerFillUndo` 留到 Task 6（fill 域）。本任务先把它们**留在原 `engine/undo/` 暂存**（下方 grep 门只
>校验机制文件已移走），由后续任务搬走。

- [ ] **Step 1：git mv（逐目标建目录后移）**

```bash
cd /Users/rongts/NovaSheet
mkdir -p packages/core/src/kernel/protocol packages/core/src/kernel/undo packages/core/src/kernel/interaction
# 注意：DefaultGridEngine.ts / GridEngine.ts 不动，保留在 src/engine/（顶层组合根）
git mv packages/core/src/engine/operation/GridOperation.ts packages/core/src/kernel/protocol/GridOperation.ts
git mv packages/core/src/engine/operation/GridTransaction.ts packages/core/src/kernel/protocol/GridTransaction.ts
git mv packages/core/src/engine/operation/README.md packages/core/src/kernel/protocol/operation-README.md
git mv packages/core/src/engine/event/GridDomainEvent.ts packages/core/src/kernel/protocol/GridDomainEvent.ts
git mv packages/core/src/engine/event/GridEventPipeline.ts packages/core/src/kernel/protocol/GridEventPipeline.ts
git mv packages/core/src/engine/event/README.md packages/core/src/kernel/protocol/event-README.md
git mv packages/core/src/undo/UndoCommand.ts packages/core/src/kernel/undo/UndoCommand.ts
git mv packages/core/src/undo/UndoStack.ts packages/core/src/kernel/undo/UndoStack.ts
git mv packages/core/src/engine/undo/UndoRegistry.ts packages/core/src/kernel/undo/UndoRegistry.ts
git mv packages/core/src/engine/undo/UndoReplay.ts packages/core/src/kernel/undo/UndoReplay.ts
git mv packages/core/src/engine/undo/UndoHandler.ts packages/core/src/kernel/undo/UndoHandler.ts
git mv packages/core/src/engine/undo/README.md packages/core/src/kernel/undo/README.md
for f in HitTest CellLayout HandleLayout scrollCellIntoView; do
  git mv "packages/core/src/interaction/$f.ts" "packages/core/src/kernel/interaction/$f.ts"
done
# 测试同步
mkdir -p packages/core/tests/kernel/engine packages/core/tests/kernel/protocol packages/core/tests/kernel/undo packages/core/tests/kernel/interaction
# 按 tests/ 下实际存在的对应测试文件 git mv（先 ls 确认）：
ls packages/core/tests/engine/undo packages/core/tests/undo packages/core/tests/interaction 2>/dev/null
```
（对 tests 下确实存在的 `UndoRegistry.test.ts`/`UndoReplay.test.ts`/`UndoCommandSerialization.test.ts`/
`UndoStack`/`HitTest`/`CellLayout`/`scrollCellIntoView` 等，逐一 `git mv` 到 `tests/kernel/<...>` 对应位置；
`CellUndoHandler.test.ts` 留到 Task 9、`FillUndoHandler.test.ts` 留到 Task 6。）

- [ ] **Step 2：重写引用 + Step 3：typecheck 修朝外 import + Step 4：验证门**

按通用流程。grep 门（不含 DefaultGridEngine/GridEngine——它们留顶层 engine/）：
```bash
grep -rnE "engine/operation/|engine/event/|engine/undo/(UndoRegistry|UndoReplay|UndoHandler)|(\.\./)+undo/(UndoCommand|UndoStack)|interaction/(HitTest|CellLayout|HandleLayout|scrollCellIntoView)" packages/core/src packages/core/tests --include=*.ts | grep -vE "kernel/" | head
# 期望: 空
bun test 2>&1 | tail -3; bun run --filter '*' typecheck 2>&1 | tail -4; bun run lint >/dev/null 2>&1 && echo LINT_OK
```

- [ ] **Step 5：commit**

```bash
git add -A
git commit -m "$(printf 'refactor(core): kernel 协议+undo机制+interaction基建搬移\n\noperation+event→kernel/protocol;UndoCommand/UndoStack/UndoRegistry/UndoReplay/\nUndoHandler→kernel/undo(纯机制,Cell/Fill handler 待 edit/fill 域);HitTest/CellLayout/\nHandleLayout/scrollCellIntoView→kernel/interaction。组合根 DefaultGridEngine/GridEngine\n保留顶层 engine/。1028 测试 + 4 包 typecheck + lint 全绿。\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 3–11：features 逐域搬移

每域按通用流程，把 `engine/<domain>` + 对应顶层 store + 对应 engine helper + 对应 undo-handler 搬到
`features/<domain>`。各任务的 git mv 清单与 grep 门如下（参数化通用流程）。

### Task 3：features/row

**git mv：** `src/engine/row/` → `src/features/row/`；`src/engine/AutofitRowHeights.ts` →
`src/features/row/AutofitRowHeights.ts`；`tests/engine/row/` → `tests/features/row/`。
（`engine/row/` 已含 `RowUndoHandler`/`RowStructureUndoHandler`，随目录一起走。）
**grep 门：** `grep -rnE "engine/row/|engine/AutofitRowHeights" ... | grep -vE "features/row" → 空`。
**commit：** `refactor(core): row 域搬入 features/row`

### Task 4：features/column

**git mv：** `src/engine/column/` → `src/features/column/`；`tests/engine/column/` → `tests/features/column/`。
**grep 门：** `engine/column/` → 零命中（非 features/column）。
**commit：** `refactor(core): column 域搬入 features/column`

### Task 5：features/selection

**git mv：** `src/engine/selection/` → `src/features/selection/`；`tests/engine/selection/` → `tests/features/selection/`。
**grep 门：** `engine/selection/` → 零命中。
**commit：** `refactor(core): selection 域搬入 features/selection`

### Task 6：features/layout

**git mv：** `src/engine/layout/` → `src/features/layout/`；`tests/engine/layout/` → `tests/features/layout/`。
**grep 门：** `engine/layout/` → 零命中。
**commit：** `refactor(core): layout 域搬入 features/layout`

### Task 7：features/fill

**git mv：** `src/fill/` → `src/features/fill/`；`src/engine/FillStylePropagator.ts` →
`src/features/fill/FillStylePropagator.ts`；`src/engine/undo/FillUndoHandler.ts` →
`src/features/fill/FillUndoHandler.ts`；`src/engine/undo/registerFillUndo.ts` →
`src/features/fill/registerFillUndo.ts`；对应 tests 同步（`tests/engine/undo/FillUndoHandler.test.ts` →
`tests/features/fill/FillUndoHandler.test.ts`；`tests/fill/` → `tests/features/fill/`）。
**grep 门：** `(\.\./)+fill/|engine/FillStylePropagator|engine/undo/(FillUndoHandler|registerFillUndo)`
→ 零命中（非 features/fill）。
**commit：** `refactor(core): fill 域搬入 features/fill(含 FillUndoHandler/StylePropagator)`

### Task 8：features/clipboard

**git mv：** `src/clipboard/` → `src/features/clipboard/`；`tests/clipboard/` → `tests/features/clipboard/`。
**grep 门：** `(\.\./)+clipboard/` → 零命中（非 features/clipboard）。
**commit：** `refactor(core): clipboard 域搬入 features/clipboard`

### Task 9：features/view

**git mv：** `src/view/{SortLayer,FilterLayer,HideRowsLayer,ViewLayer,ViewPipeline}.ts` →
`src/features/view/`；对应 tests 同步。
**注意：** `view/CoordinateSpace.ts`、`view/coordinates.ts` 已在 Task 1 归 `kernel/coords`（若 Task 1 未
覆盖 view 下的这两个文件，本任务前先把它们 `git mv` 到 `kernel/coords/` 并修引用——**执行前 `ls`
确认它们当前位置**，避免遗漏）。
**grep 门：** `(\.\./)+view/(SortLayer|FilterLayer|HideRowsLayer|ViewLayer|ViewPipeline)` → 零命中。
**commit：** `refactor(core): view 排序/筛选/隐藏管线搬入 features/view`

### Task 10：features/edit

**git mv：** `src/interaction/CellEdit.ts`、`src/interaction/CellEditModel.ts` → `src/features/edit/`；
`src/engine/undo/CellUndoHandler.ts` → `src/features/edit/CellUndoHandler.ts`；
`src/engine/undo/registerCellUndo.ts` → `src/features/edit/registerCellUndo.ts`；对应 tests 同步
（`tests/engine/undo/CellUndoHandler.test.ts` → `tests/features/edit/`；`tests/undo/UndoCommandSerialization.test.ts`
已随 Task 2 入 `tests/kernel/undo/`，**不在此动**）。
**grep 门：** `interaction/(CellEdit|CellEditModel)|engine/undo/(CellUndoHandler|registerCellUndo)`
→ 零命中（非 features/edit）。
**commit：** `refactor(core): edit 域搬入 features/edit(含 CellUndoHandler)`

### Task 11：features/context-menu

**git mv：** `src/interaction/ContextMenuModel.ts` → `src/features/context-menu/ContextMenuModel.ts`；
对应 tests 同步。
**注意：** 此后 `src/interaction/` 应为空（其余文件已分别入 kernel/interaction 与 features/edit、
features/context-menu）——`ls packages/core/src/interaction` 确认为空后 `rmdir`（git 不跟踪空目录，
无需 commit 删除）。
**grep 门：** `interaction/ContextMenuModel` → 零命中。
**commit：** `refactor(core): context-menu 搬入 features/context-menu，interaction 目录清空`

> 每个 Task 3–11 都完整跑通用流程的 Step 1–6（git mv → 重写引用 → typecheck 修朝外 import → grep+test+
> typecheck+lint 验证门 → commit）。grep 门正则见各任务；每步后 `bun test` 必须 1028/0。

---

## Task 12：index.ts 内部来源路径 + 文档收尾

**Files:**
- `packages/core/src/index.ts`（修内部来源路径，**导出名不变**）
- 新增 `packages/core/src/kernel/README.md`、`packages/core/src/features/README.md`
- `packages/core/src/engine/README.md`（若 `engine/` 已空则删；其架构内容迁入两层 README）
- `CLAUDE.md`「What goes where」表、`docs/architecture.md` 路径

- [ ] **Step 1：修 index.ts 内部来源路径**

`index.ts` 每条 `export ... from './<old>/...'` 改为新 `./kernel/...` 或 `./features/...` 路径。导出的
**名字一个不改**。改完 `bun run --filter '*' typecheck` 确认外部包仍解析（web/web-canvas2d 经桶导入）。

- [ ] **Step 2：写两层 README**

`kernel/README.md`：三层架构总览（kernel ← features ← engine 组合根，依赖单向）+ 单一主人判准 +
kernel 各子目录职责（geometry/data/theme/measure/render/util/coords/protocol/undo/interaction）。
`features/README.md`：feature 垂直切片模板（operation/event/rules/handler/undo-handler）+ 各域一句话职责 +
「feature 不互相 import mutation、只经 kernel/protocol 事件管线通信；feature 只依赖 kernel」约束。
原 `src/engine/README.md` 改为**组合根说明**（DefaultGridEngine 组装职责），其领域规则/三协议/event 约束
迁入上面两份。`src/engine/` 目录**保留**（装组合根 DefaultGridEngine.ts/GridEngine.ts），不删。

- [ ] **Step 3：更新 CLAUDE.md 与 docs/architecture.md 路径**

`CLAUDE.md`「What goes where」表的 `packages/core/src/...` 路径改为新 kernel/features 路径；
`docs/architecture.md` 同步（历史 `docs/superpowers/plans/*` 作审计记录不改）。

- [ ] **Step 4：验证门 + commit**

```bash
bun test 2>&1 | tail -3; bun run --filter '*' typecheck 2>&1 | tail -4; bun run lint >/dev/null 2>&1 && echo LINT_OK
git add -A
git commit -m "$(printf 'docs(core): index.ts 内部路径 + 两层 README + CLAUDE/architecture 同步\n\nindex.ts 内部来源路径改 kernel/features(导出名不变);新增 kernel/features README\n承接原 engine README 的领域规则与三协议;CLAUDE.md/docs 路径同步。\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## 范围外（后续单独计划）

- **features/format、features/merge**：耦合 engine 重构第 7 步（format/merge 协调收口）。待第 7 步出设计后，
  单独一个 plan 把 `format/*` + `engine/format/*` + `engine/VisibleFormatResolver` → `features/format`、
  `merge/MergeStore` + `engine/MergeViewResolver` → `features/merge`，并一并完成第 7 步收口。
- `UndoCommand` union 按域拆 + 中央 re-export（第 5 步 spec 的可选后续）。

## 最终验收（本计划范围）

- `packages/core/src/` 顶层只剩 `kernel/`、`features/`、`engine/`（仅组合根 DefaultGridEngine/GridEngine）、
  `index.ts`、`types.ts`（+ 待迁的 `format/`、`merge/` 及 `engine/format`、`engine/merge`-相关——属范围外）。
  依赖单向：kernel ← features ← engine。
- `kernel/undo` 不含任何具体 kind handler；Cell/Fill handler 在 features/edit、features/fill。
- 公共 API 导出名不变；web/web-canvas2d/storybook 零改动。
- 全程每批次 `bun test` 1028/0、4 包 typecheck、lint 全绿。

## 自检（plan self-review）

- **Spec 覆盖**：kernel 映射 → Task 1–2；features（除 format/merge）→ Task 3–11；index/docs → Task 12；
  format/merge + 第 7 步 → 明确列「范围外」。undo 按职责切两半（机制入 kernel、Cell/Fill handler 跟域）→
  Task 2 注 + Task 7/10。覆盖完整（format/merge 有意延后）。
- **占位符扫描**：无 TBD；通用流程的「typecheck 驱动修 import」是确定性过程（穷举报错逐个修），非占位。
- **路径一致**：各 grep 门正则与对应 git mv 目标一致；undo 机制（kernel）vs handler（features）归属在
  Task 2/7/10 间一致；index.ts 仅改来源不改名。
- **STOP/坑**：`git mv` 嵌套坑（通用流程 Step 1 先 ls 确认）；kernel 内部互引被 sed 误加 kernel/ 前缀
  （Task 1 Step 2 注 + Step 3 typecheck 修回）；view/CoordinateSpace 归属（Task 9 注先确认位置）。
