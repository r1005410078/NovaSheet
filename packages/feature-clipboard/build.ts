/**
 * Build script for @novasheet/feature-clipboard.
 */

import { rm, copyFile } from 'node:fs/promises'

const ROOT = new URL('.', import.meta.url).pathname

await rm(`${ROOT}dist`, { recursive: true, force: true })

const EXTERNALS = ['@novasheet/core', '@novasheet/web'] as const

const common = {
  entrypoints: [`${ROOT}src/index.ts`],
  outdir: `${ROOT}dist`,
  target: 'browser' as const,
  sourcemap: 'linked' as const,
  minify: false,
  external: [...EXTERNALS],
} satisfies Parameters<typeof Bun.build>[0]

const esmResult = await Bun.build({ ...common, format: 'esm' })
if (!esmResult.success) {
  console.error('ESM build failed:', esmResult.logs)
  process.exit(1)
}

const cjsResult = await Bun.build({
  ...common,
  format: 'cjs',
  naming: '[name].cjs',
})
if (!cjsResult.success) {
  console.error('CJS build failed:', cjsResult.logs)
  process.exit(1)
}

const dts = Bun.spawn(
  [
    'bunx',
    'tsc',
    '-p',
    'tsconfig.build.json',
    '--emitDeclarationOnly',
    '--outDir',
    `${ROOT}dist`,
    '--declaration',
    '--declarationMap',
  ],
  { cwd: ROOT, stdout: 'inherit', stderr: 'inherit' },
)
const dtsExitCode = await dts.exited
if (dtsExitCode !== 0) {
  console.error('tsc declaration generation failed')
  process.exit(1)
}

await copyFile(`${ROOT}dist/index.d.ts`, `${ROOT}dist/index.d.cts`)

console.log('Build complete')
console.log('  ESM:', esmResult.outputs.map((o) => o.path).join(', '))
console.log('  CJS:', cjsResult.outputs.map((o) => o.path).join(', '))
console.log('  DTS: index.d.ts, index.d.cts')
