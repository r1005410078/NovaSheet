import type { MbdConfig } from '@novasheet/mbd'

const config: MbdConfig = {
  scenarios: 'tests/bdd/scenarios/**/*.md',
  tests: ['tests/bdd/**/*.test.ts'],
  idPattern: /^core\.L[012]\.[a-z0-9-]+$/,
  validLayers: ['L0', 'L1', 'L2'],
  manifest: {
    json: 'tests/bdd/scenarios.manifest.json',
    markdown: 'tests/bdd/SCENARIOS.md',
  },
}

export default config
