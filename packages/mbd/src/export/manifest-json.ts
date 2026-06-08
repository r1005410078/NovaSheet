import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { ScenarioManifest } from '../types'

/** Write scenarios.manifest.json with stable formatting. */
export function writeManifestJson(manifest: ScenarioManifest, outPath: string): void {
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
}

/** Read scenarios.manifest.json. */
export async function readManifest(jsonPath: string): Promise<ScenarioManifest> {
  const raw = Bun.file(jsonPath)
  if (!(await raw.exists())) {
    throw new Error(`manifest not found: ${jsonPath}`)
  }
  return (await raw.json()) as ScenarioManifest
}
