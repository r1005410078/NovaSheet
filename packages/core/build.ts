/**
 * Build script — replaces tsup with Bun.build (for JS bundles) + tsc (for .d.ts).
 *
 * Outputs to dist/:
 *   - index.js       ESM bundle + index.js.map sourcemap
 *   - index.cjs      CJS bundle + index.cjs.map sourcemap
 *   - index.d.ts     TypeScript declarations (via tsc --emitDeclarationOnly)
 *   - index.d.cts    CJS-side declarations (copy of .d.ts — same shape)
 *
 * Run via: bun run build  (from packages/core/)
 */

import { rm, copyFile } from 'node:fs/promises'

const ROOT = new URL('.', import.meta.url).pathname

await rm(`${ROOT}dist`, { recursive: true, force: true })

const common = {
  entrypoints: [`${ROOT}src/index.ts`],
  outdir: `${ROOT}dist`,
  target: 'browser' as const,
  sourcemap: 'external' as const,
  minify: false,
} satisfies Parameters<typeof Bun.build>[0]

// ESM bundle
const esmResult = await Bun.build({ ...common, format: 'esm' })
if (!esmResult.success) {
  console.error('ESM build failed:', esmResult.logs)
  process.exit(1)
}

// CJS bundle — Bun emits .js by default; rename to .cjs via `naming`
const cjsResult = await Bun.build({
  ...common,
  format: 'cjs',
  naming: '[name].cjs',
})
if (!cjsResult.success) {
  console.error('CJS build failed:', cjsResult.logs)
  process.exit(1)
}

// Generate .d.ts via tsc — Bun.build doesn't emit declarations.
// Use tsconfig.build.json (rootDir: src, excludes tests) so output is flat
// `dist/index.d.ts` rather than `dist/src/index.d.ts`.
const dts = Bun.spawn(
  ['bunx', 'tsc', '-p', 'tsconfig.build.json', '--emitDeclarationOnly', '--outDir', `${ROOT}dist`, '--declaration', '--declarationMap'],
  { cwd: ROOT, stdout: 'inherit', stderr: 'inherit' },
)
const dtsExitCode = await dts.exited
if (dtsExitCode !== 0) {
  console.error('tsc declaration generation failed')
  process.exit(1)
}

// CJS consumers (per package.json exports.require.types) want .d.cts.
// tsc only emits .d.ts; copy to .d.cts so require() callers get types.
await copyFile(`${ROOT}dist/index.d.ts`, `${ROOT}dist/index.d.cts`)

console.log('✓ Build complete')
console.log('  ESM:', esmResult.outputs.map((o) => o.path).join(', '))
console.log('  CJS:', cjsResult.outputs.map((o) => o.path).join(', '))
console.log('  DTS: index.d.ts, index.d.cts')
