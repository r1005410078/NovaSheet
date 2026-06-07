import type { StorybookConfig } from '@storybook/html-vite'
import tailwindcss from '@tailwindcss/vite'
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

    config.plugins = [...(config.plugins ?? []), tailwindcss()]

    return {
      ...config,
      resolve: {
        ...config.resolve,
        alias: {
          ...config.resolve.alias,
          // Storybook dev should consume package source directly so edits in packages/*/src
          // trigger Vite HMR. Package exports point at dist/, which only changes after build.
          '@novasheet/core': fileURLToPath(
            new URL('../../../packages/core/src/index.ts', import.meta.url),
          ),
          '@novasheet/canvas2d': fileURLToPath(
            new URL('../../../packages/canvas2d/src/index.ts', import.meta.url),
          ),
          '@novasheet/react': fileURLToPath(
            new URL('../../../packages/react/src/index.ts', import.meta.url),
          ),
        },
      },
    }
  },
}

export default config
