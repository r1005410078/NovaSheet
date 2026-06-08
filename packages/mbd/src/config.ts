import { resolve } from 'node:path'
import type { MbdConfig } from './types'

/** Load mbd.config.ts default export from disk. */
export async function loadConfig(configPath: string): Promise<{ config: MbdConfig; rootDir: string }> {
  const absolute = resolve(configPath)
  const mod = (await import(absolute)) as { default?: MbdConfig }
  const config = mod.default
  if (config === undefined) {
    throw new Error(`config file must default-export MbdConfig: ${absolute}`)
  }
  return { config, rootDir: resolve(absolute, '..') }
}
