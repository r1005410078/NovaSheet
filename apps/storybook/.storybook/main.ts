import type { StorybookConfig } from '@storybook/html-vite'
import { fileURLToPath } from 'node:url'

const config: StorybookConfig = {
  stories: ['../src/stories/**/*.stories.@(ts|tsx)'],
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
  async viteFinal(config) {
    config.resolve ??= {}
    config.resolve.alias ??= {}
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
