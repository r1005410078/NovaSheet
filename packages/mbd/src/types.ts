/** Scenario status in frontmatter. */
export type ScenarioStatus = 'draft' | 'implemented'

/** Parsed scenario from a single MD file. */
export interface Scenario {
  readonly id: string
  readonly layer: string
  readonly summary: string
  readonly userStory?: string
  readonly tags: readonly string[]
  readonly status?: ScenarioStatus
  readonly filePath: string
}

/** Scenario with extracted body sections for manifest export. */
export interface ScenarioEntry extends Scenario {
  readonly given: readonly string[]
  readonly when: readonly string[]
  readonly then: readonly string[]
}

/** Validation issue for a scenario file. */
export interface ValidationError {
  readonly filePath: string
  readonly message: string
}

/** Monorepo mbd configuration (mbd.config.ts). */
export interface MbdConfig {
  readonly scenarios: string
  readonly tests?: readonly string[]
  readonly idPattern?: RegExp
  readonly manifest: {
    readonly json: string
    readonly markdown: string
  }
}

/** Cross-language scenario manifest (scenarios.manifest.json). */
export interface ScenarioManifest {
  readonly version: number
  readonly generatedAt: string
  readonly source: string
  readonly titleConvention: {
    readonly description: string
    readonly idPattern: string
    readonly examples: readonly string[]
  }
  readonly scenarios: readonly ManifestScenarioEntry[]
}

/** Single scenario row in the exported manifest. */
export interface ManifestScenarioEntry {
  readonly id: string
  readonly layer: string
  readonly summary: string
  readonly userStory?: string
  readonly tags: readonly string[]
  readonly status?: ScenarioStatus
  readonly sourceFile: string
  readonly given: readonly string[]
  readonly when: readonly string[]
  readonly then: readonly string[]
}
