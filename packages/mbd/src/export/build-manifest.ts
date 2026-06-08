import type { MbdConfig, ManifestScenarioEntry, ScenarioEntry, ScenarioManifest } from '../types'
import { DEFAULT_ID_PATTERN } from '../validate/validate'

const TITLE_CONVENTION = {
  description: '测试用例名称必须以 scenario id 开头，后接空格与人类可读说明',
  examples: [
    'excel.L3b.undo-redo dispatches grid.undo',
    "test('excel.L3b.undo-redo', ...)",
  ],
} as const

function toManifestEntry(scenario: ScenarioEntry): ManifestScenarioEntry {
  return {
    id: scenario.id,
    layer: scenario.layer,
    summary: scenario.summary,
    ...(scenario.userStory !== undefined ? { userStory: scenario.userStory } : {}),
    tags: scenario.tags,
    ...(scenario.status !== undefined ? { status: scenario.status } : {}),
    sourceFile: scenario.filePath,
    given: scenario.given,
    when: scenario.when,
    then: scenario.then,
  }
}

/** Build scenarios.manifest.json payload from parsed scenarios. */
export function buildManifest(
  scenarios: readonly ScenarioEntry[],
  config: MbdConfig,
  sourceGlob: string,
  generatedAt: string = new Date().toISOString(),
): ScenarioManifest {
  const idPattern = config.idPattern ?? DEFAULT_ID_PATTERN

  return {
    version: 1,
    generatedAt,
    source: sourceGlob,
    titleConvention: {
      description: TITLE_CONVENTION.description,
      idPattern: idPattern.source,
      examples: TITLE_CONVENTION.examples,
    },
    scenarios: scenarios.map(toManifestEntry),
  }
}
