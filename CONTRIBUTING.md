# Contributing to NovaSheet

Thanks for your interest in NovaSheet. The project is still early, but it is intended to grow as a serious open-source spreadsheet engine for AI-native data workbenches.

## Before You Start

- Read [README.md](./README.md) for project goals, package boundaries, and the current milestone table.
- Read [docs/architecture.md](./docs/architecture.md) before changing package boundaries, rendering flow, or engine contracts.
- Search existing issues before opening a new one.
- For larger work, open an issue first so the scope and design can be discussed.

## Development Setup

NovaSheet uses Bun workspaces.

```bash
bun install
bun run lint
bun run typecheck
bun test
bun run build
```

Run Storybook locally:

```bash
bun run storybook
```

## Pull Request Checklist

- Keep changes scoped to one behavior or documentation improvement.
- Add or update tests for runtime behavior changes.
- Keep package boundaries intact: `@zhiguang/novasheet-core` must remain platform-independent.
- Run `bun run lint`, `bun run typecheck`, `bun test`, and `bun run build` before requesting review.
- Update README, architecture docs, or Storybook stories when public behavior changes.

## Commit Style

Use Conventional Commits:

```text
feat(core): add range validation
fix(web): correct selection scroll behavior
docs(repo): add contributor guide
```

## Reporting Issues

For bugs, include:

- The package or Storybook story affected
- Browser and OS, when relevant
- Steps to reproduce
- Expected behavior
- Actual behavior
- Screenshots or recordings when the issue is visual

For feature requests, include the workflow, target users, and why it belongs in the core engine, web runtime, renderer, or Storybook.
