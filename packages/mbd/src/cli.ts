#!/usr/bin/env bun
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { loadConfig } from './config'
import { buildManifest } from './export/build-manifest'
import { writeManifestJson, writeManifestMarkdown } from './export/manifest-io'
import { parseScenarioFiles } from './parse/markdown'
import { validateScenarios } from './validate/validate'

function printUsage(): void {
  console.error('Usage: mbd <validate|manifest> [--config path/to/mbd.config.ts]')
}

function findConfigArg(argv: string[]): string | undefined {
  const idx = argv.indexOf('--config')
  if (idx < 0) return undefined
  return argv[idx + 1]
}

/** Walk up from cwd to locate monorepo root mbd.config.ts. */
function findDefaultConfigPath(): string {
  let dir = process.cwd()
  while (true) {
    const candidate = resolve(dir, 'mbd.config.ts')
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return resolve(process.cwd(), 'mbd.config.ts')
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const command = argv[0]
  const configArg = findConfigArg(argv)
  const configPath = configArg !== undefined ? resolve(configArg) : findDefaultConfigPath()

  if (command !== 'validate' && command !== 'manifest') {
    printUsage()
    process.exit(1)
  }

  const { config, rootDir } = await loadConfig(configPath)
  const scenarios = await parseScenarioFiles(config.scenarios, rootDir)
  const errors = validateScenarios(scenarios, config.idPattern, config.validLayers)

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`${error.filePath}: ${error.message}`)
    }
    process.exit(1)
  }

  if (command === 'validate') {
    console.log(`mbd validate: ${scenarios.length} scenario(s) ok`)
    return
  }

  const manifest = buildManifest(scenarios, config, config.scenarios)
  const jsonPath = resolve(rootDir, config.manifest.json)
  const mdPath = resolve(rootDir, config.manifest.markdown)

  writeManifestJson(manifest, jsonPath)
  writeManifestMarkdown(manifest, mdPath)
  console.log(`mbd manifest: wrote ${config.manifest.json}`)
  console.log(`mbd manifest: wrote ${config.manifest.markdown}`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
