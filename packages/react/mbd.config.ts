import type { MbdConfig } from '@zhiguang/novasheet-mbd'

const config: MbdConfig = {
  scenarios: 'tests/excel/scenarios/**/*.md',
  tests: ['tests/excel/**/*.test.ts'],
  idPattern: /^excel\.L3[abc]\.[a-z0-9-]+$/,
  validLayers: ['L3a', 'L3b', 'L3c'],
  manifest: {
    json: 'tests/excel/scenarios.manifest.json',
    markdown: 'tests/excel/SCENARIOS.md',
  },
}

export default config
