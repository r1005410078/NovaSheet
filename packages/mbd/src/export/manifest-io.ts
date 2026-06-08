import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { ScenarioManifest } from '../types'
import { renderManifestMarkdown } from './manifest-md'

/** Write SCENARIOS.md human-readable manifest. */
export function writeManifestMarkdown(manifest: ScenarioManifest, outPath: string): void {
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, renderManifestMarkdown(manifest), 'utf8')
}

export { writeManifestJson, readManifest } from './manifest-json'
export { renderManifestMarkdown } from './manifest-md'
