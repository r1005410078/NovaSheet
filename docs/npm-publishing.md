# npm Publishing Checklist

NovaSheet uses Bun workspaces for development and Changesets for package versioning, changelog generation, and npm publication. The repository is prepared for public package releases, but maintainers should complete this checklist before publishing to npm.

Do not publish from a dirty working tree.

## Release Order

Changesets publishes packages in dependency order:

1. `@zhiguang/novasheet-core`
2. `@zhiguang/novasheet-canvas2d`
3. `@zhiguang/web`

The root workspace and Storybook app are private and should not be published.

## Preflight

```bash
bun install
bun run lint
bun run typecheck
bun test
bun run build
STORYBOOK_BASE_PATH=/NovaSheet/ bun run build-storybook
bun run changeset status
```

Confirm that each publishable package has the expected generated files:

```bash
ls packages/core/dist
ls packages/canvas2d/dist
ls packages/web/dist
```

## Manifest Review

Before publishing, review each publishable package manifest:

- `name`, `version`, `description`, `license`, `repository`, `bugs`, and `homepage` are present.
- `files` includes the artifacts referenced by `main`, `module`, `types`, and `exports`.
- `exports` does not reference `src` files unless those files are intentionally included in the published tarball.
- Runtime dependencies are declared in `dependencies`.
- Build-only tools remain in `devDependencies`.

Current note: workspace exports use `src` entries for local development while package `files` currently includes `dist`. Reconcile this before the first npm publication by either publishing source files intentionally or switching release manifests to `dist` exports.

## Changesets Flow

For a normal feature or fix, add a changeset before merging:

```bash
bun run changeset
```

For the first public package milestone, the repository includes an initial changeset that will bump the publishable packages from `0.0.0` to `0.1.0`.

When changes land on `main`, the Release workflow uses `changesets/action` to create a version PR. Merging that version PR publishes packages to npm if the repository has an `NPM_TOKEN` secret with publish permission.

Manual versioning and publishing are still available:

```bash
bun run version-packages
bun install
bun run release
```

## Dry Run

Run a dry run from each package directory and inspect the included files:

```bash
cd packages/core
npm publish --dry-run

cd ../canvas2d
npm publish --dry-run

cd ../web
npm publish --dry-run
```

The dry-run tarballs must include only the expected package files and must not include local config, test output, or private workspace files.

## Publish

Only publish manually after dry runs look correct:

```bash
cd packages/core
npm publish --access public

cd ../canvas2d
npm publish --access public

cd ../web
npm publish --access public
```

## After Publishing

- Confirm the Changesets release commit and tags were pushed by the release workflow, or create and push a signed or annotated `v0.1.0` tag manually.
- Create a GitHub release that links to [docs/release/0.1.0.md](release/0.1.0.md).
- Confirm the Storybook deployment is available at `https://r1005410078.github.io/NovaSheet/`.
- Open a fresh project and install `@zhiguang/web` to validate the published package path.
