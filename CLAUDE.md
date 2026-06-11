# Claude / Agent Working Rules for NovaSheet

Loaded into every agent session — invariants easy to get wrong without context. Read before editing. 细节在 `packages/core/src/ARCHITECTURE.md`、`docs/superpowers/specs|plans/`、各 `README.md`。

## Project shape

- High-performance Canvas table engine → eventual AI-Native data workbench. Greenfield TS monorepo (bun workspaces).
- **两包**：`@novasheet/core`（引擎 + DOM 壳 `dom/` + 公开 `Grid` facade + `RenderBackend` 端口）、`@novasheet/canvas2d`（Canvas2D 后端，**反向依赖 core**，导出 `canvas2dBackend`）。组合根（storybook/react）`new Grid({ data, backend: canvas2dBackend })` 注入后端。

## Current state

- **Active branch:** `refactor-default-grid-engine-decomposition`（**未合并 `main`**，纯重构线）。功能线开发前确认基线分支 + read recent commits for delta。
- **Next milestone:** Phase 5-D conditional formatting — unless redirected.（5-C value formatting 已 ship，见 Shipped。）
- **Backlog（未 spec）:** ① **单元格自定义类型扩展 API** 剩 2 轴：显示(canvas painter port，强制 canvas 画星级/进度条/tag/头像/chart)、编辑(DOM/React overlay editor 注册缝，下拉/日期选择器)。现状闭合(CellPainter 仅 text/number、DomCellEditor 仅 input/textarea)；目标 core 开 port、业务层注册、core 此后零改。需 brainstorming 出统一 spec。**formatter 轴已随 5-C ship。** ② **perf**：`formatValue` 内 `Intl.NumberFormat` 每调用 new，列级格式化时热路径反复构造；终审裁为 Minor，后续按 format 签名做 `Map<string, Intl.NumberFormat>` 缓存（`TODO(phase-5-c-perf)`）。
- **Shipped（细节见 git log + `docs/superpowers/specs/`）:** Phase 4 全完成、Phase 5-A/5-B、fill×merge/format、text-wrap 三态 + Alt+Enter 多行、**5-C value formatting（ValueFormat descriptor number/currency/percent/date + 自定义 formatter 注册表，raw 不变，`Grid.setValueFormat`/`GridOptions.formatters`）**、Engine Composer Phase 2、Web 合并进 core（依赖反转）。
- **易错不变量（仅 format/merge 域）:** `RangeStyleStore`/`MergeStore` 用 **raw** 行列键控；`getFrame()` raw→view，painter 只吃 VIEW 坐标；mutation 经 `viewRangeToRawRange` 转连续 raw 区间，sort/filter 打散时保守 no-op（返 `false`）。
- **Locked decisions（别轻易翻案，见 spec ADR §A）:** 单 Canvas full visible-region redraw、native scroll + 非线性 `scrollTop`（拒绝自绘滚动条）、`CHUNK_SIZE=1024`、`<handle-layer>` sibling 做 resize hit-zone（M4）。

## Communication style

- Terse, technical, **table-driven**（`维度 | A | B`）。Lead with recommendation + reason。Runtime 约束给具体数字（如 "Firefox max scrollHeight ~17.9M px"）。
- Prose 中文、code/identifier 英文。无 emoji（除非要求）。End-of-turn summary ≤ 2 句，无庆祝语。
- **Plan-bug catches are a feature.** 测试期望与参考实现/plan 公式矛盾时 STOP+ASK，别静默选；plan bug 先 `docs(plan):` 修 plan 再 re-dispatch implementer。
- 不跳过 self-review（plan + spec）；里程碑收尾 dispatch code-reviewer，即便 test/lint/typecheck 全绿。

## Toolchain (NON-NEGOTIABLE)

- **bun (≥1.2) only** — never npm/yarn/pnpm（desync lockfile，破 CI）。
- Test `bun test`；Typecheck `bun run --filter '*' typecheck`（strict + `noUncheckedIndexedAccess` + `verbatimModuleSyntax`）；Lint `bun run lint`（0 error/warning，含 `lint:architecture`）；Build `bun run --filter @novasheet/core build && bun run --filter @novasheet/canvas2d build`（core 先）。四者全过才能进 `main`（CI 强制）。
- 测试用 `bun:test`（`mock`/`spyOn`，**非 vitest**）；global stub 用 `tests/helpers/global-stub.ts`（无 `vi.stubGlobal`）。

## Architectural invariants (enforce in review)

1. 渲染后端只从 `engine.getFrame()` 的 `Viewport`+`RenderFrame` 读，frame 契约外不碰 `ChunkedAxis`/`FrozenRegions`/`DataSource`。
2. 所有 mutation 走 `DefaultGridEngine` 或公开 `Grid` facade；facade 决定 invalidate，painter/layout 不自 invalidate。
3. Engine/facade/runtime 不直调 aggregate mutation——走 domain 写入 seam：event-source 结构域（row/col）用 `*CommandHandler`（`execute(op)→event→dispatch`）；non-event 域（selection）用写门面/domain service（`SelectionController`）。缺 seam 先补再接线。
4. **Theme 是视觉值唯一来源**——`packages/canvas2d/src/painters/`、`render/` 内零硬编码 px/font/color。
5. **DataSource.getRows endIndex INCLUSIVE**（配 `ChunkedAxis.getVisibleRange [first,last]`）；`getCell` 是 sync hot path。
6. **每 Grid 一个 frameScheduler**——所有 RAF 源 coalesce。`Grid` 自持 `new FrameScheduler()` via `GridRuntime`；`util/raf` 单例不跨 Grid。
7. **`Grid.destroy()` 完全幂等**——cancel 所有 RAF、还原 `container.style.position`、移除 canvas。StrictMode mount→destroy→mount 须绿。
8. `ChunkedAxis.getSize(index)` 是边界尺寸唯一访问器；勿用 `indexToPosition(i+1)-indexToPosition(i)`（末行返 0）。
9. **core 纯层/DOM 壳单向边界**：`kernel|features|engine|ports` 纯层不 import `dom/**`，`kernel|features|engine` 不碰 DOM 全局（`ports` 可用 DOM 类型）；`dom/**` 可依赖纯层，反向禁；**core `src/` 永不 import canvas2d**。由 `scripts/check-kernel-boundary.ts` 强制。

## Conventions

- **TS:** type-only 用 `import type`（verbatimModuleSyntax）；immutable surface 加 `readonly`/`Readonly<>`；`noUncheckedIndexedAccess` 需 `!`/guard。
- **Comments（少而硬）:** public export 短 TSDoc；private 仅注释算法/坐标系/调度顺序/不变量/tradeoff，解释 **why 非 what**；大设计放 specs、注释指过去；TODO 带 phase 前缀；无装饰性/陈旧注释。
- **Tests:** TDD strict（红先行→实现→绿→commit）。Canvas 测用 `RecordingContext2D`。Type-only 失败测用 `tsc --noEmit` 验"实现前失败"。
- **Commits:** Conventional Commits，**中文 subject/body**、英文 `type(scope)` 前缀与 identifier/path/命令。一 task 一 commit。Never `--no-verify`、never amend pushed。

## Superpowers pipeline + 开发方法（BDD 外环 × TDD 内环）

完整方法论：`docs/superpowers/specs/2026-06-10-novasheet-bdd-tdd-method-design.md`（**干活前读它**）。BDD 先锁可观测行为（场景），TDD 驱动实现。

1. **brainstorming** → spec（`docs/superpowers/specs/`）
2. **【BDD gate】场景定稿** — 写/改场景（Core L0–L2 用 `packages/core/tests/acceptance/**/scenarios/*.md`，Excel L3 用 `packages/react/tests/excel/scenarios/*.md`；MD 先 `## User Story`，再 G/W/T）作外环契约；`mbd validate`+`manifest`。无场景不开内环；契约漂移优先修门面/补观测 API，禁静默改期望。仅罩 L0–L3 可观测行为；kernel 算法与 L4 白盒纯 TDD。活跃层由 behavioral-testing **Phase 1** 决定：Core L0–L2 分批启动，Excel L3 持续维护。
3. **writing-plans** → plan（`docs/superpowers/plans/`）；首类任务 = 让行为测试存在并红，余 = TDD 内环。
4. **subagent-driven-development** — 一 task 一 subagent，不批。内环全绿→外环行为测试转绿→`lint:scenario-coverage` 不退化。
5. **finishing-a-development-branch** — verify、push、tag。

**Subagent prompts must:** 引 plan 文件路径（勿贴正文）+ 方法论 spec + 相关场景 MD 路径（Core `packages/core/tests/acceptance/**/scenarios/*.md` 或 Excel `packages/react/tests/excel/scenarios/*.md`；subagent 不自动加载，控制器须显式带上）；显式点明 plan-risk（off-by-one/语义冲突）并要求 STOP+ASK；要求 self-review（DONE/DONE_WITH_CONCERNS/BLOCKED/NEEDS_CONTEXT）。

## Navigation（详见 `packages/core/src/ARCHITECTURE.md`）

| Topic | Location |
| --- | --- |
| 公开 Grid API / 类型 | `core/src/Grid.ts`、`index.ts`（`GridOptions.backend` 必填；re-export DataSource/Schema/Theme） |
| Engine 组合根 | `core/src/engine/DefaultGridEngine.ts`（导航 `engine/README.md`） |
| Kernel 原语 | `core/src/kernel/`（geometry/data/theme/render/undo/protocol/coords；算法核心 `geometry/ChunkedAxis.ts`） |
| Feature 领域 | `core/src/features/<domain>/`（row/column/selection/layout/fill/clipboard/view/edit/format/merge） |
| Canvas2D 渲染 | `canvas2d/src/render/Canvas2DRenderer.ts`、`painters/`；Theme tokens `core/src/kernel/theme/denseGridTheme.ts` |
| DOM 壳 / runtime | `core/src/dom/{host,scroll,interaction,overlay,runtime}/`（`GridRuntime`、`GridControllerImpl`、`ScrollMapper`） |
| 渲染后端端口 + 工厂 | `core/src/ports/RenderBackend.ts`、`canvas2d/src/backend/canvas2dBackend.ts` |
| 行为测试规格 | `docs/superpowers/specs/2026-06-08-novasheet-behavioral-testing-design.md`（L0–L4、Phase 1 Core L0–L2 分批启动） |
| Core BDD 路线 | `docs/superpowers/plans/2026-06-11-novasheet-core-public-api-bdd-roadmap.md`（公开 API 场景矩阵 + 分批路径） |
| MD 场景工具 | `packages/mbd/`（`validate`/`manifest`）；覆盖率 `@novasheet/react` `lint:scenario-coverage`；规格 `2026-06-09-novasheet-mbd-package-design.md` |
| React 包架构 | `packages/react/docs/project-{structure,standards}.md` |
| 测试 | each `packages/<pkg>/tests/` mirrors `src/`（core: kernel/features/engine；canvas2d: grid/integration/runtime/painters） |

## NOT shipped yet (don't add prematurely — confirm first)

Frozen quadrant painting（M3 stub `canvas2d/src/painters/FrozenPainter.ts`）、WebGL/WebGPU 后端、server-paginated DataSource、`apps/playground/`（M5 perf）。`apps/storybook/` 已在 scope（`@storybook/html-vite`，每个 Grid 配置加 story）。

## Browser / 约束

Modern Chrome/Firefox/Safari + iOS Safari；DPR 1/1.5/2/3 须清晰；ScrollMapper `SAFE_MAX = 6_000_000` px（跨端安全 spacer 高，Firefox ~17.9M / iOS ~16.7M）。

## When in doubt

不在多个解释间静默选——flag ambiguity and ask。Phase1 spec `docs/superpowers/specs/2026-05-13-novasheet-phase1-canvas-grid-design.md`。
