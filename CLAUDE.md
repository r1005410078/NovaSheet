# Claude / Agent Working Rules for NovaSheet

This file is loaded into Claude / Codex / other coding-agent sessions. It encodes invariants that are easy to get wrong without context. Read this before editing.

---

## Project shape

- High-performance Canvas-based table engine, eventual AI-Native data workbench
- Greenfield TS monorepo (bun workspaces); single shipped package today: `@novasheet/core`
- See `README.md` for product framing and Quick Start
- See `docs/superpowers/specs/` for the design specs that drive plans
- See `docs/superpowers/plans/` for milestone implementation plans (M1 done; M2-M5 outlined)

---

## Current state (read first on a fresh session)

**Last shipped:** **M2 Virtualization & Scroll** (+ Bun migration) — tag `bun-migration` at the HEAD of `main`. 126 tests, lint/typecheck/build all clean. 1M+ rows scroll smoothly with non-linear `scrollTop` mapping. Visible in Storybook → Grid/Scroll (10k / 1M / scrollToRow / BothAxisScroll / ScrollToCellFar). Toolchain is now Bun-only (no Node / pnpm / Vitest / tsup).

**Next milestone:** **M3 Frozen + Dynamic sizing** — not yet planned. Scope (per spec §4 + §5.3 + §5.7):
- `FrozenRegions` returning 4 quadrants (topLeft / topRight / bottomLeft / main) when `frozenRows > 0` or `frozenCols > 0`
- `Renderer` iterating all populated quadrants with per-quadrant scroll offsets (frozen quadrants don't scroll)
- New `FrozenPainter` for inter-quadrant shadow gradients (spec §5.7)
- Dynamic row-height autofit (multi-line text measurement)
- Grid `setFrozen(rows, cols)` becomes load-bearing (currently a no-op stub from M1)

**Per-Grid scheduler convention** (clarification of invariant #5): each `Grid` owns `new FrameScheduler()` shared by its `Renderer` and `NativeScroller`; the `frameScheduler` singleton exported from `util/raf` is NOT used cross-Grid (would clobber via `'renderer:flush'` key collision). When M3 / M4 add more RAF sources, they pass the same per-Grid instance.

**M3-M5 status:** outlined only — see spec §1 In Scope + spec appendix B for the Phase ordering.

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
- **Test:** `bun test` (top-level). Tests live in `packages/core/tests/`. Setup is preloaded via `bunfig.toml` (`[test] preload = ["./packages/core/tests/setup.ts"]`).
- **Typecheck:** `bun run --filter @novasheet/core typecheck` — TypeScript is strict + `noUncheckedIndexedAccess` + `verbatimModuleSyntax`.
- **Lint:** `bun run lint` — must be clean (0 errors, 0 warnings).
- **Build:** `bun run --filter @novasheet/core build` (custom `build.ts` invoking `Bun.build` for ESM + CJS + `tsc --emitDeclarationOnly` for .d.ts).
- **Storybook:** `bun run storybook` (or `bun run --filter @novasheet/storybook storybook`).
- **All four (lint, typecheck, test, build) must pass** before any commit lands on `main` (CI enforces).
- **Mock APIs in tests:** `bun:test` exports `mock` and `spyOn` (replaces Vitest's `vi.fn` / `vi.spyOn`). For global stubbing (no `vi.stubGlobal` in bun:test), use `packages/core/tests/helpers/global-stub.ts` (`stubGlobal` / `unstubAllGlobals`).

---

## Architectural invariants (enforce in code review)

1. **Renderer reads ONLY from `Viewport.snapshot()`** — never from `ChunkedAxis` / `FrozenRegions` / `DataSource` directly. Snapshot is the single immutable read source per frame.
2. **All mutations go through the `Grid` facade.** The facade decides what to invalidate. Painters / Layout objects do not invalidate themselves.
3. **Theme is the ONLY source of visual values.** No hardcoded px, fonts, or color literals in `src/render/`. This rule is checked manually in review; future ESLint custom rule planned.
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

---

## Testing conventions

- **TDD strict.** Write the failing test first, see it fail, implement, see it pass, commit. Plan steps follow this exact rhythm.
- **Canvas tests use `RecordingContext2D`** (`tests/helpers/recording-context.ts`) — captures ctx instruction sequences as `{ op, args }` objects. Assert on instruction sequences, not on pixels.
- **`tests/setup.ts`** is preloaded by Bun (via `bunfig.toml [test] preload`). It registers happy-dom globally and installs the `RecordingContext` onto `HTMLCanvasElement.prototype.getContext('2d')` — Bun runtime alone has no DOM.
- **`bun:test` import**: `import { describe, expect, it, mock, spyOn } from 'bun:test'`. NOT `from 'vitest'`.
- **Global stubbing**: `import { stubGlobal, unstubAllGlobals } from '../helpers/global-stub'` (bun:test has no built-in equivalent of `vi.stubGlobal`).
- **Type-only failing tests** (Schema, DataSource interface) won't fail at runtime in `bun test` because TS imports erase. Use `tsc --noEmit` to verify the "test fails before implementation" gate for type-only modules.

---

## Commit conventions

- **Conventional Commits**: `feat(core): ...`, `chore(core): ...`, `docs(plan): ...`, `docs(spec): ...`
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

| Topic | Location |
|---|---|
| Public types & API | `packages/core/src/index.ts` (only re-export from here) |
| Algorithm core | `packages/core/src/layout/ChunkedAxis.ts` |
| Per-frame logic | `packages/core/src/render/Renderer.ts` |
| Theme tokens | `packages/core/src/theme/denseGridTheme.ts` |
| DataSource ABC | `packages/core/src/data/DataSource.ts` |
| Tests | `packages/core/tests/` (mirror src/ folder structure) |
| Test helpers | `packages/core/tests/helpers/` |
| Probe/exploration tests | `packages/core/tests/_probe.test.ts` (filename starts with `_` to signal "documents invariants, not a contract") |

---

## Things explicitly NOT in M1 (don't add prematurely)

- `src/scroll/` — M2
- `src/render/FrozenPainter.ts` (real impl beyond stub) — M3
- Dynamic row-height autofit (multi-line text) — M3
- `src/interaction/` — M4
- `packages/react/` — M4
- `apps/playground/` — M5 (custom Vite app with FPS overlay + 1M mock data for perf validation)

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
