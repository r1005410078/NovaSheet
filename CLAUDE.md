# Claude / Agent Working Rules for NovaSheet

This file is loaded into Claude / Codex / other coding-agent sessions. It encodes invariants that are easy to get wrong without context. Read this before editing.

---

## Project shape

- High-performance Canvas-based table engine, eventual AI-Native data workbench
- Greenfield TS monorepo (bun workspaces); **two packages**: `@novasheet/core`（引擎 + DOM 壳 + 公开 `Grid` facade + `RenderBackend` 端口）、`@novasheet/canvas2d`（Canvas2D 渲染后端，反向依赖 core）。`apps/storybook` 是组合根，`new Grid({ data, backend: canvas2dBackend })` 注入后端
- See `README.md` for product framing and Quick Start
- See `docs/superpowers/specs/` for the design specs that drive plans
- See `docs/superpowers/plans/` for milestone implementation plans (M1 done; M2-M5 outlined)

---

## Current state (read first on a fresh session)

**Last shipped (branch, 未合并 `main`):** **Web 合并进 Core（依赖反转）** — on `refactor-default-grid-engine-decomposition`（纯重构，零行为变化）。`@novasheet/web` 整体并入 `@novasheet/core`：表格控件的 DOM 壳（`dom/host`、`dom/scroll`、`dom/interaction`、`dom/overlay`、`dom/runtime` = `GridRuntime`/`GridControllerImpl`）+ 公开 `Grid` facade 入 core；渲染后端经 `RenderBackend` 端口**依赖反转**——`@novasheet/canvas2d` 导出 `canvas2dBackend` 工厂、反向依赖 core，组合根注入。`@novasheet/web` 已删除。core 内部分层：`kernel`/`features`/`engine`/`ports` 为纯层（零 DOM、可 node/worker、脱 DOM 测），`dom/` 为浏览器壳、单向依赖纯层（`scripts/check-kernel-boundary.ts` 强制）。Specs/plans：`2026-06-06-novasheet-web-into-core-dip-design.md`、`2026-06-06-novasheet-web-into-core-dip.md`。

**Prior shipped:** **Engine Composer Phase 2** — `StructuralMutationCoordinator`（结构 9 mutation undo 模板）、`EditController` / `PasteController` / `FillController`（edit/paste/fill 写入门面）、`FrameAssembler`（`getFrame` 纯函数装配）。Specs/plans：`2026-06-07-novasheet-engine-composer-phase-2-design.md`、`2026-06-07-novasheet-engine-composer-phase-2.md`。导航：`packages/core/src/engine/README.md`（Composer 2-A–2-D 表）、`features/edit|clipboard|fill/README.md`。

**Prior shipped:** **文本换行三态 + Alt+Enter 多行文本** — on `feat/cell-multiline-text`. Multi-line text content-driven (`\n`)；`CellFormat.textWrap: 'overflow'|'wrap'|'clip'`；`CellPainter`/`Canvas2DRenderer` overflow 溢出邻空格；`AutofitRowHeights`/`TsvFormat` 多行对齐。Spec: `2026-05-30-novasheet-text-wrap-tristate.md`.

**Prior shipped:** **填充柄 × 合并/格式 集成** — on `fix/fill-handle-merge-format-snap`. Fill handle 携带 fill/border/merge；`snapFillToBlocks`；fill undo 带 format/merge 快照。Spec: `2026-05-30-novasheet-fill-handle-merge-format-integration.md`.

**Prior shipped:** **Phase 5-A merge + basic range styling** — sparse `RangeStyleStore` + `MergeStore`（**raw** 坐标键控）；`setFillColor`/`setBorders`/`mergeCells`/`unmergeCells`；Canvas `FormatFillPainter`/`FormatBorderPainter`；结构 remap + undo 快照对齐。Spec/plan: `2026-05-28-novasheet-phase-5-merge-range-formatting.md`、`2026-05-28-novasheet-phase-5-a-merge-basic-range-styling.md`.

**Phase 5-A coordinate invariant (important):** `RangeStyleStore`/`MergeStore` key cells by **raw** underlying row index + raw col index; `getFrame()` translates the visible region raw→view so painters consume VIEW coords only. Formatting/merge mutations translate the incoming view selection to a contiguous raw range via `viewRangeToRawRange`; when a sort/filter scatters the mapping (non-contiguous) the mutation conservatively returns `false` (no-op) — consistent with the spec's "5-A 保守禁用冲突 mutation" posture.

- `@novasheet/core` — 两段分层：
  - **纯层**（`kernel/` + `features/` + `engine/DefaultGridEngine` + `ports/`）—— 平台无关、零 DOM、可 node/worker、脱 DOM 测；`ports/` 是边界契约层（`RenderBackend` 端口，可引用 DOM 类型但不依赖 `dom/`）。
  - **DOM 壳**（`dom/` = `host`/`scroll`/`interaction`/`overlay`/`runtime`）+ 公开 `Grid` facade —— browser-only，单向依赖纯层。`GridRuntime`（原 `WebGridRuntime`）、`GridControllerImpl`（通用装配，注入 backend）在 `dom/runtime/`。
- `@novasheet/canvas2d` — Canvas2D renderer、painters、text measurer、surface + `canvas2dBackend` 工厂（实现 core `RenderBackend` 端口，反向依赖 core）。消费者从 `@novasheet/core` 导入 `Grid`，注入 `canvas2dBackend`。

M2 scroll behavior preserved (1M+ rows, non-linear `scrollTop`). Storybook 从 `@novasheet/core` 导入 `Grid`、从 `@novasheet/canvas2d` 导入 `canvas2dBackend` 注入。

**Next milestone:** **Phase 5-C** number/date/currency formatting，then 5-D conditional formatting — unless the user redirects.（5-B advanced borders、text-wrap tri-state、multi-line text 已 ship；见 Prior shipped。）**Integration note:** decomposition 分支暂不合 `main`；新功能开发前先确认基于哪条分支。

**Per-Grid scheduler convention** (invariant #5): each `Grid` owns `new FrameScheduler()` shared by the render backend and `NativeScroller` via `GridRuntime`; the `frameScheduler` singleton from `util/raf` is NOT used cross-Grid.

**Dependency direction（反转后）:** `@novasheet/canvas2d` → `@novasheet/core`（canvas2d 实现 `RenderBackend` 端口、反向依赖 core）。`apps/storybook` → core + canvas2d（组合根，注入 `canvas2dBackend`）。**core `src/` 绝不 import canvas2d**。core 内部：`dom/**` 依赖纯层（`kernel|features|engine|ports`），反向禁止，且纯层禁触碰 DOM 全局——由 `scripts/check-kernel-boundary.ts`（`bun run lint:architecture`）强制。

**Phase 4 status:** 4.0 context menu, 4.1 clipboard, 4.2 undo/redo, 4.3 fill handle, 4.4 sort/filter, 4.5 row structural + row header menu, 4.6 column structural + column header menu extension, and 4.7 column drag reorder are shipped.

**Phase 5 status:** 5-A (merge + fill + basic solid borders), fill-handle × merge/format integration, text-wrap tri-state + Alt+Enter multi-line text, and **5-B advanced borders (dashed/dotted/double)** shipped. 5-C (number/date/currency format), 5-D (conditional formatting) not started.

**Engine refactor status (decomposition branch):** 7 步路线 ✅ + **Composer Phase 2** ✅（2-A 结构协调器、2-B Edit、2-C Paste/Fill、2-D FrameAssembler）。`DefaultGridEngine` 仍保留 composer：事件管线、undo 注册、跨域 ctx 注入、resize/setData 等——有意留 engine，不做脱离功能的大 bang 拆分。

**Locked architectural decisions** (do NOT revisit casually, see spec ADR §A):

1. Single Canvas, full visible-region redraw
2. Native scroll + non-linear `scrollTop` mapping; reject self-painted scrollbar
3. ChunkedAxis with `CHUNK_SIZE = 1024`
4. DataSource `getRows(start, end)` returns `Row[] | Promise<Row[]>`, **`endIndex` is INCLUSIVE** to match `ChunkedAxis.getVisibleRange [first, last]`. `getCell` is sync hot path returning `CellValue | undefined`.
5. Theme tokens — zero hardcoded visual values in `src/render/`
6. DOM `<handle-layer>` siblings for resize hit-zones (M4) — solves the canvas pointer-events vs hover-detection paradox AND fixes a11y
7. Single `frameScheduler` per Grid — all RAF sources coalesce

**How to pick up:** read this file + `packages/core/src/ARCHITECTURE.md` + `packages/core/src/engine/README.md`. On `refactor-default-grid-engine-decomposition`, read recent commits for delta; decomposition **未合并 `main`**。功能线（5-C 等）开发前确认基线分支。M1 硬ening review（`9579959`）仍适用于 Renderer / ChunkedAxis / Grid.destroy 基线行为。

---

## Working with this user (operational style)

Built up over the M1 cycle. Apply to all sessions, not just M1:

- **Terse, technical, table-driven.** Use comparison tables (`维度 | 方案 A | 方案 B`) over prose paragraphs. Lead with recommendation + reason, options second. Surface runtime constraints with concrete numbers (e.g., "Firefox max scrollHeight ~17.9M px"), not vague hedges.
- **Default to Chinese for prose, English for code/identifiers.** No emoji unless explicitly requested.
- **End-of-turn summary: one or two sentences max. No celebratory tone.**
- **Plan-bug catches are a feature, not a failure.** When implementing tasks, if a test expectation contradicts the reference implementation or a plan formula doesn't add up, STOP and ask before silently choosing. The M1 cycle caught 3 plan bugs mid-execution and 4 post-review issues — the user accepted every finding. The system is designed to catch these; don't shortcut it.
- **When a plan bug is found, fix the plan file FIRST in a `docs(plan): ...` commit**, then re-dispatch the implementer with the corrected truth. Audit trail in `git log` matters.
- **Don't skip self-review.** Both the plan self-review (placeholder scan / consistency / scope / ambiguity) and the spec self-review are load-bearing. After an entire milestone, dispatch a final code-reviewer subagent — even when tests + lint + typecheck are green; latent bugs at module boundaries are common.

---

## Toolchain (NON-NEGOTIABLE)

- **Package manager + runtime:** `bun` (≥ 1.2). **NEVER** use `npm`, `yarn`, or `pnpm` — they will desync the lockfile and break CI.
- **Test:** `bun test` (top-level). Tests live in each `packages/<pkg>/tests/`. Preload chain in `bunfig.toml`: core → canvas2d setup files（`core/tests/setup.ts` 全局注册 happy-dom，故 DOM 对所有测试可用；Grid×canvas2d 集成测试在 `packages/canvas2d/tests/`，纯引擎/纯层测试在 `packages/core/tests/{kernel,features,engine}`）。
- **Typecheck:** `bun run --filter '*' typecheck` — TypeScript is strict + `noUncheckedIndexedAccess` + `verbatimModuleSyntax`.
- **Lint:** `bun run lint` — must be clean (0 errors, 0 warnings).
- **Build:** `bun run --filter @novasheet/core build && bun run --filter @novasheet/canvas2d build` (order matters; canvas2d 反向依赖 core，先 build core).
- **Storybook:** `bun run storybook` (or `bun run --filter @novasheet/storybook storybook`).
- **All four (lint, typecheck, test, build) must pass** before any commit lands on `main` (CI enforces).
- **Mock APIs in tests:** `bun:test` exports `mock` and `spyOn` (replaces Vitest's `vi.fn` / `vi.spyOn`). For global stubbing (no `vi.stubGlobal` in bun:test), use `packages/core/tests/helpers/global-stub.ts` (`stubGlobal` / `unstubAllGlobals`).

---

## Architectural invariants (enforce in code review)

1. **渲染后端（`RenderBackend`）reads ONLY from engine state** — via held `Viewport` + `RenderFrame` from `engine.getFrame()` on the RAF path; never from `ChunkedAxis` / `FrozenRegions` / `DataSource` outside the frame contract. 后端经 `RenderBackend` 端口注入（canvas2d 的 `canvas2dBackend`）；DOM host/runtime 现在 core `dom/`，但 renderer↔engine 的 frame 契约不变。
2. **All mutations go through `DefaultGridEngine` or the public `Grid` facade.** The facade decides what to invalidate. Painters / layout objects do not invalidate themselves.
3. **Engine / facade / runtime must not call aggregate mutation methods directly.** Domain writes go through that domain's write seam; aggregate methods are for that seam, domain event handlers, and aggregate-focused tests. Two seam shapes by domain kind: **event-source structural domains** (row/column) use a CQRS **`*CommandHandler`** (`execute(operation) → aggregate event → dispatch` into `GridEventPipeline`); **non-event domains** (selection) use a **write façade / domain service** (e.g. `SelectionController`) — engine still must not touch aggregate mutations, but no `execute`/Operation/Event is required because the domain emits no events. Do not force a non-event domain into the `*CommandHandler` shape. If a domain lacks a write seam, add the appropriate one before wiring new or refactored mutations.
4. **Theme is the ONLY source of visual values.** No hardcoded px, fonts, or color literals in `packages/canvas2d/src/painters/` or `render/`. Future ESLint custom rule planned.
5. **DataSource.getRows endIndex is INCLUSIVE** (matches `ChunkedAxis.getVisibleRange` `[first, last]`). Do not change this convention.
6. **One shared `frameScheduler` per Grid instance** — multiple RAF sources must coalesce. Future M2+ NativeScroller and ResizeObserver must use the same scheduler the Renderer uses.
7. **`Grid.destroy()` must be fully idempotent.** Cancels all pending RAFs, restores `container.style.position`, removes the canvas. Strict Mode test (mount→destroy→mount) must remain green.
8. **`ChunkedAxis.getSize(index)`** is the canonical row/col size accessor at boundaries. Do NOT compute size as `indexToPosition(i+1) - indexToPosition(i)` — that returns 0 at `i = count-1` due to clamping.
9. **core 内部纯层 / DOM 壳单向边界。** `kernel|features|engine|ports` 是纯层：不得 import `dom/**`，且 `kernel|features|engine` 不得触碰 `document`/`window` 等 DOM 全局（`ports` 可引用 `HTMLElement` 等 DOM **类型**作边界契约）。`dom/**` 可依赖纯层，反向禁止。由 `scripts/check-kernel-boundary.ts` 强制（`bun run lint` 包含）。**core `src/` 永不 import `@novasheet/canvas2d`**（依赖反转的根本）。

---

## TypeScript conventions

- `verbatimModuleSyntax` is on — **type-only imports must use `import type { ... }`**.
- Strict mode: explicit `Readonly<...>` / `readonly` modifiers on Theme tree, Schema fields, and any other immutable interface surface.
- `noUncheckedIndexedAccess` is on — array/Map reads need `!` or explicit guards.
- Definite-assignment assertion (`!:`) is acceptable when a field is set indirectly via a constructor-called helper (e.g., `ChunkedAxis.chunkPrefixSum!: Float64Array` set in `rebuild()`).

## Code comment conventions

NovaSheet uses a **少而硬** comment strategy: public API is readable, core rules are traceable, and ordinary code relies on naming + tests.

- **Public exports need short TSDoc/JSDoc.** Exported classes, functions, interfaces, and important types should explain purpose and contract, not restate parameter names.
- **Private code is comment-light by default.** Add comments only for algorithms, coordinate systems, scheduling/order constraints, invariants, compatibility constraints, or non-obvious tradeoffs.
- **Comments should explain why, not what.** Avoid line-by-line narration such as "assign value to variable"; prefer context that prevents future regressions.
- **Layer-specific density:** core 纯层（`kernel/features/engine/ports`）may document algorithms and platform-independent invariants; core DOM 壳（`dom/host|runtime|interaction|overlay`）should document interaction flow, coordinate spaces, and RAF/scheduler timing; Storybook should stay sparse and explain demo intent only when useful.
- **Tests describe behavior first.** Prefer precise test names and assertions over long explanatory comments in test bodies.
- **External docs hold large design context.** Keep full design rationale in `docs/superpowers/specs/` or `docs/superpowers/plans/`; code comments may point to those docs when a local rule depends on a larger decision.
- **TODOs must be scoped.** Use a milestone or phase prefix, e.g. `TODO(phase-4.4): ...`; do not leave unowned TODOs.
- **No decorative or stale comments.** Remove comments that duplicate obvious code, refer to old architecture, or no longer match the implementation.

---

## Testing conventions

- **TDD strict.** Write the failing test first, see it fail, implement, see it pass, commit. Plan steps follow this exact rhythm.
- **Canvas tests use `RecordingContext2D`** (`packages/canvas2d/tests/helpers/recording-context.ts`) — captures ctx instruction sequences as `{ op, args }` objects.
- **`packages/core/tests/setup.ts`** is minimal (no happy-dom). Web + canvas2d setups register happy-dom; canvas2d also stubs `getContext('2d')`.
- **`bun:test` import**: `import { describe, expect, it, mock, spyOn } from 'bun:test'`. NOT `from 'vitest'`.
- **Global stubbing**: `import { stubGlobal, unstubAllGlobals } from '../helpers/global-stub'` (bun:test has no built-in equivalent of `vi.stubGlobal`).
- **Type-only failing tests** (Schema, DataSource interface) won't fail at runtime in `bun test` because TS imports erase. Use `tsc --noEmit` to verify the "test fails before implementation" gate for type-only modules.

---

## Commit conventions

- **Conventional Commits**: `feat(core): ...`, `chore(core): ...`, `docs(plan): ...`, `docs(spec): ...`
- **Commit 说明使用中文。** Conventional Commits 的 `type(scope)` 前缀保持英文，冒号后面的 subject 与正文（body）用中文叙述；代码标识符、文件路径、命令、API 名、错误信息等仍保持英文原样。示例：`feat(web): 新增筛选弹层` / `fix(core): 修正 ChunkedAxis.getSize 边界返回 0 的问题`。
- One task = one commit, per the milestone plan. Don't batch commits across plan tasks.
- When the plan itself has a bug (caught during execution), correct the plan FIRST in a `docs(plan): fix ...` commit, then re-dispatch the implementer. Audit trail matters.
- **Never use `--no-verify`** unless the user explicitly asks. Hook failures need fixing, not bypassing.
- **Never amend pushed commits.** Always create new commits.

---

## Working with the Superpowers pipeline

The user opts into the formal pipeline for any non-trivial feature:

1. **brainstorming** — explore intent + alternatives + present design sections; write `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`
2. **writing-plans** — decompose into milestones (M1/M2/...) one at a time; write `docs/superpowers/plans/YYYY-MM-DD-novasheet-mN-<name>.md`
3. **subagent-driven-development** — dispatch one implementer subagent per plan task; do not batch tasks per subagent
4. **finishing-a-development-branch** — verify tests, present completion options, push + tag

Subagent prompts must:

- Reference the plan file path; do NOT paste hundreds of lines of task body inline (saves controller context)
- State known plan-risk areas explicitly (off-by-ones, semantic conflicts) and instruct STOP+ASK before silent fixes
- Demand a self-review section in the report (DONE / DONE_WITH_CONCERNS / BLOCKED / NEEDS_CONTEXT)

---

## What goes where

| Topic                             | Location                                                                  |
| --------------------------------- | ------------------------------------------------------------------------- |
| Public Grid API                   | `packages/core/src/Grid.ts` / `packages/core/src/index.ts`（`GridOptions.backend` 必填注入）|
| DataSource / Schema / Theme types | `packages/core/src/index.ts`（re-export 自 `kernel/`）                    |
| Engine 组合根                     | `packages/core/src/engine/DefaultGridEngine.ts`                           |
| Core 三层导航                     | `packages/core/src/ARCHITECTURE.md`                                       |
| Kernel 原语（geometry/data/theme/render/undo/protocol/coords） | `packages/core/src/kernel/`                          |
| Feature 领域（row/column/selection/layout/fill/clipboard/view/edit/format/merge/…） | `packages/core/src/features/<domain>/` |
| Format 聚合 + 写入门面            | `packages/core/src/features/format/`（`DefaultFormatState`、`FormatController`） |
| Merge store + view 解析           | `packages/core/src/features/merge/`                                       |
| Algorithm core                    | `packages/core/src/kernel/geometry/ChunkedAxis.ts`                        |
| Per-frame Canvas2D logic          | `packages/canvas2d/src/render/Canvas2DRenderer.ts`                    |
| Theme tokens                      | `packages/core/src/kernel/theme/denseGridTheme.ts`                        |
| DOM host                          | `packages/core/src/dom/host/DomGridHost.ts`                               |
| Scroll math + SAFE_MAX            | `packages/core/src/dom/scroll/ScrollMapper.ts`                            |
| Runtime orchestrator              | `packages/core/src/dom/runtime/GridRuntime.ts`（原 `WebGridRuntime`）；通用装配 `dom/runtime/GridControllerImpl.ts` |
| 渲染后端端口 + 工厂               | `packages/core/src/ports/RenderBackend.ts`；`packages/canvas2d/src/backend/canvas2dBackend.ts` |
| DOM 交互 / overlay                | `packages/core/src/dom/{interaction,overlay}/`                            |
| Grid×canvas2d 集成测试           | `packages/canvas2d/tests/{grid,integration,runtime}/`                     |
| Tests                             | each `packages/<pkg>/tests/` mirrors its `src/`（core: `tests/kernel/`、`tests/features/`、`tests/engine/`） |
| RecordingContext helper           | `packages/canvas2d/tests/helpers/recording-context.ts`                |
| global-stub helper                | `packages/core/tests/helpers/global-stub.ts`（raf.test）+ `packages/canvas2d/tests/helpers/global-stub.ts` |
| Probe tests                       | `packages/core/tests/kernel/geometry/ChunkedAxis.test.ts`（轴边界）；`_probe-types-4-5/4-6.test.ts`（类型守卫） |
| React 包架构（Bulletproof 适配）  | `packages/react/docs/project-structure.md`、`packages/react/docs/project-standards.md` |
| 行为测试规格（L0–L4 分层）        | `docs/superpowers/specs/2026-06-08-novasheet-behavioral-testing-design.md` — **Phase 0**：Core **TDD 继续**、Core **行为测试暂缓**、`packages/react/tests/excel/` 大行为测试主战场；终态 L0–L2 落点 `packages/acceptance/`（API 冻结后） |
| MD 场景工具（private）            | `packages/mbd/`（`@novasheet/mbd`）— 仅 `validate` / `manifest`；测试手写、场景覆盖率由 `@novasheet/react` `lint:scenario-coverage`；规格 `docs/superpowers/specs/2026-06-09-novasheet-mbd-package-design.md` |

---

## Things explicitly NOT shipped yet (don't add prematurely)

- Frozen quadrants painting beyond stub (M3 — `packages/canvas2d/src/painters/FrozenPainter.ts`)
- React wrapper (M4 — `packages/react` or `packages/web-react`)
- WebGL / WebGPU renderers (post-Phase-1)
- Server-paginated DataSource (Phase 4)
- `apps/playground/` — M5 perf validation app

If you find yourself wanting to add any of these, stop and confirm with the user. They've been deferred for a reason.

**Note:** `apps/storybook/` exists separately and is **in scope already** (added post-M1). It's the
component-variant showcase using `@storybook/html-vite` — every Grid configuration form gets a
story. As M2-M4 add new variants (scroll, frozen, resize states), add stories there too. Storybook
serves variant exploration; `apps/playground/` will serve perf validation — different purposes.

---

## Browser support assumptions

- Modern Chrome / Firefox / Safari (desktop) + iOS Safari
- DPR 1 / 1.5 / 2 / 3 must all render crisply
- No IE / legacy Edge support
- ScrollMapper SAFE_MAX = 6_000_000 px is the safe spacer height across all targets (Firefox max ~17.9M, iOS Safari ~16.7M — 6M leaves headroom)

---

## When in doubt

- Read the spec: `docs/superpowers/specs/2026-05-13-novasheet-phase1-canvas-grid-design.md`
- Read the M1 plan: `docs/superpowers/plans/2026-05-13-novasheet-m1-foundation.md`
- Don't silently choose between interpretations — flag the ambiguity and ask
