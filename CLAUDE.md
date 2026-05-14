# Claude / Agent Working Rules for NovaSheet

This file is loaded into Claude / Codex / other coding-agent sessions. It encodes invariants that are easy to get wrong without context. Read this before editing.

---

## Project shape

- High-performance Canvas-based table engine, eventual AI-Native data workbench
- Greenfield TS monorepo (pnpm workspaces); single shipped package today: `@novasheet/core`
- See `README.md` for product framing and Quick Start
- See `docs/superpowers/specs/` for the design specs that drive plans
- See `docs/superpowers/plans/` for milestone implementation plans (M1 done; M2-M5 outlined)

---

## Toolchain (NON-NEGOTIABLE)

- **Package manager:** `pnpm` (>= 9). **NEVER** use `npm` or `yarn` — they will desync the lockfile and break CI.
- **Node:** >= 20
- **Test:** Vitest (`pnpm --filter @novasheet/core test`). No watch mode in plan steps — use `--run` (default in `pnpm test`).
- **Typecheck:** `pnpm --filter @novasheet/core typecheck` — TypeScript is strict + `noUncheckedIndexedAccess` + `verbatimModuleSyntax`.
- **Lint:** `pnpm lint` — must be clean (0 errors, 0 warnings).
- **Build:** `pnpm --filter @novasheet/core build` (tsup → ESM + CJS + d.ts).
- **All four must pass** before any commit lands on `main` (CI enforces).

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
- **`tests/setup.ts`** installs the RecordingContext globally onto `HTMLCanvasElement.prototype.getContext('2d')` — happy-dom does not implement Canvas 2D natively.
- **Type-only failing tests** (Schema, DataSource interface) won't fail at runtime in Vitest because TS imports erase. Use `tsc --noEmit` to verify the "test fails before implementation" gate for type-only modules.

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
- `apps/playground/` — M5

If you find yourself wanting to add any of these, stop and confirm with the user. They've been deferred for a reason.

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
