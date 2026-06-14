/**
 * Build script for @novasheet/cell-kit. Same artifact shape as core/canvas2d.
 */
import { rm, copyFile } from 'node:fs/promises'

const ROOT = new URL('.', import.meta.url).pathname
await rm(`${ROOT}dist`, { recursive: true, force: true })

const EXTERNALS = ['@novasheet/core', '@novasheet/canvas2d', '@novasheet/react', 'react', 'react-dom'] as const
const common = {
  entrypoints: [`${ROOT}src/index.ts`],
  outdir: `${ROOT}dist`,
  target: 'browser' as const,
  sourcemap: 'linked' as const,
  minify: false,
  external: [...EXTERNALS],
} satisfies Parameters<typeof Bun.build>[0]

const esm = await Bun.build({ ...common, format: 'esm' })
if (!esm.success) { console.error('ESM build failed:', esm.logs); process.exit(1) }
const cjs = await Bun.build({ ...common, format: 'cjs', naming: '[name].cjs' })
if (!cjs.success) { console.error('CJS build failed:', cjs.logs); process.exit(1) }

const dts = Bun.spawn(
  ['bunx', 'tsc', '-p', 'tsconfig.build.json', '--emitDeclarationOnly',
   '--outDir', `${ROOT}dist`, '--declaration', '--declarationMap'],
  { cwd: ROOT, stdout: 'inherit', stderr: 'inherit' },
)
if ((await dts.exited) !== 0) { console.error('tsc declaration generation failed'); process.exit(1) }
await copyFile(`${ROOT}dist/index.d.ts`, `${ROOT}dist/index.d.cts`)
console.log('Build complete')
