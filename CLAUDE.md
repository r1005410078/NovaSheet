# Claude / Agent Working Rules for NovaSheet

This file is loaded into Claude / Codex / other coding-agent sessions. It encodes invariants that are easy to get wrong without context. Read this before editing.

---

## Project shape

- High-performance Canvas-based table engine, eventual AI-Native data workbench
- Greenfield TS monorepo (bun workspaces); three packages: `@novasheet/core`, `@novasheet/web`, `@novasheet/web-canvas2d` (`@novasheet/web` exposes the public `Grid` facade)
- See `README.md` for product framing and Quick Start
- See `docs/superpowers/specs/` for the design specs that drive plans
- See `docs/superpowers/plans/` for milestone implementation plans (M1 done; M2-M5 outlined)

---

## Current state (read first on a fresh session)

**Last shipped:** **文本换行三态 + Alt+Enter 多行文本** — on `feat/cell-multiline-text`. (1) Multi-line text is now content-driven (value contains `\n`), not column-gated: `CellPainter.paintHardBreaks`/`paintLines` render `\n` lines for any text/fallback cell; the editor uses a `<textarea>` for any non-number field with `rows=1`+`wrap=off` (default 1 line, long single line widens horizontally via `autoGrow`, vertical growth only on Alt+Enter), `AutofitRowHeights` grows rows by `\n` line count (merged cells excluded via `isCellMerged`), and `TsvFormat` RFC-4180-quotes `\n`/`\t`/`"` cells so multi-line copy/paste doesn't split rows. (2) **Text display tri-state** `CellFormat.textWrap: 'overflow'|'wrap'|'clip'` (default `overflow`, aligned with Google/Excel; `field.wrap` is the fallback default): `RangeStyleStore` accumulates it; engine `setTextWrap(range,mode)` + `Grid.setTextWrap` with format undo; `CellPainter` resolves `mode = textWrap ?? (field.wrap?'wrap':'overflow')` and clip = hard cut **no ellipsis**; `Canvas2DRenderer` threads per-cell textWrap (`buildTextWrapLookup`) and, for overflow single-line text, spills into adjacent empty cells (`overflowExtra` scans right via `ctx.measureText`); autofit uses resolved textWrap via `isWrapCell`. Storybook `表格/合并与格式化` gains 溢出/换行/裁断 buttons. Specs: `docs/superpowers/specs/2026-05-30-novasheet-text-wrap-tristate.md` (+ plan). Known limit: overflow text sits under gridlines (stage order unchanged); vertical alignment + Center Across Selection not done.

**Prior shipped:** **填充柄 × 合并/格式 集成** — on `fix/fill-handle-merge-format-snap`. Extends the Phase 4.3 fill handle (autofill) to carry Phase 5-A fill color / borders / merge regions, aligned with Google Sheets merge-fill semantics. `commitFill` now calls `propagateFillStyles` after value writes: `tileFillFormat` tiles the source cell's resolved format along the fill axis (`positiveModulo`, clearing target first so it exactly equals the source) and `tileFillMerge` always `unmerge`s the fill region first (single-cell source over a merge → unmerges it; merged source → clears then tiles whole merge blocks). `computeFillTarget` gained `snap?`/`targetMerge?` params + `snapFillToBlocks`: cursor on an existing merge snaps the fill to that merge's edge, else round-up to whole source-block multiples — so preview and commit agree (both go through `computeFillTarget`). The `fill` undo command carries optional `format/merge` store snapshots restored on undo/redo; non-contiguous raw mapping (sort/filter scatter) conservatively fills values only. New engine `getFillMergeSnap`; runtime injects snap + the cursor's `frame.mergeRegions` entry. Spec: `docs/superpowers/specs/2026-05-30-novasheet-fill-handle-merge-format-integration.md`.

**Prior shipped:** **Phase 5-A merge + basic range styling** — on `feat/phase-5-a-merge-range-styling`. Adds platform-independent sparse `RangeStyleStore` (fill color + `all/outer/inner/clear` solid borders with color + thin/medium/thick width) and `MergeStore` (merge/unmerge, overlap rejection, raw-coord keyed); engine `setFillColor`/`setBorders`/`mergeCells`/`unmergeCells` + `getCellFormat`/`getMergeRegion` (RAW coords) with undo/redo; `RenderFrame.cellFormats?`/`mergeRegions?` (optional, emitted in VIEW coords via raw→view translation); Canvas `FormatFillPainter` + `FormatBorderPainter` stages and merge-aware text/anchor rendering (single canvas, no new DOM); structural remap of both stores on insert/delete/move with undo/redo store-snapshot alignment (Task 7b); clipboard paste-over-merge guard (`onPasteSkipped` reason `'merge'`); public `Grid` API + Storybook `表格/合并与格式化`. Prior shipped stack (Phase 4.7 column drag reorder, etc.) unchanged.

**Phase 5-A coordinate invariant (important):** `RangeStyleStore`/`MergeStore` key cells by **raw** underlying row index + raw col index; `getFrame()` translates the visible region raw→view so painters consume VIEW coords only. Formatting/merge mutations translate the incoming view selection to a contiguous raw range via `viewRangeToRawRange`; when a sort/filter scatters the mapping (non-contiguous) the mutation conservatively returns `false` (no-op) — consistent with the spec's "5-A 保守禁用冲突 mutation" posture.

- `@novasheet/core` — platform-independent (data, schema, theme, layout, `DefaultGridEngine`, `RenderFrame`). No DOM.
- `@novasheet/web` — browser host/runtime (`DomGridHost`, `NativeScroller`, `ScrollMapper`, `WebGridRuntime`) plus public `Grid` facade and Canvas2D backend assembly.
- `@novasheet/web-canvas2d` — Canvas2D renderer, text measurer, and surface utilities. Consumers normally import `Grid` from `@novasheet/web`.

M2 scroll behavior preserved (1M+ rows, non-linear `scrollTop`). Storybook uses the public `Grid` facade from `@novasheet/web`.

**Next milestone:** **Phase 5-C** number/date/currency formatting, then 5-D conditional formatting — unless the user redirects. (5-B advanced borders shipped: `setBorders` accepts all `lineStyle`; `FormatBorderPainter` renders dashed/dotted via stroke+`setLineDash` and double via two 1px rects; spec/plan `2026-05-31-novasheet-phase-5-b-advanced-borders`. Text-wrap tri-state + multi-line text also shipped — see Last shipped above the prior entry.) Phase 5-A is documented in `docs/superpowers/specs/2026-05-28-novasheet-phase-5-merge-range-formatting.md` + the implementation plan at `docs/superpowers/plans/2026-05-28-novasheet-phase-5-a-merge-basic-range-styling.md` (the plan also contains Task 7b, the structural-undo store-alignment fix added mid-execution).

**Per-Grid scheduler convention** (invariant #5): each `Grid` owns `new FrameScheduler()` shared by `Canvas2DRenderer` and `NativeScroller` via `WebGridRuntime`; the `frameScheduler` singleton from `util/raf` is NOT used cross-Grid.

**Dependency direction:** `@novasheet/core` is platform-independent. `@novasheet/web-canvas2d` depends on core for render contracts; `@novasheet/web` depends on core + web-canvas2d to expose the browser `Grid` facade and Canvas2D backend. `apps/storybook` depends on `@novasheet/web` + `@novasheet/core`.

**Phase 4 status:** 4.0 context menu, 4.1 clipboard, 4.2 undo/redo, 4.3 fill handle, 4.4 sort/filter, 4.5 row structural + row header menu, 4.6 column structural + column header menu extension, and 4.7 column drag reorder are shipped.

**Phase 5 status:** 5-A (merge + fill + basic solid borders), fill-handle × merge/format integration, text-wrap tri-state + Alt+Enter multi-line text, and **5-B advanced borders (dashed/dotted/double)** shipped. 5-C (number/date/currency format), 5-D (conditional formatting) not started.

**Locked architectural decisions** (do NOT revisit casually, see spec ADR §A):

1. Single Canvas, full visible-region redraw
2. Native scroll + non-linear `scrollTop` mapping; reject self-painted scrollbar
3. ChunkedAxis with `CHUNK_SIZE = 1024`
4. DataSource `getRows(start, end)` returns `Row[] | Promise<Row[]>`, **`endIndex` is INCLUSIVE** to match `ChunkedAxis.getVisibleRange [first, last]`. `getCell` is sync hot path returning `CellValue | undefined`.
5. Theme tokens — zero hardcoded visual values in `src/render/`
6. DOM `<handle-layer>` siblings for resize hit-zones (M4) — solves the canvas pointer-events vs hover-detection paradox AND fixes a11y
7. Single `frameScheduler` per Grid — all RAF sources coalesce

**How to pick up:** start a new session by reading this file + the spec + the M1 plan. Then read the most-recent N commits to understand the latest delta. Open the M1 hardening review (`9579959`) if anything feels off about Renderer / ChunkedAxis / Grid.destroy — that commit captured the post-M1-review polish.

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
- **Test:** `bun test` (top-level). Tests live in each `packages/<pkg>/tests/`. Preload chain in `bunfig.toml`: core → web → web-canvas2d setup files.
- **Typecheck:** `bun run --filter '*' typecheck` — TypeScript is strict + `noUncheckedIndexedAccess` + `verbatimModuleSyntax`.
- **Lint:** `bun run lint` — must be clean (0 errors, 0 warnings).
- **Build:** `bun run --filter @novasheet/web build && bun run --filter @novasheet/web-canvas2d build && bun run --filter @novasheet/core build` (order matters; core externalizes web packages).
- **Storybook:** `bun run storybook` (or `bun run --filter @novasheet/storybook storybook`).
- **All four (lint, typecheck, test, build) must pass** before any commit lands on `main` (CI enforces).
- **Mock APIs in tests:** `bun:test` exports `mock` and `spyOn` (replaces Vitest's `vi.fn` / `vi.spyOn`). For global stubbing (no `vi.stubGlobal` in bun:test), use `packages/core/tests/helpers/global-stub.ts` (`stubGlobal` / `unstubAllGlobals`).

---

## Architectural invariants (enforce in code review)

1. **Canvas2DRenderer reads ONLY from engine state** — via held `Viewport` + `RenderFrame` from `engine.getFrame()` on the RAF path; never from `ChunkedAxis` / `FrozenRegions` / `DataSource` outside the frame contract.
2. **All mutations go through `DefaultGridEngine` or the public `Grid` facade.** The facade decides what to invalidate. Painters / layout objects do not invalidate themselves.
3. **Theme is the ONLY source of visual values.** No hardcoded px, fonts, or color literals in `packages/web-canvas2d/src/painters/` or `render/`. Future ESLint custom rule planned.
4. **DataSource.getRows endIndex is INCLUSIVE** (matches `ChunkedAxis.getVisibleRange` `[first, last]`). Do not change this convention.
5. **One shared `frameScheduler` per Grid instance** — multiple RAF sources must coalesce. Future M2+ NativeScroller and ResizeObserver must use the same scheduler the Renderer uses.
6. **`Grid.destroy()` must be fully idempotent.** Cancels all pending RAFs, restores `container.style.position`, removes the canvas. Strict Mode test (mount→destroy→mount) must remain green.
7. **`ChunkedAxis.getSize(index)`** is the canonical row/col size accessor at boundaries. Do NOT compute size as `indexToPosition(i+1) - indexToPosition(i)` — that returns 0 at `i = count-1` due to clamping.

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
- **Layer-specific density:** `core` may document algorithms and platform-independent invariants; `web/runtime` should document interaction flow, coordinate spaces, and RAF/scheduler timing; Storybook should stay sparse and explain demo intent only when useful.
- **Tests describe behavior first.** Prefer precise test names and assertions over long explanatory comments in test bodies.
- **External docs hold large design context.** Keep full design rationale in `docs/superpowers/specs/` or `docs/superpowers/plans/`; code comments may point to those docs when a local rule depends on a larger decision.
- **TODOs must be scoped.** Use a milestone or phase prefix, e.g. `TODO(phase-4.4): ...`; do not leave unowned TODOs.
- **No decorative or stale comments.** Remove comments that duplicate obvious code, refer to old architecture, or no longer match the implementation.

---

## Testing conventions

- **TDD strict.** Write the failing test first, see it fail, implement, see it pass, commit. Plan steps follow this exact rhythm.
- **Canvas tests use `RecordingContext2D`** (`packages/web-canvas2d/tests/helpers/recording-context.ts`) — captures ctx instruction sequences as `{ op, args }` objects.
- **`packages/core/tests/setup.ts`** is minimal (no happy-dom). Web + web-canvas2d setups register happy-dom; web-canvas2d also stubs `getContext('2d')`.
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
| Public Grid API                   | `packages/web/src/Grid.ts` / `packages/web/src/index.ts`                  |
| DataSource / Schema / Theme types | `packages/core/src/index.ts`                                              |
| Engine state coordinator          | `packages/core/src/engine/DefaultGridEngine.ts`                           |
| Algorithm core                    | `packages/core/src/layout/ChunkedAxis.ts` (also `Axis` / `MutableAxis`)   |
| Per-frame Canvas2D logic          | `packages/web-canvas2d/src/render/Canvas2DRenderer.ts`                    |
| Theme tokens                      | `packages/core/src/theme/denseGridTheme.ts`                               |
| DOM host                          | `packages/web/src/host/DomGridHost.ts`                                    |
| Scroll math + SAFE_MAX            | `packages/web/src/scroll/ScrollMapper.ts`                                 |
| Web orchestrator                  | `packages/web/src/runtime/WebGridRuntime.ts`                              |
| Tests                             | each `packages/<pkg>/tests/` mirrors its `src/`                           |
| RecordingContext helper           | `packages/web-canvas2d/tests/helpers/recording-context.ts`                |
| global-stub helper                | `packages/web/tests/helpers/global-stub.ts` (+ duplicate in web-canvas2d) |
| Probe tests                       | `packages/core/tests/_probe.test.ts`                                      |

---

## Things explicitly NOT shipped yet (don't add prematurely)

- Frozen quadrants painting beyond stub (M3 — `packages/web-canvas2d/src/painters/FrozenPainter.ts`)
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
