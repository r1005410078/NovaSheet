# AGENTS.md

This repository's full agent working rules live in **[CLAUDE.md](./CLAUDE.md)** — that
file is the canonical source of truth for any coding agent (Claude Code, OpenAI Codex,
Cursor, Aider, Amp, Gemini CLI, etc.). Read it before touching anything in this repo.

The rules in `CLAUDE.md` are not Claude-specific; the filename is historical. Treat
both `AGENTS.md` and `CLAUDE.md` as binding for any agent operating on NovaSheet.

---

## Non-negotiables (excerpted — see `CLAUDE.md` for full context and rationale)

### Toolchain

- **Package manager + runtime: `bun` (≥ 1.2).** NEVER use `npm`, `yarn`, or `pnpm`.
  They will desync `bun.lock` and break CI.
- All four gates must pass before any commit lands on `main`:
  - `bun run lint` — oxlint, must be **0 errors / 0 warnings**
  - `bun run --filter '*' typecheck` — strict TS, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`
  - `bun test`
  - `bun run --filter @zhiguang/web build && bun run --filter @zhiguang/canvas2d build && bun run --filter @zhiguang/core build` (order matters)

### Tests

- **TDD strict.** Failing test first, see it fail, implement, see it pass, commit.
- `bun:test` only — `import { describe, expect, it, mock, spyOn } from 'bun:test'`.
  No Vitest / Jest imports.
- Canvas tests use `RecordingContext2D`
  (`packages/canvas2d/tests/helpers/recording-context.ts`).

### Commits

- **Conventional Commits** (`feat(core): …`, `chore(repo): …`, `docs(plan): …`,
  `docs(spec): …`). One task = one commit.
- **Commit 说明使用中文。** `type(scope)` 前缀保持英文，冒号后面的 subject 与正文用中文叙述；
  代码标识符、文件路径、命令、API 名、错误信息保持英文原样。
  例：`feat(web): 新增筛选弹层` / `fix(core): 修正 ChunkedAxis.getSize 边界返回 0`。
- **Never `--no-verify`** unless the user explicitly asks. Hook failures need fixing,
  not bypassing.
- **Never amend pushed commits.** Always create new commits.
- When a plan has a bug, fix the **plan file first** in a `docs(plan): …` commit, then
  re-dispatch the implementer.

### Architecture (do NOT revisit casually — see ADR §A in the design spec)

1. Single Canvas, full visible-region redraw.
2. Native scroll + non-linear `scrollTop` mapping; no self-painted scrollbar.
3. `ChunkedAxis` with `CHUNK_SIZE = 1024`.
4. `DataSource.getRows(start, end)` — **`endIndex` is INCLUSIVE** (matches
   `ChunkedAxis.getVisibleRange [first, last]`).
5. Theme tokens are the ONLY source of visual values. No hardcoded px / fonts /
   colors in `packages/canvas2d/src/painters/` or `render/`.
6. DOM `<handle-layer>` siblings for resize hit-zones.
7. One shared `frameScheduler` per `Grid` instance — all RAF sources coalesce.
   Do not use the `frameScheduler` singleton from `util/raf` cross-Grid.

### Code rules

- `verbatimModuleSyntax` → type-only imports must use `import type { ... }`.
- Canvas2DRenderer reads ONLY from engine state via held `Viewport` + `RenderFrame`;
  never from `ChunkedAxis` / `FrozenRegions` / `DataSource` outside the frame contract.
- All mutations go through `DefaultGridEngine` or the public `Grid` facade.
- `ChunkedAxis.getSize(index)` is the canonical row/col size accessor at boundaries.
  Do NOT compute size as `indexToPosition(i+1) - indexToPosition(i)` — clamping
  returns 0 at the last index.
- `Grid.destroy()` must be fully idempotent.

### Working style

- Terse, technical. Tables over prose. Lead with recommendation + reason; options
  second. Concrete numbers over vague hedges.
- Chinese for prose, English for code/identifiers. No emoji unless requested.
- **When in doubt, ASK.** If a test expectation contradicts the reference, or a plan
  formula doesn't add up, STOP and ask before silently choosing.

---

For current milestone state, file map, deferred work, the Superpowers pipeline
workflow, and everything else — read [`CLAUDE.md`](./CLAUDE.md).
