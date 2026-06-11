import type { MbdConfig } from '@novasheet/mbd'

const config: MbdConfig = {
  scenarios: 'tests/acceptance/**/scenarios/**/*.md',
  tests: ['tests/acceptance/**/*.test.ts'],
  idPattern: /^core\.(L[012]|type)\.[a-z0-9-]+$/,
  validLayers: ['L0', 'L1', 'L2', 'type-only'],
  manifest: {
    json: 'tests/acceptance/scenarios.manifest.json',
    markdown: 'tests/acceptance/SCENARIOS.md',
  },
}

export default config
