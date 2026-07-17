import type { MbdConfig } from '@zhiguang/novasheet-mbd'

const config: MbdConfig = {
  scenarios: 'packages/react/tests/excel/scenarios/**/*.md',
  tests: ['packages/react/tests/excel/**/*.test.ts'],
  idPattern: /^excel\.L3[abc]\.[a-z0-9-]+$/,
  manifest: {
    json: 'packages/react/tests/excel/scenarios.manifest.json',
    markdown: 'packages/react/tests/excel/SCENARIOS.md',
  },
}

export default config
