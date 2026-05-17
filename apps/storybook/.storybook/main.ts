import type { StorybookConfig } from '@storybook/html-vite'

const config: StorybookConfig = {
  stories: ['../src/stories/**/*.stories.@(ts|tsx)'],
  // Storybook 10 absorbed addon-essentials into core (viewport / backgrounds / actions /
  // controls / docs are all built-in now). No addon imports needed.
  addons: [],
  framework: {
    name: '@storybook/html-vite',
    options: {},
  },
  typescript: {
    check: false,
  },
}

export default config
