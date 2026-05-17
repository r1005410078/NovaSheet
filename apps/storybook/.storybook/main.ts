import type { StorybookConfig } from '@storybook/html-vite'
import { fileURLToPath } from 'node:url'

const config: StorybookConfig = {
  stories: ['../src/stories/**/*.stories.@(ts|tsx)'],
  staticDirs: ['./public'],
  addons: ['@storybook/addon-docs'],
  docs: {
    defaultName: 'README',
  },
  framework: {
    name: '@storybook/html-vite',
    options: {},
  },
  typescript: {
    check: false,
  },
  async viteFinal(config, { configType }) {
    config.resolve ??= {}
    config.resolve.alias ??= {}

    // GitHub Pages project site: https://<user>.github.io/<repo>/
    // CI sets STORYBOOK_BASE_PATH=/<repo>/ ; local `build-storybook` defaults to /.
    if (configType === 'PRODUCTION') {
      const raw = process.env.STORYBOOK_BASE_PATH?.trim()
      config.base = raw ? (raw.endsWith('/') ? raw : `${raw}/`) : '/'
    }

    return {
      ...config,
      resolve: {
        ...config.resolve,
        alias: {
          ...config.resolve.alias,
          // Storybook dev should consume core source directly so edits in packages/core/src
          // trigger Vite HMR. The package export points at dist/, which only changes after build.
          '@novasheet/core': fileURLToPath(
            new URL('../../../packages/core/src/index.ts', import.meta.url),
          ),
        },
      },
    }
  },
}

export default config
